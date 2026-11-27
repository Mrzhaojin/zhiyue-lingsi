import { safeJsonParse } from '../../lib/storage'
import { normalizeDatabase, type Database } from '../db/schema'
import { loadDatabase, writeDatabase } from '../db/persist'
import { store } from '../db/store'
import { data } from './shared'

export function getDbSnapshot(): Database {
  return data()
}

export function exportDatabaseJson(): string {
  return JSON.stringify(data(), null, 2)
}

export async function importDatabaseJson(json: string): Promise<{ users: number; posts: number; notes: number }> {
  const parsed = safeJsonParse<Partial<Database>>(json)
  if (!parsed || typeof parsed !== 'object') throw new Error('数据文件不是合法的 JSON 对象')
  if (!parsed.users || typeof parsed.users !== 'object') throw new Error('数据文件缺少 users 字段')
  if (typeof parsed.currentUserId !== 'string') throw new Error('数据文件缺少 currentUserId 字段')

  const next = normalizeDatabase(parsed)
  if (!next.users[next.currentUserId]) throw new Error('数据文件的 currentUserId 不在 users 中')

  await writeDatabase(next)
  store.replace(await loadDatabase())
  return {
    users: Object.keys(next.users).length,
    posts: Object.keys(next.posts).length,
    notes: Object.keys(next.notes).length,
  }
}

export function getDatabaseSizeBytes(): number {
  const json = JSON.stringify(data())
  if (typeof Blob !== 'undefined') return new Blob([json]).size
  return json.length
}

export function getDatabaseStats() {
  const db = data()
  return {
    users: Object.keys(db.users).length,
    books: Object.keys(db.books).length,
    posts: Object.keys(db.posts).length,
    notes: Object.keys(db.notes).length,
    comments: Object.keys(db.comments).length,
  }
}

export function getUserStats(userId: string) {
  const db = data()
  return {
    posts: Object.values(db.posts).filter((post) => post.authorId === userId).length,
    notes: Object.values(db.notes).filter((note) => note.authorId === userId && note.status === 'published').length,
  }
}
