import { nanoid } from 'nanoid'
import type { Notification } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

export function pushNotification(input: Omit<Notification, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  return mutate((db, ctx) => {
    const id = input.id ?? nanoid()
    const notification: Notification = {
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      createdAt: input.createdAt ?? now(),
      readAt: input.readAt,
      link: input.link,
    }
    db.notifications[id] = notification
    ctx.put('notifications', notification)
    return notification
  })
}

export function listNotifications(userId: string): Notification[] {
  return Object.values(data().notifications)
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getUnreadNotificationCount(userId: string) {
  return Object.values(data().notifications).filter((n) => n.userId === userId && !n.readAt).length
}

export function markNotificationRead(notificationId: string) {
  const notification = data().notifications[notificationId]
  if (!notification || notification.readAt) return
  mutate((db, ctx) => {
    const next: Notification = { ...notification, readAt: now() }
    db.notifications[notificationId] = next
    ctx.put('notifications', next)
  })
}

export function markAllNotificationsRead(userId: string) {
  const pending = Object.values(data().notifications).filter((n) => n.userId === userId && !n.readAt)
  if (!pending.length) return
  mutate((db, ctx) => {
    for (const item of pending) {
      const next: Notification = { ...item, readAt: now() }
      db.notifications[item.id] = next
      ctx.put('notifications', next)
    }
  })
}
