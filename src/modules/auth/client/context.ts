import { createContext } from 'react'
import type { RuntimeMode } from '../../../lib/runtimeConfig'
import type { AuthState, AuthUser } from './types'

export type AuthContextValue = {
  state: AuthState
  mode: RuntimeMode
  loginWithPassword: (input: { email: string; password: string; remember?: boolean }) => Promise<void>
  /** 返回 true 表示已登录；false 表示注册成功但需要邮箱确认。 */
  register: (input: { email: string; password: string; username: string }) => Promise<boolean>
  logout: () => Promise<void>
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>
  forgotPassword: (input: { email: string }) => Promise<void>
  resetPassword: (input: { newPassword: string }) => Promise<void>
  refreshMe: () => Promise<AuthUser | null>
  hasRole: (role: string) => boolean
  hasPermission: (permission: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)