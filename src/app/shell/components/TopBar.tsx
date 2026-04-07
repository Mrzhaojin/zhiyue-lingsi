import { useLocation, useNavigate } from 'react-router-dom'
import { SearchIcon } from '../../../ui/SearchIcon'

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const showSearch = !['/', '/shelf', '/forum', '/notes', '/me', '/search', '/categories', '/read', '/me/settings', '/admin'].includes(location.pathname) && !location.pathname.startsWith('/read/')

  return (
    <header className="top-bar">
      <div className="top-bar-row">
        <div className="brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="brand-mark brand-mark--logo" aria-hidden="true">
            <img src="/covers/logo.png" alt="" />
          </div>
          <span className="brand-name">智阅灵思</span>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => navigate('/categories')}
          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '10px', background: 'var(--surface-2)', border: 'none' }}
        >
          分类浏览
        </button>
      </div>
      {showSearch ? (
        <div className="top-search" style={{ marginTop: '12px' }}>
          <button
            className="search-box"
            type="button"
            onClick={() => navigate('/search')}
            aria-label="打开搜索"
            style={{ borderRadius: '14px' }}
          >
            <span className="search-icon" aria-hidden="true">
              <SearchIcon size={16} />
            </span>
            <span className="search-placeholder" style={{ opacity: 0.7 }}>探索书籍、话题或笔记...</span>
          </button>
        </div>
      ) : null}
    </header>
  )
}
