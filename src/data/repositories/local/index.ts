import { AppError } from '../../../domain/errors'
import type { Note, Post } from '../../../domain/models'
import {
  addAIChatMessage,
  addAIAnalysisRecord,
  addComment,
  addOrUpdateNote,
  addPost,
  addToShelf,
  addVocabItem,
  createAIChatThread,
  deleteAIChatThread,
  deleteAIAnalysisRecord,
  deleteNote,
  deletePost,
  deleteVocabItem,
  ensureUserRecord,
  exportDatabaseJson,
  getAdminConfig,
  getBook,
  getCurrentUser,
  getDatabaseSizeBytes,
  getNote,
  getPost,
  getReadingHistory,
  getUsersByIds,
  incrementPostView,
  getUserById,
  hasInteraction,
  importDatabaseJson,
  isInShelf,
  listAIChatMessages,
  listAIChatThreads,
  listAIAnalysisRecords,
  listBooks,
  listComments,
  listContentByTag,
  listNotes,
  listPosts,
  listReadingHistory,
  listShelf,
  listTags,
  listVocab,
  removeFromShelf,
  removeReadingHistory,
  saveReadingHistory,
  toggleInteraction,
  updateAdminConfig,
  updateCurrentUser,
  updatePost,
  upsertTagByName,
  listDraftNotesByUser,
  listPublishedNotesByUser,
  listUserInteractions,
} from '../../core'
import type {
  AdminRepository,
  AssistantRepository,
  BackupRepository,
  BookFilter,
  BookRepository,
  CommentRepository,
  ContentRepository,
  Cursor,
  InteractionRepository,
  ListNotesInput,
  ListPostsInput,
  NoteRepository,
  PageResult,
  PostPatch,
  PostRepository,
  ProfileRepository,
  ReadingRepository,
  Repositories,
  ShelfRepository,
} from '../types'

function cursorOf(value: number, id: string): string {
  return `${value}:${id}`
}

function parseCursor(cursor: Cursor): { value: number; id: string } | null {
  if (!cursor) return null
  const index = cursor.lastIndexOf(':')
  if (index <= 0) return null
  const value = Number(cursor.slice(0, index))
  const id = cursor.slice(index + 1)
  if (!Number.isFinite(value) || !id) return null
  return { value, id }
}

function postScore(post: Post): number {
  return post.stats.likes * 3 + post.stats.comments * 2 + post.stats.views
}

function noteScore(note: Note): number {
  return note.stats.likes * 3 + note.stats.comments * 2 + note.stats.views
}

function paginatePosts(posts: Post[], input: ListPostsInput): PageResult<Post> {
  const cursor = parseCursor(input.cursor ?? null)
  const query = input.query?.trim().toLowerCase()
  const filtered = posts.filter((post) => {
    if (input.authorId && post.authorId !== input.authorId) return false
    if (input.topic && !post.tags.includes(input.topic)) return false
    if (query && !`${post.title} ${post.contentText}`.toLowerCase().includes(query)) return false
    return true
  })

  const score = (post: Post) => (input.sort === 'latest' ? post.createdAt : postScore(post))
  // 确定性排序：同分时按 id 降序，游标过滤才能与排序一致（否则跨页会重复）
  const sorted = [...filtered].sort((a, b) => {
    const diff = score(b) - score(a)
    if (diff !== 0) return diff
    return a.id < b.id ? 1 : -1
  })
  const afterCursor = sorted.filter((post) => {
    if (!cursor) return true
    const value = score(post)
    return value < cursor.value || (value === cursor.value && post.id < cursor.id)
  })

  const items = afterCursor.slice(0, input.limit)
  const hasMore = afterCursor.length > items.length
  const last = items[items.length - 1]
  return { items, nextCursor: hasMore && last ? cursorOf(score(last), last.id) : null }
}

function paginateNotes(notes: Note[], input: ListNotesInput): PageResult<Note> {
  const cursor = parseCursor(input.cursor ?? null)
  const query = input.query?.trim().toLowerCase()
  const filtered = notes.filter((note) => {
    if (input.authorId && note.authorId !== input.authorId) return false
    if (input.topic && !note.tags.includes(input.topic)) return false
    if (query && !`${note.title} ${note.contentText}`.toLowerCase().includes(query)) return false
    return true
  })
  const score = (note: Note) => (input.sort === 'latest' ? note.createdAt : noteScore(note))
  const sorted = [...filtered].sort((a, b) => {
    const diff = score(b) - score(a)
    if (diff !== 0) return diff
    return a.id < b.id ? 1 : -1
  })
  const afterCursor = sorted.filter((note) => {
    if (!cursor) return true
    const value = score(note)
    return value < cursor.value || (value === cursor.value && note.id < cursor.id)
  })
  const items = afterCursor.slice(0, input.limit)
  const hasMore = afterCursor.length > items.length
  const last = items[items.length - 1]
  return { items, nextCursor: hasMore && last ? cursorOf(score(last), last.id) : null }
}

const posts: PostRepository = {
  async list(input) {
    return paginatePosts(listPosts(input.sort), input)
  },
  async get(id) {
    return getPost(id) ?? null
  },
  async create(input) {
    if (!input.title.trim()) throw new AppError('VALIDATION_ERROR', '标题不能为空')
    if (!input.contentText.trim()) throw new AppError('VALIDATION_ERROR', '正文不能为空')
    return addPost(input)
  },
  async update(id, patch: PostPatch) {
    const existing = getPost(id)
    if (!existing) throw new AppError('NOT_FOUND', '帖子不存在或已删除')
    updatePost(id, patch)
    return getPost(id) as Post
  },
  async remove(id) {
    if (!getPost(id)) throw new AppError('NOT_FOUND', '帖子不存在或已删除')
    deletePost(id)
  },
  async recordView(id) {
    if (getPost(id)) incrementPostView(id)
  },
}

const notes: NoteRepository = {
  async list(input) {
    const all = listNotes(input.sort, input.onlyPublished ?? true)
    return paginateNotes(all, input)
  },
  async listByAuthor(authorId, status) {
    if (status === 'draft') return listDraftNotesByUser(authorId)
    if (status === 'published') return listPublishedNotesByUser(authorId)
    return listNotes('latest', false).filter((note) => note.authorId === authorId)
  },
  async get(id) {
    return getNote(id) ?? null
  },
  async save(input) {
    if (!input.title.trim()) throw new AppError('VALIDATION_ERROR', '标题不能为空')
    if (!input.contentText.trim()) throw new AppError('VALIDATION_ERROR', '正文不能为空')
    return addOrUpdateNote(input)
  },
  async remove(id) {
    if (!getNote(id)) throw new AppError('NOT_FOUND', '笔记不存在或已删除')
    deleteNote(id)
  },
}

const interactions: InteractionRepository = {
  async toggle(userId, kind, targetType, targetId) {
    const target = targetType === 'post' ? getPost(targetId) : getNote(targetId)
    if (!target) throw new AppError('NOT_FOUND', '目标内容不存在')
    toggleInteraction(userId, kind, targetType, targetId)
    return { active: hasInteraction(userId, kind, targetType, targetId) }
  },
  async has(userId, kind, targetType, targetId) {
    return hasInteraction(userId, kind, targetType, targetId)
  },
  async listByUser(userId, kind) {
    return listUserInteractions(userId, kind)
  },
}

const books: BookRepository = {
  async list(filter: BookFilter) {
    const query = filter.query?.trim().toLowerCase()
    const matched = listBooks().filter((book) => {
      if (filter.category && book.category !== filter.category) return false
      if (filter.difficulty && book.difficulty !== filter.difficulty) return false
      if (filter.language && book.language !== filter.language) return false
      if (query) {
        const haystack = `${book.title} ${book.author} ${book.summary}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
    const offset = filter.cursor ? Number(filter.cursor) : 0
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0
    const items = matched.slice(start, start + filter.limit)
    const next = start + items.length
    return { items, nextCursor: next < matched.length ? String(next) : null }
  },
  async get(id) {
    return getBook(id) ?? null
  },
  async tags() {
    return listTags()
  },
  async ensureTag(name) {
    return upsertTagByName(name)
  },
}

const shelf: ShelfRepository = {
  async list(userId) {
    return listShelf(userId)
  },
  async has(userId, bookId) {
    return isInShelf(userId, bookId)
  },
  async add(userId, bookId) {
    if (!getBook(bookId)) throw new AppError('NOT_FOUND', '书籍不存在')
    addToShelf(userId, bookId)
  },
  async remove(userId, bookId) {
    removeFromShelf(userId, bookId)
  },
}

const comments: CommentRepository = {
  async listByPost(postId) {
    return listComments(postId)
  },
  async create(input) {
    if (!input.contentText.trim()) throw new AppError('VALIDATION_ERROR', '评论不能为空')
    if (!getPost(input.postId)) throw new AppError('NOT_FOUND', '帖子不存在')
    return addComment(input)
  },
}

const profiles: ProfileRepository = {
  async get(id) {
    return getUserById(id) ?? null
  },
  async current() {
    return getCurrentUser()
  },
  async ensure(input) {
    return ensureUserRecord(input)
  },
  async listByIds(ids) {
    return getUsersByIds([...new Set(ids)])
  },
  async update(patch) {
    updateCurrentUser(patch)
    return getCurrentUser()
  },
}

const reading: ReadingRepository = {
  async saveProgress(input) {
    const progress = Math.min(1, Math.max(0, input.progress))
    saveReadingHistory(input.userId, input.bookId, input.chapterId, progress)
  },
  async getProgress(userId, bookId) {
    return getReadingHistory(userId, bookId)
  },
  async history(userId) {
    return listReadingHistory(userId)
  },
  async removeHistory(userId, bookId) {
    removeReadingHistory(userId, bookId)
  },
  async addVocab(input) {
    return addVocabItem(input)
  },
  async vocab(userId, type) {
    return listVocab(userId, type)
  },
  async removeVocab(id) {
    deleteVocabItem(id)
  },
}

const assistant: AssistantRepository = {
  async listThreads(userId) {
    return listAIChatThreads(userId)
  },
  async createThread(userId, title) {
    return createAIChatThread(userId, title)
  },
  async deleteThread(threadId) {
    deleteAIChatThread(threadId)
  },
  async listMessages(threadId) {
    return listAIChatMessages(threadId)
  },
  async appendMessage(input) {
    return addAIChatMessage(input)
  },
  async listAnalyses(userId) {
    return listAIAnalysisRecords(userId)
  },
  async saveAnalysis(input) {
    return addAIAnalysisRecord(input)
  },
  async deleteAnalysis(id) {
    deleteAIAnalysisRecord(id)
  },
}

const content: ContentRepository = {
  async byTag(tag) {
    return listContentByTag(tag)
  },
  async postsByIds(ids) {
    return ids.map((id) => getPost(id)).filter((post): post is Post => Boolean(post))
  },
  async notesByIds(ids) {
    return ids.map((id) => getNote(id)).filter((note): note is Note => Boolean(note))
  },
}

const backup: BackupRepository = {
  async exportJson() {
    return exportDatabaseJson()
  },
  async importJson(json) {
    return importDatabaseJson(json)
  },
  async sizeBytes() {
    return getDatabaseSizeBytes()
  },
}

const admin: AdminRepository = {
  async getConfig() {
    return getAdminConfig()
  },
  async updateConfig(patch) {
    updateAdminConfig(patch)
  },
}

export const localRepositories: Repositories = {
  posts,
  notes,
  interactions,
  books,
  shelf,
  comments,
  content,
  profiles,
  reading,
  assistant,
  backup,
  admin,
}

