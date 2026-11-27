import type { ReadingHistory } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

export function saveReadingHistory(userId: string, bookId: string, chapterId: string, progress: number) {
  const id = `${userId}:${bookId}`
  mutate((db, ctx) => {
    const history: ReadingHistory = { id, userId, bookId, chapterId, progress, updatedAt: now() }
    db.readingHistory[id] = history
    ctx.put('readingHistory', history)
  })
}

export function getReadingHistory(userId: string, bookId: string): ReadingHistory | undefined {
  return data().readingHistory[`${userId}:${bookId}`]
}

export function listReadingHistory(userId: string): ReadingHistory[] {
  return Object.values(data().readingHistory)
    .filter((h) => h.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function removeReadingHistory(userId: string, bookId: string) {
  const id = `${userId}:${bookId}`
  if (!data().readingHistory[id]) return
  mutate((db, ctx) => {
    delete db.readingHistory[id]
    ctx.del('readingHistory', id)
  })
}
