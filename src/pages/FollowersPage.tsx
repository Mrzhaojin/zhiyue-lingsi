import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../data/db'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'

export function FollowersPage() {
  const user = getCurrentUser()
  const navigate = useNavigate()

  const items = useMemo(() => {
    const total = Math.max(0, user.stats.followersCount)
    const visible = Math.min(20, total)
    return Array.from({ length: visible }).map((_, i) => {
      const code = String.fromCharCode('A'.charCodeAt(0) + (i % 26))
      return {
        id: `${user.id}-f-${i}`,
        nickname: `读者 ${code}`,
        bio: '关注你的人正在逐步接入数据中心。',
      }
    })
  }, [user.id, user.stats.followersCount])

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon size={20} />
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">获得关注</h2>
          <span className="muted" style={{ fontSize: '11px', fontWeight: 300 }}>
            {user.stats.followersCount} 人
          </span>
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ padding: '16px', background: 'var(--accent-bg)', borderColor: 'var(--accent-border)' }}>
          <div style={{ fontSize: '13px', lineHeight: 1.7, fontWeight: 300, color: 'var(--text)' }}>
            当前版本支持“查看关注详情页”，关注用户列表将在完成 Supabase/数据库接入后自动展示真实数据。
          </div>
        </div>
      </section>

      <section className="section">
        <div className="list" style={{ gap: '12px' }}>
          {items.map((it) => (
            <div key={it.id} className="card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="avatar" aria-hidden="true" style={{ width: '36px', height: '36px', display: 'grid', placeItems: 'center' }}>
                {it.nickname.slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-h)' }}>{it.nickname}</div>
                <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginTop: '2px' }}>{it.bio}</div>
              </div>
            </div>
          ))}

          {user.stats.followersCount === 0 ? (
            <div className="empty" style={{ padding: '60px 20px' }}>暂无关注</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

