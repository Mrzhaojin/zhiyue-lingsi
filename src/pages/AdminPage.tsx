import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdminConfig } from '../features/library/queries'
import { useAdminStats, useUpdateAdminConfig } from '../features/admin/queries'
import { useDeletePost, usePosts } from '../features/posts/queries'
import { useDeleteNote, useNotes } from '../features/notes/queries'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'

export function AdminPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const adminQuery = useAdminConfig()
  const statsQuery = useAdminStats()
  const postsQuery = usePosts({ sort: 'latest', limit: 12 })
  const notesQuery = useNotes({ sort: 'latest', limit: 12, onlyPublished: false })
  const updateConfig = useUpdateAdminConfig()
  const deletePostMutation = useDeletePost()
  const deleteNoteMutation = useDeleteNote()
  const [keyword, setKeyword] = useState('')

  const admin = adminQuery.data
  const stats = statsQuery.data ?? { users: 0, books: 0, posts: 0, notes: 0, comments: 0 }
  const posts = postsQuery.data?.items ?? []
  const notes = notesQuery.data?.items ?? []
  if (!admin || adminQuery.isLoading || statsQuery.isLoading) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载中…</div></div>
  }

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">后台管理</h2>
          <span className="muted">内容审核 · 话题配置 · 数据统计</span>
        </div>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-num">{stats.users}</div>
            <div className="stat-lab">用户</div>
          </div>
          <div className="stat">
            <div className="stat-num">{stats.books}</div>
            <div className="stat-lab">书籍</div>
          </div>
          <div className="stat">
            <div className="stat-num">{stats.posts}</div>
            <div className="stat-lab">帖子</div>
          </div>
          <div className="stat">
            <div className="stat-num">{stats.notes}</div>
            <div className="stat-lab">笔记</div>
          </div>
          <div className="stat">
            <div className="stat-num">{stats.comments}</div>
            <div className="stat-lab">评论</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">内容审核（关键词过滤）</h2>
          <span className="muted">发帖/评论/笔记发布前拦截</span>
        </div>
        <div className="row gap">
          <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="新增敏感词" />
          <button
            className="btn primary"
            onClick={() => {
              const k = keyword.trim()
              if (!k) return
              const next = Array.from(new Set([...admin.bannedKeywords, k]))
              updateConfig.mutate({ bannedKeywords: next })
              setKeyword('')
              toast.push('已添加', 'success')
            }}
          >
            添加
          </button>
        </div>
        <div className="chips">
          {admin.bannedKeywords.map((k) => (
            <button
              key={k}
              className="chip btn"
              onClick={() => {
                updateConfig.mutate({ bannedKeywords: admin.bannedKeywords.filter((x) => x !== k) })
                toast.push('已移除', 'success')
              }}
            >
              {k} ×
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">帖子管理</h2>
          <span className="muted">置顶/加精/删除</span>
        </div>
        <div className="list">
          {posts.map((p) => {
              const featured = admin.featuredPostIds.includes(p.id)
              const pinned = admin.pinnedPostIds.includes(p.id)
              return (
                <div key={p.id} className="card">
                  <div className="row space">
                    <div className="card-title">{p.title}</div>
                    <div className="row gap wrap">
                      <button
                        className={`btn ${pinned ? 'primary' : ''}`}
                        onClick={() => {
                          const next = pinned ? admin.pinnedPostIds.filter((id) => id !== p.id) : [p.id, ...admin.pinnedPostIds]
                          updateConfig.mutate({ pinnedPostIds: next.slice(0, 6) })
                          toast.push(pinned ? '已取消置顶' : '已置顶', 'success')
                        }}
                      >
                        置顶
                      </button>
                      <button
                        className={`btn ${featured ? 'primary' : ''}`}
                        onClick={() => {
                          const next = featured
                            ? admin.featuredPostIds.filter((id) => id !== p.id)
                            : [p.id, ...admin.featuredPostIds]
                          updateConfig.mutate({ featuredPostIds: next.slice(0, 8) })
                          toast.push(featured ? '已取消加精' : '已加精', 'success')
                        }}
                      >
                        加精
                      </button>
                      <Link className="btn" to={`/forum/${p.id}`}>
                        查看
                      </Link>
                      <button
                        className="btn danger"
                        onClick={() => {
                          deletePostMutation.mutate(p.id, {
                            onSuccess: () => toast.push('已删除帖子', 'success'),
                            onError: (error) => toast.push(error instanceof Error ? error.message : '删除失败', 'error'),
                          })
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="muted">{p.contentText.slice(0, 120)}</div>
                </div>
              )
            })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">笔记管理</h2>
          <span className="muted">删除/查看</span>
        </div>
        <div className="list">
          {notes.map((n) => (
              <div key={n.id} className="card">
                <div className="row space">
                  <div className="card-title">{n.title}</div>
                  <div className="row gap">
                    <Link className="btn" to={`/notes/${n.id}/edit`}>
                      查看
                    </Link>
                    <button
                      className="btn danger"
                      onClick={() => {
                        deleteNoteMutation.mutate(n.id, {
                          onSuccess: () => toast.push('已删除笔记', 'success'),
                          onError: (error) => toast.push(error instanceof Error ? error.message : '删除失败', 'error'),
                        })
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div className="muted">{n.contentText.slice(0, 120)}</div>
              </div>
            ))}
        </div>
      </section>
    </div>
  )
}
