import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { getUserById, getUserRolesAndPermissions, isAccessTokenBlacklisted, sha256Base64url, uuid } from './db.mjs'

/**
 * 认证核心：
 * - bcrypt：密码加盐哈希存储与校验
 * - JWT 双 Token：Access(2h) + Refresh(7d)
 * - 黑名单：logout 后 Access Token 立即失效（按 jti 记录到数据库）
 * - RBAC：每次鉴权时从 DB 读取 roles/permissions，避免仅信任 Token 内声明
 */
export function createJwtService(config) {
  const accessSecret = config.accessTokenSecret
  const refreshSecret = config.refreshTokenSecret

  function signAccessToken(input) {
    const jti = uuid()
    const exp = Math.floor(Date.now() / 1000) + config.accessTokenTtlSeconds
    const payload = {
      sub: input.userId,
      jti,
      roles: input.roles,
      permissions: input.permissions,
    }
    const token = jwt.sign(payload, accessSecret, { algorithm: 'HS256', expiresIn: config.accessTokenTtlSeconds })
    return { token, jti, expMs: exp * 1000 }
  }

  function signRefreshToken(input) {
    const jti = uuid()
    const payload = { sub: input.userId, jti, typ: 'refresh' }
    const token = jwt.sign(payload, refreshSecret, { algorithm: 'HS256', expiresIn: config.refreshTokenTtlSeconds })
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000)
    return { token, jti, expiresAt }
  }

  function verifyAccessToken(token) {
    return jwt.verify(token, accessSecret, { algorithms: ['HS256'] })
  }

  function verifyRefreshToken(token) {
    return jwt.verify(token, refreshSecret, { algorithms: ['HS256'] })
  }

  function decodeNoVerify(token) {
    return jwt.decode(token)
  }

  function requireAuth(pool) {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization
        const raw = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
        if (!raw) return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })

        const payload = verifyAccessToken(raw)
        if (!payload?.sub || !payload?.jti) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token无效' })

        const blacklisted = await isAccessTokenBlacklisted(pool, payload.jti)
        if (blacklisted) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token已失效' })

        const user = await getUserById(pool, payload.sub)
        if (!user) return res.status(401).json({ code: 'UNAUTHORIZED', message: '账号不存在' })

        if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
          return res.status(423).json({ code: 'LOCKED', message: '账号已锁定，请稍后再试' })
        }

        if (user.status === 'banned') {
          const until = user.banned_until ? new Date(user.banned_until).getTime() : null
          if (!until || until > Date.now()) {
            return res.status(403).json({ code: 'BANNED', message: '账号已被封禁' })
          }
        }

        const rbac = await getUserRolesAndPermissions(pool, user.id)

        req.auth = {
          user: {
            id: user.id,
            username: user.username,
            email: user.email ?? undefined,
            phone: user.phone ?? undefined,
            status: user.status,
            roles: rbac.roles,
            permissions: rbac.permissions,
            createdAt: new Date(user.created_at).toISOString(),
            updatedAt: new Date(user.updated_at).toISOString(),
          },
          access: { jti: payload.jti, raw },
        }

        next()
      } catch {
        res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录或登录已过期' })
      }
    }
  }

  function requirePermission(permission) {
    return (req, res, next) => {
      const perms = req.auth?.user?.permissions ?? []
      if (!perms.includes(permission)) return res.status(403).json({ code: 'FORBIDDEN', message: '无权限访问' })
      next()
    }
  }

  function requireStepUp(config) {
    return (req, res, next) => {
      const token = req.headers['x-stepup-token']
      if (!token || typeof token !== 'string') {
        return res.status(403).json({ code: 'FORBIDDEN', message: '需要二次验证' })
      }
      try {
        const payload = jwt.verify(token, accessSecret, { algorithms: ['HS256'] })
        if (payload?.sub !== req.auth.user.id || payload?.typ !== 'stepup') {
          return res.status(403).json({ code: 'FORBIDDEN', message: '二次验证无效' })
        }
        next()
      } catch {
        res.status(403).json({ code: 'FORBIDDEN', message: '二次验证已过期' })
      }
    }
  }

  async function verifyPassword(password, passwordHash) {
    if (!passwordHash) return false
    return bcrypt.compare(password, passwordHash)
  }

  function hashTokenForStorage(rawToken) {
    return sha256Base64url(rawToken)
  }

  return {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    decodeNoVerify,
    requireAuth,
    requirePermission,
    requireStepUp,
    verifyPassword,
    hashTokenForStorage,
  }
}
