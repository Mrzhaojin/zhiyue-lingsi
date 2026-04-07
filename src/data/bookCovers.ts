import type { Book } from './models'

export const bookCoverByTitle: Record<string, string> = {
  小王子: '/covers/xiaowangzi.png',
  时间简史: '/covers/shijian-jianshi.png',
  红楼梦: '/covers/hongloumeng.png',
  三体: '/covers/santi.png',
  百年孤独: '/covers/bainian-gudu.png',
  活着: '/covers/huozhe.png',
  瓦尔登湖: '/covers/waerdenghu.png',
  万历十五年: '/covers/wanglishiwunian.png',
  围城: '/covers/weicheng.png',
  饮食术: '/covers/yinshishu.png',
  朝花夕拾: '/covers/zhaohuaxishi.png',
  '1984': '/covers/1984.jpg',
  'The Great Gatsby': '/covers/gatsby.jpg',
  'Pride and Prejudice': '/covers/pride-and-prejudice.jpg',
}

export function resolveBookCoverUrl(book: Pick<Book, 'title' | 'coverUrl'>): string | undefined {
  return bookCoverByTitle[book.title] ?? book.coverUrl
}
