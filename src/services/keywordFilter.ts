import { getAdminConfig } from '../data/db'

export function checkContentAllowed(text: string): { ok: true } | { ok: false; hit: string } {
  const { bannedKeywords } = getAdminConfig()
  const normalized = text.trim()
  if (!normalized) return { ok: true }
  const hit = bannedKeywords.find((k) => k && normalized.includes(k))
  if (hit) return { ok: false, hit }
  return { ok: true }
}

