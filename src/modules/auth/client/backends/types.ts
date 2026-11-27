import type { AuthState, AuthUser } from '../types'

export type LoginInput = { email: string; password: string; remember?: boolean }
export type RegisterInput = { email: string; password: string; username: string }
export type ChangePasswordInput = { currentPassword: string; newPassword: string }

/**
 * 认证后端接口：本地演示与 Supabase 各实现一份，AuthProvider 只依赖这个接口。
 * 这样「没有云也能跑」和「有云走真登录」是同一套 UI 的两个适配器，而不是散落的 if。
 */
export type AuthBackend = {
  readonly kind: 'local' | 'cloud'
  init(onChange: (state: AuthState) => void): () => void
  login(input: LoginInput): Promise<AuthUser>
  /** 返回 null 表示注册成功但需要邮箱确认（尚未建立会话）。 */
  register(input: RegisterInput): Promise<AuthUser | null>
  logout(): Promise<void>
  changePassword(input: ChangePasswordInput): Promise<void>
  forgotPassword(input: { email: string }): Promise<void>
  resetPassword(input: { newPassword: string }): Promise<void>
  refresh(): Promise<AuthUser | null>
}