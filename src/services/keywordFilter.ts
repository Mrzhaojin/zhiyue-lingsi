export function checkContentAllowed(
  text: string,
  bannedKeywords: string[],
): { ok: true } | { ok: false; hit: string } {
  const normalized = text.trim()
  if (!normalized) return { ok: true }
  const hit = bannedKeywords.find((keyword) => keyword && normalized.includes(keyword))
  if (hit) return { ok: false, hit }
  return { ok: true }
}