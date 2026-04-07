import React, { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { AuthApiError } from '../types'
import { useAuth } from '../AuthProvider'

function normalizeError(e: unknown) {
  const err = e as Partial<AuthApiError> | undefined
  if (err?.message) return err.message
  return '登录失败，请稍后重试'
}

export function LoginPage() {
  const { loginWithPassword, state } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const from = useMemo(() => params.get('from') ?? '/', [params])
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!identifier.trim() || !password) {
      setError('请输入用户名/邮箱和密码')
      return
    }
    setSubmitting(true)
    try {
      await loginWithPassword({ identifier: identifier.trim(), password, remember })
      navigate(from, { replace: true })
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
      <div className="card" style={{ padding: '32px', boxShadow: 'var(--shadow-lg)' }}>
        <h2 className="h2" style={{ textAlign: 'center', marginBottom: '32px' }}>登录</h2>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--text-h)', fontWeight: '400' }}>用户名/邮箱</label>
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              inputMode="email"
              placeholder="例如：admin 或 admin@example.com"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: 'var(--text-h)', fontWeight: '400' }}>密码</label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input 
              type="checkbox" 
              checked={remember} 
              onChange={(e) => setRemember(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: 'var(--accent)'
              }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>记住登录状态</span>
          </div>
          {error ? (
            <div style={{ 
              color: 'var(--danger)', 
              fontSize: '13px', 
              textAlign: 'center',
              padding: '12px',
              background: 'var(--danger-bg)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--danger)'
            }}>
              {error}
            </div>
          ) : null}
          <button 
            className="btn primary"
            style={{ 
              padding: '16px',
              fontSize: '16px',
              fontWeight: '400'
            }}
            disabled={submitting || state.status === 'loading'}
            type="submit"
          >
            {submitting || state.status === 'loading' ? '登录中...' : '登录'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <Link 
              to="/zhiyueling-si/register" 
              style={{ 
                fontSize: '13px', 
                color: 'var(--accent)',
                transition: 'color 0.3s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-h)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent)'}
            >
              注册
            </Link>
            <Link 
              to="/zhiyueling-si/forgot" 
              style={{ 
                fontSize: '13px', 
                color: 'var(--accent)',
                transition: 'color 0.3s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-h)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent)'}
            >
              忘记密码
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
