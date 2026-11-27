import { useSyncExternalStore } from 'react'
import { store } from './db/store'

/**
 * 订阅数据版本。写操作会同步 bump 版本，组件因此在一帧内重渲染。
 * 目前挂在 WebShell / MobileShell 上，让整棵页面树共享同一次失效。
 */
export function useDatabaseVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, () => 0)
}