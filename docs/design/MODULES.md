# 模块与接口设计

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 输入 | [领域模型](../modeling/DOMAIN-MODEL.md)、[数据模型](./DATA-MODEL.md) |
| 范围 | 目录结构、依赖规则、Repository/Service 契约、错误模型、迁移路线 |

---

## 1. 目标结构

```text
src/
  domain/                 # 纯类型与规则，无 React、无存储
    models.ts             # 领域类型（由 data/models.ts 迁入）
    errors.ts             # AppError / 错误码
    rules/                # 计数器、状态迁移、权限判断（纯函数）
  data/
    db/                   # 本地持久化基础设施（Dexie、写队列、迁移）
    repositories/
      types.ts            # 仓储接口（本文件定义）
      local/              # IndexedDB 实现
      remote/             # Postgres/Supabase 实现（M2）
    mappers/              # 领域对象 ↔ 行记录
    sync/                 # outbox / 冲突处理（M2）
  services/               # 用例编排：publishNote、toggleInteraction、askAssistant…
  features/               # 页面级 hooks 与视图模型
  pages/                  # 只做组合
  components/             # 跨页面展示组件
  modules/auth/           # 认证 UI 与后端适配
  lib/                    # storage/logger/runtime/format 等基础设施
```

依赖方向（ESLint 强制）：

```text
pages → features → services → repositories → data/db
  │         │            │
  │         └────────────┴──► domain（只依赖 domain）
  └──► components（不依赖 data/services）
```

- `domain` 不依赖任何其他层；
- `repositories` 只依赖 `domain` 与 `data/db`；
- `services` 依赖 `repositories` + `domain`；
- `features` 依赖 `services`；`pages` 依赖 `features` 与 `components`；
- 反向依赖一律视为错误（评审拒绝）。

## 2. 仓储接口（`data/repositories/types.ts`）

```ts
export type Cursor = string | null
export type PageResult<T> = { items: T[]; nextCursor: Cursor }

export type ListPostsInput = {
  sort: 'latest' | 'hot'
  cursor?: Cursor
  limit: number
  authorId?: string
  topic?: string
  includeDeleted?: boolean
}

export interface PostRepository {
  list(input: ListPostsInput): Promise<PageResult<Post>>
  get(id: string): Promise<Post | null>
  create(input: NewPost): Promise<Post>
  update(id: string, patch: PostPatch): Promise<Post>
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<void>
}

export interface NoteRepository {
  listByAuthor(authorId: string, status?: NoteStatus): Promise<Note[]>
  get(id: string): Promise<Note | null>
  create(input: NewNote): Promise<Note>
  update(id: string, patch: NotePatch): Promise<Note>
  /** 发布：幂等创建/复用引用型 Post，返回两者 */
  publish(id: string, actorId: string): Promise<{ note: Note; post: Post }>
  unpublish(id: string, actorId: string): Promise<void>
  softDelete(id: string, actorId: string): Promise<void>
}

export interface InteractionRepository {
  toggle(userId: string, postId: string, kind: InteractionKind): Promise<{ active: boolean; count: number }>
  listByUser(userId: string, kind: InteractionKind): Promise<Post[]>
}

export interface BookRepository {
  list(filter: { category?: string; language?: string; query?: string; limit: number; cursor?: Cursor }): Promise<PageResult<Book>>
  getWithChapters(bookId: string): Promise<{ book: Book; chapters: Chapter[] } | null>
  upsert(input: UpsertBook): Promise<Book>
}

export interface CommentRepository {
  listByPost(postId: string): Promise<Comment[]>
  create(input: NewComment): Promise<Comment>
  softDelete(id: string, actorId: string): Promise<void>
}

export interface ProfileRepository {
  get(id: string): Promise<Profile | null>
  ensure(input: { id: string; nickname: string }): Promise<Profile>
  update(id: string, patch: ProfilePatch): Promise<Profile>
}

export interface AssistantRepository {
  listThreads(userId: string): Promise<ChatThread[]>
  listMessages(threadId: string): Promise<ChatMessage[]>
  appendMessage(input: NewChatMessage): Promise<ChatMessage>
  saveAnalysis(input: NewAnalysis): Promise<AnalysisRecord>
  listAnalyses(userId: string): Promise<AnalysisRecord[]>
}
```

约定：

1. **接口不接受 React 状态**，`userId`/`actorId` 显式传入，便于测试与服务端复用；
2. 所有方法返回 `Promise`，即使本地实现是同步的；
3. 分页统一 `cursor`（服务端为 `(created_at,id)`，本地为 `createdAt:id`）；
4. 仓储负责**持久化语义**（软删、计数、事务），不负责权限叙事；权限由 service 校验 + 数据库 RLS 兜底。

## 3. 用例服务（`services/`）

| 服务 | 职责 | 依赖 | 失败语义 |
|---|---|---|---|
| `publishNote` | 校验状态与内容 → 发布笔记 → 幂等生成引用帖子 → 触发索引 | NoteRepository、IndexQueue、Audit | 冲突/校验错误明确返回 |
| `unpublishNote` | 笔记回草稿 → 帖子软删 | NoteRepository | 幂等 |
| `toggleInteraction` | 唯一性由仓储保证；返回最新计数 | InteractionRepository | 重复点击不重复计数 |
| `recordReading` | 合并进度；按会话累计时长 | ReadingRepository | 进度裁剪到 [0,1] |
| `askAssistant` | 配额 → 检索 → 组装 prompt → 流式 → 落库 + 用量 | AssistantRepository、Retriever、QuotaService | 超限 429；无命中明确说明 |
| `analyzeText` | 缓存命中 → 模型 → schema 校验 → 落库 | AssistantRepository、ModelClient | 解析失败重试一次后报错，不落库 |
| `backupNow` / `restoreFrom` | 导出/导入 + 校验 + 迁移 | LocalSnapshot | 校验失败不覆盖 |
| `issueInvite` / `redeemInvite` | 邀请生命周期与人数上限 | ProfileRepository、InviteRepository | 事务内一次性消费 |

服务层只做编排，不直接操作 Dexie/Postgres；跨仓储的一致性通过**同一事务上下文**注入（本地为写队列批处理，服务端为数据库事务）。

## 4. 错误模型

```ts
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'INTERNAL'

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly options: { retryable?: boolean; details?: unknown } = {},
  ) { super(message) }
}
```

| 错误码 | 场景 | HTTP | UI 处理 |
|---|---|---|---|
| VALIDATION_ERROR | 表单/迁移校验失败 | 400 | 字段级提示 |
| NOT_FOUND | 资源不存在或已删 | 404 | 空状态页 |
| CONFLICT | 邀请已用/重复发布 | 409 | 提示并刷新 |
| FORBIDDEN | 非作者/非管理员 | 403 | 拒绝并记录 |
| UNAUTHORIZED | 未登录/会话过期 | 401 | 跳登录 |
| QUOTA_EXCEEDED | 当日 AI 配额用尽 | 429 | 展示重置时间 |
| RATE_LIMITED | 频率限制 | 429 | 退避提示 |
| UNAVAILABLE | AI/数据库不可用 | 503 | 降级 + 重试 |
| INTERNAL | 未预期异常 | 500 | 错误边界 + requestId |

规则：错误只在边界转换一次（HTTP ↔ AppError）；日志记录 `code/requestId`，不记录用户正文。

## 5. 读路径与写路径

```text
读：页面/feature hook
      → repository (Promise)
      → local: 内存快照（O(1)）/ 服务端: SQL 分页
      → 返回领域对象

写：service（校验/编排）
      → repository
      → local: mutate(db, ctx) → 版本 bump → 写队列 → Dexie 事务
      → remote: Postgres 事务 → 触发器维护计数
      → 返回最新状态；失败抛 AppError
```

订阅：本地写入 bump 版本 → QueryClient 失效 → 相关查询重取；服务端可接 Realtime（M3 可选）。

## 6. 迁移路线（M1.5）

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1.5a | 抽取 `domain/` 与 `repositories/types.ts`；`local/` 实现；旧 `data/api.ts` 改为委托 | 现有 30 个页面零改动；13 个测试全绿；新增仓储契约测试 |
| M1.5b | 每个 feature 建 hook，按页面分批替换；旧门面标 `@deprecated` 并加 lint 规则 | 每替换一页，删除对应旧函数调用；无页面直接 import 旧门面 |
| M1.5c | 数据变更：软删、章节拆表、来源字段、笔记↔帖子关联、计数对账 | 迁移测试 7 条通过；`npm run verify` 全绿 |
| M1.5d | 删除旧 `data/api.ts` 与同步门面 | 代码量下降；无 `getDbSnapshot` 直接遍历 |

## 7. 测试契约

| 层 | 必测内容 |
|---|---|
| repository | 每个方法的正常/边界/失败；分页游标；软删过滤；计数一致性 |
| service | 状态迁移、权限、幂等、并发（双击/双标签） |
| mapper | 领域 ↔ 行记录往返一致（含 null/枚举/时间） |
| migration | 7 条迁移用例 + 回滚 |
| UI hook | loading/error/empty；写后失效 |

覆盖率目标：`domain` + `data` + `services` ≥80%，行覆盖不达标不允许合并。

## 8. 与当前代码的对应

| 当前 | 目标 |
|---|---|
| `src/data/models.ts` | 迁至 `src/domain/models.ts`，补 `Chapter/Profile/Invite` 等 |
| `src/data/api.ts`（750 行） | 拆为 repositories + services；门面逐步删除 |
| `src/data/db/store.ts` | 保留为 local adapter 的缓存与写队列 |
| 页面直接 import `data/db` | 改为 feature hooks |
| `useDatabaseVersion` | 保留，作为 Query 失效信号 |