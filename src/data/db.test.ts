import { beforeEach, describe, expect, it } from 'vitest'
import {
  ensureDbInitialized,
  ensureUserRecord,
  exportDatabaseJson,
  getCurrentUser,
  getDbSnapshot,
  importDatabaseJson,
} from './db'

describe('local database', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ensureDbInitialized()
  })

  it('初始化后存在种子数据与当前用户', () => {
    const db = getDbSnapshot()
    expect(Object.keys(db.books).length).toBeGreaterThan(0)
    expect(getCurrentUser().id).toBeTruthy()
  })

  it('登录身份可以绑定为数据层当前用户', () => {
    const before = getCurrentUser().id
    const bound = ensureUserRecord({ id: 'user-1', nickname: '测试读者', role: 'user' })
    const current = getCurrentUser()
    expect(bound.id).toBe('user-1')
    expect(current.id).toBe('user-1')
    expect(current.nickname).toBe('测试读者')
    expect(before).not.toBe('user-1')
  })

  it('导出后重新导入不丢数据', () => {
    ensureUserRecord({ id: 'user-1', nickname: '测试读者' })
    const json = exportDatabaseJson()
    expect(JSON.parse(json).version).toBe(4)

    const stats = importDatabaseJson(json)
    expect(stats.users).toBeGreaterThan(0)
    expect(stats.posts).toBeGreaterThan(0)
    expect(getCurrentUser().id).toBe('user-1')
  })

  it('拒绝格式错误的数据文件', () => {
    expect(() => importDatabaseJson('{"users":{}}')).toThrow()
    expect(() => importDatabaseJson('not json')).toThrow()
  })
})