import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getDbSnapshot, listPosts, listTags, upsertTagByName } from '../data/db'
import { formatTime } from '../lib/format'
import { useToast } from '../ui/useToast'
import { Search, MessageCircle, ThumbsUp } from 'lucide-react'
import { LoadingSpinner } from '../components/LoadingSpinner'

function getAvatarColor(id: string) {
  const colors = ['#a3c2b5', '#b2c8d4', '#d4c8b2', '#c8b2d4', '#b2d4c8', '#d4b2b2', '#e2a3a3', '#a3b2e2'];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

export function ForumPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'hot') as 'latest' | 'hot' | 'topics'
  const category = params.get('category') ?? 'all'
  const [loading, setLoading] = useState(true)
  const [db, setDb] = useState(getDbSnapshot())
  const [posts, setPosts] = useState(tab === 'topics' ? [] : listPosts(tab))
  const [tags, setTags] = useState(listTags())
  const [topicQuery, setTopicQuery] = useState('')
  
  const filteredTags = useMemo(() => {
    const q = topicQuery.trim()
    if (!q) return tags
    return tags.filter((t) => t.name.includes(q.startsWith('#') ? q : `#${q}`) || t.name.includes(q))
  }, [tags, topicQuery])
  
  const categories = [
    { id: 'all', name: '全部' },
    { id: 'discussion', name: '讨论' },
    { id: 'share', name: '分享' },
    { id: 'question', name: '问答' },
    { id: 'news', name: '资讯' }
  ]
  
  useEffect(() => {
    // 模拟数据加载
    const loadData = async () => {
      setLoading(true)
      setTimeout(() => {
        setDb(getDbSnapshot())
        setPosts(tab === 'topics' ? [] : listPosts(tab))
        setTags(listTags())
        setLoading(false)
      }, 500)
    }
    loadData()
  }, [tab, category])

  return (
    <div className="page">
      <section className="section" style={{ padding: '0 4px', marginBottom: '8px' }}>
        <div className="search-box" onClick={() => navigate('/search')} style={{ borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: 'none' }}>
           <Search size={16} style={{ opacity: 0.6 }} />
           <span className="muted" style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 300 }}>搜索话题、帖子...</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2" style={{ fontSize: '18px', fontWeight: 500 }}>社区交流</h2>
          <Link className="btn primary" to="/forum/new" style={{ fontSize: '12px', padding: '6px 16px', background: 'var(--accent)', color: '#fff', border: 'none' }}>
            发布新帖
          </Link>
        </div>
        <div className="tabs" style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '4px' }}>
          <button
            className={`tab ${tab === 'hot' ? 'active' : ''}`}
            onClick={() => setParams({ tab: 'hot', category })}
            style={{ fontWeight: 400, fontSize: '13px' }}
          >
            热门
          </button>
          <button
            className={`tab ${tab === 'latest' ? 'active' : ''}`}
            onClick={() => setParams({ tab: 'latest', category })}
            style={{ fontWeight: 400, fontSize: '13px' }}
          >
            最新
          </button>
          <button
            className={`tab ${tab === 'topics' ? 'active' : ''}`}
            onClick={() => setParams({ tab: 'topics' })}
            style={{ fontWeight: 400, fontSize: '13px' }}
          >
            话题广场
          </button>
        </div>
        
        {tab !== 'topics' && (
          <div className="categories" style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`btn sm ${category === cat.id ? 'primary' : ''}`}
                onClick={() => setParams({ tab, category: cat.id })}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: category === cat.id ? 'none' : '1px solid var(--border)',
                  background: category === cat.id ? 'var(--accent)' : 'var(--surface-2)',
                  color: category === cat.id ? '#fff' : 'var(--text)'
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        {loading ? (
          <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner size="large" text="加载中..." />
          </div>
        ) : tab === 'topics' ? (
          <>
            <div className="row gap" style={{ marginBottom: '20px', gap: '12px' }}>
              <input
                className="input"
                value={topicQuery}
                onChange={(e) => setTopicQuery(e.target.value)}
                placeholder="搜索感兴趣的话题..."
                style={{ borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', flex: 1, fontSize: '13px', padding: '10px 16px' }}
              />
              <button
                className="btn primary"
                onClick={() => {
                  const name = topicQuery.trim()
                  if (!name) return
                  const tag = upsertTagByName(name)
                  toast.push(`已创建话题 ${tag.name}`, 'success')
                }}
                style={{ borderRadius: 'var(--radius)', background: 'var(--accent)', color: '#fff', border: 'none', padding: '0 20px', fontSize: '13px' }}
              >
                新建
              </button>
            </div>
            <div className="tag-grid" style={{ gap: '16px' }}>
              {filteredTags.map((t) => (
                <Link key={t.id} className="tag" to={`/forum/topics/${encodeURIComponent(t.name)}`} style={{ padding: '16px', borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', transition: 'all 0.3s ease' }}>
                  <div className="tag-icon" aria-hidden="true" style={{ 
                    width: '36px', 
                    height: '36px', 
                    borderRadius: '50%', 
                    background: 'var(--accent-bg)', 
                    display: 'grid', 
                    placeItems: 'center',
                    fontSize: '16px',
                    color: 'var(--accent)',
                    fontWeight: 300
                  }}>
                    #
                  </div>
                  <div style={{ flex: 1, marginLeft: '4px' }}>
                    <div className="tag-name" style={{ fontSize: '14px', fontWeight: 500 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: '10px', fontWeight: 300, marginTop: '2px' }}>探索相关讨论</div>
                  </div>
                </Link>
              ))}
              {filteredTags.length === 0 ? <div className="empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', opacity: 0.5, fontSize: '13px' }}>暂无相关话题</div> : null}
            </div>
          </>
        ) : (
          <div className="list" style={{ gap: '16px' }}>
            {posts.map((p) => {
              const author = db.users[p.authorId]
              return (
                <Link key={p.id} className="card" to={`/forum/${p.id}`} style={{ padding: '20px', borderRadius: 'var(--radius)', background: 'var(--card)', border: '1px solid var(--border)', transition: 'all 0.3s ease' }}>
                  <div className="row gap" style={{ marginBottom: '16px', gap: '12px' }}>
                    {author?.avatarUrl ? (
                      <img src={author.avatarUrl} alt={author.nickname} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: 'var(--surface-2)' }} />
                    ) : (
                      <div className="avatar sm" aria-hidden="true" style={{ width: '32px', height: '32px', borderRadius: '50%', background: author ? getAvatarColor(author.id) : 'var(--surface-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 500 }}>
                        {(author?.nickname ?? 'U').slice(0, 1)}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-h)' }}>{author?.nickname ?? '未知用户'}</div>
                      <div className="muted" style={{ fontSize: '10px', fontWeight: 300 }}>{formatTime(p.createdAt)}</div>
                    </div>
                  </div>
                  <div className="card-title" style={{ fontSize: '16px', marginBottom: '8px', fontWeight: 500, lineHeight: 1.5 }}>{p.title}</div>
                  <div className="card-sub" style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '16px', fontWeight: 300, lineHeight: 1.6 }}>{p.contentText.slice(0, 120)}</div>
                  <div className="row space">
                    <div className="chips" style={{ gap: '6px' }}>
                      {p.tags.slice(0, 2).map((t) => (
                        <span key={t} className="chip" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '99px', background: 'var(--surface-2)', color: 'var(--muted)', border: 'none' }}>#{t}</span>
                      ))}
                    </div>
                    <div className="card-meta" style={{ marginTop: 0 }}>
                      <span className="row gap" style={{ gap: '4px', fontSize: '11px', fontWeight: 300 }}><ThumbsUp size={12} /> {p.stats.likes}</span>
                      <span className="row gap" style={{ gap: '4px', fontSize: '11px', fontWeight: 300 }}><MessageCircle size={12} /> {p.stats.comments}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
            {posts.length === 0 ? <div className="empty" style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5, fontSize: '13px' }}>暂无内容，快来抢沙发吧</div> : null}
          </div>
        )}
      </section>
    </div>
  )
}
