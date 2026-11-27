import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { useDatabaseVersion } from '../../data/useDatabaseVersion'

export function WebShell() {
  // 订阅数据版本：任意写入后整棵页面树重渲染，修掉「点了没反应」
  useDatabaseVersion()
  const location = useLocation()
  const path = location.pathname
  const hideSidebar = path.startsWith('/read/') || path === '/forum/new' || path.includes('/edit')

  return (
    <div className="web-shell">
      <TopBar />
      <div className="web-main-container">
        {!hideSidebar ? <Sidebar /> : null}
        <main className="web-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
