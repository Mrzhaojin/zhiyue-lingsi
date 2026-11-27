import { useNavigate } from 'react-router-dom'
import { useAuth } from '../modules/auth/client'
import { useRemoveReadingHistory, useReadingHistory } from '../features/reading/queries'
import { useBooks } from '../features/library/queries'
import { formatTime } from '../lib/format'
import { BookCover } from '../components/BookCover'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

export function ReadingHistoryPage() {
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : ''
  const historyQuery = useReadingHistory(userId)
  const booksQuery = useBooks({ limit: 200 })
  const removeHistory = useRemoveReadingHistory()
  const history = historyQuery.data ?? []
  const bookById = new Map((booksQuery.data?.items ?? []).map((book) => [book.id, book]))
  const navigate = useNavigate()
  const toast = useToast()
  if (historyQuery.isLoading) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载中…</div></div>
  }

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">最近阅读</h2>
          <span className="muted">你的阅读足迹</span>
        </div>
      </section>

      <section className="section">
        <div className="list">
          {history.map((h) => {
            const book = bookById.get(h.bookId)
            if (!book) return null
            const chapter = book.chapters.find(c => c.id === h.chapterId)
            return (
              <div key={h.id} className="card" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <BookCover book={book} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '16px' }}>{book.title}</div>
                  <div className="muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                    读至：{chapter?.title ?? '第一章'}
                  </div>
                  <div className="muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                    上次阅读：{formatTime(h.updatedAt)}
                  </div>
                </div>
                <div className="row gap">
                   <button className="btn primary" onClick={() => navigate(`/read/${book.id}`)} style={{ padding: '6px 12px', fontSize: '12px' }}>继续</button>
                   <button className="btn" onClick={() => {
                     removeHistory.mutate({ userId, bookId: book.id }, {
                       onSuccess: () => toast.push('已删除记录', 'success'),
                       onError: (error) => toast.push(error instanceof Error ? error.message : '删除失败', 'error'),
                     })
                   }} style={{ padding: '6px' }}>✕</button>
                </div>
              </div>
            )
          })}
          {history.length === 0 && (
            <div className="empty">
              还没有阅读记录。去书城发现好书吧！
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
