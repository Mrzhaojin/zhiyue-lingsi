import { useCallback, useMemo, useState } from 'react'
import { ToastContext, type ToastItem } from './toastContext'

export function ToastProvider(props: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const item: ToastItem = { id, message, kind }
    setItems((prev) => [...prev, item])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 2200)
  }, [])

  const api = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

