import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { addAIChatMessage, addOrUpdateNote, createAIChatThread, listAIChatMessages, listBooks } from '../data/db'
import { BookCover } from './BookCover'
import { streamDoubaoAPI, type AIAssistantHistoryItem } from '../services/ai'
import { useToast } from '../ui/useToast'
import { useAuth } from '../modules/auth/client/AuthProvider'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  payload?: { kind: 'book_cards'; bookIds: string[] }
}

export function GlobalAIAssistant() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { state } = useAuth()
  const user = state.status === 'authenticated' ? state.user : null

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [threadId, setThreadId] = useState<string | null>(() => sessionStorage.getItem('rf_ai_thread_id'))
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const savedMessages = localStorage.getItem('rf_ai_chat_messages')
    if (savedMessages) {
      try {
        return JSON.parse(savedMessages)
      } catch {
        // 如果解析失败，使用默认消息
        return [
          {
            id: 'welcome',
            role: 'assistant' as const,
            content: '你好！我是你的专属阅读AI助手。\n你可以问我：书名/作者/关键词找书、情节梳理、人物关系、创作背景、写作手法、英语阅读（单词释义/翻译/语法）、学习计划制定、学习复盘。',
            createdAt: Date.now(),
          },
        ]
      }
    }
    return [
      {
        id: 'welcome',
        role: 'assistant' as const,
        content: '你好！我是你的专属阅读AI助手。\n你可以问我：书名/作者/关键词找书、情节梳理、人物关系、创作背景、写作手法、英语阅读（单词释义/翻译/语法）、学习计划制定、学习复盘。',
        createdAt: Date.now(),
      },
    ]
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [position, setPosition] = useState({ x: -20, y: -80 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const initialPosition = useRef({ x: 0, y: 0 })

  const booksIndex = useMemo(() => {
    const all = listBooks()
    return new Map(all.map((b) => [b.id, b]))
  }, [])

  useEffect(() => {
    if (!threadId) return
    const list = listAIChatMessages(threadId)
    if (!list.length) return
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const merged = [...prev]
      list.forEach((m) => {
        if (existingIds.has(m.id)) return
        merged.push({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          payload: m.payload,
        })
      })
      merged.sort((a, b) => a.createdAt - b.createdAt)
      return merged
    })
  }, [threadId])

  // 保存聊天记录到localStorage
  useEffect(() => {
    localStorage.setItem('rf_ai_chat_messages', JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPosition({
        x: initialPosition.current.x + dx,
        y: initialPosition.current.y + dy,
      })
    }
    const handleMouseUp = () => {
      isDragging.current = false
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return
      const dx = e.touches[0].clientX - dragStart.current.x
      const dy = e.touches[0].clientY - dragStart.current.y
      setPosition({
        x: initialPosition.current.x + dx,
        y: initialPosition.current.y + dy,
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleMouseUp)
    }
  }, [])

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
    dragStart.current = { x: clientX, y: clientY }
    initialPosition.current = { ...position }
  }

  const handleClick = (e: React.MouseEvent) => {
    // If dragged significantly, don't open
    if (Math.abs(position.x - initialPosition.current.x) > 5 || Math.abs(position.y - initialPosition.current.y) > 5) {
      e.preventDefault()
      return
    }
    setOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isSubmitting || !user) return

    setIsSubmitting(true)
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', content: text, createdAt: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    const ensureThreadId = () => {
      if (threadId) return threadId
      const t = createAIChatThread(user.id, location.pathname.startsWith('/read/') ? '阅读页对话' : '阅读AI对话')
      sessionStorage.setItem('rf_ai_thread_id', t.id)
      setThreadId(t.id)
      return t.id
    }

    const tId = ensureThreadId()
    addAIChatMessage({ id: userMsg.id, createdAt: userMsg.createdAt, threadId: tId, userId: user.id, role: 'user', content: text })

    const historyForAi: AIAssistantHistoryItem[] = [...messages, userMsg]
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content, payload: m.payload }))

    // 创建临时的assistant消息，用于显示加载状态
    const assistantMsgId = `a_${Date.now()}`
    const tempAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    }
    setMessages((prev) => [...prev, tempAssistantMsg])

    void (async () => {
      try {
        // 准备消息历史，转换为豆包API需要的格式
        const messagesForApi = historyForAi.map((m) => ({
          role: m.role,
          content: m.content
        }))

        // 调用流式API
        const stream = await streamDoubaoAPI(messagesForApi)
        const reader = stream.getReader()
        let responseContent = ''

        // 逐字读取响应
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          responseContent += value
          // 更新消息内容
          setMessages((prev) => prev.map((msg) => 
            msg.id === assistantMsgId ? { ...msg, content: responseContent } : msg
          ))
        }

        // 完成后保存消息
        addAIChatMessage({
          id: assistantMsgId,
          createdAt: tempAssistantMsg.createdAt,
          threadId: tId,
          userId: user.id,
          role: 'assistant',
          content: responseContent,
        })
      } catch (error) {
        console.error('AI回复失败:', error)
        // 更新消息为错误提示
        setMessages((prev) => prev.map((msg) => 
          msg.id === assistantMsgId ? { ...msg, content: 'AI回复失败，请稍后重试' } : msg
        ))
        toast.push('AI回复失败，请稍后重试', 'error')
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  return (
    <>
      {/* 悬浮按钮 */}
      {!open && (
        <button
          onClick={handleClick}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          style={{
            position: 'fixed',
            bottom: 0,
            right: 0,
            transform: `translate(${position.x}px, ${position.y}px)`,
            width: '50px',
            height: '50px',
            borderRadius: '25px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            zIndex: 999,
            cursor: 'grab',
            transition: 'transform 0.1s',
            touchAction: 'none', // Prevent scrolling on touch devices while dragging
          }}
          onMouseOver={(e) => {
            if (!isDragging.current) e.currentTarget.style.transform = `translate(${position.x}px, ${position.y}px) scale(1.05)`
          }}
          onMouseOut={(e) => {
            if (!isDragging.current) e.currentTarget.style.transform = `translate(${position.x}px, ${position.y}px) scale(1)`
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8"></path>
            <rect x="4" y="8" width="16" height="12" rx="2"></rect>
            <path d="M2 14h2"></path>
            <path d="M20 14h2"></path>
            <path d="M15 13v2"></path>
            <path d="M9 13v2"></path>
          </svg>
        </button>
      )}

      {/* 交互侧边栏 */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 0,
              transform: 'translateX(-50%)',
              width: 'min(560px, 100%)',
              height: '55vh',
              background: 'var(--bg)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              borderTopLeftRadius: 'var(--radius-lg)',
              borderTopRightRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              pointerEvents: 'auto',
            }}
          >
            <div className="row space" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div className="row gap" style={{ gap: '8px' }}>
                <span style={{ fontSize: '20px', display: 'flex' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 8V4H8"></path>
                    <rect x="4" y="8" width="16" height="12" rx="2"></rect>
                    <path d="M2 14h2"></path>
                    <path d="M20 14h2"></path>
                    <path d="M15 13v2"></path>
                    <path d="M9 13v2"></path>
                  </svg>
                </span>
                <div style={{ fontSize: '16px', fontWeight: '500' }}>AI 伴读助手</div>
              </div>
              <div className="row gap" style={{ gap: '12px' }}>
                <button
                  className="btn icon"
                  onClick={() => {
                    const welcomeMsg = [
                      {
                        id: 'welcome',
                        role: 'assistant' as const,
                        content: '你好！我是你的专属阅读AI助手。\n你可以问我：书名/作者/关键词找书、情节梳理、人物关系、创作背景、写作手法、英语阅读（单词释义/翻译/语法）、学习计划制定、学习复盘。',
                        createdAt: Date.now(),
                      },
                    ]
                    setMessages(welcomeMsg)
                    // 清空localStorage中的聊天记录
                    localStorage.removeItem('rf_ai_chat_messages')
                    // 重新保存欢迎消息
                    localStorage.setItem('rf_ai_chat_messages', JSON.stringify(welcomeMsg))
                  }}
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '14px',
                    opacity: 0.7,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.opacity = '0.7';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                  title="清空对话"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
                <button
                  className="btn icon"
                  onClick={() => setOpen(false)}
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '14px',
                    opacity: 0.7,
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.opacity = '0.7';
                    e.currentTarget.style.background = 'var(--surface)';
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '92%',
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    padding: msg.role === 'user' ? '12px 16px' : '14px 16px',
                    borderRadius: '16px',
                    borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                    borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    boxShadow: msg.role === 'user' ? '0 2px 8px rgba(var(--accent-rgb), 0.2)' : 'none',
                  }}
                >
                  <div>{msg.content}</div>
                  {msg.role === 'assistant' && msg.payload?.kind === 'book_cards' && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {msg.payload.bookIds
                        .map((id) => booksIndex.get(id))
                        .filter(Boolean)
                        .map((b) => (
                          <button
                            key={b!.id}
                            onClick={() => {
                              navigate(`/read/${b!.id}`)
                            }}
                            style={{
                              display: 'flex',
                              gap: '12px',
                              width: '100%',
                              textAlign: 'left',
                              padding: '12px',
                              borderRadius: 'var(--radius)',
                              border: '1px solid var(--border)',
                              background: 'var(--card)',
                            }}
                          >
                            <BookCover book={b!} size="sm" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, color: 'var(--text-h)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b!.title}</div>
                              <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b!.author}</div>
                              <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '6px', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {b!.summary}
                              </div>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.content.trim() && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', opacity: 0.8 }}>
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(msg.content)
                            toast.push('已复制', 'success')
                          } catch {
                            toast.push('复制失败', 'error')
                          }
                        }}
                        style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent' }}
                      >
                        复制
                      </button>
                      <button
                        className="btn"
                        onClick={async () => {
                          if (!user) return
                          const titleBase = msg.content.split('\n')[0]?.slice(0, 18) || 'AI收藏'
                          const note = await addOrUpdateNote({
                            authorId: user.id,
                            title: `AI收藏：${titleBase}`,
                            contentText: msg.content,
                            tags: ['#AI收藏'],
                            status: 'draft',
                          })
                          toast.push('已保存到笔记草稿', 'success')
                          navigate(`/notes/${note.id}/edit`)
                        }}
                        style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '999px', border: '1px solid var(--border)', background: 'transparent' }}
                      >
                        收藏到笔记
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form
              onSubmit={handleSubmit}
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                gap: '8px',
                background: 'var(--bg)',
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入问题或指令..."
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '20px',
                  border: '1px solid var(--border)',
                  outline: 'none',
                  fontSize: '13px',
                  background: 'var(--surface)',
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isSubmitting}
                className="btn primary"
                style={{
                  borderRadius: '20px',
                  padding: '0 16px',
                  border: 'none',
                  background: (input.trim() && !isSubmitting) ? 'var(--accent)' : 'var(--border)',
                  color: '#fff',
                  cursor: (input.trim() && !isSubmitting) ? 'pointer' : 'not-allowed',
                }}
              >
                {isSubmitting ? '发送中...' : '发送'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
