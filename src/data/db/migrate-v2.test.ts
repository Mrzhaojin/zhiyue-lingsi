import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { dexie } from './persist'

const V1_SCHEMA = {
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
}

const stats = { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 }

describe('IndexedDB v1 → v2 迁移', () => {
  beforeEach(async () => {
    await dexie.close()
    await Dexie.delete('zhiyue-lingsi')
  })

  it('拆分章节、补来源、关联已发布笔记与帖子', async () => {
    const legacy = new Dexie('zhiyue-lingsi')
    legacy.version(1).stores(V1_SCHEMA)
    await legacy.open()

    await legacy.table('books').put({
      id: 'b1',
      title: '旧书',
      author: '作者',
      category: '小说',
      difficulty: '入门',
      summary: '',
      recommendedHeat: 50,
      aiReason: '',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [{ id: 'c1', title: '第一章', content: '正文' }],
    })
    await legacy.table('posts').put({
      id: 'p1',
      authorId: 'u1',
      title: '笔记分享',
      contentText: '正文',
      imageUrls: [],
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      stats,
    })
    await legacy.table('notes').put({
      id: 'n1',
      authorId: 'u1',
      title: '笔记分享',
      contentText: '正文',
      imageUrls: [],
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      status: 'published',
      template: 'minimal',
      stats,
    })
    legacy.close()

    await dexie.open()

    const chapters = await dexie.chapters.toArray()
    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toMatchObject({ bookId: 'b1', ordinal: 0, title: '第一章' })

    const book = await dexie.books.get('b1')
    expect(book && 'chapters' in book).toBe(false)
    expect(book?.source).toMatchObject({ type: 'excerpt', license: 'unverified' })

    const post = await dexie.posts.get('p1')
    expect(post).toMatchObject({ kind: 'note', noteId: 'n1', contentText: '' })

    const note = await dexie.notes.get('n1')
    expect(note?.publishedPostId).toBe('p1')

    await dexie.close()
    await Dexie.delete('zhiyue-lingsi')
  })
})