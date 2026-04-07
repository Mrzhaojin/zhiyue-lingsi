import { Link } from 'react-router-dom'
import { getCurrentUser, getDbSnapshot, getUnreadNotificationCount, listPublishedNotesByUser } from '../data/db'
import { ChevronRightIcon } from '../ui/ChevronRightIcon'
import { BookOpen, Bookmark, Leaf, Bell, Settings, Shield, MessageSquareText, Sparkles } from 'lucide-react'

export function MePage() {
  const user = getCurrentUser()
  const db = getDbSnapshot()
  const myPosts = Object.values(db.posts).filter((p) => p.authorId === user.id).length
  const myNotes = listPublishedNotesByUser(user.id).length
  const unread = getUnreadNotificationCount(user.id)

  return (
    <div className="page">
      <section className="section" style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: '12px 0' }}>
        <div className="profile" style={{ marginBottom: '32px' }}>
          <div className="avatar lg" aria-hidden="true" style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            background: 'var(--accent-bg)',
            color: 'var(--accent)',
            fontSize: '32px',
            display: 'grid',
            placeItems: 'center',
            border: '2px solid #fff',
            boxShadow: 'var(--shadow)'
          }}>
            {user.nickname.slice(0, 1)}
          </div>
          <div className="profile-main">
            <div className="row space" style={{ gap: '12px', alignItems: 'baseline' }}>
              <div className="profile-name" style={{ fontSize: '22px', fontWeight: 500 }}>{user.nickname}</div>
              <Link className="mini-action" to="/me/profile" aria-label="编辑个人资料">
                编辑
              </Link>
            </div>
            {user.profileTag ? (
              <div style={{ marginTop: '8px' }}>
                <span className="chip" style={{ fontSize: '10px', padding: '2px 10px', background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                  {user.profileTag}
                </span>
              </div>
            ) : null}
            <div className="muted" style={{ marginTop: '6px', fontSize: '12px', fontWeight: 300 }}>{user.bio ?? '探索知识的边界，记录思考的瞬间'}</div>
          </div>
        </div>
        
        <div className="stat-grid" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', padding: '12px' }}>
          <Link className="stat stat-link" to="/me/history" aria-label="查看阅读时长与阅读记录">
            <div className="stat-num">{user.stats.readingMinutes}</div>
            <div className="stat-lab">阅读时长</div>
          </Link>
          <Link className="stat stat-link" to="/me/stats/posts" aria-label="查看我发布的帖子">
            <div className="stat-num">{myPosts}</div>
            <div className="stat-lab">发布帖子</div>
          </Link>
          <Link className="stat stat-link" to="/me/stats/notes" aria-label="查看我的读书笔记">
            <div className="stat-num">{myNotes}</div>
            <div className="stat-lab">读书笔记</div>
          </Link>
          <Link className="stat stat-link" to="/me/stats/followers" aria-label="查看获得关注详情">
            <div className="stat-num">{user.stats.followersCount}</div>
            <div className="stat-lab">获得关注</div>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head" style={{ padding: '0 8px' }}>
          <h2 className="h2" style={{ fontSize: '16px', fontWeight: 500 }}>常用功能</h2>
        </div>
        <div className="menu">
          <Link className="menu-item" to="/me/history" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><BookOpen size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>我的阅读</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>阅读历史/记录</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          <Link className="menu-item" to="/me/collections" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><Bookmark size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>我的收藏</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>帖子/笔记</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          <Link className="menu-item" to="/me/learning" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><Leaf size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>我的学习</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>单词/句子积累</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          <Link className="menu-item" to="/me/messages" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><Bell size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>我的消息</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>{unread} 条未读</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          <Link className="menu-item" to="/me/ai-chats" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><MessageSquareText size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>AI对话历史</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>查看/删除</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          <Link className="menu-item" to="/me/analysis-records" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><Sparkles size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>赏析记录</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>句子/整段</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          <Link className="menu-item" to="/me/settings" style={{ border: 'none', background: 'var(--card)', marginBottom: '12px', borderRadius: 'var(--radius)' }}>
            <div className="row gap" style={{ gap: '16px' }}>
              <span style={{ display: 'flex', opacity: 0.7 }}><Settings size={18} /></span>
              <span className="menu-title" style={{ fontWeight: 400 }}>个人设置</span>
            </div>
            <span className="menu-right row gap" style={{ gap: '8px' }}>
              <span className="muted" style={{ fontSize: '12px' }}>主题与样式</span>
              <ChevronRightIcon size={16} />
            </span>
          </Link>
          {user.role === 'admin' && (
            <Link className="menu-item" to="/admin" style={{ border: '1px dashed var(--accent-border)', background: 'var(--accent-bg)', borderRadius: 'var(--radius)' }}>
              <div className="row gap" style={{ gap: '16px' }}>
                <span style={{ display: 'flex', opacity: 0.7 }}><Shield size={18} /></span>
                <span className="menu-title" style={{ color: 'var(--accent)', fontWeight: 400 }}>管理后台</span>
              </div>
              <ChevronRightIcon size={16} color="var(--accent)" />
            </Link>
          )}
        </div>
      </section>

      <div style={{ textAlign: 'center', padding: '32px 20px', opacity: 0.4, fontSize: '11px', fontWeight: 300, letterSpacing: '1px' }}>
        智阅灵思 v1.0.0 · 陪伴你的每一次静谧阅读
      </div>
    </div>
  )
}
