import type { Repositories } from './types'
import { localRepositories } from './local'

/**
 * 仓储入口：目前只有本地实现；M2 接入云端后按运行时选择 Local/Remote。
 * 页面与 feature hooks 只依赖这个对象，不直接依赖 data/core。
 */
export const repositories: Repositories = localRepositories

export type * from './types'
