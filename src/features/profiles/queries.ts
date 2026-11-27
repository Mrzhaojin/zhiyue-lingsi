import { useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useProfiles(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort()
  return useQuery({
    queryKey: ['profiles', unique],
    queryFn: () => repositories.profiles.listByIds(unique),
    enabled: unique.length > 0,
  })
}
export function useProfileStats(userId: string) {
  return useQuery({
    queryKey: ['profile', 'stats', userId],
    queryFn: () => repositories.profiles.stats(userId),
    enabled: Boolean(userId),
  })
}
