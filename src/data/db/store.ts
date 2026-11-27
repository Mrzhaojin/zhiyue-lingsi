import { STORAGE_ERROR_EVENT } from '../../lib/storage'
import { emptyDatabase, type Database, type TableName } from './schema'
import { applyOps, loadDatabase, type WriteOp } from './persist'

type Listener = () => void

function reportStorageFailure(error: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(STORAGE_ERROR_EVENT, {
        detail: { reason: 'unknown', message: error instanceof Error ? error.message : String(error) },
      }),
    )
  } catch {
    // 事件派发失败不影响主流程
  }
}

/**
 * 内存快照 + IndexedDB 持久化 + 订阅失效。
 *
 * 页面仍然同步读取（getSnapshot），但写入会：
 *   1) 立即修改内存并 bump 版本（UI 一帧内更新）
 *   2) 把「改动了哪些记录」交给写队列，按实体落到 IndexedDB
 *   3) 通过 BroadcastChannel 通知其他标签页刷新
 * 这样既保留了现有同步 API，又消除了「每次写入序列化整库」。
 */
class DataStore {
  private data: Database = emptyDatabase()
  private version = 0
  private listeners = new Set<Listener>()
  private queue: Promise<void> = Promise.resolve()
  private channel: BroadcastChannel | null = null

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('zhiyue-lingsi-data')
      this.channel.onmessage = () => {
        void this.refreshFromDisk()
      }
    }
  }

  getSnapshot = (): Database => this.data

  getVersion = (): number => this.version

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  replace(next: Database) {
    this.data = next
    this.bump()
  }

  bump() {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  enqueue(ops: WriteOp[]) {
    this.queue = this.queue
      .then(() => applyOps(ops))
      .then(() => this.channel?.postMessage({ type: 'changed' }))
      .catch(reportStorageFailure)
  }

  async refreshFromDisk() {
    try {
      this.replace(await loadDatabase())
    } catch (error) {
      reportStorageFailure(error)
    }
  }

  async flush() {
    await this.queue
  }

  dispose() {
    this.channel?.close()
    this.channel = null
    this.listeners.clear()
  }
}

export const store = new DataStore()

export type WriteContext = {
  put: (table: TableName, value: unknown) => void
  del: (table: TableName, key: unknown) => void
  meta: (key: string, value: unknown) => void
}

/**
 * 唯一写入口：work 直接修改内存快照，同时把改动登记为精确的实体级操作。
 * 没有登记操作的写入不会被持久化——这是刻意的约束，避免出现「改了但没存」。
 */
export function mutate<T>(work: (db: Database, ctx: WriteContext) => T): T {
  const ops: WriteOp[] = []
  const ctx: WriteContext = {
    put: (table, value) => ops.push({ kind: 'put', table, value }),
    del: (table, key) => ops.push({ kind: 'delete', table, key }),
    meta: (key, value) => ops.push({ kind: 'meta', key, value }),
  }
  const result = work(store.getSnapshot(), ctx)
  if (ops.length) {
    store.bump()
    store.enqueue(ops)
  }
  return result
}