import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 仅在开发环境中使用模拟客户端，生产环境必须提供真实配置
let supabase: SupabaseClient

if (supabaseUrl && supabaseAnonKey) {
  // 使用真实的 Supabase 配置
  supabase = createClient(supabaseUrl, supabaseAnonKey)
  console.log('Using real Supabase configuration')
} else {
  // 使用模拟客户端，避免连接到不存在的服务器
  console.warn('Using mock Supabase client. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in production.')
  supabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
      resetPasswordForEmail: async () => ({ error: null })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            single: async () => ({ data: null, error: null })
          })
        }),
        limit: () => ({
          single: async () => ({ data: null, error: null })
        })
      }),
      insert: () => ({
        select: async () => ({ data: [], error: null })
      }),
      update: () => ({
        select: async () => ({ data: [], error: null })
      }),
      delete: () => ({
        select: async () => ({ data: [], error: null })
      })
    })
  } as any
}

export { supabase }

// 添加健康检查函数
export async function checkSupabaseConnection() {
  try {
    if (supabaseUrl && supabaseAnonKey) {
      const { error } = await supabase.auth.getUser()
      if (error) {
        console.warn('Supabase connection check failed:', error.message)
        return false
      }
      console.log('Supabase connection established successfully')
      return true
    } else {
      console.log('Using mock Supabase client, skipping connection check')
      return true
    }
  } catch (error) {
    console.warn('Error checking Supabase connection:', error)
    return false
  }
}
