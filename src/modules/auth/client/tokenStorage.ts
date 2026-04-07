const ACCESS_TOKEN_KEY = 'auth.accessToken'
const ACCESS_TOKEN_EXPIRES_AT_KEY = 'auth.accessTokenExpiresAt'

type AccessTokenRecord = {
  accessToken: string
  accessTokenExpiresAt: number
}

let inMemory: AccessTokenRecord | null = null

export function setAccessToken(record: AccessTokenRecord, persist: boolean) {
  inMemory = record
  if (!persist) return
  localStorage.setItem(ACCESS_TOKEN_KEY, record.accessToken)
  localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, String(record.accessTokenExpiresAt))
}

export function clearAccessToken() {
  inMemory = null
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY)
}

export function getAccessToken(): AccessTokenRecord | null {
  if (inMemory) return inMemory
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  const expiresAtStr = localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY)
  if (!accessToken || !expiresAtStr) return null
  const accessTokenExpiresAt = Number(expiresAtStr)
  if (!Number.isFinite(accessTokenExpiresAt)) return null
  inMemory = { accessToken, accessTokenExpiresAt }
  return inMemory
}

export function willExpireSoon(record: AccessTokenRecord, skewMs = 30_000) {
  return Date.now() + skewMs >= record.accessTokenExpiresAt
}

