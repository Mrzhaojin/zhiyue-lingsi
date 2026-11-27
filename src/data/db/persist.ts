import Dexie, { type Table } from 'dexie'
import type {
  AIAnalysisRecord,
  AIChatMessage,
  AIChatThread,
  Book,
  Bookmark,
  Comment,
  Interaction,
  Note,
  Notification,
  Post,
  ReadingHistory,
  ShelfItem,
  TopicTag,
  User,
  VocabItem,
} from '../../domain/models'
import { emptyDatabase, normalizeDatabase, type Database, type TableName } from './schema'

export type WriteOp =
  | { kind: 'put'; table: TableName; value: unknown }
  | { kind: 'delete'; table: TableName; key: unknown }
  | { kind: 'meta'; key: string; value: unknown }

type MetaRow = { key: string; value: unknown }

export class ZhiyueDatabase extends Dexie {
  users!: Table<User, string>
  books!: Table<Book, string>
  posts!: Table<Post, string>
  comments!: Table<Comment, string>
  notes!: Table<Note, string>
  tags!: Table<TopicTag, string>
  interactions!: Table<Interaction, string>
  bookmarks!: Table<Bookmark, string>
  readingHistory!: Table<ReadingHistory, string>
  vocab!: Table<VocabItem, string>
  notifications!: Table<Notification, string>
  shelves!: Table<ShelfItem, [string, string]>
  aiChatThreads!: Table<AIChatThread, string>
  aiChatMessages!: Table<AIChatMessage, string>
  aiAnalysisRecords!: Table<AIAnalysisRecord, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('zhiyue-lingsi')
    this.version(1).stores({
      users: 'id',
      books: 'id',
      posts: 'id, authorId, createdAt',
      comments: 'id, postId, createdAt',
      notes: 'id, authorId, updatedAt, status',
      tags: 'id, name',
      interactions: 'id, userId, targetType, targetId',
      bookmarks: 'id, userId, bookId',
      readingHistory: 'id, userId, bookId, updatedAt',
      vocab: 'id, userId, createdAt',
      notifications: 'id, userId, createdAt',
      shelves: '[userId+bookId], userId',
      aiChatThreads: 'id, userId, updatedAt',
      aiChatMessages: 'id, threadId, createdAt',
      aiAnalysisRecords: 'id, userId, createdAt',
      meta: 'key',
    })
  }
}

export const dexie = new ZhiyueDatabase()

export const ENTITY_TABLES: TableName[] = [
  'users',
  'books',
  'posts',
  'comments',
  'notes',
  'tags',
  'interactions',
  'bookmarks',
  'readingHistory',
  'vocab',
  'notifications',
  'shelves',
  'aiChatThreads',
  'aiChatMessages',
  'aiAnalysisRecords',
]

export function shelfRows(db: Database): ShelfItem[] {
  return Object.values(db.shelves).flat()
}

export async function loadDatabase(): Promise<Database> {
  const db = emptyDatabase()
  const [users, books, posts, comments, notes, tags, interactions, bookmarks, readingHistory, vocab, notifications, shelves, threads, messages, analyses, meta] =
    await Promise.all([
      dexie.users.toArray(),
      dexie.books.toArray(),
      dexie.posts.toArray(),
      dexie.comments.toArray(),
      dexie.notes.toArray(),
      dexie.tags.toArray(),
      dexie.interactions.toArray(),
      dexie.bookmarks.toArray(),
      dexie.readingHistory.toArray(),
      dexie.vocab.toArray(),
      dexie.notifications.toArray(),
      dexie.shelves.toArray(),
      dexie.aiChatThreads.toArray(),
      dexie.aiChatMessages.toArray(),
      dexie.aiAnalysisRecords.toArray(),
      dexie.meta.toArray(),
    ])

  db.users = Object.fromEntries(users.map((row) => [row.id, row]))
  db.books = Object.fromEntries(books.map((row) => [row.id, row]))
  db.posts = Object.fromEntries(posts.map((row) => [row.id, row]))
  db.comments = Object.fromEntries(comments.map((row) => [row.id, row]))
  db.notes = Object.fromEntries(notes.map((row) => [row.id, row]))
  db.tags = Object.fromEntries(tags.map((row) => [row.id, row]))
  db.interactions = Object.fromEntries(interactions.map((row) => [row.id, row]))
  db.bookmarks = Object.fromEntries(bookmarks.map((row) => [row.id, row]))
  db.readingHistory = Object.fromEntries(readingHistory.map((row) => [row.id, row]))
  db.vocab = Object.fromEntries(vocab.map((row) => [row.id, row]))
  db.notifications = Object.fromEntries(notifications.map((row) => [row.id, row]))
  db.aiChatThreads = Object.fromEntries(threads.map((row) => [row.id, row]))
  db.aiChatMessages = Object.fromEntries(messages.map((row) => [row.id, row]))
  db.aiAnalysisRecords = Object.fromEntries(analyses.map((row) => [row.id, row]))

  db.shelves = {}
  for (const row of shelves) {
    const list = db.shelves[row.userId] ?? []
    list.push(row)
    db.shelves[row.userId] = list
  }

  const metaMap = new Map(meta.map((row) => [row.key, row.value]))
  db.currentUserId = typeof metaMap.get('currentUserId') === 'string' ? (metaMap.get('currentUserId') as string) : ''
  const admin = metaMap.get('admin')
  if (admin && typeof admin === 'object') db.admin = admin as Database['admin']

  return normalizeDatabase(db)
}

/** 全量写入：仅用于首次种子、旧数据迁移与导入。 */
export async function writeDatabase(db: Database): Promise<void> {
  const normalized = normalizeDatabase(db)
  await dexie.transaction('rw', [...ENTITY_TABLES.map((t) => dexie.table(t)), dexie.meta], async () => {
    for (const table of ENTITY_TABLES) await dexie.table(table).clear()
    await dexie.meta.clear()
    await Promise.all([
      dexie.users.bulkPut(Object.values(normalized.users)),
      dexie.books.bulkPut(Object.values(normalized.books)),
      dexie.posts.bulkPut(Object.values(normalized.posts)),
      dexie.comments.bulkPut(Object.values(normalized.comments)),
      dexie.notes.bulkPut(Object.values(normalized.notes)),
      dexie.tags.bulkPut(Object.values(normalized.tags)),
      dexie.interactions.bulkPut(Object.values(normalized.interactions)),
      dexie.bookmarks.bulkPut(Object.values(normalized.bookmarks)),
      dexie.readingHistory.bulkPut(Object.values(normalized.readingHistory)),
      dexie.vocab.bulkPut(Object.values(normalized.vocab)),
      dexie.notifications.bulkPut(Object.values(normalized.notifications)),
      dexie.shelves.bulkPut(shelfRows(normalized)),
      dexie.aiChatThreads.bulkPut(Object.values(normalized.aiChatThreads)),
      dexie.aiChatMessages.bulkPut(Object.values(normalized.aiChatMessages)),
      dexie.aiAnalysisRecords.bulkPut(Object.values(normalized.aiAnalysisRecords)),
    ])
    await dexie.meta.bulkPut([
      { key: 'currentUserId', value: normalized.currentUserId },
      { key: 'admin', value: normalized.admin },
    ])
  })
}

export async function applyOps(ops: WriteOp[]): Promise<void> {
  if (!ops.length) return
  const touched = new Set<TableName>()
  for (const op of ops) if (op.kind !== 'meta') touched.add(op.table)
  const tables = [...touched].map((t) => dexie.table(t))
  await dexie.transaction('rw', [...tables, dexie.meta], async () => {
    for (const op of ops) {
      if (op.kind === 'meta') {
        await dexie.meta.put({ key: op.key, value: op.value })
        continue
      }
      const table = dexie.table(op.table)
      if (op.kind === 'put') await table.put(op.value)
      else await table.delete(op.key as never)
    }
  })
}