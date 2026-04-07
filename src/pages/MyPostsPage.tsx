import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser, getDbSnapshot } from '../data/db'
import { formatTime } from '../lib/format'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { ThumbsUp, MessageCircle } from 'lucide-react'

export function MyPostsPage() {
  const user = getCurrentUser()
  const db = getDbSnapshot()
  const navigate = useNavigate()

  const posts = Object.values(db.posts)
    .filter((p) => p.authorId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon size={20} />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">我发布的帖子</h2>
          <span className="muted" style={{ fontSize: '11px', fontWeight: 300 }}>
            共 {posts.length} 条
          </span>
        </div>
      </section>

      <section className="section">
        <div className="list" style={{ gap: '16px' }}>
          {posts.map((p) => (
            <Link key={p.id} className="card" to={`/forum/${p.id}`}>
              <div className="row space" style={{ marginBottom: '8px' }}>
                <div className="card-title">{p.title}</div>
                <div className="card-meta" style={{ marginTop: 0 }}>
                  {formatTime(p.createdAt)}
                </div>
              </div>
              <div className="card-sub">{p.contentText.slice(0, 120)}...</div>
              <div className="card-meta">
                <span className="row gap" style={{ gap: '4px' }}><ThumbsUp size={12} /> {p.stats.likes}</span>
                <span className="row gap" style={{ gap: '4px' }}><MessageCircle size={12} /> {p.stats.comments}</span>
                <span className="row gap" style={{ gap: '4px' }}>浏览 {p.stats.views}</span>
              </div>
            </Link>
          ))}

          {posts.length === 0 ? (
            <div className="empty" style={{ padding: '60px 20px' }}>暂无帖子</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

