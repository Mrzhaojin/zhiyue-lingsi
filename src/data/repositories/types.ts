import type {
  AIAnalysisRecord,
  Notification,
  AIChatMessage,
  AIChatThread,
  Book,
  Comment,
  Interaction,
  Note,
  Post,
  ReadingHistory,
  ShelfItem,
  TopicTag,
  User,
  VocabItem,
} from '../../domain/models'

export type Cursor = string | null
export type PageResult<T> = { items: T[]; nextCursor: Cursor }

export type ListPostsInput = {
  sort: 'latest' | 'hot'
  cursor?: Cursor
  limit: number
  authorId?: string
  topic?: string
  query?: string
}

export type NewPostInput = Pick<Post, 'authorId' | 'title' | 'contentText' | 'imageUrls' | 'tags'>
export type PostPatch = Partial<Pick<Post, 'title' | 'contentText' | 'imageUrls' | 'tags' | 'stats'>>

export interface PostRepository {
  list(input: ListPostsInput): Promise<PageResult<Post>>
  get(id: string): Promise<Post | null>
  create(input: NewPostInput): Promise<Post>
  update(id: string, patch: PostPatch): Promise<Post>
  /** M1.5c 起改为软删除；当前实现为物理删除 + 级联清理。 */
  remove(id: string): Promise<void>
  recordView(id: string): Promise<void>
}

export type ListNotesInput = {
  sort: 'latest' | 'hot'
  limit: number
  cursor?: Cursor
  onlyPublished?: boolean
  authorId?: string
  topic?: string
  query?: string
}

export interface NoteRepository {
  list(input: ListNotesInput): Promise<PageResult<Note>>
  listByAuthor(authorId: string, status?: Note['status']): Promise<Note[]>
  get(id: string): Promise<Note | null>
  save(input: Partial<Note> & Pick<Note, 'authorId' | 'title' | 'contentText'>): Promise<Note>
  remove(id: string): Promise<void>
}

export interface InteractionRepository {
  toggle(userId: string, kind: Interaction['kind'], targetType: Interaction['targetType'], targetId: string): Promise<{ active: boolean }>
  has(userId: string, kind: Interaction['kind'], targetType: Interaction['targetType'], targetId: string): Promise<boolean>
  listByUser(userId: string, kind: Interaction['kind']): Promise<Array<{ targetType: Interaction['targetType']; targetId: string; createdAt: number }>>
}

export type BookFilter = {
  category?: string
  difficulty?: string
  language?: string
  query?: string
  limit: number
  cursor?: Cursor
}

export interface BookRepository {
  list(filter: BookFilter): Promise<PageResult<Book>>
  get(id: string): Promise<Book | null>
  tags(): Promise<TopicTag[]>
  ensureTag(name: string): Promise<TopicTag>
}

export interface ShelfRepository {
  list(userId: string): Promise<ShelfItem[]>
  has(userId: string, bookId: string): Promise<boolean>
  add(userId: string, bookId: string): Promise<void>
  remove(userId: string, bookId: string): Promise<void>
}

export interface CommentRepository {
  listByPost(postId: string): Promise<Comment[]>
  create(input: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment>
}

export interface ProfileRepository {
  get(id: string): Promise<User | null>
  current(): Promise<User>
  ensure(input: { id: string; nickname: string; role?: 'user' | 'admin' }): Promise<User>
  listByIds(ids: string[]): Promise<Record<string, User>>
  stats(userId: string): Promise<{ posts: number; notes: number }>
  update(patch: Partial<User>): Promise<User>
}

export interface ReadingRepository {
  saveProgress(input: { userId: string; bookId: string; chapterId: string; progress: number }): Promise<void>
  getProgress(userId: string, bookId: string): Promise<ReadingHistory | undefined>
  history(userId: string): Promise<ReadingHistory[]>
  removeHistory(userId: string, bookId: string): Promise<void>
  addVocab(input: Omit<VocabItem, 'id' | 'createdAt'>): Promise<VocabItem>
  vocab(userId: string, type?: VocabItem['type']): Promise<VocabItem[]>
  removeVocab(id: string): Promise<void>
}

export interface AssistantRepository {
  listThreads(userId: string): Promise<AIChatThread[]>
  createThread(userId: string, title?: string): Promise<AIChatThread>
  deleteThread(threadId: string): Promise<void>
  listMessages(threadId: string): Promise<AIChatMessage[]>
  appendMessage(input: Omit<AIChatMessage, 'createdAt'> & { id?: string; createdAt?: number }): Promise<AIChatMessage>
  listAnalyses(userId: string): Promise<AIAnalysisRecord[]>
  saveAnalysis(input: Omit<AIAnalysisRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<AIAnalysisRecord>
  deleteAnalysis(id: string): Promise<void>
}

export interface ContentRepository {
  byTag(tag: string): Promise<{ posts: Post[]; notes: Note[] }>
  postsByIds(ids: string[]): Promise<Post[]>
  notesByIds(ids: string[]): Promise<Note[]>
}

export interface NotificationRepository {
  list(userId: string): Promise<Notification[]>
  unreadCount(userId: string): Promise<number>
  markRead(id: string): Promise<void>
  markAllRead(userId: string): Promise<void>
}

export interface BackupRepository {
  exportJson(): Promise<string>
  importJson(json: string): Promise<{ users: number; posts: number; notes: number }>
  sizeBytes(): Promise<number>
}

export interface AdminRepository {
  getConfig(): Promise<{ pinnedPostIds: string[]; featuredPostIds: string[]; bannedKeywords: string[] }>
  updateConfig(patch: Partial<{ pinnedPostIds: string[]; featuredPostIds: string[]; bannedKeywords: string[] }>): Promise<void>
  stats(): Promise<{ users: number; books: number; posts: number; notes: number; comments: number }>
}

export interface Repositories {
  posts: PostRepository
  notes: NoteRepository
  interactions: InteractionRepository
  books: BookRepository
  shelf: ShelfRepository
  comments: CommentRepository
  content: ContentRepository
  notifications: NotificationRepository
  profiles: ProfileRepository
  reading: ReadingRepository
  assistant: AssistantRepository
  backup: BackupRepository
  admin: AdminRepository
}