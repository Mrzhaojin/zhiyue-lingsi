import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, updateCurrentUser } from '../data/db'
import type { ThemeMode } from '../data/models'
import { refreshTheme } from '../app/theme'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'

export function SettingsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [nickname, setNickname] = useState(user.nickname)
  const [bio, setBio] = useState(user.bio ?? '')
  const [theme, setTheme] = useState<ThemeMode>(user.settings.theme)
  const [like, setLike] = useState(user.settings.notifications.like)
  const [comment, setComment] = useState(user.settings.notifications.comment)
  const [collect, setCollect] = useState(user.settings.notifications.collect)

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
          <button
            className="btn primary"
            onClick={() => {
              updateCurrentUser({
                nickname: nickname.trim() || user.nickname,
                bio: bio.trim(),
                settings: {
                  ...user.settings,
                  theme,
                  notifications: { like, comment, collect },
                },
              })
              refreshTheme()
              toast.push('设置已保存', 'success')
            }}
          >
            保存
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">设置</h2>
          <span className="muted">账号安全/样式/消息通知</span>
        </div>

        <div className="form">
          <label className="field">
            <span className="label">昵称</span>
            <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">个性签名</span>
            <input className="input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="写一句话介绍你" />
          </label>
          <label className="field">
            <span className="label">主题</span>
            <select className="select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>

          <div className="field">
            <span className="label">消息通知</span>
            <div className="row gap wrap">
              <label className="switch">
                <input checked={like} onChange={(e) => setLike(e.target.checked)} type="checkbox" />
                <span>点赞提醒</span>
              </label>
              <label className="switch">
                <input checked={comment} onChange={(e) => setComment(e.target.checked)} type="checkbox" />
                <span>评论提醒</span>
              </label>
              <label className="switch">
                <input checked={collect} onChange={(e) => setCollect(e.target.checked)} type="checkbox" />
                <span>收藏提醒</span>
              </label>
            </div>
          </div>


        </div>
      </section>
    </div>
  )
}
