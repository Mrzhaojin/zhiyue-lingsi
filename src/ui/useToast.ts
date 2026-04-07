import { useContext } from 'react'
import { ToastContext } from './toastContext'

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('ToastProvider missing')
  }
  return ctx
}

