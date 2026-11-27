import { nanoid } from 'nanoid'
import type { Book, ShelfItem, TopicTag } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

export function listTags(): TopicTag[] {
  return Object.values(data().tags).sort((a, b) => b.createdAt - a.createdAt)
}

export function upsertTagByName(name: string): TopicTag {
  const normalized = name.startsWith('#') ? name : `#${name}`
  const existing = Object.values(data().tags).find((t) => t.name === normalized)
  if (existing) return existing
  return mutate((db, ctx) => {
    const tag: TopicTag = { id: nanoid(), name: normalized, createdAt: now() }
    db.tags[tag.id] = tag
    ctx.put('tags', tag)
    return tag
  })
}

export function listBooks(): Book[] {
  return Object.values(data().books)
}

export function getBook(bookId: string): Book | undefined {
  return data().books[bookId]
}

export function listShelf(userId: string): ShelfItem[] {
  return (data().shelves[userId] ?? []).slice().sort((a, b) => b.addedAt - a.addedAt)
}

export function isInShelf(userId: string, bookId: string) {
  return Boolean((data().shelves[userId] ?? []).find((s) => s.bookId === bookId))
}

export function addToShelf(userId: string, bookId: string) {
  if (isInShelf(userId, bookId)) return
  mutate((db, ctx) => {
    const item: ShelfItem = { userId, bookId, addedAt: now() }
    db.shelves[userId] = [item, ...(db.shelves[userId] ?? [])]
    ctx.put('shelves', item)
  })
}

export function removeFromShelf(userId: string, bookId: string) {
  const list = data().shelves[userId] ?? []
  if (!list.some((s) => s.bookId === bookId)) return
  mutate((db, ctx) => {
    db.shelves[userId] = (db.shelves[userId] ?? []).filter((s) => s.bookId !== bookId)
    ctx.del('shelves', [userId, bookId])
  })
}
