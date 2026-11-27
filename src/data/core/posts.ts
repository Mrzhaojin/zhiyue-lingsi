import { nanoid } from 'nanoid'
import type { Comment, Note, Post, User } from '../../domain/models'
import type { Database } from '../db/schema'
import { mutate } from '../db/store'
import { now, data } from './shared'

/** 过滤软删，并把引用型帖子的正文/标题/图片/标签从笔记取回。 */
export function hydratePost(db: Database, post: Post): Post | undefined {
  if (post.deletedAt) return undefined
  if (post.kind === 'note' && post.noteId) {
    const note: Note | undefined = db.notes[post.noteId]
    if (!note || note.deletedAt) return undefined
    return {
      ...post,
      title: note.title,
      contentText: note.contentText,
      imageUrls: note.imageUrls,
      tags: note.tags,
    }
  }
  return post
}

export function listPosts(sort: 'latest' | 'hot'): Post[] {
  const db = data()
  const pinned = new Set(db.admin.pinnedPostIds)
  const posts = Object.values(db.posts)
    .map((post) => hydratePost(db, post))
    .filter((post): post is Post => Boolean(post))
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
  const db = data()
  const post = db.posts[postId]
  return post ? hydratePost(db, post) : undefined
}

export function incrementPostView(postId: string) {
  const post = data().posts[postId]
  if (!post || post.deletedAt) return
  mutate((db, ctx) => {
    const next: Post = { ...post, stats: { ...post.stats, views: post.stats.views + 1 } }
    db.posts[postId] = next
    ctx.put('posts', next)
  })
}

export function listComments(postId: string): Comment[] {
  const post = data().posts[postId]
  if (!post || post.deletedAt) return []
  return Object.values(data().comments)
    .filter((comment) => comment.postId === postId && !comment.deletedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addComment(input: Omit<Comment, 'id' | 'createdAt'>): Comment {
  const post = data().posts[input.postId]
  if (!post || post.deletedAt) throw new Error('帖子不存在或已删除')
  return mutate((db, ctx) => {
    const comment: Comment = { ...input, id: nanoid(), createdAt: now() }
    db.comments[comment.id] = comment
    ctx.put('comments', comment)
    const next: Post = { ...post, stats: { ...post.stats, comments: post.stats.comments + 1 } }
    db.posts[post.id] = next
    ctx.put('posts', next)
    return comment
  })
}

export function addPost(input: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'stats'>): Post {
  return mutate((db, ctx) => {
    const post: Post = {
      ...input,
      kind: input.kind ?? 'original',
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
  if (!existing || existing.deletedAt) return
  mutate((db, ctx) => {
    const next: Post = { ...existing, ...partial, updatedAt: now() }
    db.posts[postId] = next
    ctx.put('posts', next)
  })
}

/** 软删除：保留评论与互动，30 天内可恢复；立即从所有列表/详情中隐藏。 */
export function deletePost(postId: string) {
  const db = data()
  const existing = db.posts[postId]
  if (!existing || existing.deletedAt) return
  const author = db.users[existing.authorId]

  mutate((db2, ctx) => {
    const next: Post = { ...existing, deletedAt: now(), updatedAt: now() }
    db2.posts[postId] = next
    ctx.put('posts', next)
    const admin = {
      ...db2.admin,
      pinnedPostIds: db2.admin.pinnedPostIds.filter((id) => id !== postId),
      featuredPostIds: db2.admin.featuredPostIds.filter((id) => id !== postId),
    }
    db2.admin = admin
    ctx.meta('admin', admin)
    if (author) {
      const nextAuthor: User = {
        ...author,
        stats: { ...author.stats, postsCount: Math.max(0, author.stats.postsCount - 1) },
      }
      db2.users[author.id] = nextAuthor
      ctx.put('users', nextAuthor)
    }
  })
}

export function restorePost(postId: string) {
  const db = data()
  const existing = db.posts[postId]
  if (!existing || !existing.deletedAt) return
  const author = db.users[existing.authorId]
  mutate((db2, ctx) => {
    const next: Post = { ...existing, deletedAt: undefined, updatedAt: now() }
    db2.posts[postId] = next
    ctx.put('posts', next)
    if (author) {
      const nextAuthor: User = { ...author, stats: { ...author.stats, postsCount: author.stats.postsCount + 1 } }
      db2.users[author.id] = nextAuthor
      ctx.put('users', nextAuthor)
    }
  })
}