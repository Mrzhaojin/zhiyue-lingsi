import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import pino from 'pino'
import pinoHttp from 'pino-http'
import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import swaggerUi from 'swagger-ui-express'

import { getConfig } from './config.mjs'
import {
  banUser,
  blacklistAccessToken,
  createDb,
  createPasswordReset,
  createPendingUser,
  ensureAuthSchema,
  ensureDevSeed,
  getRefreshTokenRecord,
  getUserByIdentifier,
  getUserById,
  getUserRolesAndPermissions,
  insertAuditLog,
  insertLoginLog,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenByJti,
  saveRefreshToken,
  unbanUser,
  withTx,
  consumePasswordReset,
  verifyEmail,
} from './db.mjs'
import { createJwtService } from './auth.mjs'
import { buildOpenApiSpec } from './openapi.mjs'

/**
 * 独立 Auth Server（不修改现有项目任何代码/配置）：
 * - API 前缀：/api/v1/auth/
 * - 认证：用户名/邮箱+密码；短信/三方登录为预留接口
 * - 安全：bcrypt、JWT双Token、自动刷新、Access黑名单、失败锁定、限流、Helmet、日志/audit
 * - RBAC：默认 user/admin 角色 + 权限码，接口级权限控制
 */
const config = getConfig()
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

const db = createDb(config.databaseUrl)
const jwtService = createJwtService(config)

const app = express()

app.disable('x-powered-by')

app.use(
  pinoHttp({
    logger,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  }),
)

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
)

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)

app.use(express.json({ limit: '64kb' }))
app.use(cookieParser())

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

async function initDb() {
  await ensureAuthSchema(db.pool)
  if (db.isMemory) {
    await ensureDevSeed(db.pool)
    logger.info('Auth DB initialized (in-memory) with dev seed users')
  }
}

function ipOf(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim()
  return req.ip
}

function setRefreshCookie(res, refreshToken, remember) {
  const maxAge = remember ? config.refreshTokenTtlSeconds * 1000 : undefined
  res.cookie(config.cookie.name, refreshToken, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: config.cookie.path,
    maxAge,
  })
}

function clearRefreshCookie(res) {
  res.clearCookie(config.cookie.name, { path: config.cookie.path })
}

function getRefreshCookie(req) {
  const v = req.cookies?.[config.cookie.name]
  return typeof v === 'string' ? v : null
}

function requireBodyFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === '')
  if (missing.length) {
    const msg = `缺少字段: ${missing.join(', ')}`
    const err = new Error(msg)
    err.code = 'VALIDATION_ERROR'
    throw err
  }
}

function asApiError(status, code, message, details) {
  return { status, body: { code, message, details } }
}

app.get('/api/v1/auth/openapi.json', (req, res) => {
  res.json(buildOpenApiSpec())
})

app.use('/api/v1/auth/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiSpec()))

app.post(
  '/api/v1/auth/login',
  rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }),
  async (req, res) => {
    const { identifier, password, remember } = req.body ?? {}
    try {
      requireBodyFields(req.body, ['identifier', 'password'])

      const user = await getUserByIdentifier(db.pool, String(identifier))
      if (!user) {
        await insertLoginLog(db.pool, {
          identifier,
          ip: ipOf(req),
          userAgent: req.headers['user-agent'],
          success: false,
          reason: 'NOT_FOUND',
        })
        return res.status(401).json({ code: 'UNAUTHORIZED', message: '账号或密码错误' })
      }

      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        await insertLoginLog(db.pool, {
          userId: user.id,
          identifier,
          ip: ipOf(req),
          userAgent: req.headers['user-agent'],
          success: false,
          reason: 'LOCKED',
        })
        return res.status(423).json({ code: 'LOCKED', message: '登录失败次数过多，已锁定15分钟' })
      }

      if (user.status === 'banned') {
        const until = user.banned_until ? new Date(user.banned_until).getTime() : null
        if (!until || until > Date.now()) {
          await insertLoginLog(db.pool, {
            userId: user.id,
            identifier,
            ip: ipOf(req),
            userAgent: req.headers['user-agent'],
            success: false,
            reason: 'BANNED',
          })
          return res.status(403).json({ code: 'BANNED', message: '账号已被封禁' })
        }
      }

      if (user.status === 'pending') {
        await insertLoginLog(db.pool, {
          userId: user.id,
          identifier,
          ip: ipOf(req),
          userAgent: req.headers['user-agent'],
          success: false,
          reason: 'PENDING',
        })
        return res.status(403).json({ code: 'FORBIDDEN', message: '账号未激活，请先完成邮箱验证' })
      }

      const ok = await jwtService.verifyPassword(String(password), user.password_hash)
      if (!ok) {
        await withTx(db.pool, async (tx) => {
          await tx.query(
            `update users
             set failed_login_count = failed_login_count + 1,
                 locked_until = case
                   when failed_login_count + 1 >= 5 then now() + interval '15 minutes'
                   else locked_until
                 end,
                 updated_at = now()
             where id = $1`,
            [user.id],
          )
        })

        await insertLoginLog(db.pool, {
          userId: user.id,
          identifier,
          ip: ipOf(req),
          userAgent: req.headers['user-agent'],
          success: false,
          reason: 'BAD_PASSWORD',
        })

        return res.status(401).json({ code: 'UNAUTHORIZED', message: '账号或密码错误' })
      }

      await withTx(db.pool, async (tx) => {
        await tx.query(
          `update users set failed_login_count = 0, locked_until = null, last_login_at = now(), updated_at = now()
           where id = $1`,
          [user.id],
        )
      })

      const rbac = await getUserRolesAndPermissions(db.pool, user.id)
      const access = jwtService.signAccessToken({
        userId: user.id,
        roles: rbac.roles,
        permissions: rbac.permissions,
      })
      const refresh = jwtService.signRefreshToken({ userId: user.id })
      const tokenHash = jwtService.hashTokenForStorage(refresh.token)

      await saveRefreshToken(db.pool, {
        userId: user.id,
        tokenHash,
        jti: refresh.jti,
        userAgent: req.headers['user-agent'],
        ip: ipOf(req),
        expiresAt: refresh.expiresAt,
      })

      setRefreshCookie(res, refresh.token, Boolean(remember))

      await insertLoginLog(db.pool, {
        userId: user.id,
        identifier,
        ip: ipOf(req),
        userAgent: req.headers['user-agent'],
        success: true,
        reason: 'OK',
      })

      res.json({
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
        tokens: { accessToken: access.token, accessTokenExpiresAt: access.expMs },
      })
    } catch (e) {
      req.log.error(e)
      const code = e?.code === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
      const status = code === 'VALIDATION_ERROR' ? 400 : 500
      res.status(status).json({ code, message: code === 'VALIDATION_ERROR' ? String(e.message) : '服务异常' })
    }
  },
)

app.post('/api/v1/auth/token/refresh', async (req, res) => {
  const raw = getRefreshCookie(req)
  if (!raw) return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
  try {
    const payload = jwtService.verifyRefreshToken(raw)
    if (!payload?.sub || !payload?.jti || payload?.typ !== 'refresh') {
      clearRefreshCookie(res)
      return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
    }

    const tokenHash = jwtService.hashTokenForStorage(raw)
    const record = await getRefreshTokenRecord(db.pool, tokenHash)
    if (!record || record.revoked_at) {
      clearRefreshCookie(res)
      return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
    }
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      clearRefreshCookie(res)
      return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
    }

    const user = await getUserById(db.pool, payload.sub)
    if (!user) {
      clearRefreshCookie(res)
      return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
    }

    if (user.status === 'banned') {
      clearRefreshCookie(res)
      return res.status(403).json({ code: 'BANNED', message: '账号已被封禁' })
    }

    const rbac = await getUserRolesAndPermissions(db.pool, payload.sub)
    const access = jwtService.signAccessToken({
      userId: payload.sub,
      roles: rbac.roles,
      permissions: rbac.permissions,
    })

    const rotated = jwtService.signRefreshToken({ userId: payload.sub })
    const rotatedHash = jwtService.hashTokenForStorage(rotated.token)

    await withTx(db.pool, async (tx) => {
      await tx.query(`update auth_refresh_tokens set revoked_at = now() where jti = $1 and revoked_at is null`, [
        payload.jti,
      ])
      await tx.query(
        `insert into auth_refresh_tokens (id, user_id, token_hash, jti, user_agent, ip, expires_at, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          crypto.randomUUID(),
          payload.sub,
          rotatedHash,
          rotated.jti,
          req.headers['user-agent'] ?? null,
          ipOf(req),
          rotated.expiresAt,
        ],
      )
    })

    setRefreshCookie(res, rotated.token, true)
    res.json({ accessToken: access.token, accessTokenExpiresAt: access.expMs })
  } catch (e) {
    req.log.error(e)
    clearRefreshCookie(res)
    res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
  }
})

app.post('/api/v1/auth/logout', jwtService.requireAuth(db.pool), async (req, res) => {
  try {
    const decoded = jwtService.decodeNoVerify(req.auth.access.raw)
    const expSeconds = decoded?.exp ? Number(decoded.exp) : null
    const expiresAt = expSeconds ? new Date(expSeconds * 1000) : new Date(Date.now() + config.accessTokenTtlSeconds * 1000)

    await blacklistAccessToken(db.pool, {
      jti: req.auth.access.jti,
      userId: req.auth.user.id,
      expiresAt,
      reason: 'logout',
    })

    const refreshRaw = getRefreshCookie(req)
    if (refreshRaw) {
      try {
        const payload = jwtService.verifyRefreshToken(refreshRaw)
        if (payload?.jti) await revokeRefreshTokenByJti(db.pool, payload.jti)
      } catch {
        // ignore
      }
    }

    clearRefreshCookie(res)
    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    clearRefreshCookie(res)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
  }
})

app.post('/api/v1/auth/logout/all', jwtService.requireAuth(db.pool), async (req, res) => {
  try {
    await revokeAllRefreshTokensForUser(db.pool, req.auth.user.id)

    const decoded = jwtService.decodeNoVerify(req.auth.access.raw)
    const expSeconds = decoded?.exp ? Number(decoded.exp) : null
    const expiresAt = expSeconds ? new Date(expSeconds * 1000) : new Date(Date.now() + config.accessTokenTtlSeconds * 1000)
    await blacklistAccessToken(db.pool, {
      jti: req.auth.access.jti,
      userId: req.auth.user.id,
      expiresAt,
      reason: 'logout_all',
    })

    clearRefreshCookie(res)
    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
  }
})

app.get('/api/v1/auth/me', jwtService.requireAuth(db.pool), (req, res) => {
  res.json(req.auth.user)
})

app.post('/api/v1/auth/stepup', jwtService.requireAuth(db.pool), async (req, res) => {
  try {
    const { password } = req.body ?? {}
    requireBodyFields(req.body, ['password'])
    const user = await getUserByIdentifier(db.pool, req.auth.user.username)
    if (!user) return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
    const ok = await bcrypt.compare(String(password), user.password_hash)
    if (!ok) return res.status(401).json({ code: 'UNAUTHORIZED', message: '密码错误' })

    const token = jwt.sign({ sub: req.auth.user.id, typ: 'stepup' }, config.accessTokenSecret, {
      algorithm: 'HS256',
      expiresIn: 5 * 60,
    })
    res.json({ stepupToken: token, expiresInSeconds: 5 * 60 })
  } catch (e) {
    req.log.error(e)
    res.status(400).json({ code: 'VALIDATION_ERROR', message: String(e.message) })
  }
})

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body ?? {}
    requireBodyFields(req.body, ['username', 'email', 'password'])
    const u = String(username).trim()
    const em = String(email).trim().toLowerCase()
    const pw = String(password)
    if (u.length < 3 || u.length > 50) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '用户名长度需为3-50' })
    if (!em.includes('@')) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '邮箱格式不正确' })
    if (pw.length < 8) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '密码至少8位' })

    const passwordHash = await bcrypt.hash(pw, 12)
    const created = await createPendingUser(db.pool, { username: u, email: em, passwordHash })
    if (!created.ok) return res.status(409).json({ code: 'CONFLICT', message: '用户名或邮箱已存在' })

    if (config.env !== 'production') {
      req.log.info({ userId: created.userId }, `DEV verification token: ${created.verificationToken}`)
    }

    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    const code = e?.code === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
    const status = code === 'VALIDATION_ERROR' ? 400 : 500
    res.status(status).json({ code, message: code === 'VALIDATION_ERROR' ? String(e.message) : '服务异常' })
  }
})

app.post('/api/v1/auth/register/verify', async (req, res) => {
  try {
    const { token } = req.body ?? {}
    requireBodyFields(req.body, ['token'])
    const result = await verifyEmail(db.pool, String(token))
    if (!result.ok) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '激活链接无效或已过期' })
    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
  }
})

app.post('/api/v1/auth/password/forgot', async (req, res) => {
  try {
    const { email } = req.body ?? {}
    requireBodyFields(req.body, ['email'])
    const em = String(email).trim().toLowerCase()
    const user = await getUserByIdentifier(db.pool, em)
    if (user) {
      const token = await createPasswordReset(db.pool, user.id)
      if (config.env !== 'production') req.log.info({ userId: user.id }, `DEV reset token: ${token}`)
    }
    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
  }
})

app.post('/api/v1/auth/password/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body ?? {}
    requireBodyFields(req.body, ['token', 'newPassword'])
    const pw = String(newPassword)
    if (pw.length < 8) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '密码至少8位' })
    const consumed = await consumePasswordReset(db.pool, String(token))
    if (!consumed.ok) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '重置链接无效或已过期' })
    const passwordHash = await bcrypt.hash(pw, 12)
    await withTx(db.pool, async (tx) => {
      await tx.query('update users set password_hash = $2, updated_at = now() where id = $1', [
        consumed.userId,
        passwordHash,
      ])
      await tx.query('update auth_refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [
        consumed.userId,
      ])
    })
    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
  }
})

app.post('/api/v1/auth/password/change', jwtService.requireAuth(db.pool), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {}
    requireBodyFields(req.body, ['currentPassword', 'newPassword'])
    const pw = String(newPassword)
    if (pw.length < 8) return res.status(400).json({ code: 'VALIDATION_ERROR', message: '密码至少8位' })
    const user = await getUserByIdentifier(db.pool, req.auth.user.username)
    if (!user) return res.status(401).json({ code: 'UNAUTHORIZED', message: '未登录' })
    const ok = await bcrypt.compare(String(currentPassword), user.password_hash)
    if (!ok) return res.status(401).json({ code: 'UNAUTHORIZED', message: '当前密码错误' })
    const passwordHash = await bcrypt.hash(pw, 12)
    await withTx(db.pool, async (tx) => {
      await tx.query('update users set password_hash = $2, updated_at = now() where id = $1', [user.id, passwordHash])
      await tx.query('update auth_refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [
        user.id,
      ])
    })
    res.json({ ok: true })
  } catch (e) {
    req.log.error(e)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
  }
})

app.post('/api/v1/auth/login/sms', (req, res) => {
  res.status(501).json({ code: 'NOT_IMPLEMENTED', message: '手机号验证码登录预留接口' })
})

app.post('/api/v1/auth/login/oauth/:provider', (req, res) => {
  res.status(501).json({ code: 'NOT_IMPLEMENTED', message: '第三方登录预留接口' })
})

app.post(
  '/api/v1/auth/admin/users/:userId/ban',
  jwtService.requireAuth(db.pool),
  jwtService.requirePermission('auth:admin:users:ban'),
  jwtService.requireStepUp(config),
  async (req, res) => {
    try {
      const { userId } = req.params
      const { until } = req.body ?? {}
      const untilDate = until ? new Date(until) : null
      await banUser(db.pool, userId, untilDate)
      await insertAuditLog(db.pool, {
        actorUserId: req.auth.user.id,
        action: 'auth:user:ban',
        targetUserId: userId,
        ip: ipOf(req),
        userAgent: req.headers['user-agent'],
        meta: { until: untilDate ? untilDate.toISOString() : null },
      })
      res.json({ ok: true })
    } catch (e) {
      req.log.error(e)
      res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
    }
  },
)

app.post(
  '/api/v1/auth/admin/users/:userId/unban',
  jwtService.requireAuth(db.pool),
  jwtService.requirePermission('auth:admin:users:unban'),
  jwtService.requireStepUp(config),
  async (req, res) => {
    try {
      const { userId } = req.params
      await unbanUser(db.pool, userId)
      await insertAuditLog(db.pool, {
        actorUserId: req.auth.user.id,
        action: 'auth:user:unban',
        targetUserId: userId,
        ip: ipOf(req),
        userAgent: req.headers['user-agent'],
      })
      res.json({ ok: true })
    } catch (e) {
      req.log.error(e)
      res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务异常' })
    }
  },
)

app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: '接口不存在' })
})

initDb()
  .then(() => {
    app.listen(config.port, () => {
      logger.info(`Auth server listening on http://localhost:${config.port}`)
    })
  })
  .catch((e) => {
    logger.error(e)
    process.exit(1)
  })
