import { nanoid } from 'nanoid'
import type { Note, Post, User } from '../../domain/models'
import type { Database } from '../db/schema'
import { mutate } from '../db/store'
import { now, data } from './shared'
import { hydratePost } from './posts'

/** 已发布笔记的互动数来自其引用型帖子；草稿为 0。 */
export function hydrateNote(db: Database, note: Note): Note | undefined {
  if (note.deletedAt) return undefined
  if (note.publishedPostId) {
    const post = db.posts[note.publishedPostId]
    if (post && !post.deletedAt) return { ...note, stats: post.stats }
    return { ...note, stats: { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 } }
  }
  return note
}

export function listNotes(sort: 'latest' | 'hot', onlyPublished = true): Note[] {
  const db = data()
  const notes = Object.values(db.notes)
    .map((note) => hydrateNote(db, note))
    .filter((note): note is Note => Boolean(note))
    .filter((note) => (onlyPublished ? note.status === 'published' : true))
  return sort === 'latest'
    ? notes.sort((a, b) => b.createdAt - a.createdAt)
    : notes.sort(
        (a, b) =>
          b.stats.likes * 3 + b.stats.comments * 2 + b.stats.views - (a.stats.likes * 3 + a.stats.comments * 2 + a.stats.views),
      )
}

export function getNote(noteId: string): Note | undefined {
  const db = data()
  const note = db.notes[noteId]
  return note ? hydrateNote(db, note) : undefined
}

export async function addOrUpdateNote(
  note: Partial<Note> & Pick<Note, 'authorId' | 'title' | 'contentText'>,
): Promise<Note> {
  const id = note.id ?? nanoid()
  const existing = data().notes[id]
  if (existing?.deletedAt) throw new Error('笔记已删除')

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

/** 发布：幂等创建/恢复引用型帖子；帖子不存正文，读取时从笔记 join。 */
export function publishNote(noteId: string, actorId: string): { note: Note; post: Post } {
  const db = data()
  const note = db.notes[noteId]
  if (!note || note.deletedAt) throw new Error('笔记不存在或已删除')
  if (note.authorId !== actorId) throw new Error('只能发布自己的笔记')

  return mutate((db2, ctx) => {
    const current = db2.notes[noteId]
    if (!current) throw new Error('笔记不存在')
    let post = current.publishedPostId ? db2.posts[current.publishedPostId] : undefined
    if (post) {
      post = { ...post, deletedAt: undefined, title: current.title, tags: current.tags, updatedAt: now() }
    } else {
      post = {
        id: nanoid(),
        authorId: current.authorId,
        kind: 'note',
        noteId: current.id,
        title: current.title,
        contentText: '',
        imageUrls: [],
        tags: current.tags,
        createdAt: now(),
        updatedAt: now(),
        stats: { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 },
      }
      const author = db2.users[current.authorId]
      if (author) {
        const next: User = { ...author, stats: { ...author.stats, postsCount: author.stats.postsCount + 1 } }
        db2.users[author.id] = next
        ctx.put('users', next)
      }
    }
    db2.posts[post.id] = post
    ctx.put('posts', post)
    const published: Note = { ...current, status: 'published', publishedPostId: post.id, updatedAt: now() }
    db2.notes[noteId] = published
    ctx.put('notes', published)
    return { note: published, post }
  })
}

export function unpublishNote(noteId: string, actorId: string) {
  const db = data()
  const note = db.notes[noteId]
  if (!note || note.deletedAt) return
  if (note.authorId !== actorId) throw new Error('只能取消发布自己的笔记')
  mutate((db2, ctx) => {
    const current = db2.notes[noteId]
    if (!current) return
    const post = current.publishedPostId ? db2.posts[current.publishedPostId] : undefined
    if (post && !post.deletedAt) {
      const nextPost: Post = { ...post, deletedAt: now(), updatedAt: now() }
      db2.posts[post.id] = nextPost
      ctx.put('posts', nextPost)
      const author = db2.users[current.authorId]
      if (author) {
        const nextAuthor: User = { ...author, stats: { ...author.stats, postsCount: Math.max(0, author.stats.postsCount - 1) } }
        db2.users[nextAuthor.id] = nextAuthor
        ctx.put('users', nextAuthor)
      }
    }
    const draft: Note = { ...current, status: 'draft', updatedAt: now() }
    db2.notes[noteId] = draft
    ctx.put('notes', draft)
  })
}

export function deleteNote(noteId: string) {
  const db = data()
  const existing = db.notes[noteId]
  if (!existing || existing.deletedAt) return
  const author = db.users[existing.authorId]
  const post = existing.publishedPostId ? db.posts[existing.publishedPostId] : undefined
  mutate((db2, ctx) => {
    const next: Note = { ...existing, deletedAt: now(), updatedAt: now() }
    db2.notes[noteId] = next
    ctx.put('notes', next)
    if (post && !post.deletedAt) {
      const nextPost: Post = { ...post, deletedAt: now(), updatedAt: now() }
      db2.posts[post.id] = nextPost
      ctx.put('posts', nextPost)
    }
    if (author) {
      const nextAuthor: User = { ...author, stats: { ...author.stats, notesCount: Math.max(0, author.stats.notesCount - 1) } }
      db2.users[author.id] = nextAuthor
      ctx.put('users', nextAuthor)
    }
  })
}

export function restoreNote(noteId: string) {
  const db = data()
  const existing = db.notes[noteId]
  if (!existing || !existing.deletedAt) return
  const author = db.users[existing.authorId]
  mutate((db2, ctx) => {
    const next: Note = { ...existing, deletedAt: undefined, updatedAt: now() }
    db2.notes[noteId] = next
    ctx.put('notes', next)
    if (author) {
      const nextAuthor: User = { ...author, stats: { ...author.stats, notesCount: author.stats.notesCount + 1 } }
      db2.users[author.id] = nextAuthor
      ctx.put('users', nextAuthor)
    }
  })
}

export function listDraftNotesByUser(userId: string): Note[] {
  return Object.values(data().notes)
    .filter((note) => note.authorId === userId && note.status === 'draft' && !note.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listPublishedNotesByUser(userId: string): Note[] {
  return Object.values(data().notes)
    .filter((note) => note.authorId === userId && note.status === 'published' && !note.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listContentByTag(tagName: string): { posts: Post[]; notes: Note[] } {
  const db = data()
  const normalized = tagName.startsWith('#') ? tagName : `#${tagName}`
  const posts = Object.values(db.posts)
    .map((post) => hydratePost(db, post))
    .filter((post): post is Post => Boolean(post))
    .filter((post) => post.tags.includes(normalized))
  const notes = Object.values(db.notes)
    .map((note) => hydrateNote(db, note))
    .filter((note): note is Note => Boolean(note))
    .filter((note) => note.status === 'published' && note.tags.includes(normalized))
  posts.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  notes.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  return { posts, notes }
}