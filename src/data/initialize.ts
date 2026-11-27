import { bootstrapDatabase, type BootstrapResult } from './db/bootstrap'
import { createSeedDb } from './seed'

/** 打开 IndexedDB、迁移旧数据或写入种子，然后载入内存快照。 */
export function initializeDatabase(): Promise<BootstrapResult> {
  return bootstrapDatabase(createSeedDb)
}
