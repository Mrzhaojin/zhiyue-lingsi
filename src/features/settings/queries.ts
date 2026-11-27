import { useMutation, useQuery } from '@tanstack/react-query'
import type { User } from '../../domain/models'
import { repositories } from '../../data/repositories'

export function useCurrentProfile() {
  return useQuery({ queryKey: ['profile', 'current'], queryFn: () => repositories.profiles.current() })
}

export function useUpdateProfile() {
  return useMutation({ mutationFn: (patch: Partial<User>) => repositories.profiles.update(patch) })
}

export function useDatabaseSize() {
  return useQuery({ queryKey: ['backup', 'size'], queryFn: () => repositories.backup.sizeBytes() })
}

export function useExportBackup() {
  return useMutation({ mutationFn: () => repositories.backup.exportJson() })
}

export function useImportBackup() {
  return useMutation({ mutationFn: (json: string) => repositories.backup.importJson(json) })
}