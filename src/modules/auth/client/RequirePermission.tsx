import React from 'react'
import { useAuth } from '.'
import { RequireAuth } from './RequireAuth'

export function RequirePermission(props: {
  permission: string
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { hasPermission, state } = useAuth()

  return (
    <RequireAuth>
      {state.status === 'authenticated' && hasPermission(props.permission) ? (
        <>{props.children}</>
      ) : (
        (props.fallback ?? <div style={{ padding: 16 }}>无权限访问</div>)
      )}
    </RequireAuth>
  )
}

