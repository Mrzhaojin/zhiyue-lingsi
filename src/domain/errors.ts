export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INTERNAL'

export class AppError extends Error {
  readonly retryable: boolean
  readonly details?: unknown

  constructor(code: AppErrorCode, message: string, options: { retryable?: boolean; details?: unknown } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }

  readonly code: AppErrorCode
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

export function toAppError(value: unknown, fallback = '操作失败'): AppError {
  if (isAppError(value)) return value
  if (value instanceof Error) return new AppError('INTERNAL', value.message)
  return new AppError('INTERNAL', fallback)
}