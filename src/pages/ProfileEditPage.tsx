import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '../domain/models'
import { useCurrentProfile, useUpdateProfile } from '../features/settings/queries'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useToast } from '../ui/useToast'

function clampText(value: string, maxLen: number) {
  const v = value.trim()
  if (!v) return ''
  return v.length > maxLen ? v.slice(0, maxLen) : v
}

export function ProfileEditPage() {
  const profileQuery = useCurrentProfile()
  if (profileQuery.isLoading) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载中…</div></div>
  }
  if (!profileQuery.data) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>未找到当前用户</div></div>
  }
  return <ProfileForm user={profileQuery.data} />
}

function ProfileForm(props: { user: User }) {
  const user = props.user
  const navigate = useNavigate()
  const toast = useToast()
  const updateProfile = useUpdateProfile()

  const [nickname, setNickname] = useState(user.nickname)
  const [bio, setBio] = useState(user.bio ?? '')
  const [profileTag, setProfileTag] = useState(user.profileTag ?? '')

  const canSave = clampText(nickname, 16).length > 0 && !updateProfile.isPending

  function handleSave() {
    const nextNickname = clampText(nickname, 16)
    const nextBio = clampText(bio, 80)
    const nextTag = clampText(profileTag, 16)
    if (!nextNickname) {
      toast.push('昵称不能为空', 'error')
      return
    }
    updateProfile.mutate(
      { nickname: nextNickname, bio: nextBio || undefined, profileTag: nextTag || undefined },
      {
        onSuccess: () => {
          toast.push('已保存', 'success')
          navigate(-1)
        },
        onError: (error) => toast.push(error instanceof Error ? error.message : '保存失败', 'error'),
      },
    )
  }

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon size={20} />
          </button>
          <button className="btn primary" disabled={!canSave} onClick={handleSave} style={{ fontSize: '12px', padding: '6px 16px' }}>
            {updateProfile.isPending ? '保存中…' : '保存'}
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">个人资料</h2>
          <span className="muted" style={{ fontSize: '11px', fontWeight: 300 }}>轻量编辑</span>
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ padding: '20px' }}>
          <div className="row gap" style={{ gap: '12px', marginBottom: '16px' }}>
            <div className="avatar" aria-hidden="true" style={{ width: '44px', height: '44px', display: 'grid', placeItems: 'center' }}>
              {clampText(nickname, 16).slice(0, 1) || user.nickname.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-h)' }}>头像</div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginTop: '2px' }}>当前版本为首字母头像</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginBottom: '8px' }}>昵称</div>
              <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="输入昵称" maxLength={16} />
            </div>
            <div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginBottom: '8px' }}>个性标签</div>
              <input className="input" value={profileTag} onChange={(e) => setProfileTag(e.target.value)} placeholder="例如：安静阅读" maxLength={16} />
            </div>
            <div>
              <div className="muted" style={{ fontSize: '11px', fontWeight: 300, marginBottom: '8px' }}>简介</div>
              <textarea className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="一句话介绍自己" rows={4} maxLength={80} style={{ resize: 'none' }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}