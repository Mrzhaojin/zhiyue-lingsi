import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser, listPublishedNotesByUser } from '../data/db'
import { formatTime } from '../lib/format'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { ThumbsUp } from 'lucide-react'

export function MyNotesPage() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const notes = listPublishedNotesByUser(user.id).sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon size={20} />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">我的读书笔记</h2>
          <span className="muted" style={{ fontSize: '11px', fontWeight: 300 }}>
            共 {notes.length} 篇
          </span>
        </div>
      </section>

      <section className="section">
        <div className="list" style={{ gap: '16px' }}>
          {notes.map((n) => (
            <Link key={n.id} className="card" to={`/notes/${n.id}/edit`}>
              <div className="row space" style={{ marginBottom: '8px' }}>
                <div className="card-title">{n.title}</div>
                <div className="card-meta" style={{ marginTop: 0 }}>
                  {formatTime(n.updatedAt)}
                </div>
              </div>
              <div className="card-sub">{n.contentText.slice(0, 120)}...</div>
              <div className="card-meta">
                <span className="row gap" style={{ gap: '4px' }}><ThumbsUp size={12} /> {n.stats.likes}</span>
                <span className="row gap" style={{ gap: '4px' }}>收藏 {n.stats.collects}</span>
                <span className="row gap" style={{ gap: '4px' }}>浏览 {n.stats.views}</span>
              </div>
            </Link>
          ))}

          {notes.length === 0 ? (
            <div className="empty" style={{ padding: '60px 20px' }}>暂无笔记</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

