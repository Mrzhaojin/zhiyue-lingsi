import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import pg from 'pg'

const { Client } = pg

function uuid() {
  return crypto.randomUUID()
}

function nowIso() {
  return new Date().toISOString()
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL')
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

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

  const startedAt = nowIso()

  const roleIds = new Map()
  for (const r of roles) {
    const id = uuid()
    roleIds.set(r.code, id)
    await client.query(
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
    await client.query(
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
      await client.query(
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
    await client.query(
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
    const userRow = await client.query('select id from users where username = $1', [u.username])
    const userId = userRow.rows[0].id
    await client.query(
      `insert into user_roles (user_id, role_id, created_at)
       values ($1, $2, $3)
       on conflict (user_id, role_id) do nothing`,
      [userId, roleId, startedAt],
    )
  }

  await client.end()
  console.log('Auth seed done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

