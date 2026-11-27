import { useMutation, useQuery } from '@tanstack/react-query'
import type { Interaction } from '../../domain/models'
import { repositories } from '../../data/repositories'

export function useInteraction(
  userId: string | undefined,
  kind: Interaction['kind'],
  targetType: Interaction['targetType'],
  targetId: string,
) {
  return useQuery({
    queryKey: ['interaction', userId, kind, targetType, targetId],
    queryFn: () => repositories.interactions.has(userId as string, kind, targetType, targetId),
    enabled: Boolean(userId && targetId),
  })
}

export function useToggleInteraction() {
  return useMutation({
    mutationFn: (input: { userId: string; kind: Interaction['kind']; targetType: Interaction['targetType']; targetId: string }) =>
      repositories.interactions.toggle(input.userId, input.kind, input.targetType, input.targetId),
  })
}