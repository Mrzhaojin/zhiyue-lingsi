import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ThemeMode, User } from '../domain/models'
import { refreshTheme } from '../app/theme'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { useAuth } from '../modules/auth/client'
import {
  useCurrentProfile,
  useDatabaseSize,
  useExportBackup,
  useImportBackup,
  useUpdateProfile,
} from '../features/settings/queries'

export function SettingsPage() {
  const profileQuery = useCurrentProfile()
  if (profileQuery.isLoading) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>加载中…</div></div>
  }
  if (!profileQuery.data) {
    return <div className="page"><div className="empty" style={{ padding: '60px 0' }}>未找到当前用户</div></div>
  }
  return <SettingsForm user={profileQuery.data} />
}

function SettingsForm(props: { user: User }) {
  const user = props.user
  const toast = useToast()
  const navigate = useNavigate()
  const { mode } = useAuth()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const updateProfile = useUpdateProfile()
  const exportBackup = useExportBackup()
  const importBackup = useImportBackup()
  const sizeQuery = useDatabaseSize()

  const [nickname, setNickname] = useState(user.nickname)
  const [bio, setBio] = useState(user.bio ?? '')
  const [theme, setTheme] = useState<ThemeMode>(user.settings.theme)
  const [like, setLike] = useState(user.settings.notifications.like)
  const [comment, setComment] = useState(user.settings.notifications.comment)
  const [collect, setCollect] = useState(user.settings.notifications.collect)

  const sizeKb = Math.max(1, Math.round((sizeQuery.data ?? 0) / 1024))

  function handleSave() {
    updateProfile.mutate(
      {
        nickname: nickname.trim() || user.nickname,
        bio: bio.trim(),
        settings: {
          ...user.settings,
          theme,
          notifications: { like, comment, collect },
        },
      },
      {
        onSuccess: () => {
          refreshTheme()
          toast.push('设置已保存', 'success')
        },
        onError: (error) => toast.push(error instanceof Error ? error.message : '保存失败', 'error'),
      },
    )
  }

  async function handleExport() {
    try {
      const json = await exportBackup.mutateAsync()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `zhiyue-backup-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.push('已导出备份文件', 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : '导出失败', 'error')
    }
  }

  async function handleImport(file: File) {
    const text = await file.text()
    if (!window.confirm('导入会覆盖当前浏览器中的全部数据，确定继续？')) return
    try {
      const stats = await importBackup.mutateAsync(text)
      toast.push(`导入成功：${stats.users} 位用户 / ${stats.posts} 篇帖子 / ${stats.notes} 篇笔记`, 'success')
      window.location.reload()
    } catch (error) {
      toast.push(error instanceof Error ? error.message : '导入失败', 'error')
    }
  }

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
          <button className="btn primary" onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? '保存中…' : '保存'}
          </button>
        </div>
        <div className="section-head">
          <h2 className="h2">设置</h2>
          <span className="muted">账号安全 / 样式 / 消息通知</span>
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

      <section className="section">
        <div className="section-head">
          <h2 className="h2">账号与安全</h2>
        </div>
        <div className="list">
          <div className="card">
            <div className="row space">
              <div>
                <div className="card-title">登录方式</div>
                <div className="card-sub">{mode === 'local' ? '本地演示账号（数据仅保存在本机）' : 'Supabase 账号'}</div>
              </div>
              {mode === 'cloud' ? <Link className="btn sm" to="/zhiyueling-si/password/change">修改密码</Link> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">数据与备份</h2>
          <span className="muted">当前约 {sizeKb} KB</span>
        </div>
        <div className="list">
          <div className="card">
            <div className="card-sub" style={{ marginBottom: '10px' }}>
              数据存储在本浏览器。清除浏览器数据会导致内容丢失，建议定期导出备份。
            </div>
            <div className="row gap wrap">
              <button className="btn sm" onClick={handleExport} disabled={exportBackup.isPending}>导出 JSON</button>
              <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={importBackup.isPending}>导入 JSON</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void handleImport(file)
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}