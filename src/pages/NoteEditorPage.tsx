import { toPng } from 'html-to-image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import {
  addOrUpdateNote,
  addPost,
  deleteNote,
  getCurrentUser,
  getNote,
  upsertTagByName,
} from '../data/db'
import type { NoteTemplate } from '../data/models'
import { checkContentAllowed } from '../services/keywordFilter'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'
import { ImagePlus } from 'lucide-react'

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



function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function NoteEditorPage(props: { mode: 'create' | 'edit' }) {
  const toast = useToast()
  const user = getCurrentUser()
  const navigate = useNavigate()
  const { noteId } = useParams()
  const [params] = useSearchParams()

  const existing = useMemo(() => (props.mode === 'edit' && noteId ? getNote(noteId) : undefined), [noteId, props.mode])

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [template, setTemplate] = useState<NoteTemplate>('minimal')
  const [cardBg, setCardBg] = useState('#ffffff')
  const [cardText, setCardText] = useState('#111827')
  const [font, setFont] = useState<'sans' | 'serif' | 'mono'>('sans')
  const [shareToForum, setShareToForum] = useState(false)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const autoCardDone = useRef(false)
  const quillContainerRef = useRef<HTMLDivElement>(null!)
  const quillRef = useRef<Quill | null>(null)

  useEffect(() => {
    if (existing) {
      setTitle(existing.title)
      setContent(existing.contentText)
      setTagsInput(existing.tags.join(' '))
      setImageUrls(existing.imageUrls)
      setTemplate(existing.template)
      const t = params.get('template')
      if (t === 'minimal' || t === 'literary' || t === 'retro') setTemplate(t)
      return
    }
    const excerpt = params.get('excerpt') ?? ''
    const tag = params.get('tag') ?? ''
    const bookId = params.get('bookId') ?? ''
    const chapterId = params.get('chapterId') ?? ''
    const t = params.get('template')
    if (t === 'minimal' || t === 'literary' || t === 'retro') setTemplate(t)

    if (excerpt) {
      setTitle('摘抄笔记')
      setContent(excerpt)
    }
    if (tag) setTagsInput(tag)
    if (bookId || chapterId) {
      const extra = [`来源：${bookId ? `book=${bookId}` : ''}${chapterId ? ` chapter=${chapterId}` : ''}`].filter(Boolean).join(
        ' ',
      )
      if (extra) setContent((prev) => (prev ? `${prev}\n\n${extra}` : extra))
    }
  }, [existing, params])

  useEffect(() => {
    if (autoCardDone.current) return
    if (params.get('autoSaveCard') !== '1') return
    if (!content.trim()) return
    autoCardDone.current = true
    void (async () => {
      const card = await generateCard()
      if (!card) return
      const a = document.createElement('a')
      a.href = card
      a.download = `${title || 'share-card'}.png`
      a.click()
      toast.push('已保存到本地', 'success')
    })()
  }, [content, params, title, template, cardBg, cardText, font, toast])

  // 初始化 Quill 编辑器
  useEffect(() => {
    if (!quillContainerRef.current || quillRef.current) return

    const quill = new Quill(quillContainerRef.current, {
      theme: 'snow',
      placeholder: '可摘抄、解读、总结、打卡…',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],
          ['blockquote', 'code-block'],
          [{ 'header': 1 }, { 'header': 2 }],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'indent': '-1'}, { 'indent': '+1' }],
          [{ 'direction': 'rtl' }],
          [{ 'size': ['small', false, 'large', 'huge'] }],
          [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
          [{ 'color': [] }, { 'background': [] }],
          [{ 'font': [] }],
          [{ 'align': [] }],
          ['clean']
        ]
      }
    })

    quillRef.current = quill

    // 设置初始内容
    quill.root.innerHTML = content

    // 监听内容变化
    const handleTextChange = () => {
      setContent(quill.root.innerHTML)
    }

    quill.on('text-change', handleTextChange)

    // 清理函数
    return () => {
      quill.off('text-change', handleTextChange)
    }
  }, [])

  // 当外部 content 变化时更新编辑器内容
  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.root.innerHTML = content
    }
  }, [content])

  function parseTags() {
    return tagsInput
      .split(/[\s,，]+/g)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
  }

  async function generateCard() {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      return dataUrl
    } catch {
      toast.push('生成分享卡片失败', 'error')
      return undefined
    }
  }

  function cardFont() {
    if (font === 'serif') return '"Noto Serif SC", "Source Han Serif CN", serif'
    if (font === 'mono') return 'ui-monospace, Consolas, monospace'
    return 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  }

  const templateStyles: Record<NoteTemplate, React.CSSProperties> = {
    minimal: {
      padding: '24px',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    literary: {
      padding: '40px 32px',
      borderRadius: '4px',
      border: '4px double var(--border)',
      textAlign: 'center',
      backgroundImage: 'linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)',
      backgroundSize: '100% 2em',
    },
    retro: {
      padding: '32px',
      borderRadius: '0',
      border: '8px solid var(--border)',
      position: 'relative',
      boxShadow: '8px 8px 0 var(--border)',
    },
  }

  return (
    <div className="page">
      <section className="section">
        <div className="row space">
          <button
            className="btn icon"
            onClick={() => {
              if (params.get('fromReader')) {
                navigate(-1)
              } else {
                navigate('/notes')
              }
            }}
            aria-label="返回"
          >
            <ChevronLeftIcon />
          </button>
          {existing ? (
            <button
              className="btn danger"
              onClick={() => {
                deleteNote(existing.id)
                toast.push('已删除笔记', 'success')
                navigate('/notes')
              }}
            >
              删除
            </button>
          ) : null}
        </div>
        <div className="section-head">
          <h2 className="h2">{existing ? '编辑笔记' : '新建笔记'}</h2>
          <span className="muted">支持草稿保存 · 生成精美分享卡片</span>
        </div>

        <div className="form">
          <label className="field">
            <span className="label">标题</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给笔记起个标题" />
          </label>
          <label className="field">
            <span className="label">内容</span>
            <div
              ref={quillContainerRef}
              style={{ height: '300px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
            />
          </label>
          <label className="field">
            <span className="label">话题标签</span>
            <input className="input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="#阅读心得 #散文赏析" />
            <span className="hint">发布后会同步到话题广场。</span>
          </label>

          <div className="field">
            <div className="row space">
              <span className="label">图片</span>
              <button
                className="btn sm"
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={imageUrls.length >= 9}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface-2)',
                  border: 'none',
                  borderRadius: '12px',
                  opacity: imageUrls.length >= 9 ? 0.6 : 1,
                }}
              >
                <ImagePlus size={14} />
                添加图片 {imageUrls.length ? `(${imageUrls.length}/9)` : '(0/9)'}
              </button>
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
            {imageUrls.length ? (
              <div className="img-grid">
                {imageUrls.map((u, idx) => (
                  <div key={idx} className="img-cell">
                    <img src={u} alt="" />
                    <button className="img-del" onClick={() => setImageUrls((prev) => prev.filter((_, i) => i !== idx))}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">未添加图片</div>
            )}
          </div>

          <div className="field">
            <div className="row gap wrap">
              <label className="pill">
                <span>模板</span>
                <select className="select" value={template} onChange={(e) => setTemplate(e.target.value as NoteTemplate)}>
                  <option value="minimal">简约风</option>
                  <option value="literary">文艺风</option>
                  <option value="retro">复古风</option>
                </select>
              </label>
              <label className="pill">
                <span>背景</span>
                <input className="input" type="color" value={cardBg} onChange={(e) => setCardBg(e.target.value)} />
              </label>
              <label className="pill">
                <span>字体色</span>
                <input className="input" type="color" value={cardText} onChange={(e) => setCardText(e.target.value)} />
              </label>
              <label className="pill">
                <span>字体</span>
                <select
                  className="select"
                  value={font}
                  onChange={(e) => setFont(e.target.value as 'sans' | 'serif' | 'mono')}
                >
                  <option value="sans">清新</option>
                  <option value="serif">文艺</option>
                  <option value="mono">极简</option>
                </select>
              </label>
              <label className="switch">
                <input checked={shareToForum} onChange={(e) => setShareToForum(e.target.checked)} type="checkbox" />
                <span>发布同步到论坛</span>
              </label>
            </div>
          </div>

          <div className="row gap wrap">
            <button
              className="btn"
              onClick={async () => {
                const note = await addOrUpdateNote({
                  id: existing?.id,
                  authorId: user.id,
                  title: title.trim() || '未命名笔记',
                  contentText: content.trim(),
                  tags: parseTags(),
                  imageUrls,
                  template,
                  status: 'draft',
                })
                toast.push('已保存到草稿箱', 'success')
                const qs = params.toString()
                navigate(`/notes/${note.id}/edit?${qs}`, { replace: true })
              }}
              disabled={!content.trim()}
            >
              保存草稿
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                const combined = `${title}\n${content}`
                const allowed = checkContentAllowed(combined)
                if (!allowed.ok) {
                  toast.push(`内容包含敏感词：${allowed.hit}，已拦截`, 'error')
                  return
                }
                const tags = parseTags()
                tags.forEach((t) => upsertTagByName(t))
                const card = await generateCard()
                const note = await addOrUpdateNote({
                  id: existing?.id,
                  authorId: user.id,
                  title: title.trim() || '未命名笔记',
                  contentText: content.trim(),
                  tags,
                  imageUrls,
                  template,
                  status: 'published',
                  shareCardDataUrl: card,
                })
                if (shareToForum) {
                  addPost({
                    authorId: user.id,
                    title: `笔记分享：${note.title}`,
                    contentText: note.contentText.slice(0, 180),
                    imageUrls: card ? [card] : [],
                    tags: note.tags,
                  })
                }
                toast.push('已发布', 'success')
                if (params.get('fromReader')) {
                  navigate(-1)
                } else {
                  navigate('/notes')
                }
              }}
              disabled={!content.trim()}
            >
              发布
            </button>

            <button
              className="btn"
              onClick={async () => {
                const card = await generateCard()
                if (!card) return
                const a = document.createElement('a')
                a.href = card
                a.download = `${title || 'share-card'}.png`
                a.click()
                toast.push('已保存到本地', 'success')
              }}
            >
              本地保存卡片
            </button>
            <button
              className="btn"
              onClick={() => {
                downloadText(`${title || 'note'}.txt`, `${title}\n\n${content}`)
                toast.push('已导出文本', 'success')
              }}
              disabled={!content.trim()}
            >
              导出文本
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">分享卡片预览</h2>
          <span className="muted">生成图片后可用于笔记封面与分享</span>
        </div>
        <div
          ref={cardRef}
          className={`share-card ${template}`}
          style={{ 
            ...templateStyles[template],
            background: cardBg, 
            color: cardText, 
            fontFamily: cardFont(),
            width: '100%',
            maxWidth: '400px'
          }}
        >
          <div className="sc-top">
            <div className="sc-badge" style={{ borderColor: 'currentColor', opacity: 0.6 }}>读享 · 智能阅读笔记</div>
            <div className="sc-title" style={{ fontSize: template === 'literary' ? '24px' : '20px', marginTop: '12px' }}>{title || '未命名笔记'}</div>
          </div>
          <div className="sc-content" style={{ 
            fontSize: '15px', 
            lineHeight: '1.8', 
            margin: '20px 0',
            textAlign: template === 'literary' ? 'center' : 'left'
          }}>
            {(() => {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = content || '';
              return tempDiv.textContent?.slice(0, 500) || '';
            })()}
          </div>
          <div className="sc-tags" style={{ justifyContent: template === 'literary' ? 'center' : 'flex-start' }}>
            {parseTags().slice(0, 4).map((t) => (
              <span key={t} className="sc-tag" style={{ borderColor: 'currentColor', opacity: 0.7 }}>
                {t}
              </span>
            ))}
          </div>
          <div className="sc-foot" style={{ marginTop: '24px', fontSize: '12px', opacity: 0.5 }}>
            —— 分享于 {new Date().toLocaleDateString()} · 智阅灵思
          </div>
        </div>
      </section>
    </div>
  )
}
