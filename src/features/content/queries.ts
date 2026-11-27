import { useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useContentByTag(tag: string) {
  return useQuery({
    queryKey: ['content', 'tag', tag],
    queryFn: () => repositories.content.byTag(tag),
    enabled: Boolean(tag),
  })
}

export function useContentByIds(postIds: string[], noteIds: string[]) {
  return useQuery({
    queryKey: ['content', 'ids', postIds, noteIds],
    queryFn: async () => {
      const [posts, notes] = await Promise.all([
        repositories.content.postsByIds(postIds),
        repositories.content.notesByIds(noteIds),
      ])
      return { posts, notes }
    },
    enabled: postIds.length + noteIds.length > 0,
  })
}