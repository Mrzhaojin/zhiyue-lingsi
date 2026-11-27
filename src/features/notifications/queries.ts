import { useMutation, useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useNotifications(userId: string) {
  return useQuery({ queryKey: ['notifications', userId], queryFn: () => repositories.notifications.list(userId), enabled: Boolean(userId) })
}

export function useUnreadCount(userId: string) {
  return useQuery({ queryKey: ['notifications', userId, 'unread'], queryFn: () => repositories.notifications.unreadCount(userId), enabled: Boolean(userId) })
}

export function useMarkNotificationRead() {
  return useMutation({ mutationFn: (id: string) => repositories.notifications.markRead(id) })
}

export function useMarkAllNotificationsRead() {
  return useMutation({ mutationFn: (userId: string) => repositories.notifications.markAllRead(userId) })
}