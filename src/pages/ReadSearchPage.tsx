import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { addToShelf, getCurrentUser, isInShelf, removeFromShelf } from '../data/db'
import type { Book } from '../data/models'
import { BookCover } from '../components/BookCover'
import { aiSearchBooks, speakText, stopSpeak } from '../services/ai'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

function useQueryParam(name: string) {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search).get(name) ?? '', [name, search])
}

export function ReadSearchPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const qParam = useQueryParam('q')
  const categoryParam = useQueryParam('category') as Book['category'] | ''
  const difficultyParam = useQueryParam('difficulty') as Book['difficulty'] | ''
  const minHeatParam = useQueryParam('minHeat')

  const [q, setQ] = useState(qParam)
  const [category, setCategory] = useState<Book['category'] | ''>(categoryParam)
  const [difficulty, setDifficulty] = useState<Book['difficulty'] | ''>(difficultyParam)
  const [minHeat, setMinHeat] = useState<number>(Number(minHeatParam || 0) || 0)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Book[]>([])
  const [, setShelfTick] = useState(0)

  const runSearch = useCallback(async (nextQ: string) => {
    setLoading(true)
    try {
      const data = await aiSearchBooks(nextQ, {
        category: category || undefined,
        difficulty: difficulty || undefined,
        minHeat: minHeat || undefined,
      })
      setResults(data)
    } catch {
      toast.push('搜索失败，请稍后重试', 'error')
    } finally {
      setLoading(false)
    }
  }, [category, difficulty, minHeat, toast])

  useEffect(() => {
    setQ(qParam)
    setCategory(categoryParam)
    setDifficulty(difficultyParam)
    setMinHeat(Number(minHeatParam || 0) || 0)
  }, [categoryParam, difficultyParam, minHeatParam, qParam])

  useEffect(() => {
    void runSearch(qParam)
  }, [qParam, runSearch])

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
          {q ? `关键词：${q}` : '关键词：全部'}
          {category ? ` · 品类：${category}` : ''}
          {difficulty ? ` · 难度：${difficulty}` : ''}
          {minHeat ? ` · 热度≥${minHeat}` : ''}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">搜索结果</h2>
          <span className="muted">{loading ? '加载中…' : '999+ 条'}</span>
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
                      const inShelf = isInShelf(user.id, b.id)
                      if (inShelf) {
                        removeFromShelf(user.id, b.id)
                        toast.push('已从书架移除', 'success')
                      } else {
                        addToShelf(user.id, b.id)
                        toast.push('已加入书架', 'success')
                      }
                      setShelfTick((v) => v + 1)
                    }}
                  >
                    {isInShelf(user.id, b.id) ? '移出书架' : '加入书架'}
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
          {!loading && results.length === 0 ? (
            <div className="empty">
              暂无结果。试试换个关键词，或调整筛选条件。
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
