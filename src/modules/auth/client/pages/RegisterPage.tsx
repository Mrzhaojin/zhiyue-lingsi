import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuthApiError } from '../types'
import { useAuth } from '../AuthProvider'

function normalizeError(e: unknown) {
  const err = e as Partial<AuthApiError> | undefined
  if (err?.message) return err.message
  return '注册失败，请稍后重试'
}

export function RegisterPage() {
  const { api } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (username.trim().length < 3) {
      setError('用户名至少3位')
      return
    }
    if (!email.includes('@')) {
      setError('请输入有效邮箱')
      return
    }
    if (password.length < 8) {
      setError('密码至少8位')
      return
    }
    setSubmitting(true)
    try {
      await api.register({ username: username.trim(), email: email.trim(), password })
      setOk(true)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '24px auto', padding: 16 }}>
      <h2 style={{ margin: '0 0 12px' }}>注册</h2>
      {ok ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>注册成功：请前往邮箱完成激活后再登录。</div>
          <Link to="/zhiyueling-si/login">返回登录</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>用户名</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>邮箱</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>密码</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>
          {error ? <div style={{ color: '#b42318' }}>{error}</div> : null}
          <button disabled={submitting} type="submit">
            {submitting ? '提交中...' : '创建账号'}
          </button>
          <div>
            已有账号？<Link to="/zhiyueling-si/login">去登录</Link>
          </div>
        </form>
      )}
    </div>
  )
}
