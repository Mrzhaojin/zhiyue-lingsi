import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDatabaseVersion } from '../data/useDatabaseVersion'

/**
 * 数据版本 → 查询缓存失效。
 * 本地写入会 bump 版本；这里统一 invalidate，页面不需要在每次 mutation 后手写刷新。
 */
export function DataInvalidator() {
  const version = useDatabaseVersion()
  const client = useQueryClient()
  const last = useRef(version)

  useEffect(() => {
    if (version === last.current) return
    last.current = version
    void client.invalidateQueries()
  }, [version, client])

  return null
}