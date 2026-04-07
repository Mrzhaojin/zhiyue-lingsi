import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuthApiError } from '../types'
import { useAuth } from '../AuthProvider'

function normalizeError(e: unknown) {
  const err = e as Partial<AuthApiError> | undefined
  if (err?.message) return err.message
  return '操作失败，请稍后重试'
}

export function ForgotPasswordPage() {
  const { api } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.includes('@')) {
      setError('请输入有效邮箱')
      return
    }
    setSubmitting(true)
    try {
      await api.forgotPassword({ email: email.trim() })
      setOk(true)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '24px auto', padding: 16 }}>
      <h2 style={{ margin: '0 0 12px' }}>忘记密码</h2>
      {ok ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>如果该邮箱存在，我们已发送重置链接（请检查收件箱/垃圾箱）。</div>
          <Link to="/zhiyueling-si/login">返回登录</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>邮箱</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
          </label>
          {error ? <div style={{ color: '#b42318' }}>{error}</div> : null}
          <button disabled={submitting} type="submit">
            {submitting ? '发送中...' : '发送重置邮件'}
          </button>
          <div>
            <Link to="/zhiyueling-si/login">返回登录</Link>
          </div>
        </form>
      )}
    </div>
  )
}
