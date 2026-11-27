import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBooks } from '../features/library/queries'
import type { BookCategory, ReadingDifficulty } from '../domain/models'
import { BookCover } from '../components/BookCover'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { SearchIcon } from '../ui/SearchIcon'

type GroupKey = 'theme' | 'difficulty'

const themeOptions: Array<{ label: string; value: BookCategory | '全部' }> = [
  { label: '全部', value: '全部' },
  { label: '小说', value: '小说' },
  { label: '社科', value: '社科' },
  { label: '人文历史', value: '人文历史' },
  { label: '健康生活', value: '健康生活' },
  { label: '英文原著', value: '英文原著' },
  { label: '散文', value: '散文' },
  { label: '其他', value: '其他' },
]
const difficultyOptions: Array<{ label: string; value: ReadingDifficulty | '全部' }> = [
  { label: '全部', value: '全部' },
  { label: '入门', value: '入门' },
  { label: '中级', value: '中级' },
  { label: '进阶', value: '进阶' },
]

function ChipRow(props: { active: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <div className="chips" style={{ marginTop: 10 }}>
      {props.options.map((t) => (
        <button
          key={t}
          className={`chip btn ${props.active === t ? 'active' : ''}`.trim()}
          onClick={() => props.onPick(t)}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function CategoriesPage() {
  const navigate = useNavigate()
  const [activeGroup, setActiveGroup] = useState<GroupKey>('theme')
  const [theme, setTheme] = useState<BookCategory | '全部'>('全部')
  const [difficulty, setDifficulty] = useState<ReadingDifficulty | '全部'>('全部')

  const booksQuery = useBooks({
    ...(theme !== '全部' ? { category: theme } : {}),
    ...(difficulty !== '全部' ? { difficulty } : {}),
    limit: 100,
  })
  const books = [...(booksQuery.data?.items ?? [])].sort((a, b) => b.recommendedHeat - a.recommendedHeat)
  if (booksQuery.isLoading) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载中…</div></div>
  }

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" aria-label="返回" onClick={() => navigate(-1)}>
            <ChevronLeftIcon />
          </button>
          <div className="h2" style={{ margin: 0 }}>
            全部分类
          </div>
          <Link className="btn icon" to="/search" aria-label="搜索">
            <SearchIcon />
          </Link>
        </div>

        <div className="tabs" style={{ marginTop: 10 }}>
          <button className={`tab ${activeGroup === 'theme' ? 'active' : ''}`} onClick={() => setActiveGroup('theme')}>
            主题
          </button>
          <button
            className={`tab ${activeGroup === 'difficulty' ? 'active' : ''}`}
            onClick={() => setActiveGroup('difficulty')}
          >
            难度
          </button>
        </div>

        {activeGroup === 'theme' ? (
          <ChipRow
            active={theme}
            options={themeOptions.map((t) => t.label)}
            onPick={(label) => {
              const hit = themeOptions.find((x) => x.label === label)
              setTheme(hit?.value ?? '全部')
            }}
          />
        ) : null}

        {activeGroup === 'difficulty' ? (
          <ChipRow
            active={difficulty}
            options={difficultyOptions.map((t) => t.label)}
            onPick={(label) => {
              const hit = difficultyOptions.find((x) => x.label === label)
              setDifficulty(hit?.value ?? '全部')
            }}
          />
        ) : null}

        <div className="hint" style={{ marginTop: 10 }}>
          当前筛选：{theme === '全部' ? '全部主题' : theme} · {difficulty === '全部' ? '全部难度' : difficulty}
        </div>

        <div className="row gap wrap" style={{ marginTop: 10 }}>
          <button
            className="btn primary"
            onClick={() => {
              const qs = new URLSearchParams()
              if (theme !== '全部') qs.set('category', theme)
              if (difficulty !== '全部') qs.set('difficulty', difficulty)
              navigate(`/read?${qs.toString()}`)
            }}
          >
            查看结果
          </button>
          <button className="btn" onClick={() => navigate('/search')}>
            去搜索
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">推荐列表</h2>
          <span className="muted">按热度排序</span>
        </div>
        <div className="list">
          {books.slice(0, 12).map((b) => (
            <div key={b.id} className="card book-card">
              <BookCover book={b} size="sm" />
              <div className="book-body">
                <div className="book-title">{b.title}</div>
                <div className="book-sub">
                  {b.author} · {b.category} · {b.difficulty}
                </div>
                <div className="book-desc">{b.summary}</div>
                <div className="row gap wrap" style={{ marginTop: 10 }}>
                  <button className="btn primary" onClick={() => navigate(`/read?q=${encodeURIComponent(b.title)}`)}>
                    去搜索
                  </button>
                  <button className="btn" onClick={() => navigate(`/read/${b.id}`)}>
                    直接阅读
                  </button>
                </div>
              </div>
            </div>
          ))}
          {books.length === 0 ? <div className="empty">暂无匹配内容</div> : null}
        </div>
      </section>
    </div>
  )
}
