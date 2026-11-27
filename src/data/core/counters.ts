import type { Post } from '../../domain/models'
import { mutate } from '../db/store'
import { data } from './shared'

/** 重算帖子计数（点赞/收藏/评论），修正漂移。返回修正的帖子数。 */
export function reconcileCounters(): { fixed: number } {
  const db = data()
  const patches: Post[] = []
  for (const post of Object.values(db.posts)) {
    const likes = Object.values(db.interactions).filter(
      (interaction) => interaction.targetType === 'post' && interaction.targetId === post.id && interaction.kind === 'like',
    ).length
    const collects = Object.values(db.interactions).filter(
      (interaction) => interaction.targetType === 'post' && interaction.targetId === post.id && interaction.kind === 'collect',
    ).length
    const comments = Object.values(db.comments).filter((comment) => comment.postId === post.id && !comment.deletedAt).length
    if (post.stats.likes !== likes || post.stats.collects !== collects || post.stats.comments !== comments) {
      patches.push({ ...post, stats: { ...post.stats, likes, collects, comments } })
    }
  }
  if (patches.length) {
    mutate((db2, ctx) => {
      for (const patch of patches) {
        db2.posts[patch.id] = patch
        ctx.put('posts', patch)
      }
    })
  }
  return { fixed: patches.length }
}