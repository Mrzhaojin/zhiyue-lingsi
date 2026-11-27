import { useMutation, useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useAdminStats() {
  return useQuery({ queryKey: ['admin', 'stats'], queryFn: () => repositories.admin.stats() })
}

export function useUpdateAdminConfig() {
  return useMutation({
    mutationFn: (patch: Partial<{ pinnedPostIds: string[]; featuredPostIds: string[]; bannedKeywords: string[] }>) =>
      repositories.admin.updateConfig(patch),
  })
}