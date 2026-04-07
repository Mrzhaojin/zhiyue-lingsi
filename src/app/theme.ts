import { useEffect } from 'react'
import { getCurrentUser } from '../data/db'

function applyTheme() {
  const user = getCurrentUser()
  const mode = user.settings.theme
  const root = document.documentElement

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const actual = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  root.dataset.theme = actual
}

export function useApplyTheme() {
  useEffect(() => {
    applyTheme()
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => applyTheme()
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [])
}

export function refreshTheme() {
  applyTheme()
}

