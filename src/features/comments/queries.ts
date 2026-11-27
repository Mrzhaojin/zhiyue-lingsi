import { useMutation, useQuery } from '@tanstack/react-query'
import type { Comment } from '../../domain/models'
import { repositories } from '../../data/repositories'

export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: () => repositories.comments.listByPost(postId as string),
    enabled: Boolean(postId),
  })
}

export function useAddComment() {
  return useMutation({
    mutationFn: (input: Omit<Comment, 'id' | 'createdAt'>) => repositories.comments.create(input),
  })
}