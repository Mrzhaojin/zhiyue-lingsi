export type ThemeMode = 'light' | 'dark' | 'system'

export type User = {
  id: string
  role?: 'user' | 'admin'
  nickname: string
  avatarUrl?: string
  bio?: string
  profileTag?: string
  createdAt: number
  stats: {
    readingMinutes: number
    postsCount: number
    notesCount: number
    followersCount: number
    followingCount: number
  }
  settings: {
    theme: ThemeMode
    reading: {
      fontSize: number
      lineHeight: number
      textColor: string
      backgroundColor: string
      fontFamily?: 'sans' | 'serif'
    }
    notifications: {
      like: boolean
      comment: boolean
      collect: boolean
    }
  }
}

export type BookCategory = '小说' | '社科' | '英文原著' | '散文' | '人文历史' | '健康生活' | '其他'
export type ReadingDifficulty = '入门' | '中级' | '进阶'

export type Book = {
  id: string
  title: string
  author: string
  category: BookCategory
  difficulty: ReadingDifficulty
  coverUrl?: string
  summary: string
  recommendedHeat: number
  aiReason: string
  hasAudioIntro: boolean
  audioIntroUrl?: string
  language: 'zh' | 'en'
  chapters: Array<{
    id: string
    title: string
    content: string
  }>
}

export type TopicTag = {
  id: string
  name: string
  icon?: string
  coverUrl?: string
  createdAt: number
}

export type ContentType = 'post' | 'note'

export type Post = {
  id: string
  authorId: string
  title: string
  contentText: string
  imageUrls: string[]
  tags: string[]
  createdAt: number
  updatedAt: number
  stats: {
    likes: number
    comments: number
    collects: number
    views: number
    shares: number
  }
}

export type Comment = {
  id: string
  postId: string
  authorId: string
  contentText: string
  imageUrls: string[]
  createdAt: number
  parentId?: string
}

export type NoteTemplate = 'minimal' | 'literary' | 'retro'

export type Note = {
  id: string
  authorId: string
  title: string
  contentText: string
  imageUrls: string[]
  tags: string[]
  createdAt: number
  updatedAt: number
  status: 'draft' | 'published'
  template: NoteTemplate
  shareCardDataUrl?: string
  source?: {
    bookId?: string
    chapterId?: string
    excerpt?: string
  }
  stats: {
    likes: number
    comments: number
    collects: number
    views: number
    shares: number
  }
}

export type Bookmark = {
  id: string
  userId: string
  bookId: string
  chapterId: string
  progress: number
  createdAt: number
}

export type ReadingHistory = {
  id: string
  userId: string
  bookId: string
  chapterId: string
  progress: number
  updatedAt: number
}

export type VocabItem = {
  id: string
  userId: string
  type: 'word' | 'sentence'
  text: string
  note?: string
  createdAt: number
}

export type ShelfItem = {
  userId: string
  bookId: string
  addedAt: number
}

export type Interaction = {
  id: string
  userId: string
  targetType: ContentType
  targetId: string
  kind: 'like' | 'collect'
  createdAt: number
}

export type NotificationType = 'system' | 'forum' | 'book'

export type Notification = {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  createdAt: number
  readAt?: number
  link?: {
    label: string
    to: string
  }
}

export type AIRole = 'user' | 'assistant'

export type AIChatThread = {
  id: string
  userId: string
  title: string
  createdAt: number
  updatedAt: number
}

export type AIChatMessage = {
  id: string
  threadId: string
  userId: string
  role: AIRole
  content: string
  createdAt: number
  payload?: { kind: 'book_cards'; bookIds: string[] }
}

export type AITextAnalysis = {
  text: string
  textInterpretation: string
  writingHighlights: string
  deepMeaning: string
  backgroundInfo: string
}

export type AIAnalysisRecord = {
  id: string
  userId: string
  bookId?: string
  chapterId?: string
  createdAt: number
  analysis: AITextAnalysis
}
