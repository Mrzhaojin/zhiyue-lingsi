import { useMutation, useQuery } from '@tanstack/react-query'
import { repositories, type BookFilter } from '../../data/repositories'

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: () => repositories.books.tags() })
}

export function useBooks(filter: BookFilter) {
  return useQuery({
    queryKey: ['books', filter],
    queryFn: () => repositories.books.list(filter),
  })
}

export function useEnsureTag() {
  return useMutation({ mutationFn: (name: string) => repositories.books.ensureTag(name) })
}
export function useAdminConfig() {
  return useQuery({ queryKey: ['admin-config'], queryFn: () => repositories.admin.getConfig() })
}
