import { useNavigate } from 'react-router-dom'
import { SearchIcon } from '../../../ui/SearchIcon'
import { useAuth } from '../../../modules/auth/client'

export function TopBar() {
  const navigate = useNavigate()
  const { state, logout } = useAuth()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/zhiyueling-si/login')
    } catch (error) {
      console.error('登出失败:', error)
    }
  }

  return (
    <header className="web-top-bar">
      <div className="web-top-bar-content">
        <div className="web-top-bar-left">
          <div className="brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
            <div className="brand-mark brand-mark--logo" aria-hidden="true">
              <img src="/covers/logo.png" alt="" />
            </div>
            <span className="brand-name">智阅灵思</span>
          </div>
        </div>
        <div className="web-top-bar-right">
          <div className="web-top-bar-search">
            <button
              className="search-box"
              type="button"
              onClick={() => navigate('/search')}
              aria-label="打开搜索"
            >
              <span className="search-icon" aria-hidden="true">
                <SearchIcon size={16} />
              </span>
              <span className="search-placeholder">探索书籍、话题或笔记...</span>
            </button>
          </div>
          <div className="web-top-bar-user">
            {state.status === 'authenticated' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div 
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    cursor: 'pointer'
                  }}
                  onClick={() => navigate('/me')}
                >
                  {state.user.username.charAt(0).toUpperCase()}
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={handleLogout}
                  style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', background: 'var(--surface-2)', border: 'none' }}
                >
                  退出
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => navigate('/zhiyueling-si/login')}
                  style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', background: 'var(--surface-2)', border: 'none' }}
                >
                  登录
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => navigate('/zhiyueling-si/register')}
                  style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', background: 'var(--accent)', color: 'white', border: 'none' }}
                >
                  注册
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
