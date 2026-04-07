import type { AITextAnalysis, Book, ReadingDifficulty } from '../data/models'
import { listBooks } from '../data/db'

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
  const content = text.trim()
  await new Promise((r) => setTimeout(r, 800))

  // 根据内容特征返回正式的 AI 赏析
  if (content.includes('甄士隐') || content.includes('石头记')) {
    return {
      text: content,
      textInterpretation:
        '此句开宗明义，确立了全书“真事隐去，假语村言”的叙事基调。通过“梦幻”与“通灵”的隐喻，作者构建了一个虚实相生的文学空间，并为后续家族兴衰与人物悲剧奠定叙事框架。',
      writingHighlights:
        '以“梦幻/通灵”作为叙事入口，虚实并置；语句凝练，信息密度高；“真事隐去”形成强烈悬念与反讽张力，读者在“可信/不可信”的张力中进入文本。',
      deepMeaning:
        '“隐去真事”并非回避现实，而是以文学的曲笔保存真实：个人身世之感怀、时代盛衰之无常、人生终归幻灭的宿命感，被压缩进这一句的叙事宣言中。',
      backgroundInfo:
        '【作者与时代】曹雪芹出身江宁织造世家，家道中落；清代盛世表象下社会矛盾暗涌。\n【关键意象】“通灵宝玉”常被解读为先天灵性与后天枷锁的对照物，贯穿人物命运走向。',
    }
  }

  if (content.includes('红岸基地') || content.includes('叶文洁')) {
    return {
      text: content,
      textInterpretation:
        '段落以“寂静”的感受为核心，将宏大的宇宙尺度与个体的心理波动并置：天线既是技术装置，也是叙事焦点，指向一次可能改变人类命运的“接触”。',
      writingHighlights:
        '冷峻克制的语气与宏大意象形成对比；以具体物象（天线）承载抽象情绪（孤独/绝望）；节奏缓慢、画面感强，营造“临界时刻”的紧张氛围。',
      deepMeaning:
        '科技在这里不只是进步的象征，也可能成为对现实绝望后的出口：当个体遭遇文明的裂缝，向宇宙发声既是求救，也是对人类自我中心的挑战。',
      backgroundInfo:
        '【时代背景】冷战时期地外文明探索潮与特殊历史时期的心理创伤并存。\n【关键意象】“红岸天线”常被视作人类对未知的危险试探：一旦发声，后果不可逆。',
    }
  }

  if (content.includes('younger and more vulnerable years') || content.includes('Gatsby')) {
    return {
      text: content,
      textInterpretation:
        '句子以“别急着批评”为道德前提，提示叙述者保持克制与同理心。它不仅解释了尼克的叙述姿态，也为后续人物评价与事件判断设定了基准。',
      writingHighlights:
        '口语化忠告形成亲密语气；“advantages”一词将阶级差异具体化；通过父辈声音建立叙事权威，间接塑造尼克“旁观者”的可信形象。',
      deepMeaning:
        '同理心背后是对不平等的提醒：理解他人处境，并不意味着为其行为开脱，而是让评判建立在结构性差异被看见之后，从而更显悲剧的不可避免。',
      backgroundInfo:
        '【时代背景】20世纪20年代美国经济高速发展伴随道德真空与享乐主义。\n【作品母题】“美国梦”与阶级鸿沟贯穿全书，决定了人物命运的上限与破碎方式。',
    }
  }

  return {
    text: content,
    textInterpretation:
      '这段文字首先在字面层面推进场景/情节，其信息点与上下文的承接关系清晰：通过关键细节完成“人物行动—情绪走向—叙事推进”的链条。',
    writingHighlights:
      '细节描写具象可感，节奏张弛有度；用词克制但富于暗示，善于用意象/对照/重复等方式强化阅读记忆点。',
    deepMeaning:
      '文本在事件之外还在表达一种更深的情绪或价值判断：可能是对人性的复杂、关系的张力、时代氛围的压迫感的隐性呈现，读者可从反复出现的意象与转折处捕捉其主题指向。',
    backgroundInfo:
      '可结合作者所处时代、题材传统与常见文化意象来理解：同一写法在不同语境中会产生差异化指向。若你提供书名/章节/上下文，我可以更精准补充背景与创作动机。',
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

function isReadingDomainQuery(text: string) {
  const t = text.trim()
  if (!t) return false
  const hasBookWords =
    /书|书籍|作者|出版社|章节|情节|人物|结局|背景|写作|修辞|赏析|阅读|原文|段落|句子|翻译|语法|单词|英文|原著/.test(t)
  const hasEnglishHelp = /translate|meaning|grammar|word|sentence/i.test(t)
  return hasBookWords || hasEnglishHelp
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

  if (looksLikeBookSearch(userText) || directMatches.length) {
    const books = directMatches.length ? directMatches : await aiSearchBooks(userText, {})
    const top = books.slice(0, 3)
    if (!top.length) return { content: `我在书库里暂时没找到与“${userText}”匹配的书。你可以换个书名/作者/关键词试试~` }
    return {
      content: `为你在书库里找到 ${top.length} 本相关书籍：`,
      payload: { kind: 'book_cards', bookIds: top.map((b) => b.id) },
    }
  }

  if (!isReadingDomainQuery(userText)) {
    return { content: '我是你的专属阅读AI助手，能解答阅读相关、书籍相关的问题哦~' }
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

  return {
    content:
      '我可以帮你做：\n1) 书名/作者/关键词检索并给出推荐\n2) 情节梳理、人物关系、创作背景与写作手法解读\n3) 英语阅读：单词释义、句子翻译、语法解析\n4) 学习监督：制定阅读目标、打卡提醒\n5) 学习复盘：阅读周报、总结分析\n你可以把问题说得更具体一点（例如："帮我制定阅读目标"、"提醒我打卡"、"帮我复盘本周阅读"）~',
  }
}

// AI 助手模拟数据库及逻辑
export function getAIAssistantResponse(query: string): string {
  const q = query.trim().toLowerCase()

  // --- 模块一：AI 智能精读（3 条） ---
  if (q.includes('红楼梦') && q.includes('精读')) {
    return `【模块一：AI 智能精读】
书籍名：《红楼梦》

[重点总结] 3 句话总结：
1. 本书以贾、史、王、薛四大家族的兴衰为背景，描绘了一幅封建社会末世的百态图。
2. 核心线索是贾宝玉与林黛玉、薛宝钗的爱情婚姻悲剧。
3. 作品通过“真事隐去，假语村言”的叙事手法，深刻探讨了人生的幻灭感与宿命论。

[知识点卡片] 【通灵宝玉】
定义：贾宝玉出生时衔在嘴里的一块玉石，原是女娲补天剩下的顽石。
核心解读：它是宝玉命根子，象征着人的先天灵性。玉上的铭文“莫失莫忘，仙寿恒昌”与其在凡间的种种磨难形成强烈对比，暗示了无论怎样呵护，最终都难逃“白茫茫大地真干净”的宿命。

[逻辑结构图]
顽石下凡 → 荣国府繁华（大观园起社） → 家族抄家衰败 → 宝玉悬崖撒手出家

[事实核查]
有人认为《红楼梦》只是一部单纯的言情小说。其实不然，它被誉为中国封建社会的百科全书，涵盖了当时的政治、经济、文化、民俗等方方面面。`
  }

  if (q.includes('三体') && q.includes('精读')) {
    return `【模块一：AI 智能精读】
书籍名：《三体》

📌 3 句话总结：
1. 故事从红岸基地的一次越级电波发射开始，地球坐标被暴露给距地球4光年的半人马座三星系统。
2. 三体文明因其母星环境极端恶劣，决定入侵地球，并利用“智子”锁死了地球的基础科学。
3. 人类在绝望中展开了长达数百年的抗争与自救，展现了宇宙社会学中的黑暗森林法则。

🏷️ 知识点卡片：【黑暗森林法则】
定义：宇宙社会学的核心公理。
核心解读：宇宙就像一座黑暗森林，每个文明都是带枪的猎人。由于“生存是文明的第一需要”和“猜疑链”的存在，任何暴露自己位置的文明都将不可避免地遭到其他文明的打击。

🕸️ 逻辑结构图：
叶文洁按下发射键 → 三体人收到信号并派舰队出发 → 智子抵达地球锁死科学 → 面壁计划启动寻找生机

🔍 事实核查：
书中提到的“半人马座α星”在现实中是存在的，它是距离太阳系最近的恒星系统，确实包含三颗恒星（南门二A、B和比邻星），这种三星系统在引力作用下极不稳定，这是小说设定的科学基础。`
  }

  if (q.includes('小王子') && q.includes('精读')) {
    return `【模块一：AI 智能精读】
书籍名：《小王子》

📌 3 句话总结：
1. 飞行员在撒哈拉沙漠遇见了来自B612星球的小王子，听他讲述了星际旅行的见闻。
2. 小王子离开了他深爱但骄傲的玫瑰，遇到了国王、酒鬼、点灯人等，看到了成人世界的荒诞。
3. 最终在地球上，狐狸教会了他“驯养”的意义，让他懂得了爱与责任，决定重返自己的星球。

🏷️ 知识点卡片：【驯养（Tame）】
定义：狐狸对小王子解释的一个词，意为“建立联系”。
核心解读：在没有建立联系之前，事物是普遍而无意义的；一旦被“驯养”，彼此在对方生命中就变得独一无二。它揭示了爱的本质——你为你所驯养的东西花费的时间，使得它变得如此重要。

🕸️ 逻辑结构图：
B612星球（玫瑰的困扰） → 游历各星（见识成人荒诞） → 降落地球（遇见狐狸学会爱） → 被蛇咬后灵魂回归

🔍 事实核查：
很多人以为这是一本纯写给小孩的童话。作者圣埃克苏佩里在序言中明确表示，这本书是献给“曾经是孩子的大人”的，它用童话的外壳包裹了深沉的哲学思考。`
  }

  // --- 模块二：AI 学习监督伙伴（3 条） ---
  if (q.includes('目标') || q.includes('计划') || q.includes('制定')) {
    return `🎉 嗨！我是你的阅读监督伙伴！太棒了，你决定制定阅读目标啦！
我们可以把大目标拆解成小关卡，像打游戏一样通关。

🎯 **你的当前任务建议：**
- 每天阅读《The Great Gatsby》1 个章节
- 记录 3 个不认识的生词并存入单词本
- 睡前写一句心得

准备好接受挑战了吗？回复“接受挑战”，我们今天就开始计算你的阅读经验值哦！🌟`
  }

  if (q.includes('提醒') || q.includes('打卡') || q.includes('督促')) {
    return `🔔 叮咚！阅读小助手上线！

我看你今天还没有打开《万历十五年》哦！虽然我们不强制打卡，但每天哪怕只读 10 分钟，长期积累也是很惊人的。
☕ 泡杯茶，找个舒服的姿势，我们一起读完这一章吧！

💡 小提示：如果今天太累了，可以试试听一会儿“朗读”功能，闭着眼睛也能涨知识！读完记得点击右上角记个简单的笔记当做今天的打卡证明哦~`
  }

  if (q.includes('复盘') || q.includes('周报') || q.includes('总结')) {
    return `📊 **你的本周阅读周报来啦！**

🏆 **阅读成就：**
- 本周你共阅读了 5 天，累计阅读时长 142 分钟！超越了 68% 的同好！
- 你在《红楼梦》中留下了 2 条深度笔记，看来“转白话”功能帮了你不少忙。
- 你的单词本新增了 15 个词汇。

🔍 **复盘小引导：**
回顾一下，本周让你印象最深的一句话是什么？
下周我们是不是可以挑战一下《三体》的英文版片段呢？

继续保持这个节奏，你超棒的！💪`
  }

  // 默认回复
  return `你好！我是你的AI阅读助手🤖。

你可以尝试对我说：
📖 **关于书籍：**
- "三体精读"
- "红楼梦精读"
- "小王子精读"

🎯 **关于学习：**
- "帮我制定阅读目标"
- "提醒我打卡"
- "帮我复盘本周阅读"

试试看吧！`
}
