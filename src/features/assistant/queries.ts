import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { repositories } from '../../data/repositories'

export function useThreads(userId: string) {
  return useQuery({ queryKey: ['ai-threads', userId], queryFn: () => repositories.assistant.listThreads(userId), enabled: Boolean(userId) })
}

export function useThreadMessages(threadId: string) {
  return useQuery({ queryKey: ['ai-messages', threadId], queryFn: () => repositories.assistant.listMessages(threadId), enabled: Boolean(threadId) })
}

export function useDeleteThread() {
  return useMutation({ mutationFn: (id: string) => repositories.assistant.deleteThread(id) })
}

export function useAnalysisRecords(userId: string) {
  return useQuery({ queryKey: ['ai-analyses', userId], queryFn: () => repositories.assistant.listAnalyses(userId), enabled: Boolean(userId) })
}

export function useDeleteAnalysis() {
  return useMutation({ mutationFn: (id: string) => repositories.assistant.deleteAnalysis(id) })
}
export function useThreadMessagesList(threadIds: string[]) {
  return useQueries({
    queries: threadIds.map((id) => ({
      queryKey: ['ai-messages', id],
      queryFn: () => repositories.assistant.listMessages(id),
      enabled: Boolean(id),
    })),
  })
}

export function useSaveAnalysis() {
  return useMutation({
    mutationFn: (input: Parameters<typeof repositories.assistant.saveAnalysis>[0]) =>
      repositories.assistant.saveAnalysis(input),
  })
}
