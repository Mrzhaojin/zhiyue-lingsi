import Dexie, { type Table } from 'dexie'
import type {
  AIAnalysisRecord,
  AIChatMessage,
  AIChatThread,
  Book,
  Chapter,
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
import { DEFAULT_BOOK_SOURCE, emptyDatabase, normalizeDatabase, type Database, type TableName } from './schema'

export type WriteOp =
  | { kind: 'put'; table: TableName; value: unknown }
  | { kind: 'delete'; table: TableName; key: unknown }
  | { kind: 'meta'; key: string; value: unknown }

type MetaRow = { key: string; value: unknown }

type StoredChapter = Chapter & { bookId: string; ordinal: number }
type StoredBook = Omit<Book, 'chapters'>

export class ZhiyueDatabase extends Dexie {
  users!: Table<User, string>
  books!: Table<StoredBook, string>
  chapters!: Table<StoredChapter, string>
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

    // v2：章节拆表、来源字段、帖子/笔记引用与软删字段
    this.version(2)
      .stores({
        users: 'id',
        books: 'id, category, language',
        chapters: 'id, bookId, [bookId+ordinal]',
        posts: 'id, authorId, createdAt, kind, noteId',
        comments: 'id, postId, createdAt',
        notes: 'id, authorId, updatedAt, status, publishedPostId',
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
      .upgrade(async (tx) => {
        const books = (await tx.table('books').toArray()) as Array<StoredBook & { chapters?: Chapter[]; source?: Book['source'] }>
        for (const book of books) {
          const chapters = Array.isArray(book.chapters) ? book.chapters : []
          await tx.table('books').put(toStoredBook(book as Book))
          for (let index = 0; index < chapters.length; index += 1) {
            const chapter = chapters[index]
            await tx.table('chapters').put({
              id: chapter.id,
              bookId: book.id,
              ordinal: index,
              title: chapter.title,
              content: chapter.content,
            })
          }
        }

        const posts = (await tx.table('posts').toArray()) as Array<Post & { kind?: string; noteId?: string }>
        for (const post of posts) {
          await tx.table('posts').put({ ...post, kind: post.kind ?? 'original' })
        }

        const notes = (await tx.table('notes').toArray()) as Array<Note & { publishedPostId?: string }>
        for (const note of notes) {
          if (note.status !== 'published' || note.publishedPostId) continue
          const match = posts.find(
            (post) =>
              post.kind !== 'note' &&
              post.authorId === note.authorId &&
              post.title === note.title &&
              post.contentText === note.contentText,
          )
          if (!match) continue
          await tx.table('posts').put({ ...match, kind: 'note', noteId: note.id, contentText: '' })
          await tx.table('notes').put({ ...note, publishedPostId: match.id })
        }
      })
  }
}

function toStoredBook(book: Book): StoredBook {
  const stored = { ...book } as Book & { chapters?: Chapter[] }
  delete stored.chapters
  return { ...stored, source: stored.source ?? { ...DEFAULT_BOOK_SOURCE } }
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
  const [users, books, chapters, posts, comments, notes, tags, interactions, bookmarks, readingHistory, vocab, notifications, shelves, threads, messages, analyses, meta] =
    await Promise.all([
      dexie.users.toArray(),
      dexie.books.toArray(),
      dexie.chapters.orderBy('[bookId+ordinal]').toArray(),
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
  const chaptersByBook = new Map<string, Chapter[]>()
  for (const chapter of chapters) {
    const list = chaptersByBook.get(chapter.bookId) ?? []
    list.push({ id: chapter.id, title: chapter.title, content: chapter.content })
    chaptersByBook.set(chapter.bookId, list)
  }
  db.books = Object.fromEntries(
    books.map((row) => [row.id, { ...row, chapters: chaptersByBook.get(row.id) ?? [] }]),
  )
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
  await dexie.transaction('rw', [...ENTITY_TABLES.map((t) => dexie.table(t)), dexie.chapters, dexie.meta], async () => {
    for (const table of ENTITY_TABLES) await dexie.table(table).clear()
    await dexie.chapters.clear()
    await dexie.meta.clear()
    await Promise.all([
      dexie.users.bulkPut(Object.values(normalized.users)),
      dexie.books.bulkPut(Object.values(normalized.books).map(toStoredBook)),
      dexie.chapters.bulkPut(
        Object.values(normalized.books).flatMap((book) =>
          (book.chapters ?? []).map((chapter, ordinal) => ({ ...chapter, bookId: book.id, ordinal })),
        ),
      ),
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
  const needsChapters = [...touched].includes('books')
  await dexie.transaction('rw', [...tables, ...(needsChapters ? [dexie.chapters] : []), dexie.meta], async () => {
    for (const op of ops) {
      if (op.kind === 'meta') {
        await dexie.meta.put({ key: op.key, value: op.value })
        continue
      }
      if (op.table === 'books' && op.kind === 'delete') {
        await dexie.books.delete(op.key as string)
        await dexie.chapters.where('bookId').equals(op.key as string).delete()
        continue
      }
      if (op.table === 'books' && op.kind === 'put') {
        const book = op.value as Book
        const bookChapters = book.chapters ?? []
        await dexie.books.put(toStoredBook(book))
        await dexie.chapters.where('bookId').equals(book.id).delete()
        if (bookChapters?.length) {
          await dexie.chapters.bulkPut(bookChapters.map((chapter, ordinal) => ({ ...chapter, bookId: book.id, ordinal })))
        }
        continue
      }
      const table = dexie.table(op.table)
      if (op.kind === 'put') await table.put(op.value)
      else await table.delete(op.key as never)
    }
  })
}