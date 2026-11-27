import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../modules/auth/client'
import { useInteractions } from '../features/interactions/queries'
import { useContentByIds } from '../features/content/queries'
import { formatTime } from '../lib/format'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { ThumbsUp, MessageCircle, Eye } from 'lucide-react'

export function CollectionsPage() {
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : ''
  const navigate = useNavigate()
  const itemsQuery = useInteractions(userId, 'collect')
  const items = itemsQuery.data ?? []
  const postIds = items.filter((item) => item.targetType === 'post').map((item) => item.targetId)
  const noteIds = items.filter((item) => item.targetType === 'note').map((item) => item.targetId)
  const contentQuery = useContentByIds(postIds, noteIds)
  const postById = new Map((contentQuery.data?.posts ?? []).map((post) => [post.id, post]))
  const noteById = new Map((contentQuery.data?.notes ?? []).map((note) => [note.id, note]))
  if (itemsQuery.isLoading) {
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
          <h2 className="h2">我的收藏</h2>
          <span className="muted">帖子 / 笔记</span>
        </div>
      </section>

      <section className="section">
        <div className="list">
          {items.map((it) => {
            if (it.targetType === 'post') {
              const p = postById.get(it.targetId)
              if (!p) return null
              return (
                <Link key={it.targetId} className="card" to={`/forum/${p.id}`}>
                  <div className="card-kicker">论坛帖子</div>
                  <div className="card-title">{p.title}</div>
                  <div className="card-sub">{p.contentText.slice(0, 100)}</div>
                  <div className="card-meta">
                    <span>收藏于 {formatTime(it.createdAt)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ThumbsUp size={12} /> {p.stats.likes}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MessageCircle size={12} /> {p.stats.comments}</span>
                  </div>
                </Link>
              )
            }
            const n = noteById.get(it.targetId)
            if (!n) return null
            return (
              <Link key={it.targetId} className="card" to={`/notes/${n.id}/edit`}>
                <div className="card-kicker">阅读笔记</div>
                <div className="card-title">{n.title}</div>
                <div className="card-sub">{n.contentText.slice(0, 100)}</div>
                <div className="card-meta">
                  <span>收藏于 {formatTime(it.createdAt)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ThumbsUp size={12} /> {n.stats.likes}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Eye size={12} /> {n.stats.views}</span>
                </div>
              </Link>
            )
          })}
          {items.length === 0 ? <div className="empty">你还没有收藏任何内容。</div> : null}
        </div>
      </section>
    </div>
  )
}
