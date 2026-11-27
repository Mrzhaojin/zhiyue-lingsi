import { bootstrapDatabase, type BootstrapResult } from './db/bootstrap'
import { createSeedDb } from './seed'

export * from './api'
export type { Database } from './db/schema'
export type { BootstrapResult }

/** 打开 IndexedDB、迁移旧数据或写入种子，然后载入内存快照。应用启动时必须先 await 它。 */
export function initializeDatabase(): Promise<BootstrapResult> {
  return bootstrapDatabase(createSeedDb)
}