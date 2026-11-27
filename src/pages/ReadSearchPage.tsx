import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Book } from '../domain/models'
import { useAuth } from '../modules/auth/client'
import { useBooks } from '../features/library/queries'
import { useAddToShelf, useRemoveFromShelf, useShelf } from '../features/shelf/queries'
import { BookCover } from '../components/BookCover'
import { speakText, stopSpeak } from '../services/ai'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

function useQueryParam(name: string) {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search).get(name) ?? '', [name, search])
}

export function ReadSearchPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : ''
  const qParam = useQueryParam('q')
  const categoryParam = useQueryParam('category') as Book['category'] | ''
  const difficultyParam = useQueryParam('difficulty') as Book['difficulty'] | ''
  const minHeatParam = useQueryParam('minHeat')
  const minHeat = Number(minHeatParam || 0) || 0

  const booksQuery = useBooks({
    ...(qParam ? { query: qParam } : {}),
    ...(categoryParam ? { category: categoryParam } : {}),
    ...(difficultyParam ? { difficulty: difficultyParam } : {}),
    ...(minHeat ? { minHeat } : {}),
    limit: 100,
  })
  const results = booksQuery.data?.items ?? []
  const shelfQuery = useShelf(userId)
  const shelfSet = new Set((shelfQuery.data ?? []).map((item) => item.bookId))
  const addShelf = useAddToShelf()
  const removeShelf = useRemoveFromShelf()


  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button
            className="btn icon"
            aria-label="返回"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1)
                return
              }
              navigate('/search')
            }}
          >
            <ChevronLeftIcon />
          </button>
          <div className="h2" style={{ margin: 0 }}>
            搜索结果
          </div>
          <Link className="btn" to="/search">
            重新搜索
          </Link>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          {qParam ? `关键词：${qParam}` : '关键词：全部'}
          {categoryParam ? ` · 品类：${categoryParam}` : ''}
          {difficultyParam ? ` · 难度：${difficultyParam}` : ''}
          {minHeat ? ` · 热度≥${minHeat}` : ''}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">搜索结果</h2>
          <span className="muted">{booksQuery.isLoading ? '加载中…' : `${results.length} 条`}</span>
        </div>

        <div className="list">
          {results.map((b) => (
            <div key={b.id} className="card book-card">
              <BookCover book={b} size="sm" />
              <div className="book-body">
                <div className="book-title">
                  <Link className="link" to={`/read/${b.id}`}>
                    {b.title}
                  </Link>
                </div>
                <div className="book-sub">
                  {b.author} · {b.category} · {b.difficulty} · 热度 {b.recommendedHeat}
                </div>
                <div className="book-desc">{b.summary}</div>
                <div className="book-ai">AI推荐：{b.aiReason}</div>
                <div className="row gap wrap">
                  <Link className="btn primary" to={`/read/${b.id}`}>
                    开始阅读
                  </Link>
                  <button
                    className="btn"
                    onClick={() => {
                      if (!userId) {
                        toast.push('请先登录', 'error')
                        return
                      }
                      if (shelfSet.has(b.id)) {
                        removeShelf.mutate({ userId, bookId: b.id }, { onSuccess: () => toast.push('已从书架移除', 'success') })
                      } else {
                        addShelf.mutate({ userId, bookId: b.id }, { onSuccess: () => toast.push('已加入书架', 'success') })
                      }
                    }}
                  >
                    {shelfSet.has(b.id) ? '移出书架' : '加入书架'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      stopSpeak()
                      speakText(`${b.title}。${b.summary}`, b.language === 'en' ? 'en-US' : 'zh-CN')
                    }}
                  >
                    15秒语音讲解
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!booksQuery.isLoading && results.length === 0 ? (
            <div className="empty">
              暂无结果。试试换个关键词，或调整筛选条件。
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
