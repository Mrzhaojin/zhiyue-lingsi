import type { AuthApiError, AuthErrorCode } from '../types'

export function authError(code: AuthErrorCode, message: string): AuthApiError {
  return { code, message }
}

export function isAuthApiError(value: unknown): value is AuthApiError {
  return value !== null && typeof value === 'object' && 'code' in value && 'message' in value
}

export function toAuthError(error: unknown, fallback = '操作失败，请稍后重试'): AuthApiError {
  if (isAuthApiError(error)) return error
  if (error instanceof Error && error.message) return authError('INTERNAL_ERROR', error.message)
  return authError('INTERNAL_ERROR', fallback)
}