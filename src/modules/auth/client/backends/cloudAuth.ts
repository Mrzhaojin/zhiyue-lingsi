import type { AuthError, Session, User } from '@supabase/supabase-js'
import { requireSupabase } from '../../../../lib/supabase'
import type { AuthPermission, AuthRole, AuthUser } from '../types'
import type { AuthBackend, ChangePasswordInput, LoginInput, RegisterInput } from './types'
import { authError } from './errors'

const ADMIN_PERMISSIONS: AuthPermission[] = [
  'auth:me:read',
  'auth:password:change',
  'auth:admin:users:read',
  'auth:admin:users:ban',
  'auth:admin:users:unban',
]

function permissionsForRole(role: AuthRole): AuthPermission[] {
  return role === 'admin' ? ADMIN_PERMISSIONS : ['auth:me:read', 'auth:password:change']
}

function mapUser(user: User): AuthUser {
  const roleValue = user.app_metadata?.role
  const role: AuthRole = roleValue === 'admin' ? 'admin' : 'user'
  const metaName = user.user_metadata?.username
  const username =
    typeof metaName === 'string' && metaName.trim()
      ? metaName.trim()
      : user.email?.split('@')[0] || '读者'
  return {
    id: user.id,
    username,
    email: user.email ?? undefined,
    status: 'active',
    roles: [role],
    permissions: permissionsForRole(role),
    createdAt: user.created_at ?? new Date().toISOString(),
    updatedAt: user.updated_at ?? user.created_at ?? new Date().toISOString(),
  }
}

function mapError(error: AuthError) {
  const status = typeof error.status === 'number' ? error.status : 0
  if (status === 400 || status === 422) return authError('VALIDATION_ERROR', error.message)
  if (status === 401) return authError('UNAUTHORIZED', error.message)
  if (status === 403) return authError('FORBIDDEN', error.message)
  if (status === 429) return authError('RATE_LIMITED', error.message || '操作过于频繁，请稍后再试')
  return authError('INTERNAL_ERROR', error.message || '认证服务异常')
}

export function createCloudAuthBackend(): AuthBackend {
  return {
    kind: 'cloud',

    init(onChange) {
      const client = requireSupabase()
      let disposed = false
      const apply = (session: Session | null) => {
        if (disposed) return
        onChange(
          session?.user
            ? { status: 'authenticated', user: mapUser(session.user) }
            : { status: 'anonymous' },
        )
      }

      client.auth
        .getSession()
        .then(({ data }) => apply(data.session))
        .catch(() => apply(null))

      const { data } = client.auth.onAuthStateChange((_event, session) => apply(session))
      return () => {
        disposed = true
        data.subscription.unsubscribe()
      }
    },

    async login(input: LoginInput) {
      const client = requireSupabase()
      const { data, error } = await client.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      })
      if (error) throw mapError(error)
      if (!data.session?.user) {
        throw authError('INTERNAL_ERROR', '登录未完成：没有拿到会话，请检查 Supabase 配置')
      }
      return mapUser(data.session.user)
    },

    async register(input: RegisterInput) {
      const client = requireSupabase()
      const { data, error } = await client.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: { data: { username: input.username.trim() } },
      })
      if (error) throw mapError(error)
      return data.session?.user ? mapUser(data.session.user) : null
    },

    async logout() {
      const client = requireSupabase()
      const { error } = await client.auth.signOut()
      if (error) throw mapError(error)
    },

    async changePassword(input: ChangePasswordInput) {
      const client = requireSupabase()
      const { data } = await client.auth.getUser()
      const email = data.user?.email
      if (!email) throw authError('UNAUTHORIZED', '登录已过期，请重新登录')

      const { error: verifyError } = await client.auth.signInWithPassword({
        email,
        password: input.currentPassword,
      })
      if (verifyError) throw authError('UNAUTHORIZED', '当前密码不正确')

      const { error } = await client.auth.updateUser({ password: input.newPassword })
      if (error) throw mapError(error)
    },

    async forgotPassword(input: { email: string }) {
      const client = requireSupabase()
      const { error } = await client.auth.resetPasswordForEmail(input.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw mapError(error)
    },

    async resetPassword(input: { newPassword: string }) {
      const client = requireSupabase()
      const { error } = await client.auth.updateUser({ password: input.newPassword })
      if (error) throw mapError(error)
    },

    async refresh() {
      const client = requireSupabase()
      const { data, error } = await client.auth.getUser()
      if (error || !data.user) return null
      return mapUser(data.user)
    },
  }
}