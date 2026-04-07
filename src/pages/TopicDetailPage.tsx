import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { getDbSnapshot, listContentByTag } from '../data/db'
import { formatTime } from '../lib/format'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { MessageCircle, ThumbsUp, Hash } from 'lucide-react'

function getAvatarColor(id: string) {
  const colors = ['#a3c2b5', '#b2c8d4', '#d4c8b2', '#c8b2d4', '#b2d4c8', '#d4b2b2', '#e2a3a3', '#a3b2e2'];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export function TopicDetailPage() {
  const { tagName } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') ?? 'hot') as 'hot' | 'latest'
  const normalized = decodeURIComponent(tagName ?? '')
  const db = getDbSnapshot()
  const { posts, notes } = listContentByTag(normalized)

  const sortedPosts =
    tab === 'latest' ? [...posts].sort((a, b) => b.createdAt - a.createdAt) : posts
  const sortedNotes =
    tab === 'latest' ? [...notes].sort((a, b) => b.createdAt - a.createdAt) : notes

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
          <div className="row gap">
            <Link className="btn" to={`/forum/new?tag=${encodeURIComponent(normalized)}`}>
              发帖
            </Link>
            <Link className="btn" to={`/notes/new?tag=${encodeURIComponent(normalized)}`}>
              写笔记
            </Link>
          </div>
        </div>
        <div className="topic-head">
          <div className="topic-icon" aria-hidden="true" style={{ display: 'grid', placeItems: 'center' }}>
            <Hash size={32} />
          </div>
          <div>
            <div className="topic-title">{normalized}</div>
            <div className="muted">
              帖子 {posts.length} · 笔记 {notes.length}
            </div>
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'hot' ? 'active' : ''}`} onClick={() => setParams({ tab: 'hot' })}>
            热门
          </button>
          <button className={`tab ${tab === 'latest' ? 'active' : ''}`} onClick={() => setParams({ tab: 'latest' })}>
            最新
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">内容</h2>
          <span className="muted">论坛与笔记实时联动</span>
        </div>
        <div className="grid">
          {sortedPosts.map((p) => {
             const author = db.users[p.authorId];
             return (
              <Link key={p.id} className="card" to={`/forum/${p.id}`} style={{ padding: '20px', borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="row gap" style={{ marginBottom: '16px', gap: '12px' }}>
                  {author?.avatarUrl ? (
                    <img src={author.avatarUrl} alt={author.nickname} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                  ) : (
                    <div className="avatar sm" aria-hidden="true" style={{ width: '32px', height: '32px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 500 }}>
                      {(author?.nickname ?? 'U').slice(0, 1)}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div className="card-kicker" style={{ margin: 0, marginBottom: '4px' }}>论坛帖子</div>
                    <div className="card-title" style={{ margin: 0 }}>{p.title}</div>
                  </div>
                </div>
                <div className="card-sub">{p.contentText.slice(0, 80)}</div>
                <div className="card-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ThumbsUp size={12} /> {p.stats.likes}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MessageCircle size={12} /> {p.stats.comments}</span>
                </div>
              </Link>
            );
          })}
          {sortedNotes.map((n) => {
             const author = db.users[n.authorId];
             return (
              <Link key={n.id} className="card" to={`/notes/${n.id}/edit`} style={{ padding: '20px', borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="row gap" style={{ marginBottom: '16px', gap: '12px' }}>
                  {author?.avatarUrl ? (
                    <img src={author.avatarUrl} alt={author.nickname} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                  ) : (
                    <div className="avatar sm" aria-hidden="true" style={{ width: '32px', height: '32px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 500 }}>
                      {(author?.nickname ?? 'U').slice(0, 1)}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div className="card-kicker" style={{ margin: 0, marginBottom: '4px' }}>阅读笔记</div>
                    <div className="card-title" style={{ margin: 0 }}>{n.title}</div>
                  </div>
                </div>
                <div className="card-sub">{n.contentText.slice(0, 80)}</div>
                <div className="card-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ThumbsUp size={12} /> {n.stats.likes}</span>
                  <span>⭐ {n.stats.collects}</span>
                  <span>{formatTime(n.updatedAt)}</span>
                </div>
              </Link>
            );
          })}
          {sortedPosts.length === 0 && sortedNotes.length === 0 ? (
            <div className="empty">该话题下暂无内容。</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
