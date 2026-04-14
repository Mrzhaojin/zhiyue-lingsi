import type { AITextAnalysis } from '../data/models'

export async function callDoubaoAPI(prompt: string, systemPrompt?: string, retries = 3): Promise<string> {
  const apiKey = import.meta.env.VITE_DOBAO_API_KEY
  if (!apiKey) {
    throw new Error('Missing Doubao API key')
  }

  let lastError: Error | null = null
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'doubao-pro-32k',
          messages: [
            {
              role: 'system',
              content: systemPrompt || 'You are a helpful reading assistant. Provide detailed and accurate information about books, reading, and literature.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Doubao API error: ${errorData.message || response.statusText}`)
      }

      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      lastError = error as Error
      console.warn(`Doubao API call failed (attempt ${i + 1}/${retries}):`, error)
      if (i < retries - 1) {
        // 指数退避重试
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)))
      }
    }
  }

  throw lastError || new Error('Doubao API call failed after multiple attempts')
}

export async function aiAnalyzeTextWithDoubao(text: string): Promise<AITextAnalysis> {
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
    // 降级处理：返回默认分析
    return {
      text,
      textInterpretation: '文本分析服务暂时不可用，请稍后再试。',
      writingHighlights: '',
      deepMeaning: '',
      backgroundInfo: ''
    }
  }
}

export async function aiAssistantReplyWithDoubao(userText: string, history: any[]): Promise<string> {
  const prompt = `用户问题：${userText}\n\n聊天历史：${JSON.stringify(history)}\n\n请作为阅读助手，回答用户的问题，提供详细、准确的信息。`
  
  const systemPrompt = `你是一个专业的阅读助手，擅长回答关于书籍、阅读、文学等方面的问题。请：\n1. 提供准确、详细的信息\n2. 保持友好、专业的语气\n3. 针对用户的具体问题进行回答\n4. 如果需要，可以提供相关的背景知识和建议\n\n请使用中文回答。`
  
  try {
    return await callDoubaoAPI(prompt, systemPrompt)
  } catch (error) {
    console.error('Doubao API error:', error)
    return 'AI服务暂时不可用，请稍后再试。'
  }
}
