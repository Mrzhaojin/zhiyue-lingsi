import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthApiError, AuthState, AuthUser } from './types'
import { AuthApi } from './authApi'
import { clearAccessToken, getAccessToken } from './tokenStorage'

/**
 * AuthProvider:
 * - 以 Context 的形式提供登录态、RBAC判断与 AuthApi 实例
 * - 初次加载时如检测到本地存在 Access Token，则自动调用 /me 校验并补全用户信息
 * - 不会与现有业务代码耦合：只有在你显式引入并包裹组件树时才会生效
 */
type AuthContextValue = {
  state: AuthState
  api: AuthApi
  loginWithPassword: (input: { identifier: string; password: string; remember?: boolean }) => Promise<void>
  logout: (input?: { allDevices?: boolean }) => Promise<void>
  refreshMe: () => Promise<AuthUser | null>
  hasRole: (role: string) => boolean
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider(props: {
  children: React.ReactNode
  config?: { baseUrl?: string; persistAccessToken?: boolean }
}) {
  const api = useMemo(() => new AuthApi(props.config), [props.config?.baseUrl, props.config?.persistAccessToken])
  const [state, setState] = useState<AuthState>(() => {
    const t = getAccessToken()
    return t ? { status: 'loading' } : { status: 'anonymous' }
  })

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      await api.ensureFreshAccessToken()
      const user = await api.getMe()
      if (!mounted.current) return user
      const tokens = getAccessToken()
      if (!tokens) {
        setState({ status: 'anonymous' })
        return null
      }
      setState({ status: 'authenticated', user, tokens })
      return user
    } catch {
      if (!mounted.current) return null
      clearAccessToken()
      setState({ status: 'anonymous' })
      return null
    }
  }, [api])

  useEffect(() => {
    if (state.status !== 'loading') return
    void refreshMe()
  }, [refreshMe, state.status])

  const loginWithPassword = useCallback(
    async (input: { identifier: string; password: string; remember?: boolean }) => {
      setState({ status: 'loading' })
      try {
        const res = await api.loginWithPassword(input)
        const tokens = getAccessToken()
        if (!tokens) throw new Error('tokens_missing')
        setState({ status: 'authenticated', user: res.user, tokens })
      } catch (e) {
        clearAccessToken()
        setState({ status: 'anonymous' })
        throw e as AuthApiError
      }
    },
    [api],
  )

  const logout = useCallback(
    async (input?: { allDevices?: boolean }) => {
      setState({ status: 'loading' })
      await api.logout(input)
      setState({ status: 'anonymous' })
    },
    [api],
  )

  const hasRole = useCallback(
    (role: string) => (state.status === 'authenticated' ? state.user.roles.includes(role as never) : false),
    [state],
  )

  const hasPermission = useCallback(
    (permission: string) =>
      state.status === 'authenticated' ? state.user.permissions.includes(permission as never) : false,
    [state],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      api,
      loginWithPassword,
      logout,
      refreshMe,
      hasRole,
      hasPermission,
    }),
    [api, hasPermission, hasRole, loginWithPassword, logout, refreshMe, state],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
