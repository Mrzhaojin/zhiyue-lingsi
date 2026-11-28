import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = {}
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (match) env[match[1]] = match[2].trim()
    }
  }
  return { ...env, ...process.env }
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
check('Auth 服务可达', health.ok, `HTTP ${health.status}`)

const tables = ['books', 'chapters', 'posts', 'notes', 'profiles', 'admin_config']
for (const table of tables) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  check(`表 ${table} 可访问`, res.ok, res.ok ? 'RLS 已生效' : `HTTP ${res.status}（多数情况是还没执行 all-in-one.sql）`)
}

const draft = await fetch(`${url}/rest/v1/notes?select=id&status=eq.draft&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
})
const drafts = draft.ok ? await draft.json() : null
check('匿名看不到草稿', draft.ok && Array.isArray(drafts) && drafts.length === 0, draft.ok ? `返回 ${drafts.length} 条` : `HTTP ${draft.status}`)

const email = env.CLOUD_TEST_EMAIL
const password = env.CLOUD_TEST_PASSWORD
if (email && password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  check('测试账号可登录', !error && Boolean(data.session), error?.message ?? '')
  if (data.session) {
    const me = await fetch(`${url}/rest/v1/profiles?select=id,nickname&id=eq.${data.user.id}`, {
      headers: { apikey: key, Authorization: `Bearer ${data.session.access_token}` },
    })
    check('登录后可读自己的 profile', me.ok, `HTTP ${me.status}`)
  }
} else {
  console.log('⏭  未设置 CLOUD_TEST_EMAIL / CLOUD_TEST_PASSWORD，跳过登录态检查')
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
process.exit(failed.length ? 1 : 0)
