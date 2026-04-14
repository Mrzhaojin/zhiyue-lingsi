import { Outlet, useLocation } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'

export function WebShell() {
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
