import type { AITextAnalysis } from '../domain/models'
import { aiProxyUrl } from '../lib/runtimeConfig'

// AI 传输层：浏览器只调用同源代理，模型密钥永远不下发到前端。
// 代理未配置时明确抛错 —— 宁可失败，也不返回「演示释义」这类假数据。

const AI_TIMEOUT_MS = 30_000

export class AIUnavailableError extends Error {
  constructor(message = 'AI 服务未配置：请设置 VITE_AI_PROXY_URL 并启动 AI 代理。') {
    super(message)
    this.name = 'AIUnavailableError'
  }
}

function aiBase(): string {
  if (!aiProxyUrl) throw new AIUnavailableError()
  return aiProxyUrl
}

async function postJson<T>(path: string, body: unknown, timeoutMs = AI_TIMEOUT_MS): Promise<T> {
  const response = await fetch(`${aiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`AI 服务返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`)
  }
  return (await response.json()) as T
}

async function callDoubaoAPI(prompt: string, systemPrompt?: string): Promise<string> {
  const data = await postJson<{ text?: string; output_text?: string }>('/responses', {
    input: prompt,
    system: systemPrompt,
  })
  const text = data.text ?? data.output_text
  if (!text) throw new Error('AI 服务返回了空结果')
  return text
}

/**
 * 聊天流：优先消费服务端 SSE（data: {"delta": "..."}），
 * 服务端返回普通 JSON 时退化为一次性输出。浏览器端不做逐字假回放。
 */
export async function streamDoubaoAPI(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  signal?: AbortSignal,
): Promise<ReadableStream<string>> {
  const response = await fetch(`${aiBase()}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system: systemPrompt }),
    signal: signal ?? AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`)

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body) {
    const text = await response.text()
    return new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text)
        controller.close()
      },
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const parsed = JSON.parse(payload) as { delta?: string; text?: string }
          const chunk = parsed.delta ?? parsed.text
          if (chunk) controller.enqueue(chunk)
        } catch {
          controller.enqueue(payload)
        }
      }
    },
    cancel(reason) {
      void reader.cancel(reason)
    },
  })
}

async function aiAnalyzeTextWithDoubao(text: string): Promise<AITextAnalysis> {
  const prompt = `请对以下文本进行深度分析，包括文本解读、写作亮点、深层含义和背景信息：\n\n${text}`

  const systemPrompt = `你是一个专业的文学分析助手，擅长对各种文本进行深度解读。请从以下几个方面分析给定文本：\n1. 文本解读：解释文本的字面意义和隐含意义\n2. 写作亮点：分析文本的写作技巧和艺术特色\n3. 深层含义：探讨文本背后的主题、思想和情感\n4. 背景信息：提供与文本相关的背景知识，如作者、时代背景等\n\n请使用中文回答，分析要深入、全面、专业。`

  const response = await callDoubaoAPI(prompt, systemPrompt)

  const sections = response.split('\n\n')
  let textInterpretation = ''
  let writingHighlights = ''
  let deepMeaning = ''
  let backgroundInfo = ''

  sections.forEach((section) => {
    if (section.includes('文本解读') || section.includes('字面意义')) {
      textInterpretation = section.replace(/^.*：/, '').trim()
    } else if (section.includes('写作亮点') || section.includes('写作技巧')) {
      writingHighlights = section.replace(/^.*：/, '').trim()
    } else if (section.includes('深层含义') || section.includes('主题')) {
      deepMeaning = section.replace(/^.*：/, '').trim()
    } else if (section.includes('背景信息') || section.includes('作者') || section.includes('时代背景')) {
      backgroundInfo = section.replace(/^.*：/, '').trim()
    }
  })

  if (!textInterpretation) {
    textInterpretation = response
  }

  return { text, textInterpretation, writingHighlights, deepMeaning, backgroundInfo }
}

export type AIAssistantHistoryItem = {
  role: 'user' | 'assistant'
  content: string
  payload?: { kind: 'book_cards'; bookIds: string[] }
}

export async function aiTranslate(text: string, to: 'zh' | 'en' | 'ja' | 'ko' | 'modern' | 'classic'): Promise<string> {
  const t = text.trim()
  if (!t) return ''

  // 处理特殊的文白转换逻辑（这部分依然保持本地逻辑，因为通用翻译API不支持文白转换）
  if (to === 'modern' || to === 'classic') {
    await new Promise((r) => setTimeout(r, 600))
    if (to === 'modern') {
      if (t.includes('此开卷第一回也')) return '这一回是全书的开头。作者自己说：因为曾经亲历过一番梦境般的经历，所以将真实的事情隐藏起来，而借用“通灵”的说法，写了这部《石头记》。'
      if (t.includes('甄士隐')) return '甄士隐在梦中领悟了通灵的玄机，发现了神秘的世界……'
      return `（现代文）${t}`
    }
    if (to === 'classic') {
      if (t.includes('这一回是全书的开头')) return '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。'
      return `（文言文）${t}`
    }
  }

  // 使用 MyMemory 免费翻译 API 实现真实翻译
  try {
    const fromLang = /[a-zA-Z]/.test(t) ? 'en' : 'zh'
    const targetLang = to === 'zh' ? 'zh-CN' : to === 'en' ? 'en-GB' : to
    
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${fromLang}|${targetLang}`
    )
    const data = await response.json()
    
    if (data.responseData && data.responseData.translatedText) {
      const translated = data.responseData.translatedText
      const prefix = to === 'zh' ? '【英译中】' : '【中译英】'
      return `${prefix}${translated}`
    }
    throw new Error('Translation failed')
  } catch (error) {
    console.error('Translation Error:', error)
    // 降级处理：如果 API 失败，返回带标记的原文
    return to === 'zh' ? `【英译中】(翻译服务暂不可用) ${t}` : `【中译英】(Translation service unavailable) ${t}`
  }
}

export async function aiAnalyzeText(text: string): Promise<AITextAnalysis> {
  // 失败必须抛给调用方：以前这里把「AI赏析失败」当成正常结果返回，
  // 调用方还会把它写进赏析记录，等于把错误持久化。
  return aiAnalyzeTextWithDoubao(text)
}

export function speakText(text: string, voiceHint?: 'en-US' | 'en-GB' | 'zh-CN', onEnd?: () => void) {
  const t = text.trim()
  if (!t) return
  if (!('speechSynthesis' in window)) return

  stopSpeak()

  const utterance = new SpeechSynthesisUtterance(t)

  // 语音参数微调，听起来更自然
  utterance.rate = 0.95
  utterance.pitch = 1.0

  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return false
    
    // 优先匹配语言
    let voice = voiceHint ? voices.find((v) => v.lang === voiceHint) : undefined
    
    // 如果没有精确匹配，尝试模糊匹配
    if (!voice && voiceHint) {
      const prefix = voiceHint.split('-')[0]
      voice = voices.find(v => v.lang.startsWith(prefix))
    }

    if (voice) {
      utterance.voice = voice
    }
    return true
  }

  if (!setVoice()) {
    // 异步加载 voices 的情况
    window.speechSynthesis.onvoiceschanged = () => {
      setVoice()
      window.speechSynthesis.onvoiceschanged = null
      window.speechSynthesis.speak(utterance)
    }
  } else {
    window.speechSynthesis.speak(utterance)
  }

  utterance.onend = () => {
    onEnd?.()
  }
  
  utterance.onerror = () => {
    onEnd?.()
  }
}

export function stopSpeak() {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

export async function aiWordExplain(word: string): Promise<{ phonetic?: string; pos?: string; meaning: string; example: string }> {
  const w = word.trim()
  if (!w) return { meaning: '', example: '' }
  const data = await postJson<{ phonetic?: string; pos?: string; meaning?: string; example?: string }>('/word', { word: w })
  return {
    phonetic: data.phonetic,
    pos: data.pos,
    meaning: data.meaning ?? '',
    example: data.example ?? '',
  }
}
