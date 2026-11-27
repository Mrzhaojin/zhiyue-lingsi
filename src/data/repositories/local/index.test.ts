import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../../domain/errors'
import { initializeDatabase } from '../../db'
import { dexie } from '../../db/persist'
import { store } from '../../db/store'
import { repositories } from '..'

async function reset() {
  await store.flush()
  await dexie.delete()
  window.localStorage.clear()
  await initializeDatabase()
}

async function seedAuthor() {
  return repositories.profiles.ensure({ id: 'test-user', nickname: '测试读者' })
}

describe('PostRepository', () => {
  beforeEach(reset)

  it('按最新分页且游标不重复', async () => {
    const user = await seedAuthor()
    for (let i = 0; i < 5; i += 1) {
      await repositories.posts.create({
        authorId: user.id,
        title: `分页测试 ${i}`,
        contentText: '内容',
        imageUrls: [],
        tags: [],
      })
    }

    const first = await repositories.posts.list({ sort: 'latest', limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeTruthy()

    const second = await repositories.posts.list({ sort: 'latest', limit: 2, cursor: first.nextCursor })
    expect(second.items).toHaveLength(2)
    const firstIds = first.items.map((post) => post.id)
    expect(firstIds).not.toContain(second.items[0]?.id)
  })

  it('更新不存在的帖子抛 NOT_FOUND', async () => {
    await expect(repositories.posts.update('missing', { title: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('拒绝空标题', async () => {
    const user = await seedAuthor()
    await expect(
      repositories.posts.create({ authorId: user.id, title: '   ', contentText: 'x', imageUrls: [], tags: [] }),
    ).rejects.toBeInstanceOf(AppError)
  })
})

describe('InteractionRepository', () => {
  beforeEach(reset)

  it('重复切换回到未激活，且计数不漂移', async () => {
    const user = await seedAuthor()
    const post = (await repositories.posts.list({ sort: 'latest', limit: 1 })).items[0]!
    const base = post.stats.likes

    const on = await repositories.interactions.toggle(user.id, 'like', 'post', post.id)
    expect(on.active).toBe(true)
    expect((await repositories.posts.get(post.id))!.stats.likes).toBe(base + 1)

    const off = await repositories.interactions.toggle(user.id, 'like', 'post', post.id)
    expect(off.active).toBe(false)
    expect((await repositories.posts.get(post.id))!.stats.likes).toBe(base)
  })
})

describe('NoteRepository / CommentRepository', () => {
  beforeEach(reset)

  it('保存笔记后可读取，删除后为 null', async () => {
    const user = await seedAuthor()
    const note = await repositories.notes.save({
      authorId: user.id,
      title: '契约测试笔记',
      contentText: '正文',
    })
    expect(await repositories.notes.get(note.id)).toMatchObject({ title: '契约测试笔记' })
    await repositories.notes.remove(note.id)
    expect(await repositories.notes.get(note.id)).toBeNull()
  })

  it('评论写入后可按帖子读取', async () => {
    const user = await seedAuthor()
    const post = (await repositories.posts.list({ sort: 'latest', limit: 1 })).items[0]!
    await repositories.comments.create({ postId: post.id, authorId: user.id, contentText: '评论', imageUrls: [] })
    const list = await repositories.comments.listByPost(post.id)
    expect(list.at(-1)?.contentText).toBe('评论')
  })
})

describe('BookRepository / BackupRepository', () => {
  beforeEach(reset)

  it('按语言过滤书库并分页', async () => {
    const page = await repositories.books.list({ language: 'en', limit: 2 })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((book) => book.language === 'en')).toBe(true)
  })

  it('导出后可回导且数据条数一致', async () => {
    const before = (await repositories.backup.exportJson()).length
    expect(before).toBeGreaterThan(0)
    const json = await repositories.backup.exportJson()
    const stats = await repositories.backup.importJson(json)
    expect(stats.posts).toBeGreaterThan(0)
    expect(await repositories.backup.exportJson()).toBe(json)
  })
})