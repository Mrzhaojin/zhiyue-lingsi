import { Link, useNavigate } from 'react-router-dom'
import { getAdminConfig, getDbSnapshot, listNotes, listPosts, listBooks, toggleInteraction } from '../data/db'
import { formatTime } from '../lib/format'
import { BookCover } from '../components/BookCover'
import { Search, MessageCircle, ThumbsUp, FileText, BookOpen, Star } from 'lucide-react'
import { useToast } from '../ui/useToast'
import { useAuth } from '../modules/auth/client/AuthProvider'

function getAvatarColor(id: string) {
  const colors = ['#a3c2b5', '#b2c8d4', '#d4c8b2', '#c8b2d4', '#b2d4c8', '#d4b2b2', '#e2a3a3', '#a3b2e2'];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

type FeedItem =
  | { type: 'post'; id: string }
  | { type: 'note'; id: string }
  | { type: 'book'; id: string }

export function HomePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { state } = useAuth()
  const user = state.status === 'authenticated' ? state.user : null
  const admin = getAdminConfig()
  const db = getDbSnapshot()
  const allBooks = listBooks()
  const featured: FeedItem[] = [
    ...admin.featuredPostIds
      .filter((id) => Boolean(db.posts[id]))
      .map((id) => ({ type: 'post' as const, id })),
    ...allBooks.filter(b => b.recommendedHeat >= 95).slice(0, 1).map(b => ({ type: 'book' as const, id: b.id })),
    ...listNotes('hot').slice(0, 2).map((n) => ({ type: 'note' as const, id: n.id })),
  ].slice(0, 5)

  const hotPosts = listPosts('hot').slice(0, 6)
  const hotNotes = listNotes('hot').slice(0, 6)
  const hotBooks = allBooks.sort((a, b) => b.recommendedHeat - a.recommendedHeat).slice(0, 2)
  
  const hot: FeedItem[] = [
    ...hotPosts.slice(0, 2).map((p) => ({ type: 'post' as const, id: p.id })),
    ...hotBooks.map((b) => ({ type: 'book' as const, id: b.id })),
    ...hotNotes.slice(0, 2).map((n) => ({ type: 'note' as const, id: n.id })),
    ...hotPosts.slice(2).map((p) => ({ type: 'post' as const, id: p.id })),
    ...hotNotes.slice(2).map((n) => ({ type: 'note' as const, id: n.id })),
  ].slice(0, 8)

  return (
    <div className="page">
      <section className="section" style={{ padding: '0 4px', marginBottom: '12px' }}>
        <div className="search-box" onClick={() => navigate('/search')} style={{ borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: 'none' }}>
           <Search size={16} style={{ opacity: 0.6 }} />
           <span className="muted" style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 300 }}>搜索好书、话题或笔记...</span>
        </div>
      </section>

      {/* 新增热门书籍推荐部分 */}
      <section className="section" style={{ marginBottom: '8px' }}>
        <div className="section-head">
          <h2 className="h2">热门书籍推荐</h2>
          <Link className="link" to="/read" style={{ fontSize: '12px', fontWeight: '400', color: 'var(--accent)' }}>
            全部书籍 →
          </Link>
        </div>
        <div className="rank-strip" style={{ padding: '0 4px', gap: '12px' }}>
          {allBooks
            .sort((a, b) => b.recommendedHeat - a.recommendedHeat)
            .slice(0, 8)
            .map((b) => (
              <Link 
                key={b.id} 
                className="card" 
                to={`/read/${b.id}`} 
                style={{ 
                  flex: '0 0 130px', 
                  padding: '12px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  textAlign: 'center',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <div style={{ transform: 'scale(1.1)', marginBottom: '8px' }}>
                  <BookCover book={b} size="lg" />
                </div>
                <div className="book-title" style={{ marginTop: '12px', fontSize: '13px', width: '100%', fontWeight: 500 }}>{b.title}</div>
                <div className="card-meta" style={{ marginTop: '4px', justifyContent: 'center', fontSize: '10px', opacity: 0.8 }}>
                  <span>{b.category}</span>
                </div>
              </Link>
            ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">置顶推荐</h2>
          <Link className="link" to="/forum?tab=topics" style={{ fontSize: '12px', fontWeight: '400', color: 'var(--accent)' }}>
            话题广场 →
          </Link>
        </div>
        <div className="grid">
          {featured.map((it) => {
            if (it.type === 'post') {
              const p = db.posts[it.id]
              if (!p) return null
              const author = db.users[p.authorId]
              return (
                <Link key={`p-${p.id}`} className="card" to={`/forum/${p.id}`}>
                  <div className="card-kicker" style={{ color: 'var(--accent)', fontWeight: '400', fontSize: '11px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {author?.avatarUrl ? (
                      <img src={author.avatarUrl} alt={author.nickname} style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div className="avatar sm" aria-hidden="true" style={{ width: '16px', height: '16px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 500 }}>
                        {(author?.nickname ?? 'U').slice(0, 1)}
                      </div>
                    )}
                    <span>{author?.nickname ?? '精华推文'}</span>
                  </div>
                  <div className="card-title">{p.title}</div>
                  <div className="card-sub">{p.contentText.slice(0, 56)}...</div>
                  <div className="card-meta">
                    <span className="row gap" style={{ gap: '4px' }}><MessageCircle size={14} /> {p.stats.comments}</span>
                    <button className="btn sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer' }} onClick={(e) => {
                      e.stopPropagation()
                      if (user) {
                        toggleInteraction(user.id, 'like', 'post', p.id)
                        toast.push('已点赞', 'success')
                      }
                    }}>
                      <ThumbsUp size={14} /> {p.stats.likes}
                    </button>
                    <span className="row gap" style={{ gap: '4px' }}>浏览 {p.stats.views}</span>
                  </div>
                </Link>
              )
            }
            if (it.type === 'book') {
              const b = db.books[it.id]
              if (!b) return null
              return (
                <Link key={`b-${b.id}`} className="card book-card" to={`/read/${b.id}`}>
                  <BookCover book={b} size="sm" />
                  <div className="book-body">
                    <div className="card-kicker" style={{ color: '#d97706', fontWeight: '400', fontSize: '11px', marginBottom: '4px' }}>必读经典</div>
                    <div className="book-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={16} /> {b.title}</div>
                    <div className="book-desc">{b.summary}</div>
                    <div className="card-meta" style={{ marginTop: '10px' }}>
                      <span className="row gap" style={{ gap: '4px' }}>推荐度 {b.recommendedHeat}%</span>
                    </div>
                  </div>
                </Link>
              )
            }
            const n = db.notes[it.id]
            if (!n) return null
            const author = db.users[n.authorId]
            return (
              <Link key={`n-${n.id}`} className="card" to={`/notes/${n.id}/edit`}>
                <div className="card-kicker" style={{ color: '#8ba89d', fontWeight: '400', fontSize: '11px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {author?.avatarUrl ? (
                    <img src={author.avatarUrl} alt={author.nickname} style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div className="avatar sm" aria-hidden="true" style={{ width: '16px', height: '16px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 500 }}>
                      {(author?.nickname ?? 'U').slice(0, 1)}
                    </div>
                  )}
                  <span>{author?.nickname ?? '热门笔记'}</span>
                </div>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={16} /> {n.title}</div>
                <div className="card-sub">{n.contentText.slice(0, 56)}...</div>
                <div className="card-meta">
                  <span className="row gap" style={{ gap: '4px' }}><ThumbsUp size={14} /> {n.stats.likes}</span>
                  <span className="row gap" style={{ gap: '4px' }}>收藏 {n.stats.collects}</span>
                  <span>{formatTime(n.updatedAt)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">热门探索</h2>
          <span className="muted" style={{ fontSize: '11px', fontWeight: 300 }}>综合实时热度排序</span>
        </div>
        <div className="list">
          {hot.map((it) => {
            if (it.type === 'post') {
              const p = db.posts[it.id]
              if (!p) return null
              const author = db.users[p.authorId]
              return (
                <Link key={`hp-${p.id}`} className="card" to={`/forum/${p.id}`}>
                  <div className="row space" style={{ marginBottom: '8px' }}>
                    <div className="card-kicker" style={{ fontSize: '11px', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {author?.avatarUrl ? (
                        <img src={author.avatarUrl} alt={author.nickname} style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div className="avatar sm" aria-hidden="true" style={{ width: '16px', height: '16px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 500 }}>
                          {(author?.nickname ?? 'U').slice(0, 1)}
                        </div>
                      )}
                      <span>{author?.nickname ?? '论坛交流'}</span>
                    </div>
                    <div className="card-meta" style={{ marginTop: 0 }}>{formatTime(p.createdAt)}</div>
                  </div>
                  <div className="card-title">{p.title}</div>
                  <div className="card-sub">{p.contentText.slice(0, 80)}...</div>
                  <div className="row space" style={{ marginTop: '14px' }}>
                    <div className="chips">
                      {p.tags.slice(0, 2).map((t) => (
                        <span key={t} className="chip">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="card-meta" style={{ marginTop: 0 }}>
                      <span className="row gap" style={{ gap: '4px' }}><MessageCircle size={14} /> {p.stats.comments}</span>
                      <button className="btn sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer' }} onClick={(e) => {
                        e.stopPropagation()
                        if (user) {
                          toggleInteraction(user.id, 'like', 'post', p.id)
                          toast.push('已点赞', 'success')
                        }
                      }}>
                        <ThumbsUp size={14} /> {p.stats.likes}
                      </button>
                      <button className="btn sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer' }} onClick={(e) => {
                        e.stopPropagation()
                        if (user) {
                          toggleInteraction(user.id, 'collect', 'post', p.id)
                          toast.push('已收藏', 'success')
                        }
                      }}>
                        <Star size={14} /> {p.stats.collects}
                      </button>
                    </div>
                  </div>
                </Link>
              )
            }
            if (it.type === 'book') {
              const b = db.books[it.id]
              if (!b) return null
              return (
                <Link key={`hb-${b.id}`} className="card book-card" to={`/read/${b.id}`}>
                  <BookCover book={b} size="sm" />
                  <div className="book-body">
                    <div className="row space" style={{ marginBottom: '6px' }}>
                      <div className="card-kicker" style={{ fontSize: '11px', fontWeight: 400, color: '#d97706' }}>热门书籍</div>
                      <div className="card-meta" style={{ marginTop: 0 }}>{b.category}</div>
                    </div>
                    <div className="book-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={16} /> {b.title}</div>
                    <div className="book-desc">{b.summary}</div>
                    <div className="row space" style={{ marginTop: '12px' }}>
                      <div className="chips">
                        <span className="chip">{b.difficulty}</span>
                      </div>
                      <div className="card-meta" style={{ marginTop: 0 }}>
                        <span className="row gap" style={{ gap: '4px' }}>推荐度 {b.recommendedHeat}%</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            }
            const n = db.notes[it.id]
            if (!n) return null
            const author = db.users[n.authorId]
            return (
              <Link key={`hn-${n.id}`} className="card" to={`/notes/${n.id}/edit`}>
                <div className="row space" style={{ marginBottom: '8px' }}>
                  <div className="card-kicker" style={{ fontSize: '11px', fontWeight: 400, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {author?.avatarUrl ? (
                      <img src={author.avatarUrl} alt={author.nickname} style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div className="avatar sm" aria-hidden="true" style={{ width: '16px', height: '16px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 500 }}>
                        {(author?.nickname ?? 'U').slice(0, 1)}
                      </div>
                    )}
                    <span>{author?.nickname ?? '读书笔记'}</span>
                  </div>
                  <div className="card-meta" style={{ marginTop: 0 }}>{formatTime(n.updatedAt)}</div>
                </div>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={16} /> {n.title}</div>
                <div className="card-sub">{n.contentText.slice(0, 80)}...</div>
                <div className="row space" style={{ marginTop: '14px' }}>
                  <div className="chips">
                    {n.tags.slice(0, 2).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="card-meta" style={{ marginTop: 0 }}>
                      <button className="btn sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer' }} onClick={(e) => {
                        e.stopPropagation()
                        if (user) {
                          toggleInteraction(user.id, 'like', 'note', n.id)
                          toast.push('已点赞', 'success')
                        }
                      }}>
                        <ThumbsUp size={14} /> {n.stats.likes}
                      </button>
                      <button className="btn sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer' }} onClick={(e) => {
                        e.stopPropagation()
                        if (user) {
                          toggleInteraction(user.id, 'collect', 'note', n.id)
                          toast.push('已收藏', 'success')
                        }
                      }}>
                        <Star size={14} /> {n.stats.collects}
                      </button>
                    </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
