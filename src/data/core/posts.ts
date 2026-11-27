import { nanoid } from 'nanoid'
import type { Comment, Post, User } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

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
