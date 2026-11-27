import { useMutation, useQuery } from '@tanstack/react-query'
import type { Note } from '../../domain/models'
import { repositories, type ListNotesInput } from '../../data/repositories'

export function useNotes(input: ListNotesInput) {
  return useQuery({
    queryKey: ['notes', input],
    queryFn: () => repositories.notes.list(input),
  })
}

export function useDrafts(authorId: string) {
  return useQuery({
    queryKey: ['notes', 'drafts', authorId],
    queryFn: () => repositories.notes.listByAuthor(authorId, 'draft'),
    enabled: Boolean(authorId),
  })
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: () => repositories.notes.get(id as string),
    enabled: Boolean(id),
  })
}

export function useSaveNote() {
  return useMutation({
    mutationFn: (input: Partial<Note> & Pick<Note, 'authorId' | 'title' | 'contentText'>) => repositories.notes.save(input),
  })
}

export function useDeleteNote() {
  return useMutation({ mutationFn: (id: string) => repositories.notes.remove(id) })
}
export function usePublishNote() {
  return useMutation({
    mutationFn: (input: { id: string; actorId: string }) => repositories.notes.publish(input.id, input.actorId),
  })
}

export function useUnpublishNote() {
  return useMutation({
    mutationFn: (input: { id: string; actorId: string }) => repositories.notes.unpublish(input.id, input.actorId),
  })
}
