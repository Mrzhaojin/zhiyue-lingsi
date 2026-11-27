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

export type Database = {
  version: 4
  users: Record<string, User>
  currentUserId: string
  books: Record<string, Book>
  posts: Record<string, Post>
  comments: Record<string, Comment>
  notes: Record<string, Note>
  tags: Record<string, TopicTag>
  interactions: Record<string, Interaction>
  bookmarks: Record<string, Bookmark>
  readingHistory: Record<string, ReadingHistory>
  vocab: Record<string, VocabItem>
  notifications: Record<string, Notification>
  shelves: Record<string, ShelfItem[]>
  aiChatThreads: Record<string, AIChatThread>
  aiChatMessages: Record<string, AIChatMessage>
  aiAnalysisRecords: Record<string, AIAnalysisRecord>
  admin: {
    pinnedPostIds: string[]
    featuredPostIds: string[]
    bannedKeywords: string[]
  }
}

export type TableName =
  | 'users'
  | 'books'
  | 'posts'
  | 'comments'
  | 'notes'
  | 'tags'
  | 'interactions'
  | 'bookmarks'
  | 'readingHistory'
  | 'vocab'
  | 'notifications'
  | 'shelves'
  | 'aiChatThreads'
  | 'aiChatMessages'
  | 'aiAnalysisRecords'

export const LEGACY_STORAGE_KEY = 'read_forum_db_v5'
export const SCHEMA_VERSION = 2
export const DEFAULT_BANNED_KEYWORDS = ['赌博', '色情', '违法', '诈骗']

/** 历史演示内容：来源未核实，需人工复核后才能进入 RAG 索引 */
export const DEFAULT_BOOK_SOURCE = {
  type: 'excerpt' as const,
  title: '历史演示摘录',
  license: 'unverified',
  attribution: '待人工复核',
}

export function defaultAdminConfig(): Database['admin'] {
  return { pinnedPostIds: [], featuredPostIds: [], bannedKeywords: [...DEFAULT_BANNED_KEYWORDS] }
}

export function emptyDatabase(): Database {
  return {
    version: 4,
    users: {},
    currentUserId: '',
    books: {},
    posts: {},
    comments: {},
    notes: {},
    tags: {},
    interactions: {},
    bookmarks: {},
    readingHistory: {},
    vocab: {},
    notifications: {},
    shelves: {},
    aiChatThreads: {},
    aiChatMessages: {},
    aiAnalysisRecords: {},
    admin: defaultAdminConfig(),
  }
}

/** 兼容旧版本 blob：补齐缺失的集合与管理配置。 */
export function normalizeDatabase(input: Partial<Database>): Database {
  const db = input as Database
  db.version = 4
  if (!db.users) db.users = {}
  if (!db.books) db.books = {}
  if (!db.posts) db.posts = {}
  if (!db.comments) db.comments = {}
  if (!db.notes) db.notes = {}
  if (!db.tags) db.tags = {}
  if (!db.interactions) db.interactions = {}
  if (!db.bookmarks) db.bookmarks = {}
  if (!db.readingHistory) db.readingHistory = {}
  if (!db.vocab) db.vocab = {}
  if (!db.notifications) db.notifications = {}
  if (!db.shelves) db.shelves = {}
  if (!db.aiChatThreads) db.aiChatThreads = {}
  if (!db.aiChatMessages) db.aiChatMessages = {}
  if (!db.aiAnalysisRecords) db.aiAnalysisRecords = {}
  if (!db.admin) db.admin = defaultAdminConfig()
  if (!db.admin.bannedKeywords) db.admin.bannedKeywords = [...DEFAULT_BANNED_KEYWORDS]
  if (!db.admin.pinnedPostIds) db.admin.pinnedPostIds = []
  if (!db.admin.featuredPostIds) db.admin.featuredPostIds = []
  for (const book of Object.values(db.books)) {
    if (!book.source) book.source = { ...DEFAULT_BOOK_SOURCE }
  }
  for (const post of Object.values(db.posts)) {
    if (!post.kind) post.kind = 'original'
  }
  return db
}