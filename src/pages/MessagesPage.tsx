import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser, listNotifications, markAllNotificationsRead, markNotificationRead } from '../data/db'
import type { NotificationType } from '../data/models'
import { formatTime } from '../lib/format'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'
import { MessageCircle, BookOpen, Bell } from 'lucide-react'

type Tab = 'all' | NotificationType

function iconFor(type: NotificationType) {
  if (type === 'forum') return <MessageCircle size={20} />
  if (type === 'book') return <BookOpen size={20} />
  return <Bell size={20} />
}

export function MessagesPage() {
  const user = getCurrentUser()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('all')

  const all = useMemo(() => listNotifications(user.id), [user.id])
  const items = useMemo(() => {
    if (tab === 'all') return all
    return all.filter((n) => n.type === tab)
  }, [all, tab])

  const unreadCount = useMemo(() => all.filter((n) => !n.readAt).length, [all])

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
          <div className="row gap">
            <button
              className="btn"
              onClick={() => {
                markAllNotificationsRead(user.id)
                toast.push('已全部标为已读', 'success')
              }}
              disabled={unreadCount === 0}
            >
              全部已读
            </button>
          </div>
        </div>
        <div className="section-head">
          <h2 className="h2">我的消息</h2>
          <span className="muted">未读 {unreadCount}</span>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            全部
          </button>
          <button className={`tab ${tab === 'forum' ? 'active' : ''}`} onClick={() => setTab('forum')}>
            论坛
          </button>
          <button className={`tab ${tab === 'book' ? 'active' : ''}`} onClick={() => setTab('book')}>
            书籍
          </button>
          <button className={`tab ${tab === 'system' ? 'active' : ''}`} onClick={() => setTab('system')}>
            系统
          </button>
        </div>
      </section>

      <section className="section">
        <div className="list">
          {items.map((n) => {
            const to = n.link?.to
            const Wrapper: any = to ? Link : 'div'
            const props = to ? { to } : {}
            return (
              <Wrapper
                key={n.id}
                className="card"
                {...props}
                onClick={() => {
                  markNotificationRead(n.id)
                }}
                style={{
                  borderColor: n.readAt ? 'var(--border)' : 'var(--accent-border)',
                  background: n.readAt ? 'var(--card)' : 'color-mix(in srgb, var(--accent-bg) 60%, var(--card))',
                }}
              >
                <div className="row gap" style={{ alignItems: 'flex-start' }}>
                  <div
                    className="avatar"
                    aria-hidden="true"
                    style={{
                      width: 40,
                      height: 40,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 18,
                      flex: '0 0 auto',
                    }}
                  >
                    {iconFor(n.type)}
                  </div>
                  <div className="grow">
                    <div className="row space" style={{ alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-h)', lineHeight: 1.3 }}>{n.title}</div>
                      {!n.readAt ? (
                        <span className="chip" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                          未读
                        </span>
                      ) : null}
                    </div>
                    <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                      {n.body}
                    </div>
                    <div className="card-meta">
                      <span>{formatTime(n.createdAt)}</span>
                      {n.link ? <span>· {n.link.label} →</span> : null}
                    </div>
                  </div>
                </div>
              </Wrapper>
            )
          })}
          {items.length === 0 ? <div className="empty">暂无消息</div> : null}
        </div>
      </section>
    </div>
  )
}

