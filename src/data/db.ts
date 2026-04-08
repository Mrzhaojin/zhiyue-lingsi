import { nanoid } from 'nanoid'
import { readStorage, writeStorage } from '../lib/storage'
import type {
  AIAnalysisRecord,
  AIChatMessage,
  AIChatThread,
  Bookmark,
  Book,
  Comment,
  Interaction,
  Notification,
  Note,
  Post,
  ReadingHistory,
  ShelfItem,
  TopicTag,
  User,
  VocabItem,
} from './models'

type Database = {
  version: 4
  users: Record<string, User>
  currentUserId: string
  books: Record<string, Book>
  posts: Record<string, Post>
  comments: Record<string, Comment>
  notes: Record<string, Note>
  tags: Record<string, TopicTag>
  interactions: Record<string, Interaction>
  bookmarks: Record<string, Bookmark>
  readingHistory: Record<string, ReadingHistory>
  vocab: Record<string, VocabItem>
  notifications: Record<string, Notification>
  shelves: Record<string, ShelfItem[]>
  aiChatThreads: Record<string, AIChatThread>
  aiChatMessages: Record<string, AIChatMessage>
  aiAnalysisRecords: Record<string, AIAnalysisRecord>
  admin: {
    pinnedPostIds: string[]
    featuredPostIds: string[]
    bannedKeywords: string[]
  }
}

const STORAGE_KEY = 'read_forum_db_v5'

function now() {
  return Date.now()
}

function migrateToV4(input: Partial<Database>): Database {
  const db = input as Database
  db.version = 4
  if (!db.shelves) db.shelves = {}
  if (!db.notifications) db.notifications = {}
  if (!db.aiChatThreads) db.aiChatThreads = {}
  if (!db.aiChatMessages) db.aiChatMessages = {}
  if (!db.aiAnalysisRecords) db.aiAnalysisRecords = {}
  if (!db.admin) {
    db.admin = { pinnedPostIds: [], featuredPostIds: [], bannedKeywords: ['赌博', '色情', '违法', '诈骗'] }
  }
  if (!db.admin.bannedKeywords) db.admin.bannedKeywords = ['赌博', '色情', '违法', '诈骗']
  return db
}

function ensureSciFiTopicSeed(db: Database) {
  const tagName = '#科幻推荐'
  const hasSciFiPost = Object.values(db.posts).some((p) => p.tags.includes(tagName))
  const hasSciFiNote = Object.values(db.notes).some((n) => n.status === 'published' && n.tags.includes(tagName))
  if (hasSciFiPost || hasSciFiNote) return false

  const settings =
    db.users[db.currentUserId]?.settings ??
    Object.values(db.users)[0]?.settings ?? {
      theme: 'system' as const,
      reading: {
        fontSize: 18,
        lineHeight: 1.7,
        textColor: '#111827',
        backgroundColor: '#ffffff',
        fontFamily: 'sans' as const,
      },
      notifications: { like: true, comment: true, collect: true },
    }

  const ensureTag = (name: string) => {
    const normalized = name.startsWith('#') ? name : `#${name}`
    const existing = Object.values(db.tags).find((t) => t.name === normalized)
    if (existing) return existing
    const tag: TopicTag = { id: nanoid(), name: normalized, createdAt: now() - 1000 * 60 * 60 * 24 * 7 }
    db.tags[tag.id] = tag
    return tag
  }

  ensureTag(tagName)
  ensureTag('#小说情节分析')
  ensureTag('#阅读心得')
  ensureTag('#小众好书分享')

  const mkUser = (input: Pick<User, 'nickname' | 'bio' | 'profileTag'> & { seed: string; createdAt: number }) => {
    const id = nanoid()
    const user: User = {
      id,
      role: 'user',
      nickname: input.nickname,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(input.seed)}`,
      bio: input.bio,
      profileTag: input.profileTag,
      createdAt: input.createdAt,
      stats: {
        readingMinutes: Math.floor(120 + Math.random() * 2400),
        postsCount: 0,
        notesCount: 0,
        followersCount: Math.floor(Math.random() * 200),
        followingCount: Math.floor(5 + Math.random() * 80),
      },
      settings,
    }
    db.users[id] = user
    return id
  }

  const baseCreatedAt = now() - 1000 * 60 * 60 * 24 * 14
  const u1 = mkUser({
    nickname: '沙丘行者',
    seed: 'DuneWalker',
    bio: '偏爱硬科幻与世界观构建，喜欢长线系列。',
    profileTag: '宇宙航行',
    createdAt: baseCreatedAt,
  })
  const u2 = mkUser({
    nickname: '量子抬杠王',
    seed: 'QuantumDebater',
    bio: '设定党，看到不自洽会忍不住开麦。',
    profileTag: '设定控',
    createdAt: baseCreatedAt + 1000 * 60 * 60 * 24 * 2,
  })
  const u3 = mkUser({
    nickname: '星际考古学家',
    seed: 'StarArchaeologist',
    bio: '冷门佳作挖掘机，尤其喜欢新怪谭与太空歌剧。',
    profileTag: '冷门推荐',
    createdAt: baseCreatedAt + 1000 * 60 * 60 * 24 * 4,
  })
  const u4 = mkUser({
    nickname: '时间旅行社',
    seed: 'TimeAgency',
    bio: '时间旅行题材爱好者：悖论、闭环、分支宇宙都来。',
    profileTag: '时间悖论',
    createdAt: baseCreatedAt + 1000 * 60 * 60 * 24 * 7,
  })

  const mkPost = (input: Pick<Post, 'authorId' | 'title' | 'contentText' | 'tags'> & { createdAt: number; stats: Post['stats'] }) => {
    const id = nanoid()
    const post: Post = {
      id,
      authorId: input.authorId,
      title: input.title,
      contentText: input.contentText,
      imageUrls: [],
      tags: input.tags,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      stats: input.stats,
    }
    db.posts[id] = post
    const author = db.users[input.authorId]
    if (author) {
      author.stats.postsCount += 1
    }
    return id
  }

  const mkComment = (input: Pick<Comment, 'postId' | 'authorId' | 'contentText' | 'parentId'> & { createdAt: number }) => {
    const id = nanoid()
    const c: Comment = {
      id,
      postId: input.postId,
      authorId: input.authorId,
      contentText: input.contentText,
      imageUrls: [],
      createdAt: input.createdAt,
      parentId: input.parentId,
    }
    db.comments[id] = c
    return id
  }

  const p1 = mkPost({
    authorId: u1,
    title: '求推荐：像《沙丘》这种“政治+宗教+生态”大世界观的科幻还有哪些？',
    contentText:
      '最近把《沙丘》六部补完，最上头的不是打斗而是“势力博弈 + 生态链条 + 神话叙事”。想找同类型：世界观厚、但叙事不拖沓。你们会推荐哪本？',
    tags: [tagName, '#小众好书分享', '#阅读心得'],
    createdAt: now() - 1000 * 60 * 60 * 30,
    stats: { likes: 44, comments: 6, collects: 18, views: 680, shares: 2 },
  })
  const p2 = mkPost({
    authorId: u3,
    title: '冷门安利：太空歌剧不只有热闹，还有“人类学式”异文明描写',
    contentText:
      '有些科幻读起来像在看宇宙版田野调查：语言、礼仪、科技与信仰绑在一起。比起“战舰轰轰轰”，这种更耐嚼。你们心里最强异文明是哪部？',
    tags: [tagName, '#阅读心得'],
    createdAt: now() - 1000 * 60 * 60 * 22,
    stats: { likes: 31, comments: 5, collects: 12, views: 512, shares: 1 },
  })
  const p3 = mkPost({
    authorId: u2,
    title: '讨论：科幻设定的“硬度”到底怎么衡量？',
    contentText:
      '我经常看到“这不硬”“这太软”的争论。我的直觉是：硬不等于堆名词，而是设定能否推演、约束是否自洽、故事是否尊重约束。你们的标准是什么？',
    tags: [tagName, '#小说情节分析'],
    createdAt: now() - 1000 * 60 * 60 * 18,
    stats: { likes: 52, comments: 7, collects: 9, views: 740, shares: 4 },
  })
  const p4 = mkPost({
    authorId: u4,
    title: '时间旅行题材避雷与推荐：我最怕“随便改过去”',
    contentText:
      '时间旅行只要不讲规则就很容易塌房：一句“我回去改变一下”就把所有张力抹掉。你们喜欢“闭环”“分支”还是“单时间线”模型？有没有规则写得特别稳的作品？',
    tags: [tagName, '#小说情节分析', '#阅读心得'],
    createdAt: now() - 1000 * 60 * 60 * 12,
    stats: { likes: 40, comments: 6, collects: 11, views: 560, shares: 2 },
  })

  const p1c1 = mkComment({
    postId: p1,
    authorId: u3,
    contentText: '如果你喜欢“生态/社会系统”那种整体感，可以试试更偏社会学设定的作品：看完会一直回味“制度如何塑造人”。',
    createdAt: now() - 1000 * 60 * 60 * 26,
    parentId: undefined,
  })
  mkComment({
    postId: p1,
    authorId: u2,
    contentText: '同意“系统感”重要。还有一类是把资源约束写进叙事里：每次决策都像在做最优化，读起来很爽。',
    createdAt: now() - 1000 * 60 * 60 * 25,
    parentId: undefined,
  })
  mkComment({
    postId: p1,
    authorId: u1,
    contentText: '“资源约束做最优化”这个说法太精准了。就是那种每一步都不浪费的推进感。',
    createdAt: now() - 1000 * 60 * 60 * 24 + 1000 * 60 * 12,
    parentId: p1c1,
  })
  mkComment({
    postId: p1,
    authorId: u4,
    contentText: '如果你愿意接受一点“时间线/宏大叙事”，会有一些作品把文明兴衰写得特别像历史书。',
    createdAt: now() - 1000 * 60 * 60 * 23,
    parentId: undefined,
  })
  mkComment({
    postId: p1,
    authorId: u3,
    contentText: '对，我就爱这种“像历史书”的口味。读完会忍不住做时间线和势力关系图。',
    createdAt: now() - 1000 * 60 * 60 * 22 + 1000 * 60 * 40,
    parentId: undefined,
  })
  mkComment({
    postId: p1,
    authorId: u1,
    contentText: '我今晚就按你说的去做关系图，感觉会很带感。',
    createdAt: now() - 1000 * 60 * 60 * 22 + 1000 * 60 * 10,
    parentId: undefined,
  })

  mkComment({
    postId: p2,
    authorId: u1,
    contentText: '我也很吃“异文明像真的存在”这种写法。语言/礼仪如果能影响冲突走向，就会特别有说服力。',
    createdAt: now() - 1000 * 60 * 60 * 21,
    parentId: undefined,
  })
  const p2c2 = mkComment({
    postId: p2,
    authorId: u2,
    contentText: '异文明最怕“换皮人类”。能把认知结构写到跟人类不一样，才算狠。',
    createdAt: now() - 1000 * 60 * 60 * 20 + 1000 * 60 * 20,
    parentId: undefined,
  })
  mkComment({
    postId: p2,
    authorId: u3,
    contentText: '对，所以我经常看完会回头检查：作者有没有让“文化差异”变成剧情的硬约束，而不是装饰。',
    createdAt: now() - 1000 * 60 * 60 * 20,
    parentId: p2c2,
  })
  mkComment({
    postId: p2,
    authorId: u4,
    contentText: '如果再加上“信息延迟/交流成本”这种物理约束，异文明冲突会更立体。',
    createdAt: now() - 1000 * 60 * 60 * 19,
    parentId: undefined,
  })
  mkComment({
    postId: p2,
    authorId: u3,
    contentText: '说到信息延迟，我立刻想到很多“第一次接触”的经典套路：越沟通越误会，越误会越危险。',
    createdAt: now() - 1000 * 60 * 60 * 18 + 1000 * 60 * 35,
    parentId: undefined,
  })

  mkComment({
    postId: p3,
    authorId: u3,
    contentText: '我更在意“约束能否反噬角色”：如果设定只是背景板，那再硬也像摆设。',
    createdAt: now() - 1000 * 60 * 60 * 17,
    parentId: undefined,
  })
  mkComment({
    postId: p3,
    authorId: u1,
    contentText: '赞同。最好的“硬度”不是解释，而是让角色不得不在约束下做选择。',
    createdAt: now() - 1000 * 60 * 60 * 16 + 1000 * 60 * 25,
    parentId: undefined,
  })
  const p3c3 = mkComment({
    postId: p3,
    authorId: u2,
    contentText: '还有一点：推演成本。读者能不能沿着设定推到同样的结论？如果完全靠作者拍脑袋，那就不行。',
    createdAt: now() - 1000 * 60 * 60 * 16,
    parentId: undefined,
  })
  mkComment({
    postId: p3,
    authorId: u4,
    contentText: '时间旅行题材尤其需要“推演成本”，否则就是随便开挂。',
    createdAt: now() - 1000 * 60 * 60 * 15,
    parentId: p3c3,
  })
  mkComment({
    postId: p3,
    authorId: u3,
    contentText: '总结一句：硬不硬看“设定有没有把故事逼到角落里”。',
    createdAt: now() - 1000 * 60 * 60 * 14,
    parentId: undefined,
  })
  mkComment({
    postId: p3,
    authorId: u1,
    contentText: '这句太对了，“逼到角落里”才会出现真正的科幻选择题。',
    createdAt: now() - 1000 * 60 * 60 * 13 + 1000 * 60 * 40,
    parentId: undefined,
  })
  mkComment({
    postId: p3,
    authorId: u2,
    contentText: '而且还得让答案不是唯一的，读者才会吵起来，这才是讨论区的灵魂。',
    createdAt: now() - 1000 * 60 * 60 * 12 + 1000 * 60 * 10,
    parentId: undefined,
  })

  mkComment({
    postId: p4,
    authorId: u2,
    contentText: '我最怕“想回就回”。如果没有代价/没有约束，时间旅行就只剩下作者想怎么写怎么写。',
    createdAt: now() - 1000 * 60 * 60 * 11,
    parentId: undefined,
  })
  const p4c2 = mkComment({
    postId: p4,
    authorId: u3,
    contentText: '我偏爱闭环：一旦闭起来就特别有宿命感，所有细节都能对上。',
    createdAt: now() - 1000 * 60 * 60 * 10 + 1000 * 60 * 5,
    parentId: undefined,
  })
  mkComment({
    postId: p4,
    authorId: u4,
    contentText: '闭环写得好确实爽，读第二遍像在做解谜。分支宇宙也行，但得把“分支”的触发写清楚。',
    createdAt: now() - 1000 * 60 * 60 * 10,
    parentId: p4c2,
  })
  mkComment({
    postId: p4,
    authorId: u1,
    contentText: '单时间线我也能接受，前提是“改过去”一定伴随损失：你救了一个人，世界就会拿走别的东西。',
    createdAt: now() - 1000 * 60 * 60 * 9,
    parentId: undefined,
  })
  mkComment({
    postId: p4,
    authorId: u3,
    contentText: '对，有代价才有张力。否则一切都可以用时光机重来。',
    createdAt: now() - 1000 * 60 * 60 * 8 + 1000 * 60 * 12,
    parentId: undefined,
  })
  mkComment({
    postId: p4,
    authorId: u4,
    contentText: '我准备整理一个“规则写得稳的时间旅行书单”，回头发到本话题里继续补充。',
    createdAt: now() - 1000 * 60 * 60 * 7,
    parentId: undefined,
  })

  return true
}

function ensureMissingSeedBooks(db: Database) {
  const has = Object.values(db.books).some((b) => b.title === '饮食术')
  if (has) return false

  const id = nanoid()
  const book: Book = {
    id,
    title: '饮食术',
    author: '牧田善二',
    category: '健康生活',
    difficulty: '入门',
    coverUrl: 'https://images.unsplash.com/photo-1490818387583-1b5ba2222703?auto=format&fit=crop&w=300&q=80',
    summary: '“匠心书单”生活指南。科学的控糖指南，让你通过饮食保持健康与精力。',
    recommendedHeat: 85,
    aiReason: '实用性极强，适合做生活方式类的笔记。',
    hasAudioIntro: false,
    language: 'zh',
    chapters: [
      {
        id: nanoid(),
        title: '第一章',
        content:
          '我们现在的身体，是由我们过去所吃的东西构成的。这是一个简单却深刻的事实。在现代社会，我们被各种精制糖和高热量食物所包围，这导致了糖尿病、肥胖和心血管疾病的高发。我想告诉大家，通过科学的控糖饮食，我们不仅可以减轻体重，还可以显著提升精力。血糖值的剧烈波动是导致疲劳和精神不集中的罪魁祸首。当我们摄入大量的碳水化合物时，血糖会迅速升高，胰岛素随之大量分泌，导致血糖又迅速下降，这种“过山车”式的变化会让大脑感到极度疲劳。因此，选择低GI食物，合理搭配蛋白质和脂肪，是保持健康的基石。',
      },
      {
        id: nanoid(),
        title: '第二章',
        content:
          '血糖值的剧烈波动是导致疲劳和精神不集中的罪魁祸首。为了保持全天候的高效，我们需要学会控制自己的血糖。首先，吃早餐是非常重要的，它可以为大脑提供全天所需的能量。其次，午餐时要避免摄入过多的主食，尤其是那些精制的米面。最后，晚餐要尽量清淡，避免在临睡前摄入高糖食物。通过这些细微的改变，我们可以显著改善自己的生活质量。健康不是一蹴而就的，而是一种持之以恒的生活态度。从今天开始，关注你吃进去的每一口食物，让身体重新焕发活力。',
      },
    ],
  }

  db.books[id] = book
  return true
}

function createSeedDb(): Database {
  const userId = nanoid()
  const baseUser: User = {
    id: userId,
    role: 'user',
    nickname: '新手读者',
    avatarUrl: undefined,
    bio: '记录阅读，分享交流',
    profileTag: '安静阅读',
    createdAt: now(),
    stats: {
      readingMinutes: 86,
      postsCount: 2,
      notesCount: 2,
      followersCount: 12,
      followingCount: 8,
    },
    settings: {
      theme: 'system',
      reading: {
        fontSize: 18,
        lineHeight: 1.7,
        textColor: '#111827',
        backgroundColor: '#ffffff',
        fontFamily: 'sans',
      },
      notifications: {
        like: true,
        comment: true,
        collect: true,
      },
    },
  }

  const user2Id = nanoid()
  const user3Id = nanoid()
  const user4Id = nanoid()
  const user5Id = nanoid()
  const user6Id = nanoid()
  const user7Id = nanoid()
  const user8Id = nanoid()
  
  const users: Record<string, User> = {
    [userId]: { ...baseUser, avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
    [user2Id]: {
      id: user2Id,
      role: 'user',
      nickname: '星空漫步者',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
      bio: '科幻迷，三体狂热粉',
      profileTag: '科幻达人',
      createdAt: now() - 1000 * 60 * 60 * 24 * 10,
      stats: { readingMinutes: 1200, postsCount: 5, notesCount: 10, followersCount: 45, followingCount: 20 },
      settings: baseUser.settings
    },
    [user3Id]: {
      id: user3Id,
      role: 'user',
      nickname: '静水流深',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
      bio: '文学爱好者，喜欢慢慢品味',
      profileTag: '文学青年',
      createdAt: now() - 1000 * 60 * 60 * 24 * 5,
      stats: { readingMinutes: 800, postsCount: 3, notesCount: 15, followersCount: 30, followingCount: 12 },
      settings: baseUser.settings
    },
    [user4Id]: {
      id: user4Id,
      role: 'user',
      nickname: '午夜飞行',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
      bio: '夜猫子，喜欢在深夜阅读悬疑小说',
      profileTag: '悬疑迷',
      createdAt: now() - 1000 * 60 * 60 * 24 * 15,
      stats: { readingMinutes: 2100, postsCount: 12, notesCount: 5, followersCount: 88, followingCount: 34 },
      settings: baseUser.settings
    },
    [user5Id]: {
      id: user5Id,
      role: 'user',
      nickname: '书海泛舟',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia',
      bio: '历史社科类书籍重度依赖者',
      profileTag: '历史达人',
      createdAt: now() - 1000 * 60 * 60 * 24 * 30,
      stats: { readingMinutes: 4500, postsCount: 25, notesCount: 40, followersCount: 320, followingCount: 56 },
      settings: baseUser.settings
    },
    [user6Id]: {
      id: user6Id,
      role: 'user',
      nickname: '橘子汽水',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
      bio: '青春文学，轻小说爱好者',
      profileTag: '元气少女',
      createdAt: now() - 1000 * 60 * 60 * 24 * 2,
      stats: { readingMinutes: 150, postsCount: 1, notesCount: 0, followersCount: 5, followingCount: 10 },
      settings: baseUser.settings
    },
    [user7Id]: {
      id: user7Id,
      role: 'user',
      nickname: '代码狂人',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
      bio: '只看技术书，偶尔看看科幻',
      profileTag: '技术宅',
      createdAt: now() - 1000 * 60 * 60 * 24 * 60,
      stats: { readingMinutes: 3000, postsCount: 8, notesCount: 22, followersCount: 150, followingCount: 40 },
      settings: baseUser.settings
    },
    [user8Id]: {
      id: user8Id,
      role: 'user',
      nickname: '晨光熹微',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aiden',
      bio: '早起阅读，坚持每日打卡',
      profileTag: '自律达人',
      createdAt: now() - 1000 * 60 * 60 * 24 * 20,
      stats: { readingMinutes: 1800, postsCount: 15, notesCount: 30, followersCount: 120, followingCount: 25 },
      settings: baseUser.settings
    }
  }

  const tags: TopicTag[] = [
    { id: nanoid(), name: '#科幻推荐', createdAt: now() },
    { id: nanoid(), name: '#经典名著推荐', createdAt: now() },
    { id: nanoid(), name: '#英文原著推荐', createdAt: now() },
    { id: nanoid(), name: '#小众好书分享', createdAt: now() },
    { id: nanoid(), name: '#英文原著打卡', createdAt: now() },
    { id: nanoid(), name: '#每日阅读打卡', createdAt: now() },
    { id: nanoid(), name: '#名著精读打卡', createdAt: now() },
    { id: nanoid(), name: '#名著解读', createdAt: now() },
    { id: nanoid(), name: '#小说情节分析', createdAt: now() },
    { id: nanoid(), name: '#散文赏析', createdAt: now() },
    { id: nanoid(), name: '#阅读心得', createdAt: now() },
    { id: nanoid(), name: '#读书疑问求解', createdAt: now() },
    { id: nanoid(), name: '#跨书籍对比', createdAt: now() },
  ]

  const sampleBooks: Book[] = [
    {
      id: nanoid(),
      title: '小王子',
      author: '圣埃克苏佩里',
      category: '小说',
      difficulty: '入门',
      coverUrl: '/covers/xiaowangzi.png',
      summary: '一段关于爱、责任与成长的旅程。',
      recommendedHeat: 92,
      aiReason: '语言简洁但寓意深，适合做精读与摘抄笔记。',
      hasAudioIntro: true,
      audioIntroUrl: 'https://example.com/audio/little-prince.mp3',
      language: 'zh',
      chapters: [
        {
          id: nanoid(),
          title: '第一章',
          content:
            '当我还是一个六岁的孩子时，我在一本描写原始森林的名叫《真实的故事》的书里，看到一副精彩的插画……',
        },
        {
          id: nanoid(),
          title: '第二章',
          content: '我就这样独自生活了很久，没有一个可以真正谈心的人，直到六年前在撒哈拉沙漠发生了那次故障……',
        },
      ],
    },
    {
      id: nanoid(),
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      category: '英文原著',
      difficulty: '中级',
      coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=300&q=80',
      summary:
        'A classic romance that explores manners, upbringing, morality, and marriage in early 19th-century England.',
      recommendedHeat: 88,
      aiReason: '对话多、句型典型，适合英语学习模式做词句积累。',
      hasAudioIntro: false,
      language: 'en',
      chapters: [
        {
          id: nanoid(),
          title: 'Chapter 1',
          content:
            'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.\n\nHowever little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
        },
      ],
    },
    {
      id: nanoid(),
      title: '红楼梦',
      author: '曹雪芹',
      category: '小说',
      difficulty: '进阶',
      coverUrl: '/covers/hongloumeng.png',
      summary: '中国古代四大名著之首，也是“匠心书单”极力推荐的文学巅峰。',
      recommendedHeat: 99,
      aiReason: '文学价值极高，人物刻画细腻，是理解中国传统文化的必读书目。',
      hasAudioIntro: true,
      language: 'zh',
      chapters: [
        { 
          id: nanoid(), 
          title: '第一回：甄士隐梦幻识通灵', 
          content: `此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。故曰“甄士隐”云云。但书中所记何事何人？自又云：“今风尘碌碌，一事无成，忽念及当日所有之女子，一一细考较去，觉其行止见识，皆出于我之上。何我堂堂须眉，诚不若彼裙钗哉？实愧则有余，悔又无益之大无可奈何之日也。

当日地陷东南，这东南一隅有处曰姑苏，有城曰阊门者，最是红尘中一二等富贵风流之地。正当阊门外有个十里街，街内有个仁清巷，巷内有个古庙，榜名曰“葫芦庙”。庙旁住着一家乡宦，姓甄，名费，字士隐。嫡妻封氏，情性贤淑，深明礼义。家中虽不甚富贵，然本地便也推他为望族了。因这甄士隐禀性恬淡，不以功名为念，每日只以观花修竹，酌酒吟诗为乐，倒是神仙一流人品。

只是一件不足：年已半百，膝下无儿，只有一女，乳名唤作英莲，年方三岁。一日，炎夏永昼，士隐于书房闲坐，手执菱花，不知不觉掩卷伏几而卧。梦中来到一处，见一僧一道，在那里闲谈。那僧道说道：“此处有个蠢物，倒也有些来历。因这蠢物在凡间受了许多磨难，如今又要去走一遭。”那道人便问：“何谓蠢物？”那僧便向袖中取出一物，递与那道人看。原来是一块鲜明莹洁的玉石，上面刻着“通灵宝玉”四个大字。此石原是女娲补天所剩的一块顽石，因未被选中补天，幻化成人形，随僧道下凡历劫。`
        },
        { 
          id: nanoid(), 
          title: '第二回：贾夫人仙逝扬州城', 
          content: `却说封肃因听见公差传唤，忙出来迎接。那公差见了封肃，却是不认得，便问道：“甄爷可在家里？”封肃忙陪笑问道：“那一位甄爷？”公差道：“还有那一位甄爷？自然是那隔壁葫芦庙旁的甄老爷了。”封肃听了，心内一惊，忙道：“他是我女婿。因他家遭了火灾，没处栖身，才在我这里的。”

公差道：“原来如此。我们太爷今日到任，路过此地，见那葫芦庙里一派荒凉，便问起根由。有人说起这甄老爷，说是位大大的名士。太爷便叫我们来请。”封肃听了，方才放下心来，忙进去告诉了士隐。士隐听了，也吃了一惊，想道：“这位太爷是谁？我并不认识。”

因见封肃催促，没奈何，只得勉强出来。见了公差，那公差倒也客气。士隐跟着公差来到官驿。只见那太爷生得仪容不俗，眉目清秀。那太爷见了士隐，忙起身相迎，口称“老先生”。士隐忙施礼道：“不敢。请教大人贵姓？”那太爷道：“晚生姓贾，名化，字雨村。”士隐听了，方才想起：这贾雨村正是当年在葫芦庙里寄居的那个穷儒。当年曾赠他银两，让他进京赶考，不想今日竟做了官。贾雨村此时已是新任知府，却因贪酷被革职，正值林如海为其谋求复职之机。`
        }
      ]
    },
    {
      id: nanoid(),
      title: '1984',
      author: 'George Orwell',
      category: '小说',
      difficulty: '进阶',
      coverUrl: 'https://images.unsplash.com/photo-1524578271613-d550eacf6090?auto=format&fit=crop&w=300&q=80',
      summary: 'A dystopian masterpiece and a key part of the "Ingenuity Booklist".',
      recommendedHeat: 96,
      aiReason: 'Classic political satire that explores themes of surveillance and totalitarianism.',
      hasAudioIntro: true,
      language: 'en',
      chapters: [
        { id: nanoid(), title: 'Chapter 1', content: 'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him. The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features. Winston made for the stairs. It was no use trying the lift. Even at the best of times it was seldom working, and at present the electric current was cut off during daylight hours. It was part of the economy drive in preparation for Hate Week. The flat was seven flights up, and Winston, who was thirty-nine and had a varicose ulcer above his right ankle, went slowly, resting several times on the way. On each landing, opposite the lift-shaft, the poster with the enormous face gazed from the wall. It was one of those pictures which are so contrived that the eyes follow you about when you move. BIG BROTHER IS WATCHING YOU, the caption beneath it ran.' },
        { id: nanoid(), title: 'Chapter 2', content: 'As he put his hand to the door-knob Winston saw that he had left the diary open on the table. DOWN WITH BIG BROTHER was written all over it, in letters almost large enough to be legible from the other end of the room. It was an inconceivable folly. He was terrified. He felt as though he were walking through a minefield. The party was everywhere. Thoughtcrime does not entail death: thoughtcrime IS death. Now he had started to write, he was committed. He was already a dead man. The telescreen, with its never-sleeping eye, would catch him sooner or later. But he could not stop. He began to write again, his hand shaking slightly but his heart filled with a strange, cold determination. He thought of the world outside, where the sun was shining on the gray buildings of London, and of the ministry of truth, where his daily work involved the systematic destruction of the past. He was a small, lonely figure in a world that had forgotten what it meant to be human.' }
      ]
    },
    {
      id: nanoid(),
      title: '围城',
      author: '钱钟书',
      category: '小说',
      difficulty: '中级',
      coverUrl: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=300&q=80',
      summary: '“匠心书单”经典推荐。婚姻是一座围城，城外的人想冲进去，城里的人想逃出来。',
      recommendedHeat: 92,
      aiReason: '幽默讽刺，语言功底深厚，对人性及知识分子生活有深刻洞察。',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '第一章', content: '红海早经过了，船在印度洋面上开驶着，但是太阳依然不饶人地迟落早起，侵占了夜的时间。在这大而无当的海洋上，人似乎变得极其渺小。方鸿渐坐在甲板上，看着远处海天一色的景象，心中却充满了某种难以言说的怅惘。他刚从欧洲求学归来，带回来的不仅是一张并不存在的博士文凭，还有一身洗不掉的孤独。船上的生活是单调的，除了吃饭、睡觉，就是看着那些阔太太们在甲板上打牌，或者是听着那些自命不凡的留学生们高谈阔论。在这个移动的孤岛上，每个人都像是在扮演着某种角色，而方鸿渐觉得自己更像是一个观众，一个随时准备逃离的观众。他想起在故乡的父亲，想起那些曾经寄予厚望的亲友，心中不禁感到一阵沉重。留学几载，他并没有找到所谓的真理，反而更加深切地体会到了人生的荒诞与无奈。' },
        { id: nanoid(), title: '第二章', content: '方鸿渐回到上海，就像是重新踏入了另一种围城，家里的期望与社会的现实交织在一起。上海的街道依旧繁华，但这种繁华在方鸿渐眼中却透着一种虚伪的冰冷。他开始寻找工作，却发现那些所谓的头衔和文凭在真正的利益面前显得如此苍白无力。他去拜访那些所谓的故交，却发现每个人都躲在自己的小圈子里，用警惕的眼光打量着外面的世界。婚姻的问题也被提上了日程，家里人开始张罗着为他相亲，而方鸿渐对这些琐事感到厌恶之极。他觉得自己像是被某种无形的力量推着走，无法停下脚步，也无法改变方向。在这个喧嚣的城市里，他感到前所未有的孤独，仿佛自己是一个异乡人，永远无法融入这片土地。' }
      ]
    },
    {
      id: nanoid(),
      title: '三体',
      author: '刘慈欣',
      category: '小说',
      difficulty: '进阶',
      coverUrl: '/covers/santi.png',
      summary: '“匠心书单”科幻力作，展示了人类文明与宇宙外星文明的生存博弈。',
      recommendedHeat: 98,
      aiReason: '宏大的宇宙观与硬核科学设想，是现代中国科幻的里程碑。',
      hasAudioIntro: true,
      language: 'zh',
      chapters: [
        { 
          id: nanoid(), 
          title: '第一章：红岸基地', 
          content: `叶文洁在那台巨大的天线前，感受着来自宇宙深处的寂静。她不知道，这一按键将改变全人类的命运。大兴安岭的寒风在耳边呼啸，雷达峰上的积雪终年不化。红岸基地，这个曾经的国家最高机密，如今在她眼中只是一片荒凉的遗迹。她想起了父亲，想起了那些在大动荡中逝去的岁月，心中唯有死一般的寂静。

巨大的抛物面天线像一只巨大的眼睛，凝视着深邃的苍穹。叶文洁坐在操作台前，手指轻轻触碰着那些冰冷的按键。她正在向太阳发射一束高功率的无线电信号，试图利用太阳的增益反射效应，将人类的声音传向宇宙的更深处。这是一种疯狂的举动，在那个科学被政治笼罩的年代，任何一点出格的行为都可能导致毁灭性的后果。

然而，叶文洁已经不在乎了。她对这个文明已经彻底失望，她渴望某种更高维度的力量来介入这个混乱的世界。信号发射了，像一颗投入平静湖面的石子，在宇宙的电磁波海洋中激起了一道微弱的涟漪。她静静地等待着，尽管她知道，回响可能在几光年甚至几百光年之后才会到来。在那一刻，她感到一种前所未有的解脱，仿佛自己已经超越了这片苦难的土地。人类文明的坐标，就这样在不经意间暴露在了浩瀚的星空之中。`
        },
        { 
          id: nanoid(), 
          title: '第二章：科学边界', 
          content: `汪淼发现，物理学在某些时刻，似乎真的不存在了。倒计时在他眼前不断跳动，像是一个幽灵在耳边低语。作为一名纳米材料专家，他习惯了严谨的逻辑和精确的实验，但最近发生的一系列自杀事件，彻底颠覆了他的认知。那些顶尖的物理学家们，仿佛在同一时间看到了某种无法理解的真相，从而选择了终结自己的生命。

“物理学从来就没有存在过，将来也不会存在。”这句话在汪淼脑海中不断回响。他参加了名为“科学边界”的学术组织，试图从中寻找答案，却陷入了更深的迷雾。申玉菲，那个冷若冰霜的女人，告诉他要观察宇宙背景辐射的整体闪烁。这在现有的物理学理论中是绝对不可能发生的，但汪淼亲眼见证了那个神迹。

宇宙在闪烁。在那一刻，汪淼感到一种彻骨的恐惧。如果连宇宙的基本常数都是可以被随意修改的，那么人类所建立的一切科学大厦，都不过是建立在沙滩上的幻影。他开始怀疑自己的感官，怀疑周围的一切。倒计时依然在跳动，每一个数字的跳动都像是在宣判人类文明的末日。他意识到，人类正面临着一个前所未有的危机，一个来自星空深处的巨大阴影正在悄然降临。这种闪烁并非自然的律动，而更像是某种高等文明对低等文明的戏谑。`
        }
      ]
    },
    {
      id: nanoid(),
      title: '活着',
      author: '余华',
      category: '小说',
      difficulty: '入门',
      coverUrl: 'https://images.unsplash.com/photo-1495640388908-05fa85288e61?auto=format&fit=crop&w=300&q=80',
      summary: '“匠心书单”感人至深之作。讲述了一个人一生的苦难与坚韧。',
      recommendedHeat: 95,
      aiReason: '文字简练有力，情感真挚，探讨了生命在极端苦难中的尊严。',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '第一章', content: '我比现在年轻十岁的时候，获得了一个游手好闲的工作，就是去乡间收集民谣。那是一个阳光灿烂的下午，我走在田埂上，远远地看到一个老人在地里干活。他牵着一头同样苍老的牛，在夕阳下缓慢地移动着。那就是福贵。他停下手中的活计，坐在树荫下，开始向我讲述他的一生。他的声音沙哑而平静，仿佛在讲述别人的故事。他说起当年的阔少爷生活，说起那个因为赌博而输掉整个家产的夜晚，说起父亲在气急败坏中去世的情景。他的眼神中没有悲伤，只有一种看透世事的淡然。他说，活着本身就是一种力量，无论生活给予了多少苦难，我们都要努力地走下去。' },
        { id: nanoid(), title: '第二章', content: '福贵老了，他牵着那头同样苍老的牛，在夕阳下讲述着过去的故事。他想起了家珍，那个一直默默支持他的妻子；想起了凤霞和有庆，那些在苦难中夭折的孩子。他的一生充满了离别与失去，但他依然活着，像那棵老树一样，扎根在这片贫瘠的土地上。他说，人是为了活着本身而活着的，而不是为了活着之外的任何事物。这种朴素的哲学在那个动荡的年代显得尤为珍贵。他看着远处的村庄，看着升起的炊烟，心中感到一种莫名的平静。生活还在继续，尽管他已经一无所有，但他拥有了这份活着的权利，这就是他最大的财富。' }
      ]
    },
    {
      id: nanoid(),
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      category: '英文原著',
      difficulty: '中级',
      coverUrl: 'https://images.unsplash.com/photo-1474366521946-c3d4b507abf2?auto=format&fit=crop&w=300&q=80',
      summary: 'A definitive novel of the Jazz Age, featured in the "Ingenuity Booklist".',
      recommendedHeat: 90,
      aiReason: 'Beautiful prose and a timeless critique of the American Dream.',
      hasAudioIntro: true,
      language: 'en',
      chapters: [
        { 
          id: nanoid(), 
          title: 'Chapter 1', 
          content: `In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since. "Whenever you feel like criticizing anyone," he told me, "just remember that all the people in this world haven’t had the advantages that you’ve had." He didn’t say any more, but we’ve always been unusually communicative in a reserved way, and I understood that he meant a great deal more than that. In consequence, I’m inclined to reserve all judgments, a habit that has opened up many curious natures to me and also made me the victim of not a few veteran bores.

The abnormal mind is quick to detect and attach itself to this quality when it appears in a normal person, and so it came about that in college I was unjustly accused of being a politician, because I was privy to the secret griefs of wild, unknown men. Most of the confidences were unsought—frequently I have feigned sleep, preoccupation, or a hostile levity when I realized by some unmistakable sign that an intimate revelation was quivering on the horizon; for the intimate revelations of young men, or at least the terms in which they express them, are usually plagiaristic and marred by obvious suppressions.

Reserving judgments is a matter of infinite hope. I am still a little afraid of missing something if I forget that, as my father snobbishly suggested, and I snobbishly repeat, a sense of the fundamental decencies is parcelled out unequally at birth. And, after boasting this way of my tolerance, I come to the admission that it has a limit. Conduct may be founded on the hard rock or the wet marshes, but after a certain point I don’t care what it’s founded on. When I came back from the East last autumn I felt that I wanted the world to be in uniform and at a sort of moral attention forever. I wanted no more riotous excursions with privileged glimpses into the human heart. Only Gatsby, the man who gives his name to this book, was exempt from my reaction.`
        },
        { 
          id: nanoid(), 
          title: 'Chapter 2', 
          content: `About half way between West Egg and New York the motor road hastily joins the railroad and runs beside it for a quarter of a mile, so as to shrink away from a certain desolate area of land. This is a valley of ashes—a fantastic farm where ashes grow like wheat into ridges and hills and grotesque gardens; where ashes take the forms of houses and chimneys and rising smoke and, finally, with a transcendent effort, of men who move dimly and already crumbling through the powdery air. Occasionally a line of gray cars crawls along an invisible track, gives out a ghastly creak, and comes to rest, and immediately the ash-gray men swarm up with leaden spades and stir up an impenetrable cloud, which screens their obscure operations from your sight.

But above the gray land and the spasms of bleak dust which drift endlessly over it, you perceive, after a moment, the eyes of Doctor T. J. Eckleburg. The eyes of Doctor T. J. Eckleburg are blue and gigantic—their retinas are one yard high. They look out of no face, but, instead, from a pair of enormous yellow spectacles which pass over a non-existent nose. Evidently some wild wag of an oculist set them there to fatten his practice in the borough of Queens, and then sank down himself into eternal blindness, or forgot them and moved away. But his eyes, dimmed a little by many paintless days, under sun and rain, brood on over the solemn dumping ground.

The valley of ashes is bounded on one side by a small foul river, and, when the drawbridge is up to let barges through, the passengers on waiting trains can stare at the dismal scene for as long as half an hour. There is always a halt there of at least a minute, and it was because of this that I first met Tom Buchanan’s mistress. Her presence was a sharp contrast to the grey surroundings, a reminder of the vitality that still pulsed beneath the surface of this desolate landscape.`
        }
      ]
    },
    {
      id: nanoid(),
      title: '朝花夕拾',
      author: '鲁迅',
      category: '散文',
      difficulty: '中级',
      coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=300&q=80',
      summary: '鲁迅先生回忆往事的散文集，“匠心书单”文学经典集。',
      recommendedHeat: 88,
      aiReason: '文字犀利而深情，是中国现代散文的巅峰之作。',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '从百草园到三味书屋', content: '我家的后面有一个很大的园，相传叫作百草园。现在是早已并屋子一起卖给朱文公的子孙了，连那最末次的相传，也已经隔了七八年。其中似乎确凿只有一些野草；但那时却是我的乐园。不必说碧绿的菜畦，光滑的石井栏，高大的皂荚树，紫红的桑椹；也不必说鸣蝉在树叶里长吟，肥胖的黄蜂伏在菜花上，轻捷的叫天子（云雀）忽然从草间直窜向云霄里去了。单是周围的短短的泥墙根一带，就有无限趣味。油蛉在这里低唱，蟋蟀们在这里弹琴。翻开断砖来，有时会遇见蜈蚣；还有斑蝥，倘若用手指按住它的脊梁，便会啪的一声，从后窍喷出一阵烟雾。何首乌藤和木莲藤缠络着，木莲有莲房一般的果实，何首乌有臃肿的根。有人说，何首乌根是有像人形的，吃了便可以成仙，我于是常常拔它起来，牵连不断地拔起来，也曾因此弄坏了泥墙，却从来没有见过有一块根像人样。' },
        { id: nanoid(), title: '藤野先生', content: '东京也无非是这样。上野的樱花烂熳的时候，望去确也像绯红的轻云，但花下也缺不了成群结队的“清国留学生”的速成班，头顶上盘着大辫子，顶得学生制帽的顶上高高耸起，像一座富士山。也有解散辫子，盘得平的，除下帽来，油光可鉴，宛如小姑娘的发髻一般，还要将脖子扭一扭。实在标致极了。中国留学生会馆的门房里有几本书买，有时还值得去一转；倘在上午，里面的有时会害口渴。从这些事情看来，我们就已经可见其精神了。我离家出外求学，已经整整的两年，这一回是第二次。我记得那是初秋，在一个雨后的下午，我坐了电车到本乡去。那里的风景倒是不坏，但我的心绪却并不在这里。我想起了在日本求学的这段日子，想起了那些曾经给予我帮助的人，心中不禁感到一阵暖意。' }
      ]
    },
    {
      id: nanoid(),
      title: '百年孤独',
      author: '加西亚·马尔克斯',
      category: '小说',
      difficulty: '进阶',
      coverUrl: '/covers/bainian-gudu.png',
      summary: '“匠心书单”魔幻现实主义巅峰，布恩迪亚家族七代人的传奇故事。',
      recommendedHeat: 97,
      aiReason: '叙事技巧独特，想象力丰富，是拉美文学皇冠上的明珠。',
      hasAudioIntro: true,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '第一章', content: '多年以后，面对行刑队，奥雷里亚诺·布恩迪亚上校将会回想起父亲带他去见识冰块的那个遥远的下午。马孔多当时是个只有二十户人家的小村庄，房屋用土坯和芦苇建在一条河岸上。河水清澈，顺着铺满洁白卵石的河床流去，那些卵石大如史前巨蛋。这片土地如此之新，以至于许多事物还没有名字，提起它们时还得用手指指点点。每年的三月，一伙衣衫褴褛的吉普赛人都会在村边支起帐篷，在响亮的笛声和鼓声中向村民介绍新的发明。他们首先带来的是磁铁。一个名叫梅尔基亚德斯的胖吉普赛人，满脸胡须，眼神清亮，他拖着两块磁铁在屋子间走动，所有的铁制家具、甚至丢失已久的铁勺铁叉都随之移动，村民们惊奇得说不出话来。梅尔基亚德斯宣称：“事物都有自己的生命，只需唤醒它们的灵魂。”' },
        { id: nanoid(), title: '第二章', content: '马孔多当时是个只有二十户人家的小村庄，房屋用土坯和芦苇建在一条河岸上。随着时间的流逝，这个小村庄逐渐变得繁华起来。布恩迪亚家族的成员们开始在这片土地上扎根，他们的命运与马孔多的兴衰紧紧地交织在一起。何塞·阿尔卡蒂奥·布恩迪亚是一个充满幻想的人，他整天沉溺于那些吉普赛人带来的奇妙发明中，试图从中找到改变世界的力量。他的妻子乌尔苏拉则是一个务实的人，她默默地操持着家务，试图将这个家庭带入正轨。然而，命运的齿轮已经开始转动，布恩迪亚家族注定要经历百年的孤独与奋斗。在这个充满奇迹与诅咒的土地上，每个人都在寻找着属于自己的归宿。' }
      ]
    },
    {
      id: nanoid(),
      title: '瓦尔登湖',
      author: 'Henry David Thoreau',
      category: '散文',
      difficulty: '进阶',
      coverUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=300&q=80',
      summary: '“匠心书单”静心之作，记录了作者在瓦尔登湖畔的简朴生活与深思。',
      recommendedHeat: 89,
      aiReason: '探讨了自然、简朴生活与个人自由，是环保主义与超验主义的经典。',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '第一章：经济篇', content: '我写下面这些篇页的时候，正孤身一人，生活在森林中，在马萨诸塞州康科德城的瓦尔登湖畔，在我亲手建筑的小屋里。我离任何邻居都有一英里远，完全自给自足，全靠我的双手生活。在那儿，我住了两年又两个月。现在，我又回到了文明社会，但我依然怀念那段宁静的时光。我发现，大多数人都在过着一种极度繁忙且毫无意义的生活，他们被琐碎的事务所困扰，被物质的欲望所奴役。我想通过我的经历告诉人们，真正的生活并不在于拥有多少财富，而在于拥有多少自由和宁静。我观察湖水的波动，观察树木的生长，观察鸟儿的飞翔。在那片原始的自然中，我找到了属于自己的真理。' },
        { id: nanoid(), title: '第二章：我生活的地方；我为何生活', content: '我到林中去，是因为我希望过一种有深度的生活，吸取生活的所有精髓。我想过得扎实，把一切不属于生活的内容剔除得干干净净。我不想在临终前才发现自己没有真正活过。时间不过是我去钓鱼的溪流。我喝溪水，但在喝水的同时，我看到了它那沙石底，意识到了它是多么浅。它那薄薄的流水流逝了，但永恒留了下来。我想喝得更深；在天空中钓鱼，那儿的底铺满了星星。我发现，简单生活不仅是一种选择，更是一种艺术。通过剥离那些多余的装饰，我们才能看到生活的本质。在这个喧嚣的世界里，我们需要一片属于自己的瓦尔登湖。' }
      ]
    },
    {
      id: nanoid(),
      title: '万历十五年',
      author: '黄仁宇',
      category: '人文历史',
      difficulty: '中级',
      coverUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=300&q=80',
      summary: '“匠心书单”历史推荐。从看似平淡的一年切入，剖析明朝中后期的政治困局。',
      recommendedHeat: 94,
      aiReason: '大历史观的代表作，适合配合 AI 进行深度历史背景分析。',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '第一章', content: '万历十五年，岁次丁亥，表面上似乎是四海升平，无事可记。但在这一年里，明朝的统治结构已经显现出了深刻的裂痕。万历皇帝朱翊钧已经即位十五年，他逐渐感到自己像是一个被困在宫殿里的囚徒，被无数的礼仪和规矩所束缚。他想通过罢工来表达自己的不满，却发现整个官僚体系依然在按照惯性运转。首辅申时行试图在皇帝与文官集团之间寻找平衡，但这种平衡是如此脆弱，仿佛随时都会崩溃。在这个庞大的帝国里，每个人都在扮演着自己的角色，却没有人能够真正改变历史的走向。这一年，不仅是万历个人的悲剧，更是整个明王朝走向衰落的起点。' },
        { id: nanoid(), title: '第二章', content: '当首辅申时行接替张居正时，他意识到这个庞大帝国的僵局并非靠一人之力可以化解。张居正的改革虽然在短期内增加了财政收入，但却得罪了整个文官集团。申时行选择了一种更为温和的方式，试图通过调和与妥协来维持国家的运转。然而，这种温和在复杂的政治斗争面前显得如此无力。万历皇帝对政治的厌恶日益加深，他开始长时间不理朝政，导致中央权力的真空。地方官员们则各行其是，社会矛盾日益尖锐。历史的巨轮已经在不知不觉中转向，而身处其中的人们，却依然在为了一些琐碎的礼仪争论不休。这就是万历十五年，一个看似平常却又极其关键的年份。' }
      ]
    },
    {
      id: nanoid(),
      title: '饮食术',
      author: '牧田善二',
      category: '健康生活',
      difficulty: '入门',
      coverUrl: 'https://images.unsplash.com/photo-1490818387583-1b5ba2222703?auto=format&fit=crop&w=300&q=80',
      summary: '“匠心书单”生活指南。科学的控糖指南，让你通过饮食保持健康与精力。',
      recommendedHeat: 85,
      aiReason: '实用性极强，适合做生活方式类的笔记。',
      hasAudioIntro: false,
      language: 'zh',
      chapters: [
        { id: nanoid(), title: '第一章', content: '我们现在的身体，是由我们过去所吃的东西构成的。这是一个简单却深刻的事实。在现代社会，我们被各种精制糖和高热量食物所包围，这导致了糖尿病、肥胖和心血管疾病的高发。我想告诉大家，通过科学的控糖饮食，我们不仅可以减轻体重，还可以显著提升精力。血糖值的剧烈波动是导致疲劳和精神不集中的罪魁祸首。当我们摄入大量的碳水化合物时，血糖会迅速升高，胰岛素随之大量分泌，导致血糖又迅速下降，这种“过山车”式的变化会让大脑感到极度疲劳。因此，选择低GI食物，合理搭配蛋白质和脂肪，是保持健康的基石。' },
        { id: nanoid(), title: '第二章', content: '血糖值的剧烈波动是导致疲劳和精神不集中的罪魁祸首。为了保持全天候的高效，我们需要学会控制自己的血糖。首先，吃早餐是非常重要的，它可以为大脑提供全天所需的能量。其次，午餐时要避免摄入过多的主食，尤其是那些精制的米面。最后，晚餐要尽量清淡，避免在临睡前摄入高糖食物。通过这些细微的改变，我们可以显著改善自己的生活质量。健康不是一蹴而就的，而是一种持之以恒的生活态度。从今天开始，关注你吃进去的每一口食物，让身体重新焕发活力。' }
      ]
    },
    {
      id: nanoid(),
      title: '时间简史',
      author: '斯蒂芬·霍金',
      category: '社科',
      difficulty: '进阶',
      coverUrl: '/covers/shijian-jianshi.png',
      summary: '“匠心书单”科普经典。关于宇宙起源、时空本质的科普经典。',
      recommendedHeat: 95,
      aiReason: '概念宏大但叙述清晰，AI赏析可以辅助理解复杂的物理概念。',
      hasAudioIntro: true,
      language: 'zh',
      chapters: [
        {
          id: nanoid(),
          title: '第一章：我们的宇宙图像',
          content: `一位著名的科学家（据说是伯特兰·罗素）曾经作过一次关于天文学的讲演。他描述了地球如何围绕着太阳公转，而太阳又如何围绕着称之为我们星系的巨大恒星集团的中心公转。演讲结束时，一位坐在后排的小个子老太太站起来说道：“你讲的是一派胡言。实际上，世界是一块位于大乌龟背上的平板。”这位科学家非常有礼貌地回敬道：“那么这只乌龟站在什么上面呢？”老太太答道：“你很聪明，年轻人，的确很聪明。不过，这是一叠乌龟，一直叠下去。”

大多数人会觉得，把我们的宇宙喻为一个无限的乌龟塔相当荒谬，但我们凭什么就认为自己知道得更多呢？我们对宇宙了解多少？我们又是如何知道这些的？宇宙从何而来，向何处去？宇宙有一个开端吗？如果有的话，在那之前发生了什么？时间的本质是什么？它会有一个终结吗？在物理学领域，这些问题不仅是哲学上的探讨，更是通过数学和实验来寻找答案的征程。从牛顿的引力定律到爱因斯坦的相对论，再到量子力学，人类一直在试图勾勒出一幅关于宇宙的完美图像。`
        },
      ],
    },
  ]

  const post1Id = nanoid()
  const post2Id = nanoid()
  const post3Id = nanoid()
  const post4Id = nanoid()
  const post5Id = nanoid()
  
  const posts: Post[] = [
    {
      id: post1Id,
      authorId: user2Id,
      title: '分享：我为什么推荐《小王子》做精读',
      contentText:
        '精读时我会重点关注比喻与重复出现的意象，比如“玫瑰”“狐狸”。你们还有哪些精读方法？',
      imageUrls: [],
      tags: ['#经典名著推荐', '#名著解读', '#阅读心得'],
      createdAt: now() - 1000 * 60 * 60 * 6,
      updatedAt: now() - 1000 * 60 * 60 * 6,
      stats: { likes: 12, comments: 3, collects: 5, views: 128, shares: 2 },
    },
    {
      id: post2Id,
      authorId: user3Id,
      title: '英文原著打卡 Day 1：经典开头怎么背？',
      contentText:
        '我会把经典句子拆成块来记，再用跟读+复述巩固。今天打卡《Pride and Prejudice》第一句。',
      imageUrls: [],
      tags: ['#英文原著打卡', '#英文原著推荐'],
      createdAt: now() - 1000 * 60 * 60 * 2,
      updatedAt: now() - 1000 * 60 * 60 * 2,
      stats: { likes: 22, comments: 5, collects: 7, views: 203, shares: 4 },
    },
    {
      id: post3Id,
      authorId: user4Id,
      title: '求推荐！有没有类似《白夜行》这种节奏紧凑的悬疑推理小说？',
      contentText:
        '最近刚看完东野圭吾的《白夜行》，后劲太大了！那种绝望中又带着一丝羁绊的感觉刻画得太好了。想问问大家还有没有类似的推荐？最好是逻辑严密，结局让人意想不到的那种！',
      imageUrls: [],
      tags: ['#小说情节分析', '#小众好书分享'],
      createdAt: now() - 1000 * 60 * 60 * 12,
      updatedAt: now() - 1000 * 60 * 60 * 12,
      stats: { likes: 35, comments: 18, collects: 12, views: 540, shares: 5 },
    },
    {
      id: post4Id,
      authorId: user5Id,
      title: '《万历十五年》读后感：大历史观下的必然与偶然',
      contentText:
        '黄仁宇先生的“大历史观”真的给我带来了很大的启发。看似平淡无奇的万历十五年，实则暗流涌动。书中对张居正、申时行、海瑞等人的分析，让我对明朝的文官制度有了更深刻的理解。强烈推荐大家配合AI助手做时间线梳理，效果极佳！',
      imageUrls: [],
      tags: ['#阅读心得', '#名著解读'],
      createdAt: now() - 1000 * 60 * 60 * 24 * 2,
      updatedAt: now() - 1000 * 60 * 60 * 24 * 2,
      stats: { likes: 58, comments: 12, collects: 45, views: 890, shares: 15 },
    },
    {
      id: post5Id,
      authorId: user7Id,
      title: '关于《三体》中“黑暗森林法则”的逻辑探讨',
      contentText:
        '今天重温了《三体》第二部，对“黑暗森林法则”的推导过程有了一点新的想法。如果考虑到技术爆炸的非线性特征，猜疑链是否有可能在某些特定条件下被打破？有没有科幻大佬来一起讨论下？',
      imageUrls: [],
      tags: ['#科幻推荐', '#小说情节分析'],
      createdAt: now() - 1000 * 60 * 60 * 48,
      updatedAt: now() - 1000 * 60 * 60 * 48,
      stats: { likes: 89, comments: 42, collects: 30, views: 1200, shares: 8 },
    }
  ]

  const comment1Id = nanoid()
  const comment2Id = nanoid()
  const comment3Id = nanoid()
  const comment4Id = nanoid()
  const comment5Id = nanoid()
  const comment6Id = nanoid()
  const comment7Id = nanoid()
  
  const comments: Comment[] = [
    {
      id: comment1Id,
      postId: post1Id,
      authorId: user3Id,
      contentText: '我也喜欢做“意象清单”，然后对照章节出现频率。',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 30,
    },
    {
      id: comment2Id,
      postId: post1Id,
      authorId: user2Id,
      contentText: '楼中楼回复示例：同意！还可以配合背景资料做延展阅读。',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 10,
      parentId: comment1Id,
    },
    {
      id: comment3Id,
      postId: post3Id,
      authorId: user6Id,
      contentText: '推荐紫金陈的《无证之罪》！和《白夜行》有异曲同工之妙，也是双线叙事，结局非常震撼。',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 60 * 10,
    },
    {
      id: comment4Id,
      postId: post3Id,
      authorId: user4Id,
      contentText: '太好了，这就去加书架！谢谢推荐~',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 60 * 8,
      parentId: comment3Id,
    },
    {
      id: comment5Id,
      postId: post3Id,
      authorId: user7Id,
      contentText: '如果喜欢逻辑严密的，可以看看凑佳苗的“复仇三部曲”，尤其是《告白》，绝对符合你的要求。',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 60 * 5,
    },
    {
      id: comment6Id,
      postId: post5Id,
      authorId: user2Id,
      contentText: '技术爆炸确实是一个变量，但猜疑链的根源在于文明间的不可沟通性。即使技术爆炸，只要沟通成本大于打击成本，黑暗森林法则依然成立。',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 60 * 40,
    },
    {
      id: comment7Id,
      postId: post5Id,
      authorId: user7Id,
      contentText: '有道理，光速限制导致了信息传递的绝对延迟，这是物理规律决定的不可沟通性。',
      imageUrls: [],
      createdAt: now() - 1000 * 60 * 60 * 35,
      parentId: comment6Id,
    }
  ]

  const note1Id = nanoid()
  const note2Id = nanoid()
  const note3Id = nanoid()
  const note4Id = nanoid()
  const note5Id = nanoid()
  const note6Id = nanoid()
  
  const notes: Note[] = [
    {
      id: note1Id,
      authorId: userId,
      title: '摘抄：关于“驯养”',
      contentText:
        '“驯养，就是建立关系。”\n\n我理解的“关系”，不是束缚，而是让彼此在世界里变得独一无二。',
      imageUrls: [],
      tags: ['#散文赏析', '#阅读心得'],
      createdAt: now() - 1000 * 60 * 60 * 12,
      updatedAt: now() - 1000 * 60 * 60 * 12,
      status: 'published',
      template: 'literary',
      source: { bookId: sampleBooks[0]!.id, excerpt: '“驯养，就是建立关系。”' },
      stats: { likes: 9, comments: 2, collects: 4, views: 76, shares: 1 },
    },
    {
      id: note2Id,
      authorId: userId,
      title: '句子积累：universally acknowledged',
      contentText:
        '"It is a truth universally acknowledged..." 这类结构可以直接套用到写作里，用来引出论点。',
      imageUrls: [],
      tags: ['#英文原著推荐', '#名著精读打卡'],
      createdAt: now() - 1000 * 60 * 60 * 3,
      updatedAt: now() - 1000 * 60 * 60 * 3,
      status: 'published',
      template: 'minimal',
      source: { bookId: sampleBooks[1]!.id },
      stats: { likes: 16, comments: 1, collects: 6, views: 104, shares: 2 },
    },
    {
      id: note3Id,
      authorId: user3Id,
      title: '《红楼梦》人物性格初探：林黛玉的多愁善感',
      contentText:
        '黛玉的“多愁善感”并非无病呻吟，而是寄人篱下的敏感与对真情的极度渴望。每次读到“葬花吟”，都能感受到那种深入骨髓的孤独与高洁。她是用生命在写诗。',
      imageUrls: [],
      tags: ['#名著解读', '#阅读心得'],
      createdAt: now() - 1000 * 60 * 60 * 24,
      updatedAt: now() - 1000 * 60 * 60 * 24,
      status: 'published',
      template: 'literary',
      source: { bookId: sampleBooks[2]!.id },
      stats: { likes: 45, comments: 12, collects: 30, views: 320, shares: 5 },
    },
    {
      id: note4Id,
      authorId: user4Id,
      title: '《1984》读书笔记：警惕语言的简化',
      contentText:
        '新话（Newspeak）的本质是通过缩减词汇量来限制人们的思想范围。当我们失去描述复杂情感和抽象概念的词汇时，我们也就在不知不觉中失去了独立思考的能力。这在今天依然有极强的警示意义。',
      imageUrls: [],
      tags: ['#阅读心得', '#经典名著推荐'],
      createdAt: now() - 1000 * 60 * 60 * 48,
      updatedAt: now() - 1000 * 60 * 60 * 48,
      status: 'published',
      template: 'minimal',
      source: { bookId: sampleBooks[3]!.id },
      stats: { likes: 88, comments: 24, collects: 65, views: 890, shares: 12 },
    },
    {
      id: note5Id,
      authorId: user2Id,
      title: '《三体》核心概念梳理：黑暗森林法则',
      contentText:
        '黑暗森林法则建立在两个公理之上：1. 生存是文明的第一需要；2. 文明不断增长和扩张，但宇宙中的物质总量保持不变。再加上“猜疑链”和“技术爆炸”，推导出了这个冷酷但逻辑严密的宇宙社会学图景。刘慈欣的想象力太震撼了！',
      imageUrls: [],
      tags: ['#科幻推荐', '#名著解读'],
      createdAt: now() - 1000 * 60 * 60 * 5,
      updatedAt: now() - 1000 * 60 * 60 * 5,
      status: 'published',
      template: 'minimal',
      source: { bookId: sampleBooks[5]!.id },
      stats: { likes: 120, comments: 35, collects: 80, views: 1500, shares: 20 },
    },
    {
      id: note6Id,
      authorId: user5Id,
      title: '《瓦尔登湖》摘抄与感悟：做减法的艺术',
      contentText:
        '“我到林中去，是因为我希望过一种有深度的生活，吸取生活的所有精髓。”\n\n梭罗在瓦尔登湖畔的独居，不是逃避现实，而是一种对生活本质的积极探索。在这个物质过剩的时代，我们需要学习这种“做减法”的艺术，给心灵留出呼吸的空间。',
      imageUrls: [],
      tags: ['#散文赏析', '#阅读心得'],
      createdAt: now() - 1000 * 60 * 60 * 15,
      updatedAt: now() - 1000 * 60 * 60 * 15,
      status: 'published',
      template: 'literary',
      source: { bookId: sampleBooks[9]!.id },
      stats: { likes: 65, comments: 8, collects: 42, views: 450, shares: 6 },
    },
  ]

  const db: Database = {
    version: 4,
    users: users,
    currentUserId: userId,
    books: Object.fromEntries(sampleBooks.map((b) => [b.id, b])),
    posts: Object.fromEntries(posts.map((p) => [p.id, p])),
    comments: Object.fromEntries(comments.map((c) => [c.id, c])),
    notes: Object.fromEntries(notes.map((n) => [n.id, n])),
    tags: Object.fromEntries(tags.map((t) => [t.id, t])),
    interactions: {},
    bookmarks: {},
    readingHistory: {},
    vocab: {},
    notifications: Object.fromEntries(
      (
        [
          {
            id: nanoid(),
            userId,
            type: 'system' as const,
            title: '欢迎来到 ReadForum',
            body: '开启 AI 智能阅读：长按选中文本即可翻译、记笔记或进入英语学习模式。',
            createdAt: now() - 1000 * 60 * 60 * 6,
            link: { label: '去书城', to: '/read' },
          },
          {
            id: nanoid(),
            userId,
            type: 'book' as const,
            title: '书籍更新通知',
            body: '《Pride and Prejudice》已新增学习建议：推荐每天跟读 1 段并记录句子积累。',
            createdAt: now() - 1000 * 60 * 60 * 2,
            link: { label: '去阅读', to: `/read/${sampleBooks[1]!.id}` },
          },
          {
            id: nanoid(),
            userId,
            type: 'system' as const,
            title: '版本更新 v1.0.0',
            body: '搜索页榜单样式升级、阅读页新增赏析侧边栏、我的页新增消息中心。',
            createdAt: now() - 1000 * 60 * 30,
          },
        ]
      ).map((n) => [n.id, n]),
    ),
    shelves: {
      [userId]: [
        { userId, bookId: sampleBooks[0]!.id, addedAt: now() - 1000 * 60 * 60 * 24 * 3 },
        { userId, bookId: sampleBooks[1]!.id, addedAt: now() - 1000 * 60 * 60 * 24 * 1 },
      ],
    },
    aiChatThreads: {},
    aiChatMessages: {},
    aiAnalysisRecords: {},
    admin: {
      pinnedPostIds: [],
      featuredPostIds: [post2Id],
      bannedKeywords: ['赌博', '色情', '违法', '诈骗'],
    },
  }

  return db
}

function readDb(): Database {
  if (typeof window === 'undefined') {
    return {
      version: 4,
      users: {},
      currentUserId: '',
      books: {},
      posts: {},
      comments: {},
      notes: {},
      tags: {},
      interactions: {},
      bookmarks: {},
      readingHistory: {},
      vocab: {},
      notifications: {},
      shelves: {},
      aiChatThreads: {},
      aiChatMessages: {},
      aiAnalysisRecords: {},
      admin: {
        pinnedPostIds: [],
        featuredPostIds: [],
        bannedKeywords: ['赌博', '色情', '违法', '诈骗']
      }
    }
  }
  const stored = readStorage<{ version?: number } | null>(STORAGE_KEY, null)
  if (!stored) return createSeedDb()
  if (stored.version === 3) {
    const migrated = migrateToV4(stored as Partial<Database>)
    if (ensureSciFiTopicSeed(migrated) || ensureMissingSeedBooks(migrated)) {
      writeDb(migrated)
    } else {
      writeDb(migrated)
    }
    return migrated
  }
  if (stored.version !== 4) return createSeedDb()
  const normalized = migrateToV4(stored as Partial<Database>)
  if (ensureSciFiTopicSeed(normalized) || ensureMissingSeedBooks(normalized)) {
    writeDb(normalized)
  }
  return normalized
}

function writeDb(db: Database) {
  writeStorage(STORAGE_KEY, db)
}

export function ensureDbInitialized() {
  const db = readDb()
  writeDb(db)
}

export function getDbSnapshot(): Database {
  return readDb()
}

export function getCurrentUser(): User {
  if (typeof window === 'undefined') {
    return {
      id: '',
      role: 'user',
      nickname: '',
      avatarUrl: undefined,
      bio: '',
      profileTag: '',
      createdAt: Date.now(),
      stats: {
        readingMinutes: 0,
        postsCount: 0,
        notesCount: 0,
        followersCount: 0,
        followingCount: 0
      },
      settings: {
        theme: 'system',
        reading: {
          fontSize: 18,
          lineHeight: 1.7,
          textColor: '#111827',
          backgroundColor: '#ffffff',
          fontFamily: 'sans'
        },
        notifications: {
          like: true,
          comment: true,
          collect: true
        }
      }
    }
  }
  const db = readDb()
  const user = db.users[db.currentUserId]
  if (!user) {
    const seeded = createSeedDb()
    writeDb(seeded)
    return seeded.users[seeded.currentUserId]!
  }
  return user
}

export function updateCurrentUser(partial: Partial<User>) {
  const db = readDb()
  const id = db.currentUserId
  const existing = db.users[id]
  if (!existing) return
  db.users[id] = { ...existing, ...partial }
  writeDb(db)
}

export function listTags(): TopicTag[] {
  const db = readDb()
  return Object.values(db.tags).sort((a, b) => b.createdAt - a.createdAt)
}

export function upsertTagByName(name: string): TopicTag {
  const db = readDb()
  const normalized = name.startsWith('#') ? name : `#${name}`
  const existing = Object.values(db.tags).find((t) => t.name === normalized)
  if (existing) return existing
  const tag: TopicTag = { id: nanoid(), name: normalized, createdAt: now() }
  db.tags[tag.id] = tag
  writeDb(db)
  return tag
}

export function listBooks(): Book[] {
  const db = readDb()
  return Object.values(db.books)
}

export function getBook(bookId: string): Book | undefined {
  const db = readDb()
  return db.books[bookId]
}

export function listShelf(userId: string): ShelfItem[] {
  const db = readDb()
  return (db.shelves[userId] ?? []).slice().sort((a, b) => b.addedAt - a.addedAt)
}

export function isInShelf(userId: string, bookId: string) {
  const db = readDb()
  return Boolean((db.shelves[userId] ?? []).find((s) => s.bookId === bookId))
}

export function addToShelf(userId: string, bookId: string) {
  const db = readDb()
  const list = db.shelves[userId] ?? []
  if (list.some((s) => s.bookId === bookId)) return
  const item: ShelfItem = { userId, bookId, addedAt: now() }
  db.shelves[userId] = [item, ...list]
  writeDb(db)
}

export function removeFromShelf(userId: string, bookId: string) {
  const db = readDb()
  const list = db.shelves[userId] ?? []
  db.shelves[userId] = list.filter((s) => s.bookId !== bookId)
  writeDb(db)
}

export function listPosts(sort: 'latest' | 'hot'): Post[] {
  const db = readDb()
  const pinned = new Set(db.admin.pinnedPostIds)
  const posts = Object.values(db.posts)
  const scored =
    sort === 'latest'
      ? posts.sort((a, b) => b.createdAt - a.createdAt)
      : posts.sort(
          (a, b) =>
            b.stats.likes * 3 +
            b.stats.comments * 2 +
            b.stats.views -
            (a.stats.likes * 3 + a.stats.comments * 2 + a.stats.views),
        )
  return scored.sort((a, b) => (pinned.has(a.id) === pinned.has(b.id) ? 0 : pinned.has(a.id) ? -1 : 1))
}

export function getPost(postId: string): Post | undefined {
  const db = readDb()
  return db.posts[postId]
}

export function incrementPostView(postId: string) {
  const db = readDb()
  const post = db.posts[postId]
  if (!post) return
  post.stats.views += 1
  writeDb(db)
}

export function listComments(postId: string): Comment[] {
  const db = readDb()
  return Object.values(db.comments)
    .filter((c) => c.postId === postId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addComment(input: Omit<Comment, 'id' | 'createdAt'>): Comment {
  const db = readDb()
  const c: Comment = { ...input, id: nanoid(), createdAt: now() }
  db.comments[c.id] = c
  const post = db.posts[c.postId]
  if (post) post.stats.comments += 1
  writeDb(db)
  return c
}

export function addPost(input: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'stats'>): Post {
  const db = readDb()
  const p: Post = {
    ...input,
    id: nanoid(),
    createdAt: now(),
    updatedAt: now(),
    stats: { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 },
  }
  db.posts[p.id] = p
  const user = db.users[p.authorId]
  if (user) user.stats.postsCount += 1
  writeDb(db)
  return p
}

export function updatePost(postId: string, partial: Partial<Post>) {
  const db = readDb()
  const existing = db.posts[postId]
  if (!existing) return
  db.posts[postId] = { ...existing, ...partial, updatedAt: now() }
  writeDb(db)
}

export function deletePost(postId: string) {
  const db = readDb()
  const existing = db.posts[postId]
  if (!existing) return
  delete db.posts[postId]
  Object.values(db.comments)
    .filter((c) => c.postId === postId)
    .forEach((c) => {
      delete db.comments[c.id]
    })
  writeDb(db)
}

export function listNotes(sort: 'latest' | 'hot', onlyPublished = true): Note[] {
  const db = readDb()
  const notes = Object.values(db.notes).filter((n) => (onlyPublished ? n.status === 'published' : true))
  return sort === 'latest'
    ? notes.sort((a, b) => b.createdAt - a.createdAt)
    : notes.sort(
        (a, b) =>
          b.stats.likes * 3 +
          b.stats.comments * 2 +
          b.stats.views -
          (a.stats.likes * 3 + a.stats.comments * 2 + a.stats.views),
      )
}

export function getNote(noteId: string): Note | undefined {
  const db = readDb()
  return db.notes[noteId]
}

export function addOrUpdateNote(note: Partial<Note> & Pick<Note, 'authorId' | 'title' | 'contentText'>): Note {
  const db = readDb()
  const id = note.id ?? nanoid()
  const existing = db.notes[id]
  const base: Note =
    existing ??
    ({
      id,
      authorId: note.authorId,
      title: note.title,
      contentText: note.contentText,
      imageUrls: [],
      tags: [],
      createdAt: now(),
      updatedAt: now(),
      status: 'draft',
      template: 'minimal',
      stats: { likes: 0, comments: 0, collects: 0, views: 0, shares: 0 },
    } satisfies Note)

  const merged: Note = {
    ...base,
    ...note,
    id,
    updatedAt: now(),
    imageUrls: note.imageUrls ?? base.imageUrls,
    tags: note.tags ?? base.tags,
    stats: note.stats ?? base.stats,
  }
  db.notes[id] = merged
  if (!existing) {
    const user = db.users[merged.authorId]
    if (user) user.stats.notesCount += 1
  }
  writeDb(db)
  return merged
}

export function deleteNote(noteId: string) {
  const db = readDb()
  const existing = db.notes[noteId]
  if (!existing) return
  delete db.notes[noteId]
  writeDb(db)
}

function interactionKey(userId: string, kind: Interaction['kind'], targetType: Interaction['targetType'], targetId: string) {
  return `${userId}:${kind}:${targetType}:${targetId}`
}

export function hasInteraction(userId: string, kind: Interaction['kind'], targetType: Interaction['targetType'], targetId: string) {
  const db = readDb()
  const key = interactionKey(userId, kind, targetType, targetId)
  return Boolean(db.interactions[key])
}

export function toggleInteraction(
  userId: string,
  kind: Interaction['kind'],
  targetType: Interaction['targetType'],
  targetId: string,
) {
  const db = readDb()
  const key = interactionKey(userId, kind, targetType, targetId)
  const existing = db.interactions[key]
  const target = targetType === 'post' ? db.posts[targetId] : db.notes[targetId]
  if (!target) return

  if (existing) {
    delete db.interactions[key]
    if (kind === 'like') target.stats.likes = Math.max(0, target.stats.likes - 1)
    if (kind === 'collect') target.stats.collects = Math.max(0, target.stats.collects - 1)
  } else {
    db.interactions[key] = {
      id: key,
      userId,
      kind,
      targetType,
      targetId,
      createdAt: now(),
    }
    if (kind === 'like') target.stats.likes += 1
    if (kind === 'collect') target.stats.collects += 1
  }
  writeDb(db)
}

export function listContentByTag(tagName: string): { posts: Post[]; notes: Note[] } {
  const db = readDb()
  const normalized = tagName.startsWith('#') ? tagName : `#${tagName}`
  const posts = Object.values(db.posts).filter((p) => p.tags.includes(normalized))
  const notes = Object.values(db.notes).filter((n) => n.status === 'published' && n.tags.includes(normalized))
  posts.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  notes.sort((a, b) => b.stats.likes + b.stats.comments - (a.stats.likes + a.stats.comments))
  return { posts, notes }
}

export function listDraftNotesByUser(userId: string): Note[] {
  const db = readDb()
  return Object.values(db.notes)
    .filter((n) => n.authorId === userId && n.status === 'draft')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listPublishedNotesByUser(userId: string): Note[] {
  const db = readDb()
  return Object.values(db.notes)
    .filter((n) => n.authorId === userId && n.status === 'published')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function listUserInteractions(userId: string, kind: Interaction['kind']): Array<{ targetType: Interaction['targetType']; targetId: string; createdAt: number }> {
  const db = readDb()
  return Object.values(db.interactions)
    .filter((i) => i.userId === userId && i.kind === kind)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((i) => ({ targetType: i.targetType, targetId: i.targetId, createdAt: i.createdAt }))
}

export function getAdminConfig() {
  const db = readDb()
  return db.admin
}

export function updateAdminConfig(partial: Partial<Database['admin']>) {
  const db = readDb()
  db.admin = { ...db.admin, ...partial }
  writeDb(db)
}

export function addVocabItem(item: Omit<VocabItem, 'id' | 'createdAt'>): VocabItem {
  const db = readDb()
  const v: VocabItem = { ...item, id: nanoid(), createdAt: now() }
  db.vocab[v.id] = v
  writeDb(db)
  return v
}

export function listVocab(userId: string, type?: VocabItem['type']): VocabItem[] {
  const db = readDb()
  return Object.values(db.vocab)
    .filter((v) => v.userId === userId && (type ? v.type === type : true))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteVocabItem(id: string) {
  const db = readDb()
  delete db.vocab[id]
  writeDb(db)
}

export function saveReadingHistory(userId: string, bookId: string, chapterId: string, progress: number) {
  const db = readDb()
  const id = `${userId}:${bookId}`
  const history: ReadingHistory = {
    id,
    userId,
    bookId,
    chapterId,
    progress,
    updatedAt: now(),
  }
  db.readingHistory[id] = history
  writeDb(db)
}

export function getReadingHistory(userId: string, bookId: string): ReadingHistory | undefined {
  const db = readDb()
  return db.readingHistory[`${userId}:${bookId}`]
}

export function listReadingHistory(userId: string): ReadingHistory[] {
  const db = readDb()
  return Object.values(db.readingHistory)
    .filter((h) => h.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function removeReadingHistory(userId: string, bookId: string) {
  const db = readDb()
  delete db.readingHistory[`${userId}:${bookId}`]
  writeDb(db)
}

export function pushNotification(input: Omit<Notification, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  const db = readDb()
  const id = input.id ?? nanoid()
  db.notifications[id] = {
    id,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    createdAt: input.createdAt ?? now(),
    readAt: input.readAt,
    link: input.link,
  }
  writeDb(db)
  return db.notifications[id]
}

export function listNotifications(userId: string): Notification[] {
  const db = readDb()
  return Object.values(db.notifications)
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getUnreadNotificationCount(userId: string) {
  const db = readDb()
  return Object.values(db.notifications).filter((n) => n.userId === userId && !n.readAt).length
}

export function markNotificationRead(notificationId: string) {
  const db = readDb()
  const n = db.notifications[notificationId]
  if (!n) return
  if (!n.readAt) {
    n.readAt = now()
    writeDb(db)
  }
}

export function markAllNotificationsRead(userId: string) {
  const db = readDb()
  let changed = false
  Object.values(db.notifications).forEach((n) => {
    if (n.userId === userId && !n.readAt) {
      n.readAt = now()
      changed = true
    }
  })
  if (changed) writeDb(db)
}

export function createAIChatThread(userId: string, title?: string): AIChatThread {
  const db = readDb()
  const t: AIChatThread = {
    id: nanoid(),
    userId,
    title: title ?? '阅读AI对话',
    createdAt: now(),
    updatedAt: now(),
  }
  db.aiChatThreads[t.id] = t
  writeDb(db)
  return t
}

export function listAIChatThreads(userId: string): AIChatThread[] {
  const db = readDb()
  return Object.values(db.aiChatThreads)
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteAIChatThread(threadId: string) {
  const db = readDb()
  const t = db.aiChatThreads[threadId]
  if (!t) return
  delete db.aiChatThreads[threadId]
  Object.values(db.aiChatMessages).forEach((m) => {
    if (m.threadId === threadId) delete db.aiChatMessages[m.id]
  })
  writeDb(db)
}

export function addAIChatMessage(input: Omit<AIChatMessage, 'createdAt'> & { id?: string; createdAt?: number }): AIChatMessage {
  const db = readDb()
  const m: AIChatMessage = { ...input, id: input.id ?? nanoid(), createdAt: input.createdAt ?? now() }
  db.aiChatMessages[m.id] = m
  const t = db.aiChatThreads[m.threadId]
  if (t) t.updatedAt = m.createdAt
  writeDb(db)
  return m
}

export function listAIChatMessages(threadId: string): AIChatMessage[] {
  const db = readDb()
  return Object.values(db.aiChatMessages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addAIAnalysisRecord(input: Omit<AIAnalysisRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): AIAnalysisRecord {
  const db = readDb()
  const id = input.id ?? nanoid()
  const rec: AIAnalysisRecord = {
    id,
    userId: input.userId,
    bookId: input.bookId,
    chapterId: input.chapterId,
    createdAt: input.createdAt ?? now(),
    analysis: input.analysis,
  }
  db.aiAnalysisRecords[id] = rec
  writeDb(db)
  return rec
}

export function listAIAnalysisRecords(userId: string): AIAnalysisRecord[] {
  const db = readDb()
  return Object.values(db.aiAnalysisRecords)
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteAIAnalysisRecord(id: string) {
  const db = readDb()
  delete db.aiAnalysisRecords[id]
  writeDb(db)
}
