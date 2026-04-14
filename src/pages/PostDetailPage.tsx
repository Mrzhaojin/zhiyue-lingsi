import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addComment,
  deletePost,
  getCurrentUser,
  getDbSnapshot,
  getPost,
  hasInteraction,
  incrementPostView,
  listComments,
  toggleInteraction,
  updatePost,
} from '../data/db'
import { formatTime } from '../lib/format'
import { checkContentAllowed } from '../services/keywordFilter'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { ThumbsUp, MessageCircle, Eye } from 'lucide-react'

function getAvatarColor(id: string) {
  const colors = ['#a3c2b5', '#b2c8d4', '#d4c8b2', '#c8b2d4', '#b2d4c8', '#d4b2b2', '#e2a3a3', '#a3b2e2'];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export function PostDetailPage() {
  const { postId } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [post, setPost] = useState<ReturnType<typeof getPost> | undefined>(postId ? getPost(postId) : undefined)
  const db = getDbSnapshot()

  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<string | undefined>(undefined)

  // 当postId变化时，重新获取帖子数据
  useEffect(() => {
    const loadPost = () => {
      if (postId) {
        setPost(getPost(postId))
      }
    }
    loadPost()
  }, [postId])

  useEffect(() => {
    if (!postId) return
    incrementPostView(postId)
  }, [postId])

  const comments = postId ? listComments(postId) : []
  const rootComments = comments.filter((c) => !c.parentId)
  const childrenByParent = new Map<string, typeof comments>()
  for (const c of comments) {
    if (!c.parentId) continue
    const list = childrenByParent.get(c.parentId) ?? []
    list.push(c)
    childrenByParent.set(c.parentId, list)
  }

  if (!post) {
    return (
      <div className="page">
        <div className="empty">帖子不存在或已被删除。</div>
        <Link className="btn" to="/forum">
          返回论坛
        </Link>
      </div>
    )
  }

  const author = post ? db.users[post.authorId] : undefined
  const liked = post ? hasInteraction(user.id, 'like', 'post', post.id) : false
  const collected = post ? hasInteraction(user.id, 'collect', 'post', post.id) : false
  const isOwner = post ? user.id === post.authorId : false

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
          {isOwner ? (
            <div className="row gap">
              <button className="btn" onClick={() => navigate(`/forum/new?edit=${encodeURIComponent(post.id)}`)}>
                编辑
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  deletePost(post.id)
                  toast.push('已删除帖子', 'success')
                  navigate('/forum')
                }}
              >
                删除
              </button>
            </div>
          ) : null}
        </div>

        <div className="card post-detail">
          <div className="post-head">
            <div className="row gap post-author">
              {author?.avatarUrl ? (
                <img src={author.avatarUrl} alt={author.nickname} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
              ) : (
                <div className="avatar" aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '16px', fontWeight: 500 }}>
                  {(author?.nickname ?? 'U').slice(0, 1)}
                </div>
              )}
              <div className="grow">
                <div className="post-title">{post.title}</div>
                <div className="muted">
                  {author?.nickname ?? '未知用户'} · {formatTime(post.createdAt)}
                </div>
              </div>
            </div>
            <div className="chips post-tags">
              {post.tags.map((t) => (
                <Link key={t} className="chip link" to={`/forum/topics/${encodeURIComponent(t)}`}>
                  {t}
                </Link>
              ))}
            </div>
          </div>

          <div className="post-content">{post.contentText}</div>
          {post.imageUrls.length ? (
            <div className="img-grid">
              {post.imageUrls.map((u, idx) => (
                <div key={idx} className="img-cell">
                  <img src={u} alt="" />
                </div>
              ))}
            </div>
          ) : null}

          <div className="post-actions">
            <div className="row gap wrap">
              <button
                className={`btn sm ${liked ? 'primary' : ''}`}
                onClick={() => {
                  toggleInteraction(user.id, 'like', 'post', post.id)
                  // 立即更新本地状态，实现点赞数的实时更新
                  setPost(prevPost => {
                    if (!prevPost) return prevPost
                    return {
                      ...prevPost,
                      stats: {
                        ...prevPost.stats,
                        likes: liked ? prevPost.stats.likes - 1 : prevPost.stats.likes + 1
                      }
                    }
                  })
                  toast.push(liked ? '已取消点赞' : '已点赞', 'success')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ThumbsUp size={14} /> 点赞 {post?.stats.likes || 0}
              </button>
              <button
                className={`btn sm ${collected ? 'primary' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => {
                  toggleInteraction(user.id, 'collect', 'post', post.id)
                  // 立即更新本地状态，实现收藏数的实时更新
                  setPost(prevPost => {
                    if (!prevPost) return prevPost
                    return {
                      ...prevPost,
                      stats: {
                        ...prevPost.stats,
                        collects: collected ? prevPost.stats.collects - 1 : prevPost.stats.collects + 1
                      }
                    }
                  })
                  toast.push(collected ? '已取消收藏' : '已收藏', 'success')
                }}
              >
                ⭐ 收藏 {post?.stats.collects || 0}
              </button>
              <button
                className="btn sm"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={async () => {
                  const url = window.location.href
                  const nav = navigator as Navigator & {
                    share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
                  }
                  try {
                    if (typeof nav.share === 'function') {
                      await nav.share({ title: post?.title || '', text: post?.contentText.slice(0, 80) || '', url })
                    } else {
                      await navigator.clipboard.writeText(url)
                      toast.push('链接已复制，可转发', 'success')
                    }
                    if (post) {
                      updatePost(post.id, { stats: { ...post.stats, shares: post.stats.shares + 1 } })
                      // 立即更新本地状态，实现转发数的实时更新
                      setPost(prevPost => {
                        if (!prevPost) return prevPost
                        return {
                          ...prevPost,
                          stats: {
                            ...prevPost.stats,
                            shares: prevPost.stats.shares + 1
                          }
                        }
                      })
                    }
                  } catch {
                    toast.push('转发失败', 'error')
                  }
                }}
              >
                🔁 转发 {post?.stats.shares || 0}
              </button>
            </div>
            <span className="muted post-stats" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageCircle size={14} /> {post?.stats.comments || 0} · <Eye size={14} /> {post?.stats.views || 0}
            </span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">评论</h2>
          <span className="muted">支持楼中楼</span>
        </div>

        <div className="form">
          {replyTo ? (
            <div className="replying">
              正在回复：{replyTo.slice(0, 6)}…
              <button className="btn" onClick={() => setReplyTo(undefined)}>
                取消
              </button>
            </div>
          ) : null}
          <textarea
            className="textarea"
            rows={3}
            placeholder="写下你的想法…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button
            className="btn primary"
            disabled={!commentText.trim()}
            onClick={() => {
              const allowed = checkContentAllowed(commentText)
              if (!allowed.ok) {
                toast.push(`评论包含敏感词：${allowed.hit}，已拦截`, 'error')
                return
              }
              addComment({
                postId: post.id,
                authorId: user.id,
                contentText: commentText.trim(),
                imageUrls: [],
                parentId: replyTo,
              })
              setCommentText('')
              setReplyTo(undefined)
              toast.push('已发表', 'success')
            }}
          >
            发表评论
          </button>
        </div>

        <div className="comment-list">
          {rootComments.map((c) => {
            const cAuthor = db.users[c.authorId]
            const children = childrenByParent.get(c.id) ?? []
            return (
              <div key={c.id} className="comment">
                <div className="row gap" style={{ marginBottom: '8px' }}>
                  {cAuthor?.avatarUrl ? (
                    <img src={cAuthor.avatarUrl} alt={cAuthor.nickname} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                  ) : (
                    <div className="avatar sm" aria-hidden="true" style={{ width: '32px', height: '32px', borderRadius: '50%', background: cAuthor ? getAvatarColor(cAuthor.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 500 }}>
                      {(cAuthor?.nickname ?? 'U').slice(0, 1)}
                    </div>
                  )}
                  <div className="grow">
                    <div className="row space">
                      <div className="muted">
                        {cAuthor?.nickname ?? '未知用户'} · {formatTime(c.createdAt)}
                      </div>
                      <button className="btn" onClick={() => setReplyTo(c.id)}>
                        回复
                      </button>
                    </div>
                    <div className="comment-text">{c.contentText}</div>
                  </div>
                </div>
                {children.length ? (
                  <div className="comment-children">
                    {children.map((cc) => {
                      const ccAuthor = db.users[cc.authorId]
                      return (
                        <div key={cc.id} className="comment child">
                          <div className="row gap" style={{ marginBottom: '4px' }}>
                            {ccAuthor?.avatarUrl ? (
                              <img src={ccAuthor.avatarUrl} alt={ccAuthor.nickname} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                            ) : (
                              <div className="avatar xs" aria-hidden="true" style={{ width: '24px', height: '24px', borderRadius: '50%', background: ccAuthor ? getAvatarColor(ccAuthor.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 500 }}>
                                {(ccAuthor?.nickname ?? 'U').slice(0, 1)}
                              </div>
                            )}
                            <div className="grow">
                              <div className="muted">
                                {ccAuthor?.nickname ?? '未知用户'} · {formatTime(cc.createdAt)}
                              </div>
                              <div className="comment-text">{cc.contentText}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
          {rootComments.length === 0 ? <div className="empty">还没有评论。</div> : null}
        </div>
      </section>
    </div>
  )
}
