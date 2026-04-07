import { toPng } from 'html-to-image'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteVocabItem, getCurrentUser, listVocab } from '../data/db'
import { formatTime } from '../lib/format'
import { useToast } from '../ui/useToast'
import { ChevronLeftIcon } from '../ui/ChevronLeftIcon'

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function LearningPage() {
  const toast = useToast()
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'word' | 'sentence'>('word')
  const [sort, setSort] = useState<'time' | 'alpha'>('time')
  const ref = useRef<HTMLDivElement | null>(null)

  const items = useMemo(() => {
    const list = listVocab(user.id, tab)
    if (sort === 'alpha') {
      return [...list].sort((a, b) => a.text.localeCompare(b.text))
    }
    return list
  }, [sort, tab, user.id])

  const exportText = items.map((i) => `${formatTime(i.createdAt)}\t${i.text}`).join('\n')

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
              onClick={async () => {
                if (!ref.current) return
                try {
                  const dataUrl = await toPng(ref.current, { cacheBust: true, pixelRatio: 2 })
                  const a = document.createElement('a')
                  a.href = dataUrl
                  a.download = tab === 'word' ? 'vocab-words.png' : 'vocab-sentences.png'
                  a.click()
                  toast.push('已导出图片', 'success')
                } catch {
                  toast.push('导出图片失败', 'error')
                }
              }}
              disabled={items.length === 0}
            >
              导出图片
            </button>
            <button
              className="btn"
              onClick={() => {
                downloadText(tab === 'word' ? 'vocab-words.txt' : 'vocab-sentences.txt', exportText)
                toast.push('已导出文本', 'success')
              }}
              disabled={items.length === 0}
            >
              导出文本
            </button>
          </div>
        </div>
        <div className="section-head">
          <h2 className="h2">英语学习积累本</h2>
          <span className="muted">来自英语学习模式的选词/选句</span>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'word' ? 'active' : ''}`} onClick={() => setTab('word')}>
            单词
          </button>
          <button className={`tab ${tab === 'sentence' ? 'active' : ''}`} onClick={() => setTab('sentence')}>
            句子
          </button>
        </div>

        <div className="tabs">
          <button className={`tab ${sort === 'time' ? 'active' : ''}`} onClick={() => setSort('time')}>
            按添加时间
          </button>
          <button className={`tab ${sort === 'alpha' ? 'active' : ''}`} onClick={() => setSort('alpha')}>
            按字母
          </button>
        </div>
      </section>

      <section className="section">
        <div className="list" ref={ref} style={{ padding: '4px' }}>
          {items.map((i) => (
            <div key={i.id} className="card" style={{ marginBottom: '12px', border: 'none', background: 'var(--surface-2)' }}>
              <div className="row space" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <div className="card-title" style={{ fontSize: '17px', lineHeight: '1.5', color: 'var(--text-h)' }}>{i.text}</div>
                  <div className="muted" style={{ fontSize: '11px', marginTop: '8px' }}>记录于 {formatTime(i.createdAt)}</div>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 12px', fontSize: '12px', border: 'none', background: 'var(--danger-bg)', color: 'var(--danger)' }}
                  onClick={() => {
                    deleteVocabItem(i.id)
                    toast.push('已从积累本移除', 'success')
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <div className="empty" style={{ padding: '60px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎓</div>
              <div>积累本空空如也</div>
              <div className="muted" style={{ marginTop: '8px' }}>在阅读英文原著时开启学习模式，点击“存单词”或“存句子”即可出现在这里。</div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
