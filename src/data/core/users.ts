import type { User } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

function defaultSettings(): User['settings'] {
  return {
    theme: 'system',
    reading: {
      fontSize: 18,
      lineHeight: 1.7,
      textColor: '#111827',
      backgroundColor: '#ffffff',
      fontFamily: 'sans',
    },
    notifications: { like: true, comment: true, collect: true },
  }
}

function createTransientGuest(): User {
  return {
    id: '',
    role: 'user',
    nickname: '访客',
    avatarUrl: undefined,
    bio: '',
    profileTag: '',
    createdAt: now(),
    stats: { readingMinutes: 0, postsCount: 0, notesCount: 0, followersCount: 0, followingCount: 0 },
    settings: defaultSettings(),
  }
}

/**
 * 把「登录身份」落成一条本地用户记录，并设为当前用户。
 * 这是认证身份与数据身份的唯一连接点。
 */

export function getCurrentUser(): User {
  const db = data()
  const user = db.users[db.currentUserId]
  if (user) return user
  return createTransientGuest()
}

export function ensureUserRecord(input: { id: string; nickname: string; role?: 'user' | 'admin' }): User {
  const existing = data().users[input.id]
  const nickname = input.nickname.trim() || existing?.nickname || '读者'

  return mutate((db, ctx) => {
    const current = db.users[input.id]
    if (current) {
      const role = input.role ?? current.role
      const next: User = { ...current, nickname, role }
      db.users[input.id] = next
      db.currentUserId = input.id
      ctx.put('users', next)
      ctx.meta('currentUserId', input.id)
      return next
    }
    const user: User = {
      ...createTransientGuest(),
      id: input.id,
      nickname,
      role: input.role ?? 'user',
      createdAt: now(),
    }
    db.users[user.id] = user
    db.currentUserId = user.id
    ctx.put('users', user)
    ctx.meta('currentUserId', user.id)
    return user
  })
}

export function setCurrentUserId(userId: string) {
  if (data().currentUserId === userId) return
  mutate((db, ctx) => {
    db.currentUserId = userId
    ctx.meta('currentUserId', userId)
  })
}

export function getUserById(id: string): User | undefined {
  return data().users[id]
}

export function updateCurrentUser(partial: Partial<User>) {
  const id = data().currentUserId
  const existing = data().users[id]
  if (!existing) return
  mutate((db, ctx) => {
    const next: User = { ...existing, ...partial }
    db.users[id] = next
    ctx.put('users', next)
  })
}