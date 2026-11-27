import { useCallback, useEffect, useMemo, useState } from 'react'
import { STORAGE_ERROR_EVENT } from '../lib/storage'
import { ToastContext, type ToastItem } from './toastContext'

export function ToastProvider(props: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const item: ToastItem = { id, message, kind }
    setItems((prev) => [...prev, item])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 3200)
  }, [])

  // 本地存储写失败（配额满 / 不可用）必须让用户知道，否则就是静默丢数据
  useEffect(() => {
    const onStorageError = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail
      push(
        detail?.reason === 'quota'
          ? '本地存储空间不足，本次数据未保存。请到设置页导出备份并清理内容。'
          : '本地存储不可用，本次数据未保存。请检查浏览器隐私设置。',
        'error',
      )
    }
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError)
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError)
  }, [push])

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