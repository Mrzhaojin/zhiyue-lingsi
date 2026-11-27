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
export function useProgress(userId: string, bookId: string) {
  return useQuery({
    queryKey: ['reading-progress', userId, bookId],
    queryFn: () => repositories.reading.getProgress(userId, bookId),
    enabled: Boolean(userId && bookId),
  })
}

export function useSaveProgress() {
  return useMutation({
    mutationFn: (input: { userId: string; bookId: string; chapterId: string; progress: number }) =>
      repositories.reading.saveProgress(input),
  })
}

export function useAddVocab() {
  return useMutation({
    mutationFn: (input: { userId: string; type: 'word' | 'sentence'; text: string }) =>
      repositories.reading.addVocab(input),
  })
}

export function useIncrementReadingMinutes() {
  return useMutation({
    mutationFn: (input: { userId: string; minutes: number }) =>
      repositories.reading.incrementReadingMinutes(input.userId, input.minutes),
  })
}
