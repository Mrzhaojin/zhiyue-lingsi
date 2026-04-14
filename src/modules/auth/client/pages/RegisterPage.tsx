import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuthApiError } from '../types'
import { useAuth } from '../AuthProvider'

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
  return '注册失败，请稍后重试'
}

export function RegisterPage() {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
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
    if (!agreeTerms) {
      setError('请同意用户协议')
      return
    }
    setSubmitting(true)
    try {
      await register({ username: username.trim(), email: email.trim(), password })
      setOk(true)
    } catch (err) {
      setError(normalizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      background: 'var(--bg-gradient)',
      backgroundAttachment: 'fixed'
    }}>
      {/* 左侧飞翔的书效果 */}
      <div style={{ 
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
          }}>加入知识社区</h3>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--text)',
            maxWidth: '300px'
          }}>创建账号，开启您的阅读之旅</p>
        </div>
      </div>
      
      {/* 右侧注册表单 */}
      <div style={{ 
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
          <div className="card" style={{ 
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
            }}>注册</h2>
            {ok ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '20px', 
                textAlign: 'center',
                animation: 'fadeIn 0.6s ease-out'
              }}>
                <div style={{ 
                  fontSize: '16px', 
                  color: 'var(--text)',
                  lineHeight: '1.6'
                }}>注册成功：请前往邮箱完成激活后再登录。</div>
                <Link 
                  to="/zhiyueling-si/login" 
                  className="btn primary"
                  style={{ 
                    padding: '16px',
                    fontSize: '16px',
                    fontWeight: '400',
                    textAlign: 'center',
                    borderRadius: 'var(--radius)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  返回登录
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ 
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
                  }}>用户名</label>
                  <input
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="请输入用户名"
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
                  }}>邮箱</label>
                  <input
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    placeholder="请输入邮箱地址"
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
                  animation: 'fadeIn 0.6s ease-out 0.6s both'
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
                    autoComplete="new-password"
                    placeholder="请输入密码（至少8位）"
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
                  animation: 'fadeIn 0.6s ease-out 0.8s both'
                }}>
                  <input 
                    type="checkbox" 
                    checked={agreeTerms} 
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--accent)'
                    }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>我已阅读并同意 <a href="#" style={{ color: 'var(--accent)', transition: 'color 0.3s ease' }}>用户协议</a> 和 <a href="#" style={{ color: 'var(--accent)', transition: 'color 0.3s ease' }}>隐私政策</a></span>
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
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? '提交中...' : '创建账号'}
                </button>
                <div style={{ 
                  textAlign: 'center', 
                  fontSize: '13px', 
                  color: 'var(--text)',
                  animation: 'fadeIn 0.6s ease-out 1s both'
                }}>
                  已有账号？ <Link to="/zhiyueling-si/login" style={{ 
                    color: 'var(--accent)',
                    transition: 'color 0.3s ease'
                  }}>去登录</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
