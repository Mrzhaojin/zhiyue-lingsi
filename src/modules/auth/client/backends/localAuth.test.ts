import { beforeEach, describe, expect, it } from 'vitest'
import type { AuthState } from '../types'
import { createLocalAuthBackend } from './localAuth'

describe('localAuth backend', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('以任意邮箱登录，并把 persona 持久化', async () => {
    const backend = createLocalAuthBackend()
    const states: AuthState[] = []
    backend.init((state) => states.push(state))
    expect(states[0]?.status).toBe('anonymous')

    const user = await backend.login({ email: 'demo@example.com', password: '123456' })
    expect(user.email).toBe('demo@example.com')
    expect(user.roles).toContain('admin')

    const again = await backend.login({ email: 'DEMO@example.com', password: '123456' })
    expect(again.id).toBe(user.id)
  })

  it('拒绝过短密码与非法邮箱', async () => {
    const backend = createLocalAuthBackend()
    await expect(backend.login({ email: 'a@b.com', password: '123' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(backend.login({ email: 'not-an-email', password: '123456' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('重启后恢复会话，登出后回到匿名', async () => {
    const first = createLocalAuthBackend()
    await first.login({ email: 'a@b.com', password: '123456' })

    const second = createLocalAuthBackend()
    const restored: AuthState[] = []
    second.init((state) => restored.push(state))
    expect(restored[0]?.status).toBe('authenticated')

    await second.logout()
    const third = createLocalAuthBackend()
    const afterLogout: AuthState[] = []
    third.init((state) => afterLogout.push(state))
    expect(afterLogout[0]?.status).toBe('anonymous')
  })

  it('拒绝重复注册', async () => {
    const backend = createLocalAuthBackend()
    await backend.register({ email: 'a@b.com', password: '12345678', username: 'alice' })
    await expect(
      backend.register({ email: 'a@b.com', password: '12345678', username: 'alice' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('本地模式不提供找回密码', async () => {
    const backend = createLocalAuthBackend()
    await expect(backend.forgotPassword({ email: 'a@b.com' })).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })
})