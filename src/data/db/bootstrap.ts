import { safeJsonParse } from '../../lib/storage'
import { dexie, loadDatabase, writeDatabase } from './persist'
import { LEGACY_STORAGE_KEY, normalizeDatabase, SCHEMA_VERSION, type Database } from './schema'
import { store } from './store'

export type BootstrapSource = 'existing' | 'legacy' | 'seed'

export type BootstrapResult = {
  source: BootstrapSource
  counts?: { users: number; books: number; posts: number; notes: number }
}

function readLegacyDatabase(): Database | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = safeJsonParse<Partial<Database>>(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.currentUserId !== 'string') return null
    return normalizeDatabase(parsed)
  } catch {
    return null
  }
}

function countOf(db: Database) {
  return {
    users: Object.keys(db.users).length,
    books: Object.keys(db.books).length,
    posts: Object.keys(db.posts).length,
    notes: Object.keys(db.notes).length,
  }
}

/**
 * 启动时初始化：打开 IndexedDB → 首次运行做迁移或种子 → 载入内存快照。
 * 旧 localStorage key 会原样保留，作为迁移前的只读备份。
 */
export async function bootstrapDatabase(createSeed: () => Database): Promise<BootstrapResult> {
  await dexie.open()
  const schemaMeta = await dexie.meta.get('schema')

  if (schemaMeta) {
    store.replace(await loadDatabase())
    return { source: 'existing' }
  }

  const legacy = readLegacyDatabase()
  const next = legacy ?? createSeed()
  const source: BootstrapSource = legacy ? 'legacy' : 'seed'
  const counts = countOf(next)

  await writeDatabase(next)

  // 校验：写进去的条数必须和来源一致，否则宁可报错也不继续。
  const [users, books, posts, notes] = await Promise.all([
    dexie.users.count(),
    dexie.books.count(),
    dexie.posts.count(),
    dexie.notes.count(),
  ])
  if (users !== counts.users || books !== counts.books || posts !== counts.posts || notes !== counts.notes) {
    throw new Error('数据迁移校验失败：写入条数与来源不一致')
  }

  await dexie.meta.put({
    key: 'schema',
    value: { version: SCHEMA_VERSION, source, migratedAt: Date.now(), counts },
  })
  if (legacy) {
    await dexie.meta.put({ key: 'legacyBackup', value: { key: LEGACY_STORAGE_KEY, migratedAt: Date.now(), counts } })
  }

  store.replace(await loadDatabase())
  return { source, counts }
}