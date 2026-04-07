import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAuth(props: { children: React.ReactNode; loginPath?: string }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <div style={{ padding: 16 }}>加载中...</div>
  if (state.status === 'anonymous') {
    const loginPath = props.loginPath ?? '/zhiyueling-si/login'
    const from = location.pathname + location.search + location.hash
    return <Navigate to={`${loginPath}?from=${encodeURIComponent(from)}`} replace />
  }

  return <>{props.children}</>
}
