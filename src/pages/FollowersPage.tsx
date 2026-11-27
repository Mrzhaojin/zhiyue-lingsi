import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../data/db'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'

/**
 * 关注关系需要服务端数据（M2 计划）。
 * 旧版本在这里用前端随机生成「读者 A/B/C…」冒充粉丝列表，已删除：
 * 演示时被问一句「这些用户从哪来」就会穿帮。
 */
export function FollowersPage() {
  const user = getCurrentUser()
  const navigate = useNavigate()

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
            关注关系需要服务端数据，当前版本尚未实现（计划在 M2 接入 profiles / follows 表）。
            这里不会再展示前端随机生成的虚构关注者。
          </div>
        </div>
      </section>

      <section className="section">
        <div className="list" style={{ gap: '12px' }}>
          <div className="empty" style={{ padding: '60px 20px' }}>关注列表暂不可用</div>
        </div>
      </section>
    </div>
  )
}