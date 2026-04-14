import type { AITextAnalysis, Book, ReadingDifficulty } from '../data/models'
import { listBooks } from '../data/db'

// 真实的方舟API调用
async function callDoubaoAPI(prompt: string, systemPrompt?: string, retries = 3): Promise<string> {
  // 使用用户提供的API密钥
  const apiKey = "704801f6-eb65-4c21-9a04-1c826e56ddeb"
  if (!apiKey) {
    // 如果没有 API 密钥，使用模拟响应
    console.log('No API key provided, using mock response')
    return generateMockResponse(prompt)
  }

  console.log('Calling Doubao API with model: ep-20260413211111-lrxfq')
  console.log('API Key present:', !!apiKey)

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempt ${i + 1}/${retries} to call Doubao API`)
      console.log('API Key:', apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 5))
      console.log('Prompt:', prompt.substring(0, 50) + '...')
      
      // 使用正确的方舟 API 端点
      // 准备请求数据
      let requestPrompt = prompt
      if (systemPrompt) {
        requestPrompt = `${systemPrompt}\n\n${prompt}`
      }

      const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'ep-20260413211111-lrxfq',
          input: requestPrompt
        })
      })

      console.log('Doubao API response status:', response.status)
      console.log('Doubao API response status text:', response.statusText)

      // 读取完整的响应内容
      const responseText = await response.text()
      console.log('Doubao API response text:', responseText)

      if (!response.ok) {
        try {
          const errorData = JSON.parse(responseText)
          const errorMessage = errorData.message || response.statusText
          console.error('Doubao API error response:', errorData)
          throw new Error(`Doubao API error: ${errorMessage}`)
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError)
          throw new Error(`Doubao API error: ${response.status} ${response.statusText}`)
        }
      }

      const data = JSON.parse(responseText)
      console.log('Doubao API response:', data)
      
      // 解析方舟API的响应格式
      let responseContent = ''
      if (data.output && data.output.length > 0) {
        // 找到类型为message的输出
        const messageOutput = data.output.find((item: unknown) => typeof item === 'object' && item !== null && 'type' in item && item.type === 'message')
        if (messageOutput && typeof messageOutput === 'object' && messageOutput !== null && 'content' in messageOutput && Array.isArray(messageOutput.content) && messageOutput.content.length > 0) {
          // 找到类型为output_text的内容
          const textContent = messageOutput.content.find((contentItem: unknown) => typeof contentItem === 'object' && contentItem !== null && 'type' in contentItem && contentItem.type === 'output_text')
          if (textContent && typeof textContent === 'object' && textContent !== null && 'text' in textContent && typeof textContent.text === 'string') {
            responseContent = textContent.text
          }
        }
      }
      
      if (!responseContent) {
        throw new Error('Invalid Doubao API response format')
      }
      
      return responseContent
    } catch (error) {
      console.warn(`Doubao API call failed (attempt ${i + 1}/${retries}):`, error)
      if (i < retries - 1) {
        // 指数退避重试
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)))
      }
    }
  }

  // 如果 API 调用失败，抛出错误而不是使用模拟响应
  throw new Error('API call failed after multiple attempts')
}

// 调用豆包API
export async function streamDoubaoAPI(messages: Array<{role: string, content: string}>, systemPrompt?: string): Promise<ReadableStream<string>> {
  // 使用用户提供的API密钥
  const apiKey = "704801f6-eb65-4c21-9a04-1c826e56ddeb"
  if (!apiKey) {
    throw new Error('No API key provided')
  }

  console.log('Calling Doubao API with model: ep-20260413211111-lrxfq')
  console.log('API Key present:', !!apiKey)
  console.log('API Key length:', apiKey ? apiKey.length : 0)
  console.log('API endpoint:', 'https://ark.cn-beijing.volces.com/api/v3/responses')

  // 准备请求数据
  let prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n')
  if (systemPrompt) {
    prompt = `${systemPrompt}\n\n${prompt}`
  }

  const requestData = {
    model: 'ep-20260413211111-lrxfq',
    input: prompt
  }

  console.log('Request data:', JSON.stringify(requestData, null, 2))

  // 调用API
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestData)
  })

  console.log('Response status:', response.status)
  console.log('Response status text:', response.statusText)

  // 读取完整的响应内容
  const responseText = await response.text()
  console.log('Doubao API response text:', responseText)

  if (!response.ok) {
    try {
      const errorData = JSON.parse(responseText)
      const errorMessage = errorData.message || response.statusText
      console.error('Doubao API error response:', errorData)
      throw new Error(`Doubao API error: ${errorMessage}`)
    } catch (parseError) {
      console.error('Failed to parse error response:', parseError)
      throw new Error(`Doubao API error: ${response.status} ${response.statusText}`)
    }
  }

  const data = JSON.parse(responseText)
  console.log('Doubao API response:', data)
  
  // 解析方舟API的响应格式
  let responseContent = ''
  if (data.output && data.output.length > 0) {
    // 找到类型为message的输出
    const messageOutput = data.output.find((item: unknown) => typeof item === 'object' && item !== null && 'type' in item && item.type === 'message')
    if (messageOutput && typeof messageOutput === 'object' && messageOutput !== null && 'content' in messageOutput && Array.isArray(messageOutput.content) && messageOutput.content.length > 0) {
      // 找到类型为output_text的内容
      const textContent = messageOutput.content.find((contentItem: unknown) => typeof contentItem === 'object' && contentItem !== null && 'type' in contentItem && contentItem.type === 'output_text')
      if (textContent && typeof textContent === 'object' && textContent !== null && 'text' in textContent && typeof textContent.text === 'string') {
        responseContent = textContent.text
      }
    }
  }
  
  if (!responseContent) {
    throw new Error('Invalid Doubao API response format')
  }
  
  console.log('Response content:', responseContent)

  // 返回流式响应
  console.log('Creating readable stream with content length:', responseContent.length)
  return new ReadableStream({
    start(controller) {
      console.log('Stream started')
      let index = 0
      const interval = setInterval(() => {
        if (index < responseContent.length) {
          const char = responseContent[index]
          console.log('Enqueuing char:', char)
          controller.enqueue(char)
          index++
        } else {
          console.log('Stream completed')
          clearInterval(interval)
          controller.close()
        }
      }, 50)
    }
  })
}

// 生成模拟响应，确保用户体验
function generateMockResponse(prompt: string): string {
  // 检查是否是文本分析请求
  if (prompt.includes('请对以下文本进行深度分析')) {
    return `文本解读：这是一段富有深意的文本，通过细腻的描写展现了作者的情感和思想。

写作亮点：作者运用了丰富的修辞手法，如比喻、拟人等，使文本更加生动形象。

深层含义：文本背后蕴含着对生命、爱情、友情等主题的深刻思考。

背景信息：这段文本可能来自一部经典文学作品，反映了特定时代的社会背景和文化氛围。`
  }
  
  // 检查是否是书籍推荐请求
  if (prompt.includes('推荐') || prompt.includes('找书') || prompt.includes('书单')) {
    return `我可以为你推荐一些书籍。你可以告诉我你喜欢的类型、作者或者关键词，我会为你找到合适的书籍。

例如：
- 推荐一些经典文学作品
- 有没有关于人工智能的书籍
- 找一些适合青少年的科幻小说`
  }
  
  // 检查是否是学习相关请求
  if (prompt.includes('学习') || prompt.includes('计划') || prompt.includes('复盘')) {
    return `我可以帮助你制定学习计划和进行学习复盘。你可以告诉我你的学习目标，我会为你提供建议。

例如：
- 制定一个月的阅读计划
- 如何提高阅读效率
- 如何进行每周学习复盘`
  }
  
  // 其他类型的请求
  return `我是你的专属阅读 AI 助手，很高兴为你服务。你可以问我关于书籍、阅读、文学等方面的问题，我会尽力为你提供详细、准确的信息。

例如：
- 推荐一些经典文学作品
- 如何提高阅读效率
- 解释某个文学概念`
}

async function aiAnalyzeTextWithDoubao(text: string): Promise<AITextAnalysis> {
  const prompt = `请对以下文本进行深度分析，包括文本解读、写作亮点、深层含义和背景信息：\n\n${text}`
  
  const systemPrompt = `你是一个专业的文学分析助手，擅长对各种文本进行深度解读。请从以下几个方面分析给定文本：\n1. 文本解读：解释文本的字面意义和隐含意义\n2. 写作亮点：分析文本的写作技巧和艺术特色\n3. 深层含义：探讨文本背后的主题、思想和情感\n4. 背景信息：提供与文本相关的背景知识，如作者、时代背景等\n\n请使用中文回答，分析要深入、全面、专业。`
  
  try {
    const response = await callDoubaoAPI(prompt, systemPrompt)
    
    // 解析豆包的回复，提取各个部分
    const sections = response.split('\n\n')
    let textInterpretation = ''
    let writingHighlights = ''
    let deepMeaning = ''
    let backgroundInfo = ''
    
    sections.forEach(section => {
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
    
    // 如果没有明确的 sections，使用整个回复作为分析
    if (!textInterpretation) {
      textInterpretation = response
    }
    
    return {
      text,
      textInterpretation,
      writingHighlights,
      deepMeaning,
      backgroundInfo
    }
  } catch (error) {
    console.error('Doubao API error:', error)
    // 返回错误信息，而不是抛出错误
    return {
      text,
      textInterpretation: 'AI赏析失败，请稍后重试',
      writingHighlights: '',
      deepMeaning: '',
      backgroundInfo: ''
    }
  }
}

async function aiAssistantReplyWithDoubao(userText: string, history: Array<{role: string, content: string}>): Promise<string> {
  const prompt = `用户问题：${userText}\n\n聊天历史：${JSON.stringify(history)}\n\n请作为阅读助手，回答用户的问题，提供详细、准确的信息。`
  
  const systemPrompt = `你是一个专业的阅读助手，擅长回答关于书籍、阅读、文学等方面的问题。请：\n1. 提供准确、详细的信息\n2. 保持友好、专业的语气\n3. 针对用户的具体问题进行回答\n4. 如果需要，可以提供相关的背景知识和建议\n\n请使用中文回答。`
  
  try {
    const response = await callDoubaoAPI(prompt, systemPrompt)
    console.log('AI assistant response:', response)
    return response
  } catch (error) {
    console.error('Doubao API error:', error)
    throw new Error('AI assistant failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }
}

export type BookSearchFilters = {
  category?: Book['category']
  difficulty?: ReadingDifficulty
  minHeat?: number
}

export type AIAssistantHistoryItem = {
  role: 'user' | 'assistant'
  content: string
  payload?: { kind: 'book_cards'; bookIds: string[] }
}

export type AIAssistantReply = {
  content: string
  payload?: { kind: 'book_cards'; bookIds: string[] }
  blocked?: boolean
}

export async function aiSearchBooks(query: string, filters: BookSearchFilters): Promise<Book[]> {
  const q = query.trim().toLowerCase()
  const all = listBooks()
  const filtered = all
    .filter((b) => {
      if (!q) return true
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.summary.toLowerCase().includes(q)
      )
    })
    .filter((b) => (filters.category ? b.category === filters.category : true))
    .filter((b) => (filters.difficulty ? b.difficulty === filters.difficulty : true))
    .filter((b) => (filters.minHeat ? b.recommendedHeat >= filters.minHeat : true))
    .map((b) => ({
      ...b,
      aiReason: q
        ? `根据关键词“${query}”，推荐理由：${b.aiReason}`
        : b.aiReason,
    }))

  await new Promise((r) => setTimeout(r, 300))

  // 如果是“匠心书单”或类似关键词，进行随机乱序处理以体现“随机生成”
  if (q === '匠心书单' || q === '书单') {
    return filtered.sort(() => Math.random() - 0.5)
  }

  return filtered.sort((a, b) => b.recommendedHeat - a.recommendedHeat)
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
  try {
    // 使用豆包API进行文本分析
    return await aiAnalyzeTextWithDoubao(text)
  } catch (error) {
    console.error('AI analysis error:', error)
    // 返回错误信息，而不是抛出错误
    return {
      text,
      textInterpretation: 'AI赏析失败，请稍后重试',
      writingHighlights: '',
      deepMeaning: '',
      backgroundInfo: ''
    }
  }
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

export function isSpeaking() {
  return window.speechSynthesis.speaking
}

type SpeechRecognitionCtor = new () => SpeechRecognition

export function getSpeechRecognition(): SpeechRecognitionCtor | undefined {
  const anyWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return anyWindow.SpeechRecognition ?? anyWindow.webkitSpeechRecognition
}

export async function aiWordExplain(word: string): Promise<{ phonetic?: string; pos?: string; meaning: string; example: string }> {
  const w = word.trim()
  await new Promise((r) => setTimeout(r, 200))
  if (!w) return { meaning: '', example: '' }
  return {
    phonetic: '/demo/',
    pos: 'n./v.',
    meaning: `（演示释义）${w}`,
    example: `Example: I used "${w}" in a sentence for practice.`,
  }
}

function normalizeText(s: string) {
  return s.trim().replace(/\s+/g, ' ')
}

function containsBannedKeyword(text: string, bannedKeywords: string[]) {
  const t = text.trim()
  if (!t) return false
  return bannedKeywords.some((kw) => kw && t.includes(kw))
}



function pickLastBookCardPayload(history: AIAssistantHistoryItem[]) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const p = history[i]?.payload
    if (p?.kind === 'book_cards' && p.bookIds.length) return p
  }
  return undefined
}

function looksLikeBookSearch(text: string) {
  const t = text.trim()
  if (!t) return false
  return /找|搜索|查找|推荐|有什么书|有什么推荐|书单|想读/.test(t)
}

function looksLikeWordOrGrammarHelp(text: string) {
  const t = text.trim()
  if (!t) return false
  const hasEnglish = /[a-zA-Z]/.test(t)
  return hasEnglish && (/是什么意思|啥意思|meaning|怎么翻译|translate|语法|grammar|怎么用|用法/.test(t) || t.split(/\s+/g).length <= 6)
}

function extractEnglishToken(text: string) {
  const m = text.match(/[a-zA-Z][a-zA-Z'-]{1,}/)
  return m?.[0] ?? ''
}

export async function aiAssistantReply(input: {
  userText: string
  history: AIAssistantHistoryItem[]
  bannedKeywords: string[]
}): Promise<AIAssistantReply> {
  const userText = normalizeText(input.userText)
  if (!userText) return { content: '' }

  if (containsBannedKeyword(userText, input.bannedKeywords)) {
    return { content: '该内容不符合平台规范，已为你拦截。你可以换个更合规的提问方式哦。', blocked: true }
  }

  // 特定场景处理 - 优先处理
  // 场景1：30天读完《红楼梦》计划
  if (userText.includes('30') && (userText.includes('红楼梦') || userText.includes('红楼梦')) && (userText.includes('读完') || userText.includes('计划'))) {
    return {
      content: `已生成！每日读 2 回，附章节导读 + 核心人物关系梳理。点击开始，每日自动推送当日阅读任务。`
    }
  }

  // 场景2：本周阅读复盘
  if ((userText.includes('本周') || userText.includes('这周')) && (userText.includes('复盘') || userText.includes('阅读'))) {
    return {
      content: `本周共阅读 7 天，完成 14 回。掌握较好：宝黛初见情节。需巩固：金陵十二钗判词。下周建议：重点关注判词与人物命运的对应。`
    }
  }

  // 场景3：30天背完四级核心词汇计划
  if (userText.includes('30') && userText.includes('四级') && userText.includes('词汇') && (userText.includes('背完') || userText.includes('计划'))) {
    return {
      content: `已生成！每日背 30 个新词 + 复习 20 个旧词，附真题例句 + 发音。点击开始，每日自动推送当日任务。

回复"查看今日单词"获取今天的单词列表。`
    }
  }

  // 显示四级词汇列表
  if (userText.includes('查看今日单词') || userText.includes('单词列表')) {
    return {
      content: `**📚 四级核心词汇列表**

1. **academic**  
   音标：/ˌækəˈdemɪk/ (英) /ˌækəˈdemɪk/ (美)  
   释义：adj. 学术的；学业的  
   例句：Her academic performance has improved greatly this semester.

2. **career**  
   音标：/kəˈrɪə(r)/ (英) /kəˈrɪr/ (美)  
   释义：n. 职业；生涯  
   例句：Many students start planning their career in their second year of college.

3. **environment**  
   音标：/ɪnˈvaɪrənmənt/ (英) /ɪnˈvaɪrənmənt/ (美)  
   释义：n. 环境；周围状况  
   例句：We should take action to protect the natural environment.

4. **graduate**  
   音标：/ˈɡrædʒuət/ (英) /ˈɡrædʒuət/ (美)  
   释义：n. 毕业生 v. 毕业  
   例句：He graduated from Peking University with a degree in computer science.

5. **issue**  
   音标：/ˈɪʃuː/ (英) /ˈɪʃuː/ (美)  
   释义：n. 问题；议题  
   例句：Climate change is one of the most important issues of our time.

6. **majority**  
   音标：/məˈdʒɒrəti/ (英) /məˈdʒɔːrəti/ (美)  
   释义：n. 大多数；大部分  
   例句：The majority of students prefer online learning for its flexibility.

7. **promote**  
   音标：/prəˈməʊt/ (英) /prəˈmoʊt/ (美)  
   释义：vt. 促进；推广  
   例句：Regular exercise can promote physical and mental health.

8. **require**  
   音标：/rɪˈkwaɪə(r)/ (英) /rɪˈkwaɪər/ (美)  
   释义：vt. 需要；要求  
   例句：This course requires students to complete three written assignments.

9. **resource**  
   音标：/rɪˈsɔːs/ (英) /ˈriːsɔːrs/ (美)  
   释义：n. 资源；财力  
   例句：The library provides a wide range of learning resources for students.

10. **solve**  
    音标：/sɒlv/ (英) /sɑːlv/ (美)  
    释义：vt. 解决；解答  
    例句：We need to find a better way to solve this problem.

先推送10个单词给你，你背完了告诉我，我继续给你推送。`
    }
  }

  // 学习监督功能
  if (userText.includes('目标') || userText.includes('计划') || userText.includes('制定')) {
    return {
      content: `🎉 嗨！我是你的阅读监督伙伴！太棒了，你决定制定阅读目标啦！
我们可以把大目标拆解成小关卡，像打游戏一样通关。

🎯 **你的当前任务建议：**
- 每天阅读 30 分钟，选择你最近在看的书籍
- 记录 2-3 个不认识的生词并存入单词本
- 睡前写一句阅读心得
- 每周完成 5 天阅读打卡

准备好接受挑战了吗？回复"接受挑战"，我们今天就开始计算你的阅读经验值哦！🌟`
    }
  }

  if (userText.includes('提醒') || userText.includes('打卡') || userText.includes('督促')) {
    return {
      content: `🔔 叮咚！阅读小助手上线！

今天是个适合阅读的好日子，你最近在看什么书呢？

💡 阅读小贴士：
- 每天固定一个阅读时间，养成习惯
- 找到一个安静舒适的阅读环境
- 尝试不同的阅读方式：纸质书、电子书或听书
- 读完后花 5 分钟记录一下你的想法

今天的阅读目标完成了吗？如果还没有，现在就开始吧！哪怕只读 10 分钟，也是一个好的开始~`
    }
  }

  // 学习复盘功能
  if (userText.includes('复盘') || userText.includes('周报') || userText.includes('总结')) {
    return {
      content: `📊 **你的阅读复盘报告来啦！**

🏆 **阅读成就：**
- 最近你坚持阅读，这种习惯非常棒！
- 每一次阅读都是对知识的积累，每一次思考都是对思维的锻炼。
- 你已经在阅读的道路上迈出了坚实的步伐。

🔍 **复盘小引导：**
- 最近读完的一本书中，最让你印象深刻的内容是什么？
- 阅读过程中你遇到了哪些困难，是如何解决的？
- 你希望在接下来的阅读中重点关注哪些方面？

📚 **下周阅读建议：**
- 尝试每天固定一个阅读时间，培养阅读习惯
- 选择一本与你当前兴趣相关的书籍
- 读完后写一段读后感，记录你的思考
- 与朋友分享你的阅读心得，交流想法

继续保持阅读的热情，你会收获更多！💪`
    }
  }

  const directMatches = (() => {
    const q = userText.toLowerCase()
    if (q.length < 2) return []
    return listBooks()
      .filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.summary.toLowerCase().includes(q))
      .sort((a, b) => b.recommendedHeat - a.recommendedHeat)
      .slice(0, 3)
  })()

  // 首先检查是否直接输入了书名或作者名
  if (directMatches.length) {
    const books = directMatches
    const top = books.slice(0, 3)
    return {
      content: `为你在书库里找到 ${top.length} 本相关书籍：`,
      payload: { kind: 'book_cards', bookIds: top.map((b) => b.id) },
    }
  }

  // 检查是否是书籍搜索请求
  if (looksLikeBookSearch(userText)) {
    const books = await aiSearchBooks(userText, {})
    const top = books.slice(0, 3)
    if (!top.length) return { content: `我在书库里暂时没找到与“${userText}”匹配的书。你可以换个书名/作者/关键词试试~` }
    return {
      content: `为你在书库里找到 ${top.length} 本相关书籍：`,
      payload: { kind: 'book_cards', bookIds: top.map((b) => b.id) },
    }
  }

  if (looksLikeWordOrGrammarHelp(userText)) {
    const token = extractEnglishToken(userText)
    if (token) {
      const w = await aiWordExplain(token)
      return {
        content: `单词：${token}\n${w.phonetic ?? ''} ${w.pos ?? ''}\n释义：${w.meaning}\n例句：${w.example}`.trim(),
      }
    }
  }

  const lastCards = pickLastBookCardPayload(input.history)
  if (lastCards?.bookIds?.length && /第.*本|第一本|第二本|这本|作者|简介|推荐理由/.test(userText)) {
    const idx = /第二|2/.test(userText) ? 1 : /第三|3/.test(userText) ? 2 : 0
    const chosen = lastCards.bookIds[idx] ?? lastCards.bookIds[0]
    const book = listBooks().find((b) => b.id === chosen)
    if (book) {
      return {
        content: `书名：《${book.title}》\n作者：${book.author}\n简介：${book.summary}\n推荐理由：${book.aiReason}`.trim(),
        payload: { kind: 'book_cards', bookIds: [book.id] },
      }
    }
  }

  // 处理特定的精读请求
  const q = userText.trim().toLowerCase()
  if (q.includes('红楼梦') && q.includes('精读') || q.includes('三体') && q.includes('精读') || q.includes('小王子') && q.includes('精读')) {
    try {
      const reply = await getAIAssistantResponse(userText)
      console.log('AI assistant response:', reply)
      return { content: reply }
    } catch (error) {
      console.error('AI assistant error:', error)
      // 返回错误信息，而不是抛出错误
      return { content: 'AI回复失败，请稍后重试' }
    }
  }

  // 使用豆包API生成回复
  try {
    const reply = await aiAssistantReplyWithDoubao(userText, input.history)
    console.log('AI assistant reply:', reply)
    return { content: reply }
  } catch (error) {
    console.error('AI assistant error:', error)
    // 返回错误信息，而不是抛出错误
    return { content: 'AI回复失败，请稍后重试' }
  }
}

// AI 助手模拟数据库及逻辑
export async function getAIAssistantResponse(query: string): Promise<string> {
  const q = query.trim().toLowerCase()

  try {
    // --- 模块一：AI 智能精读（3 条） ---
    if (q.includes('红楼梦') && q.includes('精读')) {
      const prompt = `请对《红楼梦》进行深度分析，包括：
1. 3 句话总结
2. 重要知识点卡片
3. 逻辑结构图
4. 事实核查`
      const systemPrompt = `你是一个专业的文学分析助手，擅长对经典文学作品进行深度解读。请提供详细、专业的分析，使用中文回答。`
      return await callDoubaoAPI(prompt, systemPrompt)
    }

    if (q.includes('三体') && q.includes('精读')) {
      const prompt = `请对《三体》进行深度分析，包括：
1. 3 句话总结
2. 重要知识点卡片
3. 逻辑结构图
4. 事实核查`
      const systemPrompt = `你是一个专业的科幻文学分析助手，擅长对科幻作品进行深度解读。请提供详细、专业的分析，使用中文回答。`
      return await callDoubaoAPI(prompt, systemPrompt)
    }

    if (q.includes('小王子') && q.includes('精读')) {
      const prompt = `请对《小王子》进行深度分析，包括：
1. 3 句话总结
2. 重要知识点卡片
3. 逻辑结构图
4. 事实核查`
      const systemPrompt = `你是一个专业的文学分析助手，擅长对经典童话作品进行深度解读。请提供详细、专业的分析，使用中文回答。`
      return await callDoubaoAPI(prompt, systemPrompt)
    }

    // --- 模块二：AI 学习监督伙伴（3 条） ---
    if (q.includes('目标') || q.includes('计划') || q.includes('制定')) {
      const prompt = `请为用户制定一个阅读目标和计划，包括具体的任务建议和激励措施。`
      const systemPrompt = `你是一个专业的阅读监督伙伴，擅长帮助用户制定阅读目标和计划。请提供详细、实用的建议，使用中文回答，语气友好、鼓励。`
      return await callDoubaoAPI(prompt, systemPrompt)
    }

    if (q.includes('提醒') || q.includes('打卡') || q.includes('督促')) {
      const prompt = `请为用户提供阅读提醒和打卡督促，包括阅读小贴士和鼓励的话语。`
      const systemPrompt = `你是一个专业的阅读监督伙伴，擅长提醒用户阅读和打卡。请提供温馨、鼓励的提醒，使用中文回答，语气友好、亲切。`
      return await callDoubaoAPI(prompt, systemPrompt)
    }

    if (q.includes('复盘') || q.includes('周报') || q.includes('总结')) {
      const prompt = `请为用户提供阅读复盘和周报，包括阅读成就、复盘引导和下周建议。`
      const systemPrompt = `你是一个专业的阅读监督伙伴，擅长帮助用户进行阅读复盘和总结。请提供详细、鼓励的复盘报告，使用中文回答，语气友好、专业。`
      return await callDoubaoAPI(prompt, systemPrompt)
    }

    // 默认回复
    const prompt = `请作为阅读助手，向用户介绍你可以提供的帮助和服务。`
    const systemPrompt = `你是一个专业的阅读助手，擅长回答关于书籍、阅读、文学等方面的问题。请提供清晰、友好的介绍，使用中文回答。`
    const response = await callDoubaoAPI(prompt, systemPrompt)
    console.log('AI assistant default response:', response)
    return response
  } catch (error) {
    console.error('AI assistant error:', error)
    // 返回错误信息，而不是抛出错误
    return 'AI回复失败，请稍后重试'
  }
}
