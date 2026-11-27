import { beforeEach, describe, expect, it } from 'vitest'
import { initializeDatabase } from '../../db'
import { dexie } from '../../db/persist'
import { store } from '../../db/store'
import { reconcileCounters } from '../../core/counters'
import { repositories } from '..'

async function reset() {
  await store.flush()
  await dexie.delete()
  window.localStorage.clear()
  await initializeDatabase()
}

async function author() {
  return repositories.profiles.ensure({ id: 'c2-user', nickname: 'C2 测试' })
}

describe('c2 引用型发布与软删除', () => {
  beforeEach(reset)

  it('发布笔记幂等创建引用型帖子，读取时取回笔记正文', async () => {
    const user = await author()
    const note = await repositories.notes.save({ authorId: user.id, title: '引用测试', contentText: '笔记正文' })

    const first = await repositories.notes.publish(note.id, user.id)
    await store.flush()
    expect(first.post.kind).toBe('note')
    expect((await dexie.posts.get(first.post.id))?.contentText).toBe('')

    const view = await repositories.posts.get(first.post.id)
    expect(view).toMatchObject({ title: '引用测试', contentText: '笔记正文' })

    const second = await repositories.notes.publish(note.id, user.id)
    expect(second.post.id).toBe(first.post.id)
    expect(await dexie.posts.where('noteId').equals(note.id).count()).toBe(1)
  })

  it('取消发布软删帖子，重新发布复用同一帖子', async () => {
    const user = await author()
    const note = await repositories.notes.save({ authorId: user.id, title: '发布-取消', contentText: '正文' })
    const { post } = await repositories.notes.publish(note.id, user.id)

    await repositories.notes.unpublish(note.id, user.id)
    await store.flush()
    expect(await repositories.posts.get(post.id)).toBeNull()
    expect((await dexie.posts.get(post.id))?.deletedAt).toBeTruthy()

    const again = await repositories.notes.publish(note.id, user.id)
    expect(again.post.id).toBe(post.id)
    expect(await repositories.posts.get(post.id)).not.toBeNull()
  })

  it('笔记点赞代理到其发布帖，草稿不可互动', async () => {
    const user = await author()
    const note = await repositories.notes.save({ authorId: user.id, title: '互动代理', contentText: '正文' })
    await repositories.notes.publish(note.id, user.id)
    const published = await repositories.notes.get(note.id)
    const post = await repositories.posts.get(published!.publishedPostId!)

    await repositories.interactions.toggle(user.id, 'like', 'note', note.id)
    expect((await repositories.posts.get(post!.id))!.stats.likes).toBe(post!.stats.likes + 1)
    expect(await repositories.interactions.has(user.id, 'like', 'note', note.id)).toBe(true)

    const draft = await repositories.notes.save({ authorId: user.id, title: '草稿', contentText: '正文' })
    await repositories.interactions.toggle(user.id, 'like', 'note', draft.id)
    expect(await repositories.interactions.has(user.id, 'like', 'note', draft.id)).toBe(false)
  })

  it('对账修正被破坏的计数', async () => {
    const user = await author()
    const post = await repositories.posts.create({ authorId: user.id, title: '对账', contentText: 'x', imageUrls: [], tags: [] })
    await repositories.interactions.toggle(user.id, 'like', 'post', post.id)
    await repositories.posts.update(post.id, { stats: { ...post.stats, likes: 99, collects: 7 } })

    const result = reconcileCounters()
    await store.flush()
    expect(result.fixed).toBeGreaterThanOrEqual(1)
    expect((await repositories.posts.get(post.id))!.stats).toMatchObject({ likes: 1, collects: 0, comments: 0 })
  })
})