import { useMutation, useQuery } from '@tanstack/react-query'
import type { VocabItem } from '../../domain/models'
import { repositories } from '../../data/repositories'

export function useVocab(userId: string, type: VocabItem['type']) {
  return useQuery({ queryKey: ['vocab', userId, type], queryFn: () => repositories.reading.vocab(userId, type), enabled: Boolean(userId) })
}

export function useRemoveVocab() {
  return useMutation({ mutationFn: (id: string) => repositories.reading.removeVocab(id) })
}