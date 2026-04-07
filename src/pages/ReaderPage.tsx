import { Sparkles, Edit3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addAIAnalysisRecord, addOrUpdateNote, addVocabItem, getBook, getCurrentUser, getReadingHistory, saveReadingHistory, updateCurrentUser } from '../data/db'
import type { AITextAnalysis, Book, NoteTemplate } from '../data/models'
import { BookCover } from '../components/BookCover'
import { aiAnalyzeText, aiTranslate, aiWordExplain, speakText, stopSpeak } from '../services/ai'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'

type SelectionMenuState =
  | { open: false }
  | {
      open: true
      text: string
      x: number
      y: number
    }

function getSelectedText() {
  const sel = window.getSelection?.()
  const t = sel?.toString() ?? ''
  return t.trim()
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function pickChapter(book: Book, chapterId?: string) {
  if (!chapterId) return book.chapters[0]
  return book.chapters.find((c) => c.id === chapterId) ?? book.chapters[0]
}

export function ReaderPage() {
  const { bookId } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const book = bookId ? getBook(bookId) : undefined
  const user = getCurrentUser()

  const [chapterId, setChapterId] = useState<string | undefined>(undefined)
  const chapter = useMemo(() => (book ? pickChapter(book, chapterId) : undefined), [book, chapterId])
  const chapterIndex = useMemo(() => (book && chapter ? book.chapters.findIndex((c) => c.id === chapter.id) : -1), [book, chapter])

  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AITextAnalysis | null>(null)

  const [snippetOpen, setSnippetOpen] = useState(false)
  const [snippetLoading, setSnippetLoading] = useState(false)
  const [snippet, setSnippet] = useState<AITextAnalysis | null>(null)
  const [snippetText, setSnippetText] = useState('')
  const [shareTemplate, setShareTemplate] = useState<NoteTemplate>('minimal')

  const isHongLouMeng = book?.title === '红楼梦'
  const isSanTi = book?.title === '三体'
  const isGatsby = book?.title === 'The Great Gatsby'
  const showMutualTranslate = isHongLouMeng || isSanTi || isGatsby
  
  const translateTo: 'zh' | 'en' | 'ja' | 'ko' | 'modern' | 'classic' = 'zh'
  const [translation, setTranslation] = useState<string>('')
  const [activeTranslateType, setActiveTranslateType] = useState<string | null>(null)

  const [learningMode, setLearningMode] = useState(false)
  const [wordExplain, setWordExplain] = useState<{ phonetic?: string; pos?: string; meaning: string; example: string } | null>(
    null,
  )

  const [menu, setMenu] = useState<SelectionMenuState>({ open: false })
  const [isReading, setIsReading] = useState(false)
  const [stylePanelOpen, setStylePanelOpen] = useState(false)
  
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => stopSpeak()
  }, [])

  useEffect(() => {
    const history = bookId ? getReadingHistory(user.id, bookId) : undefined
    if (history) {
      setChapterId(history.chapterId)
    } else {
      setChapterId(undefined)
    }
    setAnalysis(null)
    setAnalysisOpen(false)
    setTranslation('')
    setWordExplain(null)
  }, [bookId, user.id])

  useEffect(() => {
    if (bookId && chapter) {
      saveReadingHistory(user.id, bookId, chapter.id, 0)
    }
  }, [bookId, chapter, user.id])

  useEffect(() => {
    if (book?.language === 'en') return
    setLearningMode(false)
  }, [book?.language])

  // 记录阅读时长逻辑
  useEffect(() => {
    const timer = setInterval(() => {
      updateCurrentUser({
        stats: {
          ...user.stats,
          readingMinutes: (user.stats?.readingMinutes || 0) + 1,
        },
      })
    }, 60000)
    return () => clearInterval(timer)
  }, [user])

  if (!book || !chapter) return <div className="page">书籍未找到</div>

  const reading = user.settings.reading
  const readingFontFamily = reading.fontFamily ?? 'sans'

  async function openAnalysis() {
    if (!book || !chapter) return
    const content = chapter.content
    if (!content) return
    setAnalysisOpen(true)
    setAnalysisLoading(true)
    try {
      const res = await aiAnalyzeText(content)
      setAnalysis(res)
      addAIAnalysisRecord({ userId: user.id, bookId: book.id, chapterId: chapter.id, analysis: res })
    } catch {
      toast.push('AI赏析失败，请稍后重试', 'error')
    } finally {
      setAnalysisLoading(false)
    }
  }

  async function openSnippetAnalysis(text: string) {
    if (!book || !chapter) return
    const t = text.trim()
    if (!t) return
    setSnippetText(t)
    setSnippetOpen(true)
    setSnippetLoading(true)
    try {
      const res = await aiAnalyzeText(t)
      setSnippet(res)
      addAIAnalysisRecord({ userId: user.id, bookId: book.id, chapterId: chapter.id, analysis: res })
    } catch {
      toast.push('AI句子赏析失败，请稍后重试', 'error')
    } finally {
      setSnippetLoading(false)
    }
  }

  async function doTranslate(text: string, to?: typeof translateTo) {
    const type = to || translateTo
    setActiveTranslateType(type)
    setTranslation('翻译中…')
    try {
      const res = await aiTranslate(text, type)
      setTranslation(res)
    } catch {
      setTranslation('')
      setActiveTranslateType(null)
      toast.push('翻译失败', 'error')
    }
  }

  async function doExplain(word: string) {
    try {
      const res = await aiWordExplain(word)
      setWordExplain(res)
    } catch {
      toast.push('单词解析失败', 'error')
    }
  }

  function updateReadingStyle(next: Partial<typeof reading>) {
    updateCurrentUser({
      settings: {
        ...user.settings,
        reading: { ...user.settings.reading, ...next },
      },
    })
  }

  function handleSelection() {
    const text = getSelectedText()
    if (!text) {
      setMenu({ open: false })
      setTranslation('')
      setWordExplain(null)
      return
    }
    const rect = window.getSelection?.()?.getRangeAt(0)?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top : 120
    setMenu({ open: true, text, x: clamp(x, 16, window.innerWidth - 16), y: clamp(y, 16, window.innerHeight - 140) })
    setTranslation('')
    setActiveTranslateType(null)
    setWordExplain(null)
  }

  const canLearning = book.language === 'en'

  return (
    <div className="page reader-page" style={{ padding: 0, background: reading.backgroundColor }}>
      {/* 顶部浮动栏 */}
      <header className="reader-top-bar" style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        padding: '8px 16px',
        background: `color-mix(in srgb, ${reading.backgroundColor} 90%, transparent)`,
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px'
      }}>
        <div className="row gap" style={{ gap: '12px' }}>
          <button className="btn icon" onClick={() => navigate(-1)} style={{ border: 'none', background: 'transparent', padding: '4px' }}>
            <ChevronLeftIcon size={20} />
          </button>
          <BookCover book={book} size="xs" alt={book.title} />
          <div style={{ marginLeft: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: reading.textColor, opacity: 0.9 }}>{book.title}</div>
            <div style={{ fontSize: '10px', opacity: 0.5, color: reading.textColor }}>{chapter.title}</div>
          </div>
        </div>
        <div className="row gap" style={{ gap: '8px' }}>
          {canLearning && (
            <button 
              className={`btn ${learningMode ? 'primary' : ''}`}
              onClick={() => setLearningMode(!learningMode)}
              style={{ fontSize: '11px', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: learningMode ? 'var(--accent)' : 'transparent' }}
            >
              {learningMode ? '阅 读' : '学 习'}
            </button>
          )}
          <button className="btn" onClick={() => openAnalysis()} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'transparent' }}>
            赏 析
          </button>
          <button className="btn icon" onClick={() => setStylePanelOpen(!stylePanelOpen)} style={{ border: 'none', background: 'transparent', color: reading.textColor, padding: '4px' }}>
            <span style={{ fontSize: '16px', fontWeight: 300 }}>Aa</span>
          </button>
        </div>
      </header>

      {/* 阅读正文 */}
      <main
        ref={contentRef}
        className={`reader-body ${learningMode ? 'learning-mode' : ''}`}
        style={{
          padding: '40px 24px 140px',
          fontSize: `${reading.fontSize}px`,
          lineHeight: 1.8,
          color: reading.textColor,
          minHeight: '100vh',
          fontFamily: readingFontFamily === 'serif' ? 'Georgia, "Source Han Serif SC", serif' : 'system-ui',
          transition: 'all 0.3s ease',
          maxWidth: '800px',
          margin: '0 auto'
        }}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
      >
        {learningMode && (
          <div style={{ 
            background: 'var(--accent-bg)', 
            color: 'var(--accent)', 
            padding: '10px 16px', 
            borderRadius: 'var(--radius-sm)', 
            fontSize: '11px', 
            marginBottom: '32px',
            fontWeight: '400',
            border: '1px solid var(--accent-border)',
            opacity: 0.8
          }}>
            已开启学习模式：长按单词可查词，选中句子可存入单词本。
          </div>
        )}
        <h2 style={{ fontSize: '1.4em', marginBottom: '1.5em', fontWeight: '500', textAlign: 'center', letterSpacing: '1px' }}>{chapter.title}</h2>
        {chapter.content.split('\n').map((line, idx) =>
          line.trim() ? (
            <p key={idx} style={{ marginBottom: '1.5em', textIndent: '2em', fontWeight: 300 }}>
              {line}
            </p>
          ) : (
            <div key={idx} style={{ height: '1.2em' }} />
          ),
        )}

        {/* 翻页控制 */}
        <div className="reader-footer-nav" style={{ marginTop: '64px', display: 'flex', gap: '16px' }}>
          <button
            className="btn"
            style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent', fontSize: '13px' }}
            disabled={chapterIndex <= 0}
            onClick={() => {
              const prev = book.chapters[Math.max(0, chapterIndex - 1)]
              if (prev) setChapterId(prev.id)
              window.scrollTo(0, 0)
            }}
          >
            上一章
          </button>
          <button
            className="btn primary"
            style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius)', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: '13px' }}
            disabled={chapterIndex < 0 || chapterIndex >= book.chapters.length - 1}
            onClick={() => {
              const next = book.chapters[Math.min(book.chapters.length - 1, chapterIndex + 1)]
              if (next) setChapterId(next.id)
              window.scrollTo(0, 0)
            }}
          >
            下一章
          </button>
        </div>
      </main>

      <button
        className="btn"
        onClick={() => openAnalysis()}
        style={{
          position: 'fixed',
          right: 12,
          top: '52%',
          transform: 'translateY(-50%)',
          zIndex: 25,
          padding: '10px 12px',
          borderRadius: '999px',
          border: '1px solid var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          opacity: 0.92,
        }}
      >
        <Sparkles size={16} />
        整段AI赏析
      </button>

      {/* 底部样式面板 */}
      {stylePanelOpen && (
        <div className="style-drawer" style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(560px, 100%)',
          background: 'var(--card)',
          padding: '24px 24px 40px',
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 30,
          animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div className="row space" style={{ marginBottom: '24px' }}>
            <div style={{ fontWeight: '500', fontSize: '16px', letterSpacing: '0.5px' }}>阅读设置</div>
            <button className="btn icon" onClick={() => setStylePanelOpen(false)} style={{ border: 'none', background: 'transparent', opacity: 0.5 }}>✕</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="style-item">
              <div className="label" style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--muted)' }}>字号: {reading.fontSize}px</div>
              <input 
                type="range" min="14" max="24" 
                value={reading.fontSize} 
                onChange={(e) => updateReadingStyle({ fontSize: Number(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
            
            <div className="style-item">
              <div className="label" style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--muted)' }}>背景主题</div>
              <div className="row gap" style={{ gap: '12px' }}>
                {[
                  { bg: '#fcfbf9', text: '#3d403d', name: '奶白' },
                  { bg: '#f5f2e9', text: '#5b4d36', name: '燕麦' },
                  { bg: '#f0f5f2', text: '#3d4d45', name: '薄荷' },
                  { bg: '#1a1b1a', text: '#9da39d', name: '深夜' }
                ].map((t) => (
                  <button 
                    key={t.name}
                    onClick={() => updateReadingStyle({ backgroundColor: t.bg, textColor: t.text })}
                    style={{ 
                      flex: 1, height: '44px', borderRadius: 'var(--radius-sm)', background: t.bg, 
                      border: reading.backgroundColor === t.bg ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                      fontSize: '11px', color: t.text, fontWeight: 300, transition: 'all 0.2s ease'
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 选中文本菜单 */}
      {menu.open && (
        <div className="sel-menu" style={{
          position: 'fixed',
          left: menu.x,
          top: menu.y,
          transform: 'translate(-50%, -100%) translateY(-12px)',
          background: 'var(--card)',
          padding: '8px',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 40,
          width: 'max-content',
          maxWidth: '320px',
          border: '1px solid var(--border)'
        }}>
          <div className="row gap wrap" style={{ gap: '4px' }}>
            {showMutualTranslate ? (
              <>
                {book.language === 'zh' && (
                  <button 
                    className="btn" 
                    onClick={() => doTranslate(menu.text, 'en')} 
                    style={{ 
                      padding: '6px 14px', 
                      fontSize: '11px', 
                      border: 'none', 
                      background: activeTranslateType === 'en' ? 'var(--accent-bg)' : 'transparent', 
                      color: activeTranslateType === 'en' ? 'var(--accent)' : 'inherit', 
                      borderRadius: 'var(--radius-sm)' 
                    }}
                  >
                    中译英
                  </button>
                )}
                {book.language === 'en' && (
                  <button 
                    className="btn" 
                    onClick={() => doTranslate(menu.text, 'zh')} 
                    style={{ 
                      padding: '6px 14px', 
                      fontSize: '11px', 
                      border: 'none', 
                      background: activeTranslateType === 'zh' ? 'var(--accent-bg)' : 'transparent', 
                      color: activeTranslateType === 'zh' ? 'var(--accent)' : 'inherit', 
                      borderRadius: 'var(--radius-sm)' 
                    }}
                  >
                    英译中
                  </button>
                )}
                {isHongLouMeng && (
                  <>
                    <button 
                      className="btn" 
                      onClick={() => doTranslate(menu.text, 'modern')} 
                      style={{ 
                        padding: '6px 14px', 
                        fontSize: '11px', 
                        border: 'none', 
                        background: activeTranslateType === 'modern' ? 'var(--accent-bg)' : 'transparent', 
                        color: activeTranslateType === 'modern' ? 'var(--accent)' : 'inherit', 
                        borderRadius: 'var(--radius-sm)' 
                      }}
                    >
                      转白话
                    </button>
                    <button 
                      className="btn" 
                      onClick={() => doTranslate(menu.text, 'classic')} 
                      style={{ 
                        padding: '6px 14px', 
                        fontSize: '11px', 
                        border: 'none', 
                        background: activeTranslateType === 'classic' ? 'var(--accent-bg)' : 'transparent', 
                        color: activeTranslateType === 'classic' ? 'var(--accent)' : 'inherit', 
                        borderRadius: 'var(--radius-sm)' 
                      }}
                    >
                      转文言
                    </button>
                  </>
                )}
              </>
            ) : (
              <button 
                className="btn" 
                onClick={() => doTranslate(menu.text)} 
                style={{ 
                  padding: '6px 14px', 
                  fontSize: '11px', 
                  border: 'none', 
                  background: activeTranslateType === translateTo ? 'var(--accent-bg)' : 'transparent', 
                  color: activeTranslateType === translateTo ? 'var(--accent)' : 'inherit', 
                  borderRadius: 'var(--radius-sm)' 
                }}
              >
                翻译
              </button>
            )}
            <button className="btn" onClick={() => {
              navigate(`/notes/new?bookId=${encodeURIComponent(book.id)}&chapterId=${encodeURIComponent(chapter.id)}&excerpt=${encodeURIComponent(menu.text)}&fromReader=true`)
            }} style={{ padding: '6px 14px', fontSize: '11px', border: 'none', background: 'transparent' }}>记笔记</button>
            <button
              className="btn"
              onClick={() => {
                void openSnippetAnalysis(menu.text)
                setMenu({ open: false })
              }}
              style={{ padding: '6px 14px', fontSize: '11px', border: 'none', background: 'transparent' }}
            >
              AI句子赏析
            </button>
            {learningMode && (
              <>
                <button className="btn" onClick={() => {
                   const w = menu.text.split(/\s+/g)[0] ?? menu.text
                   void doExplain(w.replace(/[^\w'-]/g, ''))
                }} style={{ padding: '6px 14px', fontSize: '11px', border: 'none', background: 'transparent' }}>查词</button>
                <button className="btn" onClick={() => {
                  addVocabItem({ userId: user.id, type: 'word', text: menu.text })
                  toast.push('已加入单词本', 'success')
                  setMenu({ open: false })
                }} style={{ padding: '6px 14px', fontSize: '11px', border: 'none', background: 'transparent' }}>存单词</button>
              </>
            )}
            <button className="btn" onClick={() => {
              if (isReading) {
                stopSpeak()
                setIsReading(false)
              } else {
                setIsReading(true)
                speakText(menu.text, book.language === 'en' ? 'en-US' : 'zh-CN', () => setIsReading(false))
              }
            }} style={{ padding: '6px 14px', fontSize: '11px', border: 'none', background: isReading ? 'var(--accent-bg)' : 'transparent', color: isReading ? 'var(--accent)' : 'inherit' }}>
              {isReading ? '停止朗读' : '朗读'}
            </button>
          </div>

          {(translation || wordExplain || isReading) && (
            <div style={{ marginTop: '8px', padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', fontSize: '12px', lineHeight: '1.6' }}>
              {isReading && !translation && !wordExplain && <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="reading-wave">🔊</span> 正在朗读中...
              </div>}
              {translation && <div style={{ color: 'var(--accent)', fontWeight: '400' }}>{translation}</div>}
              {wordExplain && (
                <div>
                  <div style={{ fontWeight: '500', color: 'var(--text-h)' }}>{wordExplain.phonetic} {wordExplain.pos}</div>
                  <div style={{ color: 'var(--text)', marginTop: '2px' }}>{wordExplain.meaning}</div>
                  <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '6px', fontStyle: 'italic' }}>{wordExplain.example}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {snippetOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 48, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: 'min(420px, 92vw)',
              height: '100%',
              background: 'var(--bg)',
              padding: '28px 20px',
              boxShadow: 'var(--shadow-lg)',
              overflowY: 'auto',
              borderLeft: '1px solid var(--border)',
              pointerEvents: 'auto',
              animation: 'slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div className="row space" style={{ marginBottom: '22px' }}>
              <div style={{ fontSize: '16px', fontWeight: '500', letterSpacing: '0.5px' }}>AI 句子赏析</div>
              <button className="btn icon" onClick={() => setSnippetOpen(false)} style={{ border: 'none', background: 'transparent', opacity: 0.5 }}>
                ✕
              </button>
            </div>

            {snippetLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.7, fontSize: '12px' }}>正在生成结构化赏析…</div>
            ) : snippet ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '12px', lineHeight: '1.7' }}>
                  {snippet.text}
                </div>
                <div>
                  <div style={{ color: 'var(--accent)', fontWeight: 500, fontSize: '13px', marginBottom: '10px' }}>① 文本解析</div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', fontWeight: 300 }}>{snippet.textInterpretation}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--accent)', fontWeight: 500, fontSize: '13px', marginBottom: '10px' }}>② 写作亮点</div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', fontWeight: 300 }}>{snippet.writingHighlights}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--accent)', fontWeight: 500, fontSize: '13px', marginBottom: '10px' }}>③ 内容深意</div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', fontWeight: 300 }}>{snippet.deepMeaning}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--accent)', fontWeight: 500, fontSize: '13px', marginBottom: '10px' }}>④ 背景补充</div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', fontWeight: 300 }}>{snippet.backgroundInfo}</div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {(['minimal', 'literary', 'retro'] as NoteTemplate[]).map((t) => (
                    <button
                      key={t}
                      className="btn"
                      onClick={() => setShareTemplate(t)}
                      style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: shareTemplate === t ? 'var(--accent-bg)' : 'transparent',
                        color: shareTemplate === t ? 'var(--accent)' : 'inherit',
                      }}
                    >
                      {t === 'minimal' ? '清新' : t === 'literary' ? '文艺' : '复古'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    onClick={async () => {
                      const combined = `【原文】\n${snippet.text}\n\n【文本解析】\n${snippet.textInterpretation}\n\n【写作亮点】\n${snippet.writingHighlights}\n\n【内容深意】\n${snippet.deepMeaning}\n\n【背景补充】\n${snippet.backgroundInfo}`
                      try {
                        await navigator.clipboard.writeText(combined)
                        toast.push('已复制', 'success')
                      } catch {
                        toast.push('复制失败', 'error')
                      }
                    }}
                    style={{ padding: '10px 12px', fontSize: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent' }}
                  >
                    一键复制
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const combined = `【原文】\n${snippet.text}\n\n【文本解析】\n${snippet.textInterpretation}\n\n【写作亮点】\n${snippet.writingHighlights}\n\n【内容深意】\n${snippet.deepMeaning}\n\n【背景补充】\n${snippet.backgroundInfo}`
                      navigate(
                        `/notes/new?bookId=${encodeURIComponent(book.id)}&chapterId=${encodeURIComponent(chapter.id)}&excerpt=${encodeURIComponent(combined)}&tag=${encodeURIComponent('#AI赏析')}&fromReader=true`,
                      )
                    }}
                    style={{ padding: '10px 12px', fontSize: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'transparent' }}
                  >
                    收藏到笔记
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => {
                      const combined = `【原文】\n${snippet.text}\n\n【文本解析】\n${snippet.textInterpretation}\n\n【写作亮点】\n${snippet.writingHighlights}\n\n【内容深意】\n${snippet.deepMeaning}\n\n【背景补充】\n${snippet.backgroundInfo}`
                      const note = addOrUpdateNote({
                        authorId: user.id,
                        title: '句子赏析分享',
                        contentText: combined,
                        tags: ['#AI赏析'],
                        status: 'draft',
                        template: shareTemplate,
                        source: { bookId: book.id, chapterId: chapter.id, excerpt: snippetText },
                      })
                      navigate(`/notes/${note.id}/edit?fromReader=true&autoSaveCard=1&template=${encodeURIComponent(shareTemplate)}`)
                    }}
                    style={{ padding: '10px 12px', fontSize: '12px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--accent)', color: '#fff' }}
                  >
                    生成分享卡片
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* AI赏析抽屉 */}
      {analysisOpen && (
        <div className="drawer-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 50, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)'
        }} onClick={() => setAnalysisOpen(false)}>
          <div className="drawer-content" style={{
            width: '85%', maxWidth: '380px', height: '100%', background: 'var(--bg)', padding: '32px 24px', boxShadow: 'var(--shadow-lg)', overflowY: 'auto', animation: 'slideLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            <div className="row space" style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '18px', fontWeight: '500', letterSpacing: '0.5px' }}>AI 深度赏析</div>
              <button className="btn icon" onClick={() => setAnalysisOpen(false)} style={{ border: 'none', background: 'transparent', opacity: 0.5 }}>✕</button>
            </div>

            {analysisLoading ? (
              <div className="loading-state" style={{ textAlign: 'center', padding: '60px 0' }}>
                <div className="spinner" style={{ marginBottom: '16px', opacity: 0.5 }}>🍃</div>
                <div className="muted" style={{ fontSize: '12px', fontWeight: 300 }}>正在解析文学意蕴...</div>
              </div>
            ) : analysis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div className="analysis-section">
                  <div style={{ color: 'var(--accent)', fontWeight: '500', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Edit3 size={16} /> 文本解析
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text)', fontWeight: 300 }}>{analysis.textInterpretation}</div>
                </div>

                <div className="analysis-section">
                  <div style={{ color: 'var(--accent)', fontWeight: '500', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={16} /> 写作亮点
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text)', fontWeight: 300 }}>{analysis.writingHighlights}</div>
                </div>

                <div className="analysis-section">
                  <div style={{ color: 'var(--accent)', fontWeight: '500', marginBottom: '12px', fontSize: '14px' }}>内容深意</div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text)', fontWeight: 300 }}>{analysis.deepMeaning}</div>
                </div>

                <div className="analysis-section">
                  <div style={{ color: 'var(--accent)', fontWeight: '500', marginBottom: '12px', fontSize: '14px' }}>背景补充</div>
                  <div style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text)', fontWeight: 300 }}>{analysis.backgroundInfo}</div>
                </div>

                <button 
                  className="btn primary" 
                  style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius)', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: '13px', marginTop: '12px' }}
                  onClick={() => {
                    const combined = `【原文】\n${analysis.text}\n\n【文本解析】\n${analysis.textInterpretation}\n\n【写作亮点】\n${analysis.writingHighlights}\n\n【内容深意】\n${analysis.deepMeaning}\n\n【背景补充】\n${analysis.backgroundInfo}`
                    navigate(
                      `/notes/new?bookId=${encodeURIComponent(book.id)}&chapterId=${encodeURIComponent(chapter.id)}&excerpt=${encodeURIComponent(combined)}&tag=${encodeURIComponent('#AI赏析')}&fromReader=true`,
                    )
                  }}
                >
                  保存赏析笔记
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
