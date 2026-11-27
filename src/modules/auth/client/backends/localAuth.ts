import type { AuthPermission, AuthState, AuthUser } from '../types'
import type { AuthBackend, LoginInput, RegisterInput } from './types'
import { authError } from './errors'

const ACCOUNTS_KEY = 'zl.local.accounts.v1'
const SESSION_KEY = 'zl.local.session.v1'

/** 本地演示模式：账号只是本机的 persona，没有密码校验，也没有邮件服务。 */
const LOCAL_PERMISSIONS: AuthPermission[] = [
  'auth:me:read',
  'auth:password:change',
  'auth:admin:users:read',
  'auth:admin:users:ban',
  'auth:admin:users:unban',
]

type LocalAccount = {
  id: string
  username: string
  email: string
  createdAt: string
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 忽略：存储不可用时下面会报更明确的错误
  }
}

function readAccounts(): Record<string, LocalAccount> {
  const raw = safeGet(ACCOUNTS_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LocalAccount>) : {}
  } catch {
    return {}
  }
}

function writeAccounts(accounts: Record<string, LocalAccount>): void {
  if (!safeSet(ACCOUNTS_KEY, JSON.stringify(accounts))) {
    throw authError('UNAVAILABLE', '浏览器本地存储不可用，无法创建本地账号。')
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function toAuthUser(account: LocalAccount): AuthUser {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    status: 'active',
    roles: ['admin'],
    permissions: LOCAL_PERMISSIONS,
    createdAt: account.createdAt,
    updatedAt: account.createdAt,
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function validateEmailShape(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function currentAccount(): LocalAccount | null {
  const email = safeGet(SESSION_KEY)
  if (!email) return null
  return readAccounts()[email] ?? null
}

export function createLocalAuthBackend(): AuthBackend {
  return {
    kind: 'local',

    init(onChange) {
      const account = currentAccount()
      const state: AuthState = account
        ? { status: 'authenticated', user: toAuthUser(account) }
        : { status: 'anonymous' }
      onChange(state)
      return () => {}
    },

    async login(input: LoginInput) {
      const email = normalizeEmail(input.email)
      if (!validateEmailShape(email)) throw authError('VALIDATION_ERROR', '请输入有效的邮箱地址')
      if (input.password.trim().length < 6) throw authError('VALIDATION_ERROR', '本地演示模式仅校验密码长度（至少 6 位）')

      const accounts = readAccounts()
      let account = accounts[email]
      if (!account) {
        account = {
          id: createId(),
          username: email.split('@')[0] || '演示读者',
          email,
          createdAt: new Date().toISOString(),
        }
        accounts[email] = account
        writeAccounts(accounts)
      }
      if (!safeSet(SESSION_KEY, email)) {
        throw authError('UNAVAILABLE', '浏览器本地存储不可用，无法保存登录状态。')
      }
      return toAuthUser(account)
    },

    async register(input: RegisterInput) {
      const email = normalizeEmail(input.email)
      if (!validateEmailShape(email)) throw authError('VALIDATION_ERROR', '请输入有效的邮箱地址')
      if (input.password.length < 8) throw authError('VALIDATION_ERROR', '密码至少 8 位')
      if (input.username.trim().length < 2) throw authError('VALIDATION_ERROR', '昵称至少 2 个字符')

      const accounts = readAccounts()
      if (accounts[email]) throw authError('CONFLICT', '该邮箱已在本地创建过账号，请直接登录')
      const account: LocalAccount = {
        id: createId(),
        username: input.username.trim(),
        email,
        createdAt: new Date().toISOString(),
      }
      accounts[email] = account
      writeAccounts(accounts)
      safeSet(SESSION_KEY, email)
      return toAuthUser(account)
    },

    async logout() {
      safeRemove(SESSION_KEY)
    },

    async changePassword() {
      throw authError('UNAVAILABLE', '本地演示模式不使用密码，修改密码仅在云端模式可用。')
    },

    async forgotPassword() {
      throw authError('UNAVAILABLE', '本地演示模式没有邮箱服务：直接登录即可，不需要找回密码。')
    },

    async resetPassword() {
      throw authError('UNAVAILABLE', '本地演示模式没有邮箱服务，无法重置密码。')
    },

    async refresh() {
      const account = currentAccount()
      return account ? toAuthUser(account) : null
    },
  }
}