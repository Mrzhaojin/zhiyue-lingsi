import type { Interaction, Post } from '../../domain/models'
import type { Database } from '../db/schema'
import { mutate } from '../db/store'
import { now, data } from './shared'

type ResolvedTarget = { type: 'post'; id: string }

/** 互动只落在帖子上：对笔记的点赞/收藏会代理到其已发布的帖子。 */
export function resolveInteractionTarget(
  db: Database,
  targetType: Interaction['targetType'],
  targetId: string,
): ResolvedTarget | null {
  if (targetType === 'post') {
    const post = db.posts[targetId]
    return post && !post.deletedAt ? { type: 'post', id: targetId } : null
  }
  const note = db.notes[targetId]
  if (!note || note.deletedAt || !note.publishedPostId) return null
  const post = db.posts[note.publishedPostId]
  return post && !post.deletedAt ? { type: 'post', id: post.id } : null
}

function interactionKey(userId: string, kind: Interaction['kind'], targetType: string, targetId: string) {
  return `${userId}:${kind}:${targetType}:${targetId}`
}

export function hasInteraction(
  userId: string,
  kind: Interaction['kind'],
  targetType: Interaction['targetType'],
  targetId: string,
) {
  const target = resolveInteractionTarget(data(), targetType, targetId)
  if (!target) return false
  return Boolean(data().interactions[interactionKey(userId, kind, target.type, target.id)])
}

export function toggleInteraction(
  userId: string,
  kind: Interaction['kind'],
  targetType: Interaction['targetType'],
  targetId: string,
) {
  const resolved = resolveInteractionTarget(data(), targetType, targetId)
  if (!resolved) return
  const key = interactionKey(userId, kind, resolved.type, resolved.id)

  mutate((db, ctx) => {
    const target = db.posts[resolved.id]
    if (!target || target.deletedAt) return
    const current = db.interactions[key]
    const stats = {
      ...target.stats,
      likes: kind === 'like' ? Math.max(0, target.stats.likes + (current ? -1 : 1)) : target.stats.likes,
      collects: kind === 'collect' ? Math.max(0, target.stats.collects + (current ? -1 : 1)) : target.stats.collects,
    }
    if (current) {
      delete db.interactions[key]
      ctx.del('interactions', key)
    } else {
      const interaction: Interaction = {
        id: key,
        userId,
        kind,
        targetType: 'post',
        targetId: resolved.id,
        createdAt: now(),
      }
      db.interactions[key] = interaction
      ctx.put('interactions', interaction)
    }
    const next: Post = { ...target, stats }
    db.posts[target.id] = next
    ctx.put('posts', next)
  })
}

export function listUserInteractions(
  userId: string,
  kind: Interaction['kind'],
): Array<{ targetType: Interaction['targetType']; targetId: string; createdAt: number }> {
  const db = data()
  const seen = new Set<string>()
  const result: Array<{ targetType: Interaction['targetType']; targetId: string; createdAt: number }> = []
  for (const interaction of Object.values(db.interactions)) {
    if (interaction.userId !== userId || interaction.kind !== kind) continue
    const target = resolveInteractionTarget(db, interaction.targetType, interaction.targetId)
    if (!target || seen.has(target.id)) continue
    seen.add(target.id)
    result.push({ targetType: 'post', targetId: target.id, createdAt: interaction.createdAt })
  }
  return result.sort((a, b) => b.createdAt - a.createdAt)
}