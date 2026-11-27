import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import bcrypt from 'bcrypt'
import { newDb } from 'pg-mem'
import { supabase } from './supabase.mjs'

const { Pool } = pg

/**
 * 数据访问层（PostgreSQL）：
 * - 所有 SQL 使用参数化查询，避免注入风险
 * - Token/验证码仅存储哈希（sha256），避免明文落库
 * - RBAC 表：users/roles/permissions/user_roles/role_permissions
 * - 额外安全表：refresh token、黑名单、验证/重置、日志
 */
export function createDb(databaseUrl) {
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl })
    return {
      pool,
      supabase,
      isMemory: false,
      async close() {
        await pool.end()
      },
    }
  }

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  const pool = new adapter.Pool()

  return {
    pool,
    supabase,
    isMemory: true,
    async close() {
      await pool.end()
    },
  }
}

export function sha256Base64url(input) {
  return crypto.createHash('sha256').update(input).digest('base64url')
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function uuid() {
  return crypto.randomUUID()
}

function moduleRootDir() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..')
}

async function loadSchemaSql() {
  const sqlPath = path.resolve(moduleRootDir(), '..', 'db', 'schema.sql')
  return fs.readFile(sqlPath, 'utf8')
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(';') ? s : `${s};`))
}

export async function ensureAuthSchema(pool) {
  const sql = await loadSchemaSql()
  const statements = splitSqlStatements(sql)
  for (const stmt of statements) {
    await pool.query(stmt)
  }
}

export async function ensureDevSeed(pool) {
  const startedAt = new Date().toISOString()

  const roles = [
    { code: 'user', name: '普通用户' },
    { code: 'admin', name: '管理员' },
  ]

  const permissions = [
    { code: 'auth:me:read', name: '查看个人信息' },
    { code: 'auth:password:change', name: '修改密码' },
    { code: 'auth:admin:users:read', name: '查看用户列表' },
    { code: 'auth:admin:users:ban', name: '封禁用户' },
    { code: 'auth:admin:users:unban', name: '解封用户' },
  ]

  const roleIds = new Map()
  for (const r of roles) {
    const id = uuid()
    roleIds.set(r.code, id)
    await pool.query(
      `insert into roles (id, code, name, created_at, updated_at)
       values ($1, $2, $3, $4, $4)
       on conflict (code) do update set name = excluded.name, updated_at = excluded.updated_at`,
      [id, r.code, r.name, startedAt],
    )
  }

  const permissionIds = new Map()
  for (const p of permissions) {
    const id = uuid()
    permissionIds.set(p.code, id)
    await pool.query(
      `insert into permissions (id, code, name, created_at, updated_at)
       values ($1, $2, $3, $4, $4)
       on conflict (code) do update set name = excluded.name, updated_at = excluded.updated_at`,
      [id, p.code, p.name, startedAt],
    )
  }

  const rolePerm = {
    user: ['auth:me:read', 'auth:password:change'],
    admin: [
      'auth:me:read',
      'auth:password:change',
      'auth:admin:users:read',
      'auth:admin:users:ban',
      'auth:admin:users:unban',
    ],
  }

  for (const [roleCode, permCodes] of Object.entries(rolePerm)) {
    const roleId = roleIds.get(roleCode)
    for (const permCode of permCodes) {
      const permId = permissionIds.get(permCode)
      await pool.query(
        `insert into role_permissions (role_id, permission_id, created_at)
         values ($1, $2, $3)
         on conflict (role_id, permission_id) do nothing`,
        [roleId, permId, startedAt],
      )
    }
  }

  const users = [
    { username: 'admin', password: 'admin123456', role: 'admin', email: 'admin@example.com' },
    { username: 'user1', password: 'user123456', role: 'user', email: 'user1@example.com' },
    { username: 'user2', password: 'user123456', role: 'user', email: 'user2@example.com' },
  ]

  for (const u of users) {
    const id = uuid()
    const passwordHash = await bcrypt.hash(u.password, 12)
    await pool.query(
      `insert into users (id, username, email, password_hash, status, created_at, updated_at)
       values ($1, $2, $3, $4, 'active', $5, $5)
       on conflict (username) do update
         set email = excluded.email,
             password_hash = excluded.password_hash,
             status = excluded.status,
             updated_at = excluded.updated_at`,
      [id, u.username, u.email, passwordHash, startedAt],
    )

    const roleId = roleIds.get(u.role)
    const userRow = await pool.query('select id from users where username = $1', [u.username])
    const userId = userRow.rows[0].id
    await pool.query(
      `insert into user_roles (user_id, role_id, created_at)
       values ($1, $2, $3)
       on conflict (user_id, role_id) do nothing`,
      [userId, roleId, startedAt],
    )
  }
}

export async function queryOne(pool, text, params) {
  const res = await pool.query(text, params)
  return res.rows[0] ?? null
}

export async function queryMany(pool, text, params) {
  const res = await pool.query(text, params)
  return res.rows
}

export async function withTx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (e) {
    try {
      await client.query('rollback')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function getUserByIdentifier(pool, identifier) {
  const trimmed = String(identifier ?? '').trim()
  if (!trimmed) return null
  return queryOne(
    pool,
    `select *
     from users
     where username = $1
        or email = $1`,
    [trimmed],
  )
}

export async function getUserById(pool, userId) {
  return queryOne(pool, 'select * from users where id = $1', [userId])
}

export async function getUserRolesAndPermissions(pool, userId) {
  const roles = await queryMany(
    pool,
    `select r.code
     from roles r
     join user_roles ur on ur.role_id = r.id
     where ur.user_id = $1`,
    [userId],
  )
  const permissions = await queryMany(
    pool,
    `select p.code
     from permissions p
     join role_permissions rp on rp.permission_id = p.id
     join user_roles ur on ur.role_id = rp.role_id
     where ur.user_id = $1`,
    [userId],
  )
  return {
    roles: roles.map((r) => r.code),
    permissions: Array.from(new Set(permissions.map((p) => p.code))),
  }
}

export async function insertLoginLog(pool, input) {
  const id = uuid()
  await pool.query(
    `insert into auth_login_logs (id, user_id, identifier, ip, user_agent, success, reason, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())`,
    [id, input.userId ?? null, input.identifier ?? null, input.ip ?? null, input.userAgent ?? null, input.success, input.reason ?? null],
  )
}

export async function insertAuditLog(pool, input) {
  const id = uuid()
  await pool.query(
    `insert into auth_audit_logs (id, actor_user_id, action, target_user_id, ip, user_agent, meta, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      id,
      input.actorUserId ?? null,
      input.action,
      input.targetUserId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
    ],
  )
}

export async function createPendingUser(pool, input) {
  return withTx(pool, async (tx) => {
    const existing = await tx.query(
      'select id from users where username = $1 or email = $2',
      [input.username, input.email],
    )
    if (existing.rowCount > 0) {
      return { ok: false, reason: 'CONFLICT' }
    }

    const userId = uuid()
    await tx.query(
      `insert into users (id, username, email, password_hash, status, created_at, updated_at)
       values ($1, $2, $3, $4, 'pending', now(), now())`,
      [userId, input.username, input.email, input.passwordHash],
    )

    const role = await tx.query(`select id from roles where code = 'user'`)
    const roleId = role.rows[0]?.id
    if (roleId) {
      await tx.query(
        `insert into user_roles (user_id, role_id, created_at) values ($1, $2, now())
         on conflict (user_id, role_id) do nothing`,
        [userId, roleId],
      )
    }

    return { ok: true, userId }
  })
}

export async function verifyEmail(pool, token) {
  // 注意：此函数现在仅用于兼容旧代码，实际验证由 Supabase 处理
  return { ok: true }
}

export async function createPasswordReset(pool, userId) {
  const token = randomToken()
  const tokenHash = sha256Base64url(token)
  await pool.query(
    `insert into auth_password_resets (id, user_id, token_hash, expires_at, created_at)
     values ($1, $2, $3, now() + interval '1 hour', now())`,
    [uuid(), userId, tokenHash],
  )
  return token
}

export async function consumePasswordReset(pool, token) {
  const tokenHash = sha256Base64url(token)
  return withTx(pool, async (tx) => {
    const row = await queryOne(
      tx,
      `select * from auth_password_resets
       where token_hash = $1 and used_at is null and expires_at > now()`,
      [tokenHash],
    )
    if (!row) return { ok: false, reason: 'INVALID' }
    await tx.query(`update auth_password_resets set used_at = now() where id = $1`, [row.id])
    return { ok: true, userId: row.user_id }
  })
}

export async function saveRefreshToken(pool, input) {
  await pool.query(
    `insert into auth_refresh_tokens (id, user_id, token_hash, jti, user_agent, ip, expires_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())`,
    [uuid(), input.userId, input.tokenHash, input.jti, input.userAgent ?? null, input.ip ?? null, input.expiresAt],
  )
}

export async function revokeRefreshTokenByJti(pool, jti) {
  await pool.query(
    `update auth_refresh_tokens set revoked_at = now()
     where jti = $1 and revoked_at is null`,
    [jti],
  )
}

export async function revokeAllRefreshTokensForUser(pool, userId) {
  await pool.query(
    `update auth_refresh_tokens set revoked_at = now()
     where user_id = $1 and revoked_at is null`,
    [userId],
  )
}

export async function getRefreshTokenRecord(pool, tokenHash) {
  return queryOne(
    pool,
    `select * from auth_refresh_tokens
     where token_hash = $1`,
    [tokenHash],
  )
}

export async function blacklistAccessToken(pool, input) {
  await pool.query(
    `insert into auth_token_blacklist (jti, user_id, expires_at, reason, created_at)
     values ($1, $2, $3, $4, now())
     on conflict (jti) do nothing`,
    [input.jti, input.userId, input.expiresAt, input.reason ?? 'logout'],
  )
}

export async function isAccessTokenBlacklisted(pool, jti) {
  const row = await queryOne(pool, `select jti from auth_token_blacklist where jti = $1 and expires_at > now()`, [
    jti,
  ])
  return Boolean(row)
}

export async function incrementLoginFailure(pool, userId) {
  await pool.query(
    `update users
     set failed_login_count = failed_login_count + 1,
         locked_until = case
           when failed_login_count + 1 >= 5 then now() + interval '15 minutes'
           else locked_until
         end,
         updated_at = now()
     where id = $1`,
    [userId],
  )
}

export async function resetLoginFailure(pool, userId) {
  await pool.query(
    `update users
     set failed_login_count = 0,
         locked_until = null,
         last_login_at = now(),
         updated_at = now()
     where id = $1`,
    [userId],
  )
}

export async function banUser(pool, userId, until) {
  await pool.query(
    `update users
     set status = 'banned',
         banned_until = $2,
         updated_at = now()
     where id = $1`,
    [userId, until ?? null],
  )
}

export async function unbanUser(pool, userId) {
  await pool.query(
    `update users
     set status = 'active',
         banned_until = null,
         updated_at = now()
     where id = $1`,
    [userId],
  )
}
