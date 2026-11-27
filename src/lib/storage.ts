export const STORAGE_ERROR_EVENT = 'zl:storage-error'

export type StorageFailureReason = 'quota' | 'unavailable' | 'unknown'

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; reason: StorageFailureReason; key: string; message: string }

export function safeJsonParse<T>(value: string | null): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

function reportFailure(result: Extract<StorageWriteResult, { ok: false }>): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: result }))
  } catch {
    // 事件派发失败不应影响主流程
  }
}

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const parsed = safeJsonParse<T>(window.localStorage.getItem(key))
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

/**
 * 写入 localStorage。以前这里没有任何异常处理：配额满（QuotaExceededError）时
 * 会静默抛错，调用方以为保存成功，实际数据丢失。
 * 现在统一捕获并广播事件，由 ToastProvider 提示用户。
 */
export function writeStorage<T>(key: string, value: T): StorageWriteResult {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'unavailable', key, message: '当前环境没有 localStorage' }
  }

  let payload: string
  try {
    payload = JSON.stringify(value)
  } catch (error) {
    const result: StorageWriteResult = {
      ok: false,
      reason: 'unknown',
      key,
      message: error instanceof Error ? error.message : '数据无法序列化',
    }
    reportFailure(result)
    return result
  }

  try {
    window.localStorage.setItem(key, payload)
    return { ok: true }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    const isQuota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    const result: StorageWriteResult = {
      ok: false,
      reason: isQuota ? 'quota' : 'unknown',
      key,
      message: error instanceof Error ? error.message : '本地存储写入失败',
    }
    reportFailure(result)
    return result
  }
}

export function getLocalStorageBytes(key: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const value = window.localStorage.getItem(key)
    return value ? new Blob([value]).size : 0
  } catch {
    return 0
  }
}
export function readSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const parsed = safeJsonParse<T>(window.sessionStorage.getItem(key))
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function writeSession<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 会话存储失败不影响主流程
  }
}