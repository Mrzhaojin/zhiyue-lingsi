import React, { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { AuthApiError } from '../types'
import { useAuth } from '..'
import { validateEmail, sanitizeInput } from '../../../../lib/security'

// 添加CSS动画
const styles = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  
  /* 移动端媒体查询 */
  @media (max-width: 767px) {
    .login-container {
      flex-direction: column !important;
      padding: 20px !important;
    }
    
    .login-left {
      display: none !important;
    }
    
    .login-right {
      flex: none !important;
      padding: 0 !important;
      width: 100% !important;
    }
    
    .login-card {
      padding: 32px 16px !important;
      margin: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    
    .login-card h2 {
      font-size: 22px !important;
      margin-bottom: 24px !important;
    }
    
    .login-form {
      gap: 20px !important;
    }
    
    .login-form input {
      min-height: 48px !important;
      font-size: 16px !important;
      padding: 12px 16px !important;
    }
    
    .login-form label {
      font-size: 14px !important;
    }
    
    .login-form button[type="submit"] {
      min-height: 48px !important;
      padding: 16px !important;
      font-size: 16px !important;
      width: 100% !important;
    }
    
    .social-login {
      flex-direction: row !important;
      justify-content: space-between !important;
    }
    
    .social-login button {
      flex: 1 !important;
      min-height: 48px !important;
      font-size: 14px !important;
      margin: 0 4px !important;
    }
    
    .login-links {
      flex-direction: column !important;
      align-items: center !important;
      gap: 12px !important;
      margin-top: 24px !important;
    }
    
    .login-links a {
      font-size: 14px !important;
    }
    
    /* 禁止横向滚动 */
    html, body {
      overflow-x: hidden !important;
    }
  }
  
  /* 平板端媒体查询 */
  @media (min-width: 768px) and (max-width: 1023px) {
    .login-container {
      padding: 20px !important;
    }
    
    .login-left,
    .login-right {
      padding: 20px !important;
    }
    
    .login-card {
      padding: 32px !important;
    }
  }
`

// 注入动画样式
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.type = 'text/css'
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}


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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    
    // 清理输入
    const sanitizedEmail = sanitizeInput(email.trim())
    const sanitizedPassword = sanitizeInput(password)
    
    if (!sanitizedEmail || !sanitizedPassword) {
      setError('请输入邮箱和密码')
      return
    }
    
    // 验证邮箱格式
    if (!validateEmail(sanitizedEmail)) {
      setError('请输入有效的邮箱地址')
      return
    }
    
    setSubmitting(true)
    try {
      await loginWithPassword({ email: sanitizedEmail, password: sanitizedPassword, remember })
      navigate(from, { replace: true })
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-container" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      background: 'var(--bg-gradient)',
      backgroundAttachment: 'fixed'
    }}>
      {/* 左侧飞翔的书效果 */}
      <div className="login-left" style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '40px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: '100%', 
          height: '100%',
          maxWidth: '500px',
          animation: 'fadeIn 1s ease-out'
        }}>
          <img 
            src="/flying-books.svg" 
            alt="飞翔的书" 
            style={{ 
              width: '100%', 
              height: '100%',
              objectFit: 'contain'
            }} 
          />
        </div>
        <div style={{ 
          position: 'absolute', 
          bottom: '40px', 
          left: '40px',
          color: 'var(--text-h)',
          textAlign: 'center',
          animation: 'fadeIn 1.5s ease-out 0.5s both'
        }}>
          <h3 style={{ 
            fontSize: '24px', 
            fontWeight: '500',
            marginBottom: '12px',
            letterSpacing: '0.5px'
          }}>知识的翅膀</h3>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--text)',
            maxWidth: '300px'
          }}>在书的世界里自由翱翔，探索无限可能</p>
        </div>
      </div>
      
      {/* 右侧登录表单 */}
      <div className="login-right" style={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '40px',
        minWidth: '300px'
      }}>
        <div style={{ 
          width: '100%', 
          maxWidth: '400px',
          animation: 'slideIn 0.8s ease-out'
        }}>
          <div className="login-card card" style={{ 
            padding: '40px', 
            boxShadow: 'var(--shadow-lg)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)'
          }}>
            <h2 className="h2" style={{ 
              textAlign: 'center', 
              marginBottom: '32px',
              fontSize: '24px',
              fontWeight: '500'
            }}>登录</h2>
            <form className="login-form" onSubmit={onSubmit} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '24px'
            }}>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px',
                animation: 'fadeIn 0.6s ease-out 0.2s both'
              }}>
                <label style={{ 
                  fontSize: '14px', 
                  color: 'var(--text-h)', 
                  fontWeight: '400'
                }}>邮箱</label>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="例如：admin@example.com"
                  style={{
                    transition: 'all 0.3s ease',
                    border: '1px solid var(--border)'
                  }}
                />
              </div>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px',
                animation: 'fadeIn 0.6s ease-out 0.4s both'
              }}>
                <label style={{ 
                  fontSize: '14px', 
                  color: 'var(--text-h)', 
                  fontWeight: '400'
                }}>密码</label>
                <input
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  style={{
                    transition: 'all 0.3s ease',
                    border: '1px solid var(--border)'
                  }}
                />
              </div>
              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                alignItems: 'center',
                animation: 'fadeIn 0.6s ease-out 0.6s both'
              }}>
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
                  border: '1px solid var(--danger)',
                  animation: 'fadeIn 0.4s ease-out'
                }}>
                  {error}
                </div>
              ) : null}
              <button 
                className="btn primary"
                style={{ 
                  padding: '16px',
                  fontSize: '16px',
                  fontWeight: '400',
                  borderRadius: 'var(--radius)',
                  transition: 'all 0.3s ease'
                }}
                disabled={submitting || state.status === 'loading'}
                type="submit"
              >
                {submitting || state.status === 'loading' ? '登录中...' : '登录'}
              </button>
              
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                margin: '20px 0',
                animation: 'fadeIn 0.6s ease-out 0.8s both'
              }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                <span style={{ margin: '0 16px', fontSize: '12px', color: 'var(--muted)' }}>其他登录方式</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              </div>
              
              <div className="social-login" style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '16px',
                animation: 'fadeIn 0.6s ease-out 1s both'
              }}>
                <button 
                  className="btn" 
                  style={{ 
                    padding: '10px 20px', 
                    borderRadius: 'var(--radius-sm)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: '#07C160',
                    color: '#fff',
                    fontSize: '12px',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => alert('微信登录功能开发中')}
                >
                  微信
                </button>
                <button 
                  className="btn" 
                  style={{ 
                    padding: '10px 20px', 
                    borderRadius: 'var(--radius-sm)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: '#12B7F5',
                    color: '#fff',
                    fontSize: '12px',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => alert('QQ登录功能开发中')}
                >
                  QQ
                </button>
                <button 
                  className="btn" 
                  style={{ 
                    padding: '10px 20px', 
                    borderRadius: 'var(--radius-sm)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: '#24292E',
                    color: '#fff',
                    fontSize: '12px',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => alert('GitHub登录功能开发中')}
                >
                  GitHub
                </button>
              </div>
              
              <div className="login-links" style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginTop: '20px',
                animation: 'fadeIn 0.6s ease-out 1.2s both'
              }}>
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
      </div>
    </div>
  )}
