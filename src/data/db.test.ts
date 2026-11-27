import { beforeEach, describe, expect, it } from 'vitest'
import {
  addComment,
  addPost,
  deletePost,
  restorePost,
  ensureUserRecord,
  exportDatabaseJson,
  getCurrentUser,
  getDbSnapshot,
  importDatabaseJson,
  initializeDatabase,
  listComments,
} from './db'
import { dexie } from './db/persist'
import { store } from './db/store'

async function resetAppData() {
  await dexie.delete()
  window.localStorage.clear()
  await initializeDatabase()
}

describe('IndexedDB 数据层', () => {
  beforeEach(resetAppData)

  it('初始化后写入种子数据与当前用户', () => {
    const db = getDbSnapshot()
    expect(Object.keys(db.books).length).toBeGreaterThan(0)
    expect(Object.keys(db.posts).length).toBeGreaterThan(0)
    expect(getCurrentUser().id).toBeTruthy()
  })

  it('写入时拆章节，读取时组装，并补齐来源', async () => {
    const db = getDbSnapshot()
    const book = Object.values(db.books)[0]
    expect(book.chapters.length).toBeGreaterThan(0)
    expect(await dexie.chapters.count()).toBeGreaterThan(0)

    const stored = await dexie.books.get(book.id)
    expect(stored && 'chapters' in stored).toBe(false)
    expect(stored?.source?.type).toBe('excerpt')

    const schema = await dexie.meta.get('schema')
    expect(schema?.value).toMatchObject({ version: 2 })
  })

  it('登录身份可以绑定为数据层当前用户', () => {
    const before = getCurrentUser().id
    const bound = ensureUserRecord({ id: 'user-1', nickname: '测试读者', role: 'user' })
    expect(bound.id).toBe('user-1')
    expect(getCurrentUser().id).toBe('user-1')
    expect(getCurrentUser().nickname).toBe('测试读者')
    expect(before).not.toBe('user-1')
  })

  it('写操作按实体落盘，而不是重写整库', async () => {
    const user = ensureUserRecord({ id: 'user-1', nickname: '测试读者' })
    const post = addPost({
      authorId: user.id,
      title: '持久化测试',
      contentText: '只写一条记录',
      imageUrls: [],
      tags: [],
    })
    await store.flush()

    const stored = await dexie.posts.get(post.id)
    expect(stored?.title).toBe('持久化测试')
    // 内存快照同步更新，页面无需等待磁盘
    expect(getDbSnapshot().posts[post.id]?.title).toBe('持久化测试')
  })

  it('写入会 bump 版本，订阅者立即收到通知', () => {
    const user = ensureUserRecord({ id: 'user-1', nickname: '测试读者' })
    let hits = 0
    const unsubscribe = store.subscribe(() => {
      hits += 1
    })
    addPost({ authorId: user.id, title: '订阅测试', contentText: 'x', imageUrls: [], tags: [] })
    unsubscribe()
    expect(hits).toBe(1)
  })

  it('删除帖子为软删：隐藏但保留评论，可恢复', async () => {
    const user = ensureUserRecord({ id: 'user-1', nickname: '测试读者' })
    const post = addPost({ authorId: user.id, title: '待删除', contentText: 'x', imageUrls: [], tags: [] })
    addComment({ postId: post.id, authorId: user.id, contentText: '评论', imageUrls: [] })
    expect(listComments(post.id)).toHaveLength(1)

    deletePost(post.id)
    await store.flush()

    expect(getDbSnapshot().posts[post.id]?.deletedAt).toBeTruthy()
    expect(listComments(post.id)).toHaveLength(0)
    expect(await dexie.comments.where('postId').equals(post.id).count()).toBe(1)
    expect(getCurrentUser().stats.postsCount).toBe(0)

    restorePost(post.id)
    await store.flush()
    expect(getDbSnapshot().posts[post.id]?.deletedAt).toBeUndefined()
    expect(listComments(post.id)).toHaveLength(1)
    expect(getCurrentUser().stats.postsCount).toBe(1)
  })

  it('导出后重新导入不丢数据', async () => {
    ensureUserRecord({ id: 'user-1', nickname: '测试读者' })
    const json = exportDatabaseJson()
    expect(JSON.parse(json).version).toBe(4)

    const stats = await importDatabaseJson(json)
    expect(stats.users).toBeGreaterThan(0)
    expect(stats.posts).toBeGreaterThan(0)
    expect(getCurrentUser().id).toBe('user-1')
  })

  it('拒绝格式错误的数据文件', async () => {
    await expect(importDatabaseJson('{"users":{}}')).rejects.toThrow()
    await expect(importDatabaseJson('not json')).rejects.toThrow()
  })
})

describe('旧 localStorage 数据迁移', () => {
  it('首次启动时把旧 JSON 迁移进 IndexedDB，并保留旧 key 作为备份', async () => {
    await dexie.delete()
    window.localStorage.clear()
    const legacy = {
      version: 4,
      users: {
        'legacy-user': {
          id: 'legacy-user',
          role: 'user',
          nickname: '老用户',
          createdAt: 1,
          stats: { readingMinutes: 1, postsCount: 0, notesCount: 0, followersCount: 0, followingCount: 0 },
        },
      },
      currentUserId: 'legacy-user',
      posts: {},
    }
    window.localStorage.setItem('read_forum_db_v5', JSON.stringify(legacy))

    const result = await initializeDatabase()
    expect(result.source).toBe('legacy')
    expect(result.counts?.users).toBe(1)
    expect(getCurrentUser().nickname).toBe('老用户')
    expect(window.localStorage.getItem('read_forum_db_v5')).not.toBeNull()
    expect(await dexie.users.get('legacy-user')).toBeTruthy()
  })
})