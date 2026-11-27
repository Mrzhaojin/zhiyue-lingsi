import { useMutation, useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useReadingHistory(userId: string) {
  return useQuery({
    queryKey: ['reading-history', userId],
    queryFn: () => repositories.reading.history(userId),
    enabled: Boolean(userId),
  })
}

export function useRemoveReadingHistory() {
  return useMutation({
    mutationFn: (input: { userId: string; bookId: string }) =>
      repositories.reading.removeHistory(input.userId, input.bookId),
  })
}