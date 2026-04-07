import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteAIAnalysisRecord, getBook, getCurrentUser, listAIAnalysisRecords } from '../data/db'
import { formatTime } from '../lib/format'
import { BookCover } from '../components/BookCover'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

function formatAnalysisText(input: {
  bookTitle?: string
  chapterId?: string
  text: string
  textInterpretation: string
  writingHighlights: string
  deepMeaning: string
  backgroundInfo: string
}) {
  const head = [input.bookTitle ? `【书名】${input.bookTitle}` : '', input.chapterId ? `【章节】${input.chapterId}` : ''].filter(Boolean).join('\n')
  const body = `【原文】\n${input.text}\n\n【文本解析】\n${input.textInterpretation}\n\n【写作亮点】\n${input.writingHighlights}\n\n【内容深意】\n${input.deepMeaning}\n\n【背景补充】\n${input.backgroundInfo}`
  return head ? `${head}\n\n${body}` : body
}

export function AIAnalysisRecordsPage() {
  const toast = useToast()
  const user = getCurrentUser()
  const navigate = useNavigate()
  const records = useMemo(() => listAIAnalysisRecords(user.id), [user.id])

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">赏析记录</h2>
          <span className="muted">句子赏析 / 整段赏析</span>
        </div>
      </section>

      <section className="section">
        <div className="list">
          {records.map((r) => {
            const book = r.bookId ? getBook(r.bookId) : undefined
            const bookTitle = book?.title
            const combined = formatAnalysisText({
              bookTitle,
              chapterId: r.chapterId,
              text: r.analysis.text,
              textInterpretation: r.analysis.textInterpretation,
              writingHighlights: r.analysis.writingHighlights,
              deepMeaning: r.analysis.deepMeaning,
              backgroundInfo: r.analysis.backgroundInfo,
            })
            return (
              <div key={r.id} className="card" style={{ padding: '14px 16px' }}>
                <div className="row gap" style={{ gap: '12px', alignItems: 'flex-start' }}>
                  {book ? <BookCover book={book} size="xs" /> : null}
                  <div className="grow">
                    <div className="card-kicker">{bookTitle ? `《${bookTitle}》` : '通用赏析'}</div>
                    <div className="card-title" style={{ fontSize: '14px', marginTop: '6px' }}>
                      {r.analysis.text.slice(0, 40)}
                      {r.analysis.text.length > 40 ? '…' : ''}
                    </div>
                    <div className="card-sub" style={{ marginTop: '8px' }}>
                      {r.analysis.textInterpretation.slice(0, 70)}
                      {r.analysis.textInterpretation.length > 70 ? '…' : ''}
                    </div>
                    <div className="card-meta" style={{ marginTop: '10px' }}>
                      <span>生成于 {formatTime(r.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="row gap wrap" style={{ marginTop: '12px', gap: '8px' }}>
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(combined)
                        toast.push('已复制', 'success')
                      } catch {
                        toast.push('复制失败', 'error')
                      }
                    }}
                  >
                    复制
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      navigate(`/notes/new?excerpt=${encodeURIComponent(combined)}&tag=${encodeURIComponent('#AI赏析')}`)
                    }}
                  >
                    收藏到笔记
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      deleteAIAnalysisRecord(r.id)
                      toast.push('已删除记录', 'success')
                      navigate(0)
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
          {records.length === 0 ? <div className="empty">暂无赏析记录。去阅读页选中一句话试试「AI句子赏析」。</div> : null}
        </div>
      </section>
    </div>
  )
}
