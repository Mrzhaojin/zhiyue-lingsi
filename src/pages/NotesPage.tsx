import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../modules/auth/client'
import { useDrafts, useNotes } from '../features/notes/queries'
import { useInteractions, useToggleInteraction } from '../features/interactions/queries'
import { useProfiles } from '../features/profiles/queries'
import { formatTime } from '../lib/format'
import { Search, Flame, Clock, ThumbsUp, Star, PenTool } from 'lucide-react'

function getAvatarColor(id: string) {
  const colors = ['#a3c2b5', '#b2c8d4', '#d4c8b2', '#c8b2d4', '#b2d4c8', '#d4b2b2', '#e2a3a3', '#a3b2e2']
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

export function NotesPage() {
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : ''
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'published') as 'published' | 'draft'
  const sort = (params.get('sort') ?? 'hot') as 'hot' | 'latest'

  const publishedQuery = useNotes({ sort, onlyPublished: true, limit: 100 })
  const draftsQuery = useDrafts(userId)
  const notes = tab === 'draft' ? draftsQuery.data ?? [] : publishedQuery.data?.items ?? []
  const authors = useProfiles(notes.map((note) => note.authorId)).data ?? {}
  const likes = useInteractions(userId, 'like').data ?? []
  const collects = useInteractions(userId, 'collect').data ?? []
  const likedSet = new Set(likes.map((item) => item.targetId))
  const collectedSet = new Set(collects.map((item) => item.targetId))
  const toggle = useToggleInteraction()

  const loading = tab === 'draft' ? draftsQuery.isLoading : publishedQuery.isLoading
  const error = tab === 'draft' ? draftsQuery.error : publishedQuery.error
  if (loading) return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载笔记中…</div></div>
  if (error) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载失败：{error instanceof Error ? error.message : '未知错误'}</div></div>
  }

  return (
    <div className="page">
      <section className="section" style={{ padding: '0 4px', marginBottom: '8px' }}>
        <div className="search-box" onClick={() => navigate('/search')} style={{ borderRadius: '14px', background: 'var(--surface-2)', border: 'none' }}>
           <Search size={18} style={{ opacity: 0.6 }} />
           <span className="muted" style={{ marginLeft: '8px', fontSize: '14px' }}>搜索你的读书笔记...</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">阅读笔记</h2>
          <Link className="btn primary" to="/notes/new">
            写新笔记
          </Link>
        </div>

        <div className="tabs" style={{ marginBottom: tab === 'published' ? '8px' : '0' }}>
          <button
            className={`tab ${tab === 'published' ? 'active' : ''}`}
            onClick={() => setParams({ tab: 'published', sort })}
          >
            已发布
          </button>
          <button
            className={`tab ${tab === 'draft' ? 'active' : ''}`}
            onClick={() => setParams({ tab: 'draft', sort })}
          >
            草稿箱
          </button>
        </div>

        {tab === 'published' ? (
          <div className="tabs" style={{ background: 'transparent', padding: 0 }}>
            <button
              className={`tab ${sort === 'hot' ? 'active' : ''}`}
              onClick={() => setParams({ tab, sort: 'hot' })}
              style={{ fontSize: '12px', padding: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Flame size={14} /> 热门
            </button>
            <button
              className={`tab ${sort === 'latest' ? 'active' : ''}`}
              onClick={() => setParams({ tab, sort: 'latest' })}
              style={{ fontSize: '12px', padding: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Clock size={14} /> 最新
            </button>
          </div>
        ) : null}
      </section>

      <section className="section">
        <div className="list">
          {notes.map((n) => {
            const author = authors[n.authorId]
            return (
              <Link key={n.id} className="card" to={`/notes/${n.id}/edit`} style={{ position: 'relative', overflow: 'hidden' }}>
                {n.status === 'draft' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '-24px',
                      background: '#f59e0b',
                      color: '#fff',
                      fontSize: '10px',
                      padding: '2px 24px',
                      transform: 'rotate(45deg)',
                      fontWeight: '700',
                    }}
                  >
                    草稿
                  </div>
                )}

                <div className="row space" style={{ marginBottom: '10px' }}>
                  <div className="row gap" style={{ gap: '8px', minWidth: 0 }}>
                    {author?.avatarUrl ? (
                      <img
                        src={author.avatarUrl}
                        alt={author.nickname}
                        style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="avatar sm"
                        aria-hidden="true"
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: author ? getAvatarColor(author.id) : 'var(--surface-2)',
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '11px',
                          fontWeight: 500,
                          flex: '0 0 auto',
                        }}
                      >
                        {(author?.nickname ?? 'U').slice(0, 1)}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 400,
                          color: 'var(--text-h)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {author?.nickname ?? '匿名读者'}
                      </div>
                      {author ? (
                        <div className="muted" style={{ fontSize: '10px', fontWeight: 300, opacity: 0.8 }} title={author.id}>
                          ID {author.id.slice(0, 8)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="card-meta" style={{ marginTop: 0 }}>
                    {formatTime(n.updatedAt)}
                  </div>
                </div>

                <div className="card-title" style={{ fontSize: '17px' }}>
                  {n.title}
                </div>

                <div className="card-sub" style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '12px' }}>
                  {n.contentText.slice(0, 100)}...
                </div>

                {n.shareCardDataUrl ? (
                  <div
                    className="note-cover"
                    style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: '12px' }}
                  >
                    <img src={n.shareCardDataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                  </div>
                ) : null}

                <div className="row space">
                  <div className="chips">
                    {n.tags.slice(0, 3).map((t) => {
                      const label = t.startsWith('#') ? t : `#${t}`
                      return (
                        <span key={t} className="chip">
                          {label}
                        </span>
                      )
                    })}
                  </div>
                  <div className="card-meta" style={{ marginTop: 0 }}>
                    <span className="row gap" style={{ gap: '4px', cursor: 'pointer' }} onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle.mutate({ userId, kind: 'like', targetType: 'note', targetId: n.id });
                    }}>
                      <ThumbsUp size={12} style={{ color: n.publishedPostId && likedSet.has(n.publishedPostId) ? '#f59e0b' : undefined }} /> {n.stats.likes}
                    </span>
                    <span className="row gap" style={{ gap: '4px', cursor: 'pointer' }} onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle.mutate({ userId, kind: 'collect', targetType: 'note', targetId: n.id });
                    }}>
                      <Star size={12} style={{ color: n.publishedPostId && collectedSet.has(n.publishedPostId) ? '#f59e0b' : undefined }} /> {n.stats.collects}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
          {notes.length === 0 ? (
            <div className="empty" style={{ padding: '40px 20px' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center', opacity: 0.5 }}><PenTool size={40} /></div>
              <div>还没有笔记</div>
              <Link to="/notes/new" className="link" style={{ display: 'block', marginTop: '8px' }}>开始记录第一篇 →</Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
