import { useMutation, useQuery } from '@tanstack/react-query'
import { repositories, type NewPostInput, type PostPatch } from '../../data/repositories'

export type PostListParams = {
  sort: 'latest' | 'hot'
  limit?: number
  authorId?: string
  topic?: string
}

function toListInput(params: PostListParams) {
  return {
    sort: params.sort,
    limit: params.limit ?? 50,
    ...(params.authorId ? { authorId: params.authorId } : {}),
    ...(params.topic ? { topic: params.topic } : {}),
  }
}

export function usePosts(params: PostListParams) {
  const input = toListInput(params)
  return useQuery({
    queryKey: ['posts', input],
    queryFn: () => repositories.posts.list(input),
  })
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: () => repositories.posts.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreatePost() {
  return useMutation({ mutationFn: (input: NewPostInput) => repositories.posts.create(input) })
}

export function useDeletePost() {
  return useMutation({ mutationFn: (id: string) => repositories.posts.remove(id) })
}

export function useRecordPostView() {
  return useMutation({ mutationFn: (id: string) => repositories.posts.recordView(id) })
}
export function useUpdatePost() {
  return useMutation({ mutationFn: (input: { id: string; patch: PostPatch }) => repositories.posts.update(input.id, input.patch) })
}
