import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteAIChatThread, getCurrentUser, listAIChatMessages, listAIChatThreads } from '../data/db'
import { formatTime } from '../lib/format'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

export function AIChatHistoryPage() {
  const toast = useToast()
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const threads = useMemo(() => listAIChatThreads(user.id), [user.id])

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">AI对话历史</h2>
          <span className="muted">支持展开查看与删除</span>
        </div>
      </section>

      <section className="section">
        <div className="list">
          {threads.map((t) => {
            const msgs = listAIChatMessages(t.id)
            const last = msgs[msgs.length - 1]
            const isOpen = Boolean(expanded[t.id])
            return (
              <div key={t.id} className="card" style={{ padding: '14px 16px' }}>
                <div className="row space" style={{ gap: '12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title" style={{ fontSize: '14px' }}>
                      {t.title}
                    </div>
                    <div className="card-sub" style={{ marginTop: '6px' }}>
                      {last ? last.content.slice(0, 60) : '暂无消息'}
                    </div>
                    <div className="card-meta" style={{ marginTop: '8px' }}>
                      <span>更新于 {formatTime(t.updatedAt)}</span>
                      <span>{msgs.length} 条消息</span>
                    </div>
                  </div>
                  <div className="row gap" style={{ gap: '8px', flexShrink: 0 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        sessionStorage.setItem('rf_ai_thread_id', t.id)
                        toast.push('已切换到该对话，打开AI助手继续即可', 'success')
                      }}
                    >
                      继续对话
                    </button>
                    <button className="btn" onClick={() => setExpanded((prev) => ({ ...prev, [t.id]: !isOpen }))}>
                      {isOpen ? '收起' : '展开'}
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => {
                        deleteAIChatThread(t.id)
                        toast.push('已删除该对话', 'success')
                        navigate(0)
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {msgs.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '92%',
                          padding: '10px 12px',
                          borderRadius: '14px',
                          background: m.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
                          color: m.role === 'user' ? '#fff' : 'var(--text)',
                          fontSize: '12px',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {m.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {threads.length === 0 ? <div className="empty">暂无对话记录。打开AI助手开始一次阅读对话吧。</div> : null}
        </div>
      </section>
    </div>
  )
}

