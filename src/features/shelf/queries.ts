import { useMutation, useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useShelf(userId: string) {
  return useQuery({
    queryKey: ['shelf', userId],
    queryFn: () => repositories.shelf.list(userId),
    enabled: Boolean(userId),
  })
}

export function useRemoveFromShelf() {
  return useMutation({
    mutationFn: (input: { userId: string; bookId: string }) =>
      repositories.shelf.remove(input.userId, input.bookId),
  })
}

export function useAddToShelf() {
  return useMutation({
    mutationFn: (input: { userId: string; bookId: string }) =>
      repositories.shelf.add(input.userId, input.bookId),
  })
}