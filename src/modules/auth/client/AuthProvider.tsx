import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthApiError, AuthState, AuthUser, AuthTokens } from './types'
import { supabase } from '../../../lib/supabase'
import { clearAccessToken, getAccessToken, setAccessToken } from './tokenStorage'
import type { Session } from '@supabase/supabase-js'

/**
 * AuthProvider:
 * - 以 Context 的形式提供登录态、RBAC判断与 Auth 方法
 * - 初次加载时自动监听 Supabase Auth 状态
 * - 直接使用 Supabase Auth API，确保邮箱验证等功能正常
 */
type AuthContextValue = {
  state: AuthState
  loginWithPassword: (input: { email: string; password: string; remember?: boolean }) => Promise<void>
  register: (input: { email: string; password: string; username: string }) => Promise<void>
  logout: () => Promise<void>
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>
  forgotPassword: (input: { email: string }) => Promise<void>
  resetPassword: (input: { token: string; newPassword: string }) => Promise<void>
  refreshMe: () => Promise<AuthUser | null>
  hasRole: (role: string) => boolean
  hasPermission: (permission: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider(props: {
  children: React.ReactNode
  config?: { persistAccessToken?: boolean }
}) {
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

  // 监听 Supabase Auth 状态变化
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: Session | null) => {
      if (!mounted.current) return
      
      if (session?.user) {
        // 登录成功
        const user: AuthUser = {
          id: session.user.id,
          username: session.user.user_metadata?.username || session.user.email || '',
          email: session.user.email || undefined,
          status: 'active', // 默认状态
          roles: ['user'], // 默认角色
          permissions: [], // 默认权限
          createdAt: session.user.created_at,
          updatedAt: session.user.updated_at || session.user.created_at
        }
        
        const tokens: AuthTokens = {
          accessToken: session.access_token,
          accessTokenExpiresAt: (session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000
        }
        
        setAccessToken(tokens, props.config?.persistAccessToken ?? false)
        setState({ status: 'authenticated', user, tokens })
      } else {
        // 登出或未登录
        clearAccessToken()
        setState({ status: 'anonymous' })
      }
    })

    // 初始化时获取当前用户状态
    const initAuth = async () => {
      try {
        // 添加超时处理，防止 Supabase 调用卡住
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Authentication timeout')), 10000)
        })
        
        const { data: { user }, error } = await Promise.race([
          supabase.auth.getUser(),
          timeoutPromise
        ])
        
        if (!mounted.current) return
        
        if (error || !user) {
          clearAccessToken()
          setState({ status: 'anonymous' })
        } else {
          const { data: { session } } = await supabase.auth.getSession()
          if (!mounted.current) return
          
          if (session) {
            const authUser: AuthUser = {
              id: user.id,
              username: user.user_metadata?.username || user.email || '',
              email: user.email || undefined,
              status: 'active', // 默认状态
              roles: ['user'], // 默认角色
              permissions: [], // 默认权限
              createdAt: user.created_at,
              updatedAt: user.updated_at || user.created_at
            }
            
            const tokens: AuthTokens = {
              accessToken: session.access_token,
              accessTokenExpiresAt: (session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000
            }
            
            setAccessToken(tokens, props.config?.persistAccessToken ?? false)
            setState({ status: 'authenticated', user: authUser, tokens })
          } else {
            clearAccessToken()
            setState({ status: 'anonymous' })
          }
        }
      } catch (error) {
        console.error('Authentication initialization error:', error)
        if (!mounted.current) return
        clearAccessToken()
        setState({ status: 'anonymous' })
      }
    }

    initAuth()
    
    return () => subscription.unsubscribe()
  }, [props.config?.persistAccessToken])

  const refreshMe = useCallback(async () => {
    try {
      // 添加超时处理，防止 Supabase 调用卡住
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Authentication timeout')), 10000)
      })
      
      const { data: { user }, error } = await Promise.race([
        supabase.auth.getUser(),
        timeoutPromise
      ])
      
      if (!mounted.current) return null
      
      if (error || !user) {
        clearAccessToken()
        setState({ status: 'anonymous' })
        return null
      }
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted.current) return null
      
      if (!session) {
        clearAccessToken()
        setState({ status: 'anonymous' })
        return null
      }
      
      const authUser: AuthUser = {
        id: user.id,
        username: user.user_metadata?.username || user.email || '',
        email: user.email || undefined,
        status: 'active', // 默认状态
        roles: ['user'], // 默认角色
        permissions: [], // 默认权限
        createdAt: user.created_at,
        updatedAt: user.updated_at || user.created_at
      }
      
      const tokens: AuthTokens = {
        accessToken: session.access_token,
        accessTokenExpiresAt: (session.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000
      }
      
      setAccessToken(tokens, props.config?.persistAccessToken ?? false)
      setState({ status: 'authenticated', user: authUser, tokens })
      return authUser
    } catch (error) {
      console.error('Refresh me error:', error)
      if (!mounted.current) return null
      clearAccessToken()
      setState({ status: 'anonymous' })
      return null
    }
  }, [props.config?.persistAccessToken])

  const loginWithPassword = useCallback(
    async (input: { email: string; password: string; remember?: boolean }) => {
      setState({ status: 'loading' })
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password
        })
        
        if (error) {
          throw {
            code: error.code,
            message: error.message
          } as AuthApiError
        }
        
        // 状态会通过 onAuthStateChange 自动更新
      } catch (e) {
        clearAccessToken()
        setState({ status: 'anonymous' })
        throw e as AuthApiError
      }
    },
    []
  )

  const register = useCallback(
    async (input: { email: string; password: string; username: string }) => {
      setState({ status: 'loading' })
      try {
        const { error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: {
              username: input.username
            }
          }
        })
        
        if (error) {
          throw {
            code: error.code,
            message: error.message
          } as AuthApiError
        }
        
        // 注册成功后，状态会通过 onAuthStateChange 自动更新
      } catch (e) {
        clearAccessToken()
        setState({ status: 'anonymous' })
        throw e as AuthApiError
      }
    },
    []
  )

  const logout = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw {
          code: error.code,
          message: error.message
        } as AuthApiError
      }
      // 状态会通过 onAuthStateChange 自动更新
    } catch (e) {
      clearAccessToken()
      setState({ status: 'anonymous' })
      throw e as AuthApiError
    }
  }, [])

  const changePassword = useCallback(async (input: { currentPassword: string; newPassword: string }) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: input.newPassword
      })
      
      if (error) {
        throw {
          code: error.code,
          message: error.message
        } as AuthApiError
      }
    } catch (e) {
      throw e as AuthApiError
    }
  }, [])

  const forgotPassword = useCallback(async (input: { email: string }) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
        redirectTo: window.location.origin + '/zhiyueling-si/password/reset'
      })
      
      if (error) {
        throw {
          code: error.code,
          message: error.message
        } as AuthApiError
      }
    } catch (e) {
      throw e as AuthApiError
    }
  }, [])

  const resetPassword = useCallback(async (input: { token: string; newPassword: string }) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: input.newPassword
      })
      
      if (error) {
        throw {
          code: error.code,
          message: error.message
        } as AuthApiError
      }
    } catch (e) {
      throw e as AuthApiError
    }
  }, [])

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
      loginWithPassword,
      register,
      logout,
      changePassword,
      forgotPassword,
      resetPassword,
      refreshMe,
      hasRole,
      hasPermission,
    }),
    [hasPermission, hasRole, loginWithPassword, logout, register, changePassword, forgotPassword, resetPassword, refreshMe, state],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}
