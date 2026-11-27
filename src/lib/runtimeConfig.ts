export type RuntimeMode = 'local' | 'cloud'

function readEnv(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const supabaseUrl = readEnv(import.meta.env.VITE_SUPABASE_URL)
export const supabaseAnonKey = readEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

/**
 * 运行时模式：
 * - local：本地演示模式。未配置 Supabase，或显式设置 VITE_LOCAL_MODE=true。
 *   数据只存在浏览器，账号是本地 persona，用于离线演示与开发。
 * - cloud：配置了 Supabase，使用真实的登录与（后续的）云端数据。
 */
export const forceLocalMode = readEnv(import.meta.env.VITE_LOCAL_MODE).toLowerCase() === 'true'
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const runtimeMode: RuntimeMode = forceLocalMode || !isSupabaseConfigured ? 'local' : 'cloud'

/** AI 代理地址（同源优先），为空时 AI 功能整体不可用，而不是假装可用。 */
export const aiProxyUrl = readEnv(import.meta.env.VITE_AI_PROXY_URL).replace(/\/$/, '')
export const isAiConfigured = aiProxyUrl.length > 0

export function runtimeLabel(): string {
  return runtimeMode === 'local' ? '本地演示模式' : '云端模式'
}

export function runtimeSummary(): string {
  if (runtimeMode === 'local') {
    return '本地演示模式：账号与数据仅保存在当前浏览器，不联网、不需要配置。'
  }
  return '云端模式：使用 Supabase 账号登录。'
}