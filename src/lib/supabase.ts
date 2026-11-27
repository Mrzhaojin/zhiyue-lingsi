import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './runtimeConfig'

/**
 * 只有配置了 Supabase 才创建客户端。
 * 以前这里有一个 mock 客户端：登录会「成功」但永远不会建立会话，
 * 导致整个应用卡在加载中。mock 已删除——没有配置就走本地演示模式。
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase 未配置：请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY，或使用本地演示模式。',
    )
  }
  return supabase
}