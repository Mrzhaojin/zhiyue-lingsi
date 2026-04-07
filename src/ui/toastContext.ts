import { createContext } from 'react'

export type ToastItem = {
  id: string
  message: string
  kind: 'info' | 'success' | 'error'
}

export type ToastApi = {
  push: (message: string, kind?: ToastItem['kind']) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

