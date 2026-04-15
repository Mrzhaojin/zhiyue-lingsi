import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuthApiError } from '../types'
import { useAuth } from '..'

// 添加CSS样式
const styles = `
  /* 移动端媒体查询 */
  @media (max-width: 767px) {
    .forgot-password-container {
      max-width: 100% !important;
      margin: 24px 16px !important;
      padding: 16px !important;
    }
    
    .forgot-password-container h2 {
      font-size: 22px !important;
      margin-bottom: 24px !important;
      text-align: center !important;
    }
    
    .forgot-password-form {
      gap: 20px !important;
    }
    
    .forgot-password-form input {
      min-height: 48px !important;
      font-size: 16px !important;
      padding: 12px 16px !important;
      border: 1px solid var(--border) !important;
      border-radius: var(--radius) !important;
    }
    
    .forgot-password-form label {
      font-size: 14px !important;
    }
    
    .forgot-password-form button {
      min-height: 48px !important;
      padding: 16px !important;
      font-size: 16px !important;
      border-radius: var(--radius) !important;
      background: var(--accent) !important;
      color: white !important;
      border: none !important;
      cursor: pointer !important;
      transition: all 0.3s ease !important;
    }
    
    .forgot-password-form button:disabled {
      opacity: 0.6 !important;
      cursor: not-allowed !important;
    }
    
    .forgot-password-links {
      margin-top: 20px !important;
      text-align: center !important;
    }
    
    .forgot-password-links a {
      font-size: 14px !important;
      color: var(--accent) !important;
      transition: color 0.3s ease !important;
    }
    
    /* 禁止横向滚动 */
    html, body {
      overflow-x: hidden !important;
    }
  }
`

// 注入样式
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.type = 'text/css'
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}

function normalizeError(e: unknown) {
  const err = e as Partial<AuthApiError> | undefined
  if (err?.message) return err.message
  return '操作失败，请稍后重试'
}

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth()
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
      await forgotPassword({ email: email.trim() })
      setOk(true)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="forgot-password-container" style={{ maxWidth: 420, margin: '24px auto', padding: 16 }}>
      <h2 style={{ margin: '0 0 12px' }}>忘记密码</h2>
      {ok ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>如果该邮箱存在，我们已发送重置链接（请检查收件箱/垃圾箱）。</div>
          <div className="forgot-password-links">
            <Link to="/zhiyueling-si/login">返回登录</Link>
          </div>
        </div>
      ) : (
        <form className="forgot-password-form" onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>邮箱</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
          </label>
          {error ? <div style={{ color: 'var(--danger)' }}>{error}</div> : null}
          <button disabled={submitting} type="submit">
            {submitting ? '发送中...' : '发送重置邮件'}
          </button>
          <div className="forgot-password-links">
            <Link to="/zhiyueling-si/login">返回登录</Link>
          </div>
        </form>
      )}
    </div>
  )
}
