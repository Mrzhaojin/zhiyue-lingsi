import { nanoid } from 'nanoid'
import { safeJsonParse } from '../lib/storage'
import type {
  AIAnalysisRecord,
  AIChatMessage,
  AIChatThread,
  Book,
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
} from './models'
import { defaultAdminConfig, normalizeDatabase, type Database } from './db/schema'
import { loadDatabase, writeDatabase } from './db/persist'
import { mutate, store } from './db/store'

function now() {
  return Date.now()
}

function data(): Database {
  return store.getSnapshot()
}

// ---------------------------------------------------------------------------
// 快照 / 初始化
// ---------------------------------------------------------------------------

export function getDbSnapshot(): Database {
  return data()
}

export function getCurrentUser(): User {
  const db = data()
  const user = db.users[db.currentUserId]
  if (user) return user
  return createTransientGuest()
}

function defaultSettings(): User['settings'] {
  return {
    theme: 'system',
    reading: {
      fontSize: 18,
      lineHeight: 1.7,
      textColor: '#111827',
      backgroundColor: '#ffffff',
      fontFamily: 'sans',
    },
    notifications: { like: true, comment: true, collect: true },
  }
}

function createTransientGuest(): User {
  return {
    id: '',
    role: 'user',
    nickname: '访客',
    avatarUrl: undefined,
    bio: '',
    profileTag: '',
    createdAt: now(),
    stats: { readingMinutes: 0, postsCount: 0, notesCount: 0, followersCount: 0, followingCount: 0 },
    settings: defaultSettings(),
  }
}

/**
 * 把「登录身份」落成一条本地用户记录，并设为当前用户。
 * 这是认证身份与数据身份的唯一连接点。
 */
export function ensureUserRecord(input: { id: string; nickname: string; role?: 'user' | 'admin' }): User {
  const existing = data().users[input.id]
  const nickname = input.nickname.trim() || existing?.nickname || '读者'

  return mutate((db, ctx) => {
    const current = db.users[input.id]
    if (current) {
      const role = input.role ?? current.role
      const next: User = { ...current, nickname, role }
      db.users[input.id] = next
      db.currentUserId = input.id
      ctx.put('users', next)
      ctx.meta('currentUserId', input.id)
      return next
    }
    const user: User = {
      ...createTransientGuest(),
      id: input.id,
      nickname,
      role: input.role ?? 'user',
      createdAt: now(),
    }
    db.users[user.id] = user
    db.currentUserId = user.id
    ctx.put('users', user)
    ctx.meta('currentUserId', user.id)
    return user
  })
}

export function setCurrentUserId(userId: string) {
  if (data().currentUserId === userId) return
  mutate((db, ctx) => {
    db.currentUserId = userId
    ctx.meta('currentUserId', userId)
  })
}

export function updateCurrentUser(partial: Partial<User>) {
  const id = data().currentUserId
  const existing = data().users[id]
  if (!existing) return
  mutate((db, ctx) => {
    const next: User = { ...existing, ...partial }
    db.users[id] = next
    ctx.put('users', next)
  })
}

// ---------------------------------------------------------------------------
// 标签 / 书籍 / 书架
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 帖子 / 评论
// ---------------------------------------------------------------------------

export function listPosts(sort: 'latest' | 'hot'): Post[] {
  const db = data()
  const pinned = new Set(db.admin.pinnedPostIds)
  const posts = Object.values(db.posts)
  const scored =
    sort === 'latest'
      ? posts.sort((a, b) => b.createdAt - a.createdAt)
      : posts.sort(
          (a, b) =>
            b.stats.likes * 3 +
            b.stats.comments * 2 +
            b.stats.views -
            (a.stats.likes * 3 + a.stats.comments * 2 + a.stats.views),
        )
  return scored.sort((a, b) => (pinned.has(a.id) === pinned.has(b.id) ? 0 : pinned.has(a.id) ? -1 : 1))
}

export function getPost(postId: string): Post | undefined {
  return data().posts[postId]
}

export function incrementPostView(postId: string) {
  const post = data().posts[postId]
  if (!post) return
  mutate((db, ctx) => {
    const next: Post = { ...post, stats: { ...post.stats, views: post.stats.views + 1 } }
    db.posts[postId] = next
    ctx.put('posts', next)
  })
}

export function listComments(postId: string): Comment[] {
  return Object.values(data().comments)
    .filter((c) => c.postId === postId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addComment(input: Omit<Comment, 'id' | 'createdAt'>): Comment {
  return mutate((db, ctx) => {
    const comment: Comment = { ...input, id: nanoid(), createdAt: now() }
    db.comments[comment.id] = comment
    ctx.put('comments', comment)
    const post = db.posts[comment.postId]
    if (post) {
      const next: Post = { ...post, stats: { ...post.stats, comments: post.stats.comments + 1 } }
      db.posts[post.id] = next
      ctx.put('posts', next)
    }
    return comment
  })
}

export function addPost(input: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'stats'>): Post {
  return mutate((db, ctx) => {
    const post: Post = {
      ...input,
      id: nanoid(),
      createdAt: now(),
      updatedAt: now(),
      stats: { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 },
    }
    db.posts[post.id] = post
    ctx.put('posts', post)
    const author = db.users[post.authorId]
    if (author) {
      const next: User = { ...author, stats: { ...author.stats, postsCount: author.stats.postsCount + 1 } }
      db.users[author.id] = next
      ctx.put('users', next)
    }
    return post
  })
}

export function updatePost(postId: string, partial: Partial<Post>) {
  const existing = data().posts[postId]
  if (!existing) return
  mutate((db, ctx) => {
    const next: Post = { ...existing, ...partial, updatedAt: now() }
    db.posts[postId] = next
    ctx.put('posts', next)
  })
}

/** 删除帖子：级联评论、互动、后台引用，并回退作者计数。 */
export function deletePost(postId: string) {
  const db = data()
  const existing = db.posts[postId]
  if (!existing) return
  const comments = Object.values(db.comments).filter((c) => c.postId === postId)
  const interactions = Object.values(db.interactions).filter(
    (i) => i.targetType === 'post' && i.targetId === postId,
  )

  mutate((db2, ctx) => {
    delete db2.posts[postId]
    ctx.del('posts', postId)
    for (const comment of comments) {
      delete db2.comments[comment.id]
      ctx.del('comments', comment.id)
    }
    for (const interaction of interactions) {
      delete db2.interactions[interaction.id]
      ctx.del('interactions', interaction.id)
    }
    const admin = {
      ...db2.admin,
      pinnedPostIds: db2.admin.pinnedPostIds.filter((id) => id !== postId),
      featuredPostIds: db2.admin.featuredPostIds.filter((id) => id !== postId),
    }
    db2.admin = admin
    ctx.meta('admin', admin)
    const author = db2.users[existing.authorId]
    if (author) {
      const next: User = {
        ...author,
        stats: { ...author.stats, postsCount: Math.max(0, author.stats.postsCount - 1) },
      }
      db2.users[author.id] = next
      ctx.put('users', next)
    }
  })
}

// ---------------------------------------------------------------------------
// 笔记
// ---------------------------------------------------------------------------

export function listNotes(sort: 'latest' | 'hot', onlyPublished = true): Note[] {
  const notes = Object.values(data().notes).filter((n) => (onlyPublished ? n.status === 'published' : true))
  return sort === 'latest'
    ? notes.sort((a, b) => b.createdAt - a.createdAt)
    : notes.sort(
        (a, b) =>
          b.stats.likes * 3 + b.stats.comments * 2 + b.stats.views - (a.stats.likes * 3 + a.stats.comments * 2 + a.stats.views),
      )
}

export function getNote(noteId: string): Note | undefined {
  return data().notes[noteId]
}

export async function addOrUpdateNote(
  note: Partial<Note> & Pick<Note, 'authorId' | 'title' | 'contentText'>,
): Promise<Note> {
  const id = note.id ?? nanoid()
  const existing = data().notes[id]

  return mutate((db, ctx) => {
    const base: Note =
      existing ??
      ({
        id,
        authorId: note.authorId,
        title: note.title,
        contentText: note.contentText,
        imageUrls: [],
        tags: [],
        createdAt: now(),
        updatedAt: now(),
        status: 'draft',
        template: 'minimal',
        stats: { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 },
      } satisfies Note)

    const merged: Note = {
      ...base,
      ...note,
      id,
      updatedAt: now(),
      imageUrls: note.imageUrls ?? base.imageUrls,
      tags: note.tags ?? base.tags,
      stats: note.stats ?? base.stats,
    }
    db.notes[id] = merged
    ctx.put('notes', merged)
    if (!existing) {
      const user = db.users[merged.authorId]
      if (user) {
        const next: User = { ...user, stats: { ...user.stats, notesCount: user.stats.notesCount + 1 } }
        db.users[user.id] = next
        ctx.put('users', next)
      }
    }
    return merged
  })
}

export function deleteNote(noteId: string) {
  const db = data()
  const existing = db.notes[noteId]
  if (!existing) return
  const interactions = Object.values(db.interactions).filter(
    (i) => i.targetType === 'note' && i.targetId === noteId,
  )
  mutate((db2, ctx) => {
    delete db2.notes[noteId]
    ctx.del('notes', noteId)
    for (const interaction of interactions) {
      delete db2.interactions[interaction.id]
      ctx.del('interactions', interaction.id)
    }
    const author = db2.users[existing.authorId]
    if (author) {
      const next: User = {
        ...author,
        stats: { ...author.stats, notesCount: Math.max(0, author.stats.notesCount - 1) },
      }
      db2.users[author.id] = next
      ctx.put('users', next)
    }
  })
}

// ---------------------------------------------------------------------------
// 互动
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 聚合查询
// ---------------------------------------------------------------------------

export function listContentByTag(tagName: string): { posts: Post[]; notes: Note[] } {
  const db = data()
  const normalized = tagName.startsWith('#') ? tagName : `#${tagName}`
  const posts = Object.values(db.posts).filter((p) => p.tags.includes(normalized))
  const notes = Object.values(db.notes).filter((n) => n.status === 'published' && n.tags.includes(normalized))
  posts.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  notes.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  return { posts, notes }
}

export function listDraftNotesByUser(userId: string): Note[] {
  return Object.values(data().notes)
    .filter((n) => n.authorId === userId && n.status === 'draft')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listPublishedNotesByUser(userId: string): Note[] {
  return Object.values(data().notes)
    .filter((n) => n.authorId === userId && n.status === 'published')
    .sort((a, b) => b.updatedAt - a.updatedAt)
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

// ---------------------------------------------------------------------------
// 管理配置 / 生词 / 阅读记录 / 通知
// ---------------------------------------------------------------------------

export function getAdminConfig() {
  return data().admin ?? defaultAdminConfig()
}

export function updateAdminConfig(partial: Partial<Database['admin']>) {
  mutate((db, ctx) => {
    const admin = { ...db.admin, ...partial }
    db.admin = admin
    ctx.meta('admin', admin)
  })
}

export function addVocabItem(item: Omit<VocabItem, 'id' | 'createdAt'>): VocabItem {
  return mutate((db, ctx) => {
    const v: VocabItem = { ...item, id: nanoid(), createdAt: now() }
    db.vocab[v.id] = v
    ctx.put('vocab', v)
    return v
  })
}

export function listVocab(userId: string, type?: VocabItem['type']): VocabItem[] {
  return Object.values(data().vocab)
    .filter((v) => v.userId === userId && (type ? v.type === type : true))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteVocabItem(id: string) {
  if (!data().vocab[id]) return
  mutate((db, ctx) => {
    delete db.vocab[id]
    ctx.del('vocab', id)
  })
}

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

// ---------------------------------------------------------------------------
// AI 会话与赏析记录
// ---------------------------------------------------------------------------

export function createAIChatThread(userId: string, title?: string): AIChatThread {
  return mutate((db, ctx) => {
    const thread: AIChatThread = {
      id: nanoid(),
      userId,
      title: title ?? '阅读AI对话',
      createdAt: now(),
      updatedAt: now(),
    }
    db.aiChatThreads[thread.id] = thread
    ctx.put('aiChatThreads', thread)
    return thread
  })
}

export function listAIChatThreads(userId: string): AIChatThread[] {
  return Object.values(data().aiChatThreads)
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteAIChatThread(threadId: string) {
  const thread = data().aiChatThreads[threadId]
  if (!thread) return
  const messages = Object.values(data().aiChatMessages).filter((m) => m.threadId === threadId)
  mutate((db, ctx) => {
    delete db.aiChatThreads[threadId]
    ctx.del('aiChatThreads', threadId)
    for (const message of messages) {
      delete db.aiChatMessages[message.id]
      ctx.del('aiChatMessages', message.id)
    }
  })
}

export function addAIChatMessage(
  input: Omit<AIChatMessage, 'createdAt'> & { id?: string; createdAt?: number },
): AIChatMessage {
  return mutate((db, ctx) => {
    const message: AIChatMessage = { ...input, id: input.id ?? nanoid(), createdAt: input.createdAt ?? now() }
    db.aiChatMessages[message.id] = message
    ctx.put('aiChatMessages', message)
    const thread = db.aiChatThreads[message.threadId]
    if (thread) {
      const next: AIChatThread = { ...thread, updatedAt: message.createdAt }
      db.aiChatThreads[thread.id] = next
      ctx.put('aiChatThreads', next)
    }
    return message
  })
}

export function listAIChatMessages(threadId: string): AIChatMessage[] {
  return Object.values(data().aiChatMessages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addAIAnalysisRecord(
  input: Omit<AIAnalysisRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): AIAnalysisRecord {
  return mutate((db, ctx) => {
    const id = input.id ?? nanoid()
    const record: AIAnalysisRecord = {
      id,
      userId: input.userId,
      bookId: input.bookId,
      chapterId: input.chapterId,
      createdAt: input.createdAt ?? now(),
      analysis: input.analysis,
    }
    db.aiAnalysisRecords[id] = record
    ctx.put('aiAnalysisRecords', record)
    return record
  })
}

export function listAIAnalysisRecords(userId: string): AIAnalysisRecord[] {
  return Object.values(data().aiAnalysisRecords)
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteAIAnalysisRecord(id: string) {
  if (!data().aiAnalysisRecords[id]) return
  mutate((db, ctx) => {
    delete db.aiAnalysisRecords[id]
    ctx.del('aiAnalysisRecords', id)
  })
}

// ---------------------------------------------------------------------------
// 导出 / 导入 / 体积
// ---------------------------------------------------------------------------

export function exportDatabaseJson(): string {
  return JSON.stringify(data(), null, 2)
}

export async function importDatabaseJson(json: string): Promise<{ users: number; posts: number; notes: number }> {
  const parsed = safeJsonParse<Partial<Database>>(json)
  if (!parsed || typeof parsed !== 'object') throw new Error('数据文件不是合法的 JSON 对象')
  if (!parsed.users || typeof parsed.users !== 'object') throw new Error('数据文件缺少 users 字段')
  if (typeof parsed.currentUserId !== 'string') throw new Error('数据文件缺少 currentUserId 字段')

  const next = normalizeDatabase(parsed)
  if (!next.users[next.currentUserId]) throw new Error('数据文件的 currentUserId 不在 users 中')

  await writeDatabase(next)
  store.replace(await loadDatabase())
  return {
    users: Object.keys(next.users).length,
    posts: Object.keys(next.posts).length,
    notes: Object.keys(next.notes).length,
  }
}

export function getDatabaseSizeBytes(): number {
  const json = JSON.stringify(data())
  if (typeof Blob !== 'undefined') return new Blob([json]).size
  return json.length
}