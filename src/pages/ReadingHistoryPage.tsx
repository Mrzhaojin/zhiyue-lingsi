import { useNavigate } from 'react-router-dom'
import { getCurrentUser, listReadingHistory, getBook, removeReadingHistory } from '../data/db'
import { formatTime } from '../lib/format'
import { BookCover } from '../components/BookCover'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

export function ReadingHistoryPage() {
  const user = getCurrentUser()
  const history = listReadingHistory(user.id)
  const navigate = useNavigate()
  const toast = useToast()

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
            const book = getBook(h.bookId)
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
                     removeReadingHistory(user.id, book.id)
                     toast.push('已删除记录', 'success')
                     window.location.reload()
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
