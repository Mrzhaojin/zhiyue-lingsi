import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../modules/auth/client'
import { useRemoveFromShelf, useShelf } from '../features/shelf/queries'
import { useBooks } from '../features/library/queries'
import type { Book } from '../domain/models'
import { resolveBookCoverUrl } from '../data/bookCovers'
import { useToast } from '../ui/useToast'
import { Search } from 'lucide-react'

export function BookshelfPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : ''
  const shelfQuery = useShelf(userId)
  const booksQuery = useBooks({ limit: 200 })
  const removeFromShelf = useRemoveFromShelf()
  const shelf = shelfQuery.data ?? []
  const bookById = new Map((booksQuery.data?.items ?? []).map((book) => [book.id, book]))
  if (shelfQuery.isLoading) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载中…</div></div>
  }

  return (
    <div className="page">
      <section className="section" style={{ padding: '0 4px', marginBottom: '12px' }}>
        <div className="search-box" onClick={() => navigate('/search')} style={{ borderRadius: 'var(--radius)', background: 'var(--surface-2)', border: 'none' }}>
           <Search size={16} style={{ opacity: 0.6 }} />
           <span className="muted" style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 300 }}>在书架或书城中搜索...</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2" style={{ fontSize: '18px', fontWeight: 500 }}>我的书架</h2>
          <Link className="btn primary" to="/read" style={{ fontSize: '12px', padding: '6px 16px', background: 'var(--accent)', color: '#fff', border: 'none' }}>
            发现新书
          </Link>
        </div>
        <div className="muted" style={{ padding: '0 4px', fontSize: '12px', fontWeight: 300 }}>正在阅读 {shelf.length} 本书籍</div>
      </section>

      <section className="section">
        <div className="shelf-grid" style={{ gap: '24px 16px' }}>
          {shelf.map((s) => {
            const book = bookById.get(s.bookId)
            if (!book) return null
            return (
              <div key={s.bookId} className="shelf-item">
                <Link className="shelf-cover" to={`/read/${book.id}`} aria-label={`继续阅读 ${book.title}`}>
                  <ShelfCover book={book} />
                </Link>
                <div className="shelf-meta" style={{ textAlign: 'center', marginTop: '8px' }}>
                  <div className="shelf-title" style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-h)' }}>{book.title}</div>
                  <div className="shelf-sub" style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                    {book.author}
                  </div>
                </div>
                <div className="shelf-actions" style={{ marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    className="btn"
                    style={{ padding: '2px 8px', minWidth: 'unset', border: 'none', background: 'transparent', fontSize: '10px', color: 'var(--muted)', opacity: 0.6 }}
                    onClick={() => {
                      removeFromShelf.mutate({ userId, bookId: book.id }, {
                        onSuccess: () => toast.push('已从书架移除', 'success'),
                        onError: (error) => toast.push(error instanceof Error ? error.message : '移除失败', 'error'),
                      })
                    }}
                  >
                    移除
                  </button>
                </div>
              </div>
            )
          })}
          {shelf.length === 0 ? (
            <div className="empty" style={{ gridColumn: '1 / -1', padding: '80px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '16px', opacity: 0.4 }}>🍃</div>
              <div style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: 300 }}>书架空空如也</div>
              <Link to="/read" className="link" style={{ display: 'block', marginTop: '12px', fontSize: '12px', color: 'var(--accent)' }}>去发现心仪好书 →</Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function ShelfCover(props: { book: Book }) {
  const [failed, setFailed] = useState(false)
  const coverUrl = resolveBookCoverUrl(props.book)
  const showImage = Boolean(coverUrl) && !failed
  const color = getRandomColor(props.book.id)
  return (
    <div
      className="shelf-cover-inner"
      aria-hidden="true"
      style={{
        background: showImage ? 'var(--surface-2)' : `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 20%, #fff))`,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        border: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      {showImage ? (
        <img
          src={coverUrl}
          alt={props.book.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <>
          <div style={{ fontSize: '20px', fontWeight: '500', opacity: 0.9 }}>{props.book.title.slice(0, 1)}</div>
          <div style={{ position: 'absolute', bottom: '6px', right: '8px', fontSize: '9px', opacity: 0.6, letterSpacing: '1px' }}>READ</div>
        </>
      )}
    </div>
  )
}

function getRandomColor(id: string) {
  const colors = ['#a3c2b5', '#b2c8d4', '#d4c8b2', '#c8b2d4', '#b2d4c8', '#d4b2b2'];
  const index = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}
