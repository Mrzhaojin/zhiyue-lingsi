import { useEffect, useMemo, useState } from 'react'
import type { Book } from '../data/models'
import { resolveBookCoverUrl } from '../data/bookCovers'

type Size = 'xs' | 'sm' | 'md' | 'lg'

export function BookCover(props: {
  book: Pick<Book, 'id' | 'title' | 'coverUrl'>
  size?: Size
  className?: string
  alt?: string
}) {
  const size = props.size ?? 'md'
  const letter = useMemo(() => (props.book.title || '书').slice(0, 1), [props.book.title])
  const override = resolveBookCoverUrl(props.book)
  const fallback = props.book.coverUrl
  const [src, setSrc] = useState<string | null>(override ?? null)
  const [failed, setFailed] = useState(false)
  const hasImage = Boolean(src) && !failed

  useEffect(() => {
    const updateCover = () => {
      setFailed(false)
      setSrc(override ?? null)
    }
    updateCover()
  }, [override])

  return (
    <div className={['book-cover', size, props.className].filter(Boolean).join(' ')} aria-hidden={!props.alt}>
      {hasImage ? (
        <img
          src={src!}
          alt={props.alt ?? props.book.title}
          loading="lazy"
          onError={() => {
            if (fallback && src && fallback !== src) {
              setSrc(fallback)
              return
            }
            setFailed(true)
          }}
        />
      ) : (
        <div className="book-cover-fallback" aria-hidden="true">
          <span>{letter}</span>
        </div>
      )}
    </div>
  )
}
