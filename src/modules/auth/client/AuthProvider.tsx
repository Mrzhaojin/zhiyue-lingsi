import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runtimeMode } from '../../../lib/runtimeConfig'
import { createCloudAuthBackend } from './backends/cloudAuth'
import { toAuthError } from './backends/errors'
import { createLocalAuthBackend } from './backends/localAuth'
import type { AuthBackend } from './backends/types'
import { AuthContext, type AuthContextValue } from './context'
import { syncIdentity } from './identity'
import type { AuthState, AuthUser } from './types'

function createBackend(): AuthBackend {
  return runtimeMode === 'cloud' ? createCloudAuthBackend() : createLocalAuthBackend()
}

/**
 * AuthProvider 只做三件事：选择后端、维护状态机、把登录身份同步到本地数据层。
 * 具体认证细节（Supabase / 本地演示）在 backends/ 下，各自独立、可替换。
 */
export function AuthProvider(props: { children: React.ReactNode }) {
  const backend = useMemo(createBackend, [])
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const applyUser = useCallback((user: AuthUser) => {
    // 身份在进入应用前就绑定到本地数据层，避免「登录是 A、数据是 B」
    syncIdentity(user)
    if (mounted.current) setState({ status: 'authenticated', user })
  }, [])

  useEffect(() => {
    return backend.init((next) => {
      if (next.status === 'authenticated') {
        applyUser(next.user)
        return
      }
      if (mounted.current) setState(next)
    })
  }, [backend, applyUser])

  const loginWithPassword = useCallback(
    async (input: { email: string; password: string; remember?: boolean }) => {
      setState({ status: 'loading' })
      try {
        const user = await backend.login(input)
        applyUser(user)
      } catch (error) {
        if (mounted.current) setState({ status: 'anonymous' })
        throw toAuthError(error, '登录失败，请检查邮箱与密码')
      }
    },
    [backend, applyUser],
  )

  const register = useCallback(
    async (input: { email: string; password: string; username: string }) => {
      try {
        const user = await backend.register(input)
        if (user) {
          applyUser(user)
          return true
        }
        if (mounted.current) setState({ status: 'anonymous' })
        return false
      } catch (error) {
        throw toAuthError(error, '注册失败，请稍后重试')
      }
    },
    [backend, applyUser],
  )

  const logout = useCallback(async () => {
    try {
      await backend.logout()
    } finally {
      if (mounted.current) setState({ status: 'anonymous' })
    }
  }, [backend])

  const changePassword = useCallback(
    async (input: { currentPassword: string; newPassword: string }) => {
      try {
        await backend.changePassword(input)
      } catch (error) {
        throw toAuthError(error, '修改密码失败')
      }
    },
    [backend],
  )

  const forgotPassword = useCallback(
    async (input: { email: string }) => {
      try {
        await backend.forgotPassword(input)
      } catch (error) {
        throw toAuthError(error, '发送重置邮件失败')
      }
    },
    [backend],
  )

  const resetPassword = useCallback(
    async (input: { newPassword: string }) => {
      try {
        await backend.resetPassword(input)
      } catch (error) {
        throw toAuthError(error, '重置密码失败，链接可能已过期')
      }
    },
    [backend],
  )

  const refreshMe = useCallback(async () => {
    try {
      const user = await backend.refresh()
      if (!user) {
        if (mounted.current) setState({ status: 'anonymous' })
        return null
      }
      applyUser(user)
      return user
    } catch (error) {
      if (mounted.current) setState({ status: 'anonymous' })
      throw toAuthError(error, '刷新登录状态失败')
    }
  }, [backend, applyUser])

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
      mode: runtimeMode,
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
    [state, loginWithPassword, register, logout, changePassword, forgotPassword, resetPassword, refreshMe, hasRole, hasPermission],
  )

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}

