export function safeJsonParse<T>(value: string | null): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export function readStorage<T>(key: string, fallback: T): T {
  const parsed = safeJsonParse<T>(localStorage.getItem(key))
  return parsed ?? fallback
}

export function writeStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

