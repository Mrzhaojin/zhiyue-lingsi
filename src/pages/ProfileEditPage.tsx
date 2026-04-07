import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, updateCurrentUser } from '../data/db'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

function clampText(value: string, maxLen: number) {
  const v = value.trim()
  if (!v) return ''
  return v.length > maxLen ? v.slice(0, maxLen) : v
}

export function ProfileEditPage() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const toast = useToast()

  const initial = useMemo(
    () => ({
      nickname: user.nickname,
      bio: user.bio ?? '',
      profileTag: user.profileTag ?? '',
    }),
    [user.bio, user.nickname, user.profileTag],
  )

  const [nickname, setNickname] = useState(initial.nickname)
  const [bio, setBio] = useState(initial.bio)
  const [profileTag, setProfileTag] = useState(initial.profileTag)

  const canSave = clampText(nickname, 16).length > 0

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon size={20} />
          </button>
          <button
            className="btn primary"
            disabled={!canSave}
            onClick={() => {
              const nextNickname = clampText(nickname, 16)
              const nextBio = clampText(bio, 80)
              const nextTag = clampText(profileTag, 16)

              if (!nextNickname) {
                toast.push('昵称不能为空', 'error')
                return
              }

              updateCurrentUser({
                nickname: nextNickname,
                bio: nextBio || undefined,
                profileTag: nextTag || undefined,
              })
              toast.push('已保存', 'success')
              navigate(-1)
            }}
            style={{ fontSize: '12px', padding: '6px 16px' }}
          >
            保存
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">个人资料</h2>
          <span className="muted" style={{ fontSize: '11px', fontWeight: 300 }}>
            轻量编辑
          </span>
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ padding: '20px' }}>
          <div className="row gap" style={{ gap: '12px', marginBottom: '16px' }}>
            <div
              className="avatar"
              aria-hidden="true"
              style={{ width: '44px', height: '44px', display: 'grid', placeItems: 'center' }}
            >
              {clampText(nickname, 16).slice(0, 1) || user.nickname.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-h)' }}>头像</div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginTop: '2px' }}>
                当前版本为首字母头像
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginBottom: '8px' }}>
                昵称
              </div>
              <input
                className="input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入昵称"
                maxLength={16}
              />
            </div>

            <div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginBottom: '8px' }}>
                个性标签
              </div>
              <input
                className="input"
                value={profileTag}
                onChange={(e) => setProfileTag(e.target.value)}
                placeholder="例如：安静阅读"
                maxLength={16}
              />
            </div>

            <div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginBottom: '8px' }}>
                简介
              </div>
              <textarea
                className="textarea"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="一句话介绍自己"
                rows={4}
                maxLength={80}
                style={{ resize: 'none' }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

