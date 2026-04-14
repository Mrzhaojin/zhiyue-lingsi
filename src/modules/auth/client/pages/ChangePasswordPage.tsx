import React, { useState } from 'react'
import type { AuthApiError } from '../types'
import { useAuth } from '../AuthProvider'
import { RequireAuth } from '../RequireAuth'

function normalizeError(e: unknown) {
  const err = e as Partial<AuthApiError> | undefined
  if (err?.message) return err.message
  return '修改失败，请稍后重试'
}

export function ChangePasswordPage() {
  const { changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError('新密码至少8位')
      return
    }
    setSubmitting(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setOk(true)
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <RequireAuth>
      <div style={{ maxWidth: 420, margin: '24px auto', padding: 16 }}>
        <h2 style={{ margin: '0 0 12px' }}>修改密码</h2>
        {ok ? <div style={{ marginBottom: 12, color: '#027a48' }}>修改成功</div> : null}
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>当前密码</span>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>新密码</span>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          {error ? <div style={{ color: '#b42318' }}>{error}</div> : null}
          <button disabled={submitting} type="submit">
            {submitting ? '提交中...' : '确认修改'}
          </button>
        </form>
      </div>
    </RequireAuth>
  )
}

