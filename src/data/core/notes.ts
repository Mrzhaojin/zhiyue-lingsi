import { nanoid } from 'nanoid'
import type { Note, Post, User } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

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

export function listContentByTag(tagName: string): { posts: Post[]; notes: Note[] } {
  const db = data()
  const normalized = tagName.startsWith('#') ? tagName : `#${tagName}`
  const posts = Object.values(db.posts).filter((p) => p.tags.includes(normalized))
  const notes = Object.values(db.notes).filter((n) => n.status === 'published' && n.tags.includes(normalized))
  posts.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  notes.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  return { posts, notes }
}
