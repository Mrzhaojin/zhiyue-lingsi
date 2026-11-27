import { useEffect } from 'react'
import type { ThemeMode } from '../domain/models'
import { useCurrentProfile } from '../features/settings/queries'

export function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return
  const root = document.documentElement
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const actual = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  root.dataset.theme = actual
}

/** 订阅当前用户的主题设置；资料变更后查询失效会自动重新应用。 */
export function ThemeSync() {
  const profileQuery = useCurrentProfile()
  const mode: ThemeMode = profileQuery.data?.settings.theme ?? 'system'

  useEffect(() => {
    applyTheme(mode)
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => applyTheme(mode)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  return null
}