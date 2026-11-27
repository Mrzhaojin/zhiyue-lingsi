import { ensureUserRecord } from '../../../data/db'
import { createLogger } from '../../../lib/logger'

const log = createLogger('auth-identity')
import type { AuthUser } from './types'

/**
 * 登录成功后，把认证身份写成/更新成本地数据层的用户记录，并设为 currentUserId。
 * 这是 M0 里最重要的一步：没有它，页面写的 authorId 仍然是种子用户。
 */
export function syncIdentity(user: AuthUser): void {
  try {
    ensureUserRecord({
      id: user.id,
      nickname: user.username,
      role: user.roles.includes('admin') ? 'admin' : 'user',
    })
  } catch (error) {
    // 身份绑定失败不应阻断登录：页面会退化为只读的访客数据
    log.error('身份绑定到数据层失败:', error)
  }
}