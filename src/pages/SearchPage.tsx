import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDbSnapshot, listBooks, listNotes, listPosts } from '../data/db'
import { BookCover } from '../components/BookCover'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { SearchIcon } from '../ui/SearchIcon'
import { MessageCircle } from 'lucide-react'

function pillList(items: string[]) {
  return items.filter(Boolean).slice(0, 12)
}

export function SearchPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const db = getDbSnapshot()

  const hotSearch = pillList([
    '匠心书单',
    '仙逆',
    '极简英语',
    '名著精读',
    '散文赏析',
    '小王子',
    'Pride and Prejudice',
    '科幻推荐',
    '每日阅读打卡',
  ])

  const bookRank = listBooks()
    .slice()
    .sort((a, b) => b.recommendedHeat - a.recommendedHeat)
    .slice(0, 8)

  const byCount = new Map<string, number>()
  Object.values(db.posts).forEach((p) => p.tags.forEach((t) => byCount.set(t, (byCount.get(t) ?? 0) + 1)))
  Object.values(db.notes).forEach((n) => n.tags.forEach((t) => byCount.set(t, (byCount.get(t) ?? 0) + 1)))
  const topicRank = Array.from(byCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const hotNotes = listNotes('hot').slice(0, 8)
  const hotPosts = listPosts('hot').slice(0, 8)

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" aria-label="返回" onClick={() => navigate(-1)}>
            <ChevronLeftIcon />
          </button>
          <div className="muted">搜索</div>
          <div style={{ width: 38 }} />
        </div>
        <div className="search-input-wrap" style={{ marginTop: 10 }}>
          <span className="search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入书名 / 作者 / 关键词"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const keyword = q.trim()
              if (!keyword) return
              navigate(`/read?q=${encodeURIComponent(keyword)}`)
            }}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">热门搜索</h2>
          <Link className="link" to="/categories">
            全部分类 →
          </Link>
        </div>
        <div className="chips">
          {hotSearch.map((t) => (
            <button
              key={t}
              className="chip btn"
              onClick={() => {
                navigate(`/read?q=${encodeURIComponent(t)}`)
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">榜单</h2>
        </div>
        <div className="rank-strip" aria-label="榜单横向滚动">
          <div className="rank-card">
            <div className="rank-title">热门搜索</div>
            <div className="rank-list">
              {hotSearch.slice(0, 8).map((t, idx) => (
                <button key={t} className="rank-item" onClick={() => navigate(`/read?q=${encodeURIComponent(t)}`)}>
                  <span className="rank-no">{idx + 1}</span>
                  <span className="rank-main">
                    <span className="rank-name">{t}</span>
                    <span className="rank-sub">点击进入搜索结果</span>
                  </span>
                  <span className="rank-meta">进入</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rank-card">
            <div className="rank-title">热门话题</div>
            <div className="rank-list">
              {topicRank.map(([t, count], idx) => (
                <Link key={t} className="rank-item" to={`/forum/topics/${encodeURIComponent(t)}`}>
                  <span className="rank-no">{idx + 1}</span>
                  <span className="rank-main">
                    <span className="rank-name">{t}</span>
                    <span className="rank-sub">{count} 条内容</span>
                  </span>
                  <span className="rank-meta">进入</span>
                </Link>
              ))}
              {topicRank.length === 0 ? <div className="empty">暂无话题榜单数据</div> : null}
            </div>
          </div>

          <div className="rank-card">
            <div className="rank-title">热门书籍</div>
            <div className="rank-list">
              {bookRank.map((b, idx) => (
                <button key={b.id} className="rank-item" onClick={() => navigate(`/read/${b.id}`)}>
                  <span className="rank-no">{idx + 1}</span>
                  <BookCover book={b} size="xs" />
                  <span className="rank-main">
                    <span className="rank-name">{b.title}</span>
                    <span className="rank-sub">{b.author}</span>
                  </span>
                  <span className="rank-meta">热度 {b.recommendedHeat}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rank-card">
            <div className="rank-title">热门帖子</div>
            <div className="rank-list">
              {hotPosts.slice(0, 10).map((p, idx) => (
                <Link key={p.id} className="rank-item" to={`/forum/${p.id}`}>
                  <span className="rank-no">{idx + 1}</span>
                  <span className="rank-main">
                    <span className="rank-name">{p.title}</span>
                    <span className="rank-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>浏览 {p.stats.views} · <MessageCircle size={12} /> {p.stats.comments}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rank-card">
            <div className="rank-title">热门笔记</div>
            <div className="rank-list">
              {hotNotes.slice(0, 10).map((n, idx) => (
                <Link key={n.id} className="rank-item" to={`/notes/${n.id}/edit`}>
                  <span className="rank-no">{idx + 1}</span>
                  <span className="rank-main">
                    <span className="rank-name">{n.title}</span>
                    <span className="rank-sub">♡ {n.stats.likes} · 收藏 {n.stats.collects}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
