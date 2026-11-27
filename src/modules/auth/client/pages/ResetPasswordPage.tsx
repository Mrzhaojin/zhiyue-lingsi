import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '..'
import type { AuthApiError } from '../types'

function normalizeError(error: unknown): string {
  const err = error as Partial<AuthApiError> | undefined
  return err?.message ?? '重置失败，链接可能已过期'
}

/**
 * 重置密码落地页。
 * Supabase 的恢复链接会带着 code 回到应用，detectSessionInUrl 会把它换成临时会话，
 * 这个页面直接用该会话调用 updateUser 设置新密码。
 */
export function ResetPasswordPage() {
  const { resetPassword, mode } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('新密码至少 8 位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    try {
      await resetPassword({ newPassword: password })
      navigate('/zhiyueling-si/login?reset=ok', { replace: true })
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: 16 }}>
      <h2 style={{ margin: '0 0 12px' }}>设置新密码</h2>
      {mode === 'local' ? (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
          本地演示模式没有邮箱服务，重置密码不可用，请直接登录。
        </div>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>新密码</span>
          <input
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>确认新密码</span>
          <input
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type="password"
            autoComplete="new-password"
          />
        </label>
        {error ? <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div> : null}
        <button className="btn primary" disabled={submitting} type="submit">
          {submitting ? '提交中...' : '确认修改'}
        </button>
        <Link to="/zhiyueling-si/login" style={{ fontSize: 13, color: 'var(--accent)' }}>
          返回登录
        </Link>
      </form>
    </div>
  )
}