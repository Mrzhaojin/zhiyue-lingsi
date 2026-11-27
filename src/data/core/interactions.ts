import type { Interaction, Note, Post } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

function interactionKey(userId: string, kind: Interaction['kind'], targetType: Interaction['targetType'], targetId: string) {
  return `${userId}:${kind}:${targetType}:${targetId}`
}

export function hasInteraction(
  userId: string,
  kind: Interaction['kind'],
  targetType: Interaction['targetType'],
  targetId: string,
) {
  return Boolean(data().interactions[interactionKey(userId, kind, targetType, targetId)])
}

export function toggleInteraction(
  userId: string,
  kind: Interaction['kind'],
  targetType: Interaction['targetType'],
  targetId: string,
) {
  const db = data()
  const key = interactionKey(userId, kind, targetType, targetId)
  const existing = db.interactions[key]
  const target = targetType === 'post' ? db.posts[targetId] : db.notes[targetId]
  if (!target) return

  mutate((db2, ctx) => {
    const current = db2.interactions[key]
    const targetNow = targetType === 'post' ? db2.posts[targetId] : db2.notes[targetId]
    if (!targetNow) return

    if (current) {
      delete db2.interactions[key]
      ctx.del('interactions', key)
      const stats = {
        ...targetNow.stats,
        likes: kind === 'like' ? Math.max(0, targetNow.stats.likes - 1) : targetNow.stats.likes,
        collects: kind === 'collect' ? Math.max(0, targetNow.stats.collects - 1) : targetNow.stats.collects,
      }
      if (targetType === 'post') {
        const next = { ...(targetNow as Post), stats }
        db2.posts[targetId] = next
        ctx.put('posts', next)
      } else {
        const next = { ...(targetNow as Note), stats }
        db2.notes[targetId] = next
        ctx.put('notes', next)
      }
    } else {
      const interaction: Interaction = { id: key, userId, kind, targetType, targetId, createdAt: now() }
      db2.interactions[key] = interaction
      ctx.put('interactions', interaction)
      const stats = {
        ...targetNow.stats,
        likes: kind === 'like' ? targetNow.stats.likes + 1 : targetNow.stats.likes,
        collects: kind === 'collect' ? targetNow.stats.collects + 1 : targetNow.stats.collects,
      }
      if (targetType === 'post') {
        const next = { ...(targetNow as Post), stats }
        db2.posts[targetId] = next
        ctx.put('posts', next)
      } else {
        const next = { ...(targetNow as Note), stats }
        db2.notes[targetId] = next
        ctx.put('notes', next)
      }
    }
  })
  void existing
}

export function listUserInteractions(
  userId: string,
  kind: Interaction['kind'],
): Array<{ targetType: Interaction['targetType']; targetId: string; createdAt: number }> {
  return Object.values(data().interactions)
    .filter((i) => i.userId === userId && i.kind === kind)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((i) => ({ targetType: i.targetType, targetId: i.targetId, createdAt: i.createdAt }))
}
