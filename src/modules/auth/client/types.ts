export type AuthRole = 'user' | 'admin'

export type AuthPermission =
  | 'auth:me:read'
  | 'auth:password:change'
  | 'auth:admin:users:read'
  | 'auth:admin:users:ban'
  | 'auth:admin:users:unban'

export type AuthUserStatus = 'active' | 'banned' | 'pending'

export type AuthUser = {
  id: string
  username: string
  email?: string
  phone?: string
  status: AuthUserStatus
  roles: AuthRole[]
  permissions: AuthPermission[]
  createdAt: string
  updatedAt: string
}

export type AuthTokens = {
  accessToken: string
  accessTokenExpiresAt: number
}

export type AuthState =
  | { status: 'anonymous' }
  | { status: 'loading' }
  | {
      status: 'authenticated'
      user: AuthUser
      tokens: AuthTokens
    }

export type AuthApiError = {
  code:
    | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'LOCKED'
    | 'BANNED'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR'
  message: string
  details?: unknown
}

