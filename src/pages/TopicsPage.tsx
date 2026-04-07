import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listTags, upsertTagByName } from '../data/db'
import { useToast } from '../ui/useToast'

export function TopicsPage() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const tags = listTags()

  const filtered = useMemo(() => {
    const query = q.trim()
    if (!query) return tags
    return tags.filter((t) => t.name.includes(query.startsWith('#') ? query : `#${query}`) || t.name.includes(query))
  }, [q, tags])

  return (
    <div className="page">
      <section className="section">
        <div className="section-head">
          <h2 className="h2">话题广场</h2>
          <span className="muted">分类清晰 · 论坛与笔记联动</span>
        </div>
        <div className="row gap">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索话题标签" />
          <button
            className="btn"
            onClick={() => {
              const name = q.trim()
              if (!name) return
              const tag = upsertTagByName(name)
              toast.push(`已创建话题 ${tag.name}`, 'success')
            }}
          >
            新建
          </button>
        </div>
        <div className="hint">无匹配标签时可新建，然后在发帖/写笔记时引用该标签。</div>
      </section>

      <section className="section">
        <div className="tag-grid">
          {filtered.map((t) => (
            <Link key={t.id} className="tag" to={`/forum/topics/${encodeURIComponent(t.name)}`}>
              <div className="tag-icon" aria-hidden="true">
                🏷️
              </div>
              <div className="tag-name">{t.name}</div>
            </Link>
          ))}
          {filtered.length === 0 ? <div className="empty">暂无相关话题，可发布新内容创建。</div> : null}
        </div>
      </section>
    </div>
  )
}
