import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addPost, getCurrentUser, getPost, updatePost, upsertTagByName } from '../data/db'
import { checkContentAllowed } from '../services/keywordFilter'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { ImagePlus, X } from 'lucide-react'

function readFilesAsDataUrls(files: FileList): Promise<string[]> {
  const list = Array.from(files).slice(0, 9)
  return Promise.all(
    list.map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result ?? ''))
          reader.onerror = () => reject(new Error('read failed'))
          reader.readAsDataURL(f)
        }),
    ),
  )
}

export function NewPostPage() {
  const toast = useToast()
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit') ?? ''
  const presetTag = params.get('tag') ?? ''
  const editing = Boolean(editId)

  const existing = useMemo(() => (editing ? getPost(editId) : undefined), [editId, editing])

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!existing) return
    setTitle(existing.title)
    setContent(existing.contentText)
    setTagsInput(existing.tags.join(' '))
    setImageUrls(existing.imageUrls)
  }, [existing])

  useEffect(() => {
    if (editing) return
    if (!presetTag.trim()) return
    setTagsInput((prev) => (prev.trim() ? prev : presetTag.trim()))
  }, [editing, presetTag])

  function parseTags() {
    return tagsInput
      .split(/[\s,，]+/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
  }

  return (
    <div className="page">
      <section className="section">
        <div className="section-head">
          <h2 className="h2">{editing ? '编辑帖子' : '发帖'}</h2>
          <button className="btn icon" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeftIcon />
          </button>
        </div>

        <div className="form">
          <label className="field">
            <span className="label">标题</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="写一个清晰标题" />
          </label>

          <label className="field">
            <span className="label">正文</span>
            <textarea
              className="textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="可发布阅读心得、推荐、问题探讨、打卡记录…"
              rows={8}
            />
          </label>

          <label className="field">
            <span className="label">话题标签</span>
            <input
              className="input"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="例如：#阅读心得 #英文原著打卡（空格分隔）"
            />
            <span className="hint">最多 8 个标签，发布后会同步到话题广场。</span>
          </label>

          <div className="field">
            <span className="label">图片（最多9张）</span>
            <div className="img-grid" style={{ marginTop: '8px', gap: '12px' }}>
              {imageUrls.map((u, idx) => (
                <div key={idx} className="img-cell" style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', aspectRatio: '1', border: '1px solid var(--border)' }}>
                  <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button 
                    className="btn icon" 
                    style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '4px', border: 'none', borderRadius: '50%' }}
                    onClick={() => setImageUrls((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {imageUrls.length < 9 && (
                <button
                  className="btn"
                  style={{ 
                    aspectRatio: '1', 
                    borderRadius: 'var(--radius-sm)', 
                    border: '1px dashed var(--border-hover)', 
                    background: 'var(--surface-2)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '8px',
                    color: 'var(--muted)',
                    cursor: 'pointer'
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={24} />
                  <span style={{ fontSize: '10px' }}>添加图片</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={async (e) => {
                const files = e.target.files
                if (!files || files.length === 0) return
                try {
                  const urls = await readFilesAsDataUrls(files)
                  setImageUrls((prev) => [...prev, ...urls].slice(0, 9))
                } catch {
                  toast.push('图片读取失败', 'error')
                } finally {
                  e.target.value = ''
                }
              }}
            />
          </div>

          <div className="row gap">
            <button
              className="btn primary"
              onClick={() => {
                const combined = `${title}\n${content}`
                const allowed = checkContentAllowed(combined)
                if (!allowed.ok) {
                  toast.push(`内容包含敏感词：${allowed.hit}，已拦截`, 'error')
                  return
                }
                const tags = parseTags()
                tags.forEach((t) => upsertTagByName(t))

                if (editing && existing) {
                  updatePost(existing.id, {
                    title: title.trim(),
                    contentText: content.trim(),
                    tags,
                    imageUrls,
                  })
                  toast.push('已更新帖子', 'success')
                  navigate(`/forum/${existing.id}`)
                  return
                }

                const p = addPost({
                  authorId: user.id,
                  title: title.trim(),
                  contentText: content.trim(),
                  imageUrls,
                  tags,
                })
                toast.push('发布成功', 'success')
                navigate(`/forum/${p.id}`)
              }}
              disabled={!title.trim() || !content.trim()}
            >
              {editing ? '保存' : '发布'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setTitle('')
                setContent('')
                setTagsInput('')
                setImageUrls([])
              }}
            >
              清空
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
