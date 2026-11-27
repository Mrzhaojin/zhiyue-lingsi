import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { TopBar } from './components/TopBar'
import { useDatabaseVersion } from '../../data/useDatabaseVersion'

export function MobileShell() {
  useDatabaseVersion()
  const location = useLocation()
  const path = location.pathname
  const hideNav = path.startsWith('/read/') || path === '/forum/new' || path.includes('/edit')

  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
      {!hideNav ? <BottomNav /> : null}
    </div>
  )
}
