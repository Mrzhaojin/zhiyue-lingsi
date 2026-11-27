# 智阅灵思 · 数据层技术尽调（只读分析）

> **分析范围**：`src/data/db.ts`（实际 **1796 行 / 87,425 B**，任务描述中的 1692 行已过时）、`src/data/dbService.ts`、`src/data/models.ts`、`src/lib/storage.ts`、`src/lib/supabase.ts`；为回答 Supabase 相关问题，补充核查 `src/modules/auth/db/schema.sql`、`src/modules/auth/client/*`。
> **方法**：精读全部相关文件；对 `src/` 下 69 个 .ts/.tsx 做调用点 grep；统计导出函数的调用方、模型字段的读/写方、死代码；`npx tsc -p tsconfig.app.json --noEmit` 实测可通过（exit 0）。
> **约定**：P0 = 数据丢失 / 安全漏洞 / 功能不可用；P1 = 架构性或明显质量问题；P2 = 工程规范。文中标注“估算”的为静态推算，未做浏览器实测；“推测”表示无法从代码直接证实的推断。
> **边界**：本次未修改 `src/`、配置或任何源码；唯一写入是本报告。工作区中 `package-lock.json` 的改动与本报告无关（团队其他成员并行操作所致）。

## 一、现状还原

### 1.0 一句话结论

**这是一个“产品完成度很高、数据层基本没做”的纯前端离线 Demo。** 所谓持久化 = localStorage 里一个 JSON 字符串；Supabase 只承担登录（Auth），所有社区内容、笔记、互动数据从未离开浏览器。数据层目前不能作为工程亮点讲，但正因如此，重构空间清晰、收益可量化。

### 1.1 真实持久化：单个 localStorage JSON blob（回答①）

**结论：整个项目没有数据库。唯一真实持久化是 localStorage 的一个 JSON blob，所有“表”都是这个对象里的 `Record`。**

关键事实（全部有代码证据）：

- **唯一 key**：`read_forum_db_v5`（`src/data/db.ts:64`），而内部 `version` 字段是 `4`（`src/data/db.ts:40`）——key 名与数据版本号已经漂移（推测：key 改版时忘了 bump version）。
- **结构**：`Database` 类型包含 15 个集合（`db.ts:39-62`）：users / posts / comments / notes / tags / interactions / bookmarks / readingHistory / vocab / notifications / shelves / aiChatThreads / aiChatMessages / aiAnalysisRecords / admin 等。**书籍章节内嵌在 `Book.chapters`**（`models.ts:51-55`），没有 chapters 表；`shelves` 是 `Record<userId, ShelfItem[]>`，与其他表风格不一致。
- **读路径**：任何 getter 都调用 `readDb()` → `localStorage.getItem` + `JSON.parse(整库)`（`db.ts:1208-1252`），并且**读操作本身会写库**：v3 迁移后写回（`db.ts:1237-1245`）、seed 补丁后写回（`db.ts:1239-1250`）、版本不符直接重建（`db.ts:1246`）。getter 带副作用。
- **写路径**：`writeDb = JSON.stringify(整库) + localStorage.setItem`（`db.ts:1254-1256`）；每次增删改都是“读整库 → 改内存 → 写整库”，无差异写、无事务、无锁、无 quota 捕获（`storage.ts:18-22`）。
- **初始化**：`App` mount 时 `ensureDbInitialized()` = `readDb + writeDb`（`App.tsx:54-59`；`db.ts:1258-1261`）；首次访问缺 key 时 `createSeedDb()`（`db.ts:457-1206`）并写回（`db.ts:1236`）。
- **迁移**：只有 `migrateToV4`，且只补顶层字段（`db.ts:70-83`）；`stored.version !== 4` 一律 `createSeedDb()` 覆盖（`db.ts:1246`）；`version === 3` 分支的 if/else 内容完全一样（`db.ts:1237-1245`，死逻辑）。
- **种子补丁**：`ensureSciFiTopicSeed`（`db.ts:85-418`，会补 4 个用户 / 4 帖 / 24 评论）和 `ensureMissingSeedBooks`（`db.ts:420-455`，补《饮食术》）在**每次读取时**检查并可能写回（判断依据是“有没有 #科幻推荐 的帖子/笔记”，`db.ts:86-89`）；当前 v4 库也会执行该检查（`db.ts:1247-1250`），一旦用户删光这批内容，下一次读取就会以全新 ID 复活 4 用户/4 帖/24 评论并写回。
- **备份/导出/导入**：全仓库没有“导出数据库/导入数据库”的功能（grep 无）；清浏览器数据 = 全部用户内容永久丢失。

数据流（ASCII）：

```
26 个业务页面 + 4 个认证页面 ──直接 import──> src/data/db.ts（52 个导出函数，唯一门面）
                                            │
              ┌─────────────────────────────┴──────────────────────────────┐
              ▼ 读（每次调用都整库 parse）                                  ▼ 写（每次改动都整库覆盖）
        readDb()                                                      writeDb()
        localStorage.getItem('read_forum_db_v5')                      JSON.stringify(整库)
        JSON.parse(整库，约 2.5–3 万字符)                              localStorage.setItem(...)
          ├─ 无 key / parse 失败 ────────────────> createSeedDb() ──┐   （同步 API，无 try/catch）
          ├─ version !== 4 ─────────────────────> createSeedDb() ──┤ 覆盖写回
          ├─ version === 3 ──> migrateToV4 + seed 补丁 ────────────┤
          └─ version === 4 ──> 可能 ensureSciFi / ensureMissingSeedBooks 写回
```

**对“真实持久化是什么”的直答**：localStorage 单 key `read_forum_db_v5` 单 JSON blob；版本号 4；迁移逻辑只做了 v3→v4 的补字段且失败即重建；没有任何云端写入。

### 1.2 dbService / Supabase 到底有没有被业务使用（回答②）

**结论：Supabase 只在认证层被真实使用；dbService 只在启动时做了一次装饰性 healthCheck，以及一个“必失败”的笔记同步。数据层完全是 localStorage。**

- **Supabase 的真实用途 = 登录态**：`AuthProvider` 直接调用 `supabase.auth.*`（`AuthProvider.tsx:46-134, 193-317`）；全站被 `RequireAuth` 包裹（`App.tsx:76`，`RequireAuth.tsx:10-14`）。
- **dbService 的使用面**：`dbService` 共 13 个方法（`dbService.ts:11-207`），业务侧只 import 了它一次（`db.ts:3`），实际调用只有两处：
  1. 模块加载时 `dbService.healthCheck()`（`db.ts:25-36`）；
  2. `addOrUpdateNote` 中 `if (supabaseConnected) await dbService.createNote(merged)`（`db.ts:1511-1518`）。
  其余 11 个方法（getUserById / createUser / getPosts / createPost / getNotes / getComments / createComment / getTags / createTag / createInteraction / deleteInteraction）在 `src/` 内**零调用点**（grep 验证）。
- **healthCheck 是假阳性**：mock 客户端 `from().select().limit()` 返回 `{error: undefined}`，`!error` 恒为 true（`supabase.ts:20-56` + `dbService.ts:198-206`）。也就是说**后端完全不存在时，`supabaseConnected` 也会变成 true**。
- **createNote 必然失败**：mock 的 `insert().select()` 返回 Promise，链式 `.single()` 不存在（`supabase.ts:45-47`），每次保存笔记都抛 `TypeError`，被 `db.ts:1512-1518` 的 `try/catch` 吞掉（只 console.error）。即使接真 Supabase，目标表也不存在：仓库里的 `schema.sql` 只有认证/RBAC 表（`schema.sql:1-135`），**没有 posts / notes / comments / tags / interactions 任何一张表**；且 dbService 用 snake_case 列名（`post_id`/`created_at`，`dbService.ts:47-48,105-109`），模型是 camelCase（`models.ts:68-84`）——写的对象直接 insert 会因列名不存在报错。
- **类型伪装**：mock 客户端用 `as unknown as SupabaseClient` 通过编译（`supabase.ts:55`）。
- **“自研后端”残留（全是死代码）**：`src/modules/auth/client/authApi.ts`（6,655 B，全仓库 0 import）、`src/modules/auth/server/`（express+bcrypt+pg 的完整 Node 后端，根 `package.json` 不包含其依赖/启动脚本，`vercel.json` 只有 SPA rewrite）、`src/modules/auth/db/schema.sql`、`rls.sql`、`seed.mjs`（均无引用）、`src/lib/supabase.ts` 导出的 `checkSupabaseConnection`（0 import，且 db.ts 自己写了一份同名函数）。这些是“从自研 RBAC 迁到 Supabase Auth”后的半途遗留。

两套身份、两条链路的实际状态（ASCII）：

```
Supabase Auth（auth.users，uuid）              localStorage Database（nanoid 种子用户）
   │ AuthProvider                                │ db.currentUserId（db.ts:458,1147）
   ├─ TopBar / MePage / GlobalAIAssistant        ├─ getCurrentUser() → 内容的作者/点赞/评论/收藏/阅读记录
   │                                            │
   ▼                                            ▼
 MePage 用 auth.id 过滤帖子/笔记 → 永远是 0    种子用户“新手读者”拥有全部本地内容
 GlobalAIAssistant 用 auth.id 建 thread/存笔记
 AIChatHistoryPage 用 db 用户 id 查 thread → 永远为空
```

**对“dbService/Supabase 是否被业务路径使用”的直答**：Supabase Auth 被真实使用；Supabase 数据库与 dbService 只有启动健康检查 + 一个被吞掉异常的 createNote，属于装饰/死代码，且对应表在仓库中根本不存在。

### 1.3 单 blob 的量化影响（回答③）

#### 1.3.1 写放大

每一次业务写入 = 解析整个库 + 序列化整个库 + 同步落盘。按调用链统计（均为静态计数）：

| 操作 | readDb 次数 | writeDb 次数 | 证据 |
|------|------------|-------------|------|
| 打开帖子详情 | 约 7（getCurrentUser/getPost/getDbSnapshot/incrementPostView/listComments/hasInteraction×2）| 1（views+1）| `PostDetailPage.tsx:31-33,48-53,75-76`；`db.ts:1394-1400` |
| 点赞 / 收藏 | 2（hasInteraction + toggleInteraction 内部 readDb）| 1 | `PostDetailPage.tsx:75-76,147-158`；`db.ts:1541-1570` |
| 发表评论 | 2（listComments 渲染 + addComment 内部 readDb）| 1 | `PostDetailPage.tsx:53,261-267`；`db.ts:1409-1417` |
| 发帖（带 5 个新标签）| 6 | 6（每个新标签 upsertTagByName 各写一次 + addPost）| `NewPostPage.tsx:171-194`；`db.ts:1325-1334,1419-1433` |
| 发布笔记并同步到论坛 | 3–4 | 3–9（addOrUpdateNote + addPost + 每个新标签一次 upsert）| `NoteEditorPage.tsx:399-421`；`db.ts:1325-1334` |
| 阅读页停留 | 每次渲染 1 次 | **每次渲染 1 次**（`chapter` 每次 render 都是新对象，effect 依赖变化）| `ReaderPage.tsx:39-43,93-97`；`db.ts:1636-1649` |
| 阅读页停留 | 每 60 秒 1 次 | 每 60 秒 1 次 | `ReaderPage.tsx:104-115` |
| 打开首页 | 约 6 次整库 parse | 0 | `HomePage.tsx:25-37`（getAdminConfig + getDbSnapshot + listBooks + listNotes×2 + listPosts）|
| 打开搜索页 | 4 次整库 parse | 0 | `SearchPage.tsx:16,30-43` |
| 任意页面 | 1–2 次整库 parse | 0 | 19 个文件使用 `getCurrentUser`，多数在 render 体内（grep 统计）|

两个特别值得指出的写放大源：
1. **ReaderPage 每次渲染都写库**：`book = getBook(bookId)` 每次 render 返回新对象（`ReaderPage.tsx:39`），`chapter` 随之每次都是新引用，`useEffect([bookId, chapter, user.id])` 于是每次渲染都执行 `saveReadingHistory(..., 0)`——用户在阅读页点菜单、翻设置、开关 AI 面板，都会触发一次全库写（`ReaderPage.tsx:93-97`）。
2. **发帖标签逐个写库**：`tags.forEach((t) => upsertTagByName(t))`（`NewPostPage.tsx:172`），每个新标签一次“读整库+写整库”。

体积估算：种子库所有字符串字面量合计 **17,631 字符**（静态统计 `db.ts:457-1203`），加键名/结构/ID 后估算 **25–30k 字符**（UTF-16 约 50–60KB；估算）。也就是说**即使纯文字，每次点赞都要序列化并同步写 25–30k 字符**；一旦有图片，数字会变成 MB 级。

#### 1.3.2 5MB 配额

- 图片是 **data URL 原样入库**：`FileReader.readAsDataURL` 后直接存 `imageUrls`（`NewPostPage.tsx:9-22,150-151`；`NoteEditorPage.tsx:26-29`），**无压缩、无大小限制、最多 9 张**；分享卡片是 `html-to-image` 生成的 PNG data URL，同时写入 `note.shareCardDataUrl` 和同步帖子的 `imageUrls`（`NoteEditorPage.tsx:401-421`）——同一张图在库里存两遍。
- 浏览器 localStorage 常见额度约 5MB（不同浏览器计量口径不同；按 UTF-16 约 250 万字符）。1MB 照片 base64 后约 1.37M 字符 → **1–2 张照片就触及上限**；一张分享卡片（长边 2x，估算 300–800KB base64）×2 份 → **2–3 篇带卡片笔记打满**。所谓“最多 9 张”实际不可达。
- **写失败无处理**：`writeStorage` 没有 try/catch（`storage.ts:18-22`）；`addPost`（`NewPostPage.tsx:186-194`）和笔记发布（`NoteEditorPage.tsx:392-428`）都没有捕获异常 → 用户点发布后 `QuotaExceededError` 抛出，toast 还没来，数据不落库、页面无提示；阅读页 60 秒定时器里的 `updateCurrentUser` 抛错则成为未捕获异常（`ReaderPage.tsx:104-115`）。
- 没有任何 quota 监控、降级策略、备份或恢复入口。**P0 级数据丢失风险。**

#### 1.3.3 多标签页并发

- 全仓库**没有** `storage` 事件监听、`BroadcastChannel`、`visibilitychange`/`focus` 刷新逻辑（grep 0 命中）。A 标签页改了数据，B 标签页的 React state 不会更新（例如 ForumPage 只在自身操作或切 tab 时重新 `setDb`，`ForumPage.tsx:41-53`）。
- 所有写入都是“读整库 → 改内存 → 写整库”，**没有版本号、锁、事务**。虽然每次 mutation 前会重新 `readDb()`（比长期缓存快照好一点），但读改写不是原子操作：A 读到旧库并新增帖子；B 在 A 写之前读到旧库并点赞；B 后写会用“旧库 + 点赞”整库覆盖，**A 的新帖直接消失**。窗口窄但后果是整条记录丢失。
- 同一标签页内：`addOrUpdateNote` 在 `await` 之前写库（`db.ts:1494-1518`），主链路同步，问题不大；但 AI 消息同时写 localStorage（`GlobalAIAssistant.tsx:87-90`）和 DB（`db.ts:1752-1767`），两处无一致性保证，见 1.4。

#### 1.3.4 跨设备同步缺失

- 数据只在这个浏览器的这个 origin 下；登录用的 Supabase 用户 id 与 db 的 `currentUserId` **没有任何关联**（`currentUserId` 只在种子数据里赋值：`db.ts:1147`；全仓库无二次赋值，grep 验证）。
- 后果：换浏览器/换设备/清缓存 = 用户全部内容（帖子、评论、笔记、收藏、阅读历史、AI 记录）永久丢失；多设备无法共享；不同访客看到的是各自浏览器里的“平行社区”。
- 项目文档宣称“实现了阅读进度、笔记等数据的跨设备同步”（`项目文档.md:647`，另见 `项目文档.md:471`），与实现相反；实现只有“按章节恢复上次章节”（`ReaderPage.tsx:80-97`，progress 恒传 0，`db.ts:1636-1649`）。**这是面试中最容易被追问穿的点。**

### 1.4 数据模型缺陷（回答④）

**结构性问题**：
1. **没有关系与外键**：`Comment.postId`、`Post.authorId`、`Note.authorId`、`Interaction.targetId`、`ReadingHistory.bookId` 全是裸字符串（`models.ts:68-140`）；`addComment` 不校验帖子是否存在（`db.ts:1409-1417`），可产生孤儿评论。
2. **计数 stats 冗余且无单一真相**：Post/Note 各 5 个计数（`models.ts:77-83,115-121`），User 5 个（`models.ts:11-17`），靠手工 ±1 维护，但大量路径没维护：
   - `Note.stats.comments/views/shares` **从不由业务更新**（`addComment` 只动 post.stats，`db.ts:1409-1417`；`incrementPostView` 只动 post，`db.ts:1394-1400`），但 UI 在展示（`HomePage.tsx:177`、`MyNotesPage.tsx:41-42`、`CollectionsPage.tsx:56`）；
   - `User.stats.postsCount/notesCount` 在新增时 +1（`db.ts:1429-1430,1505-1508`），删除时**不减**（`db.ts:1443-1454,1523-1529`）→ 越用越漂移；而且全仓库没有任何 UI 读取这两个字段（grep 只有写）；
   - `User.stats.readingMinutes` 只被 ReaderPage 写（`ReaderPage.tsx:104-115`），但 MePage 展示的是 auth 用户的 stats（`MePage.tsx:9,53`）→ **恒为 0**；且定时器闭包里 `user` 是旧引用，每分钟写入的是“初始值 + 1”，不会累加；
   - `followersCount` 是随机种子数（`db.ts:133`），FollowersPage 按这个数字生成“读者 A/B/C…”（`FollowersPage.tsx:10-21`），文案还写着“关注用户列表将在完成 Supabase/数据库接入后自动展示真实数据”（`FollowersPage.tsx:42`）——**没有 follow 表/类型，关注功能不存在**。
   - **种子数据自相矛盾（当前数据即错，不是“以后接库”的问题）**：

| 对象 | 计数（种子） | 实际记录 | 用户看到的效果 |
|------|------------|---------|---------------|
| post1 | comments = 3（`db.ts:922`）| 2 条（`db.ts:982-999`）| 列表 3 条、详情 2 条 |
| post2 | comments = 5（`db.ts:934`）| 0 条 | 列表显示 5 条评论，点进去没有 |
| post3 | comments = 18（`db.ts:946`）| 3 条（`db.ts:1001-1024`）| 差 15 条 |
| post4 | comments = 12（`db.ts:958`）| 0 条 | 差 12 条 |
| post5 | likes = 89、comments = 42（`db.ts:970`）| 2 条评论、0 条互动记录（`db.ts:1026-1041`）| 显示 89 赞但 `hasInteraction` 为 false，红心不亮（`PostDetailPage.tsx:75-76`）|
| 用户“书海泛舟” | postsCount = 25（`db.ts:542`）| 实际 1 篇（post4）| 个人页统计不可信 |
| 当前用户 | postsCount = 2（`db.ts:467-473`）| 实际 0 篇（2 篇笔记）| 统计错位 |

3. **删除不级联**：
   - `deletePost`：删 posts[id] + 该帖 comments（`db.ts:1443-1454`），但 **interactions**（点赞/收藏 targetId 指向该帖）、`admin.pinnedPostIds`/`featuredPostIds`、通知里的 link、`user.stats.postsCount` 都不清理 → 收藏页/后台/统计残留；
   - `deleteNote`：只删 notes[id]（`db.ts:1523-1529`），interactions 留着（`toggleInteraction` 支持 note，`db.ts:1550-1569`）；笔记也没有评论模型（`Comment` 只有 `postId`）；
   - 没有 tag 清理，tag 只是字符串数组（`models.ts:73`）。
4. **时间戳**：全部 `Date.now()` 客户端时间（`db.ts:66-68`），无时区、无服务器校验、无单调性；`updatedAt` 无条件覆盖（`db.ts:1439,1499`）；种子用相对 `now()` 生成（如 `db.ts:142`）→ 每次新建种子都“是最近 14 天内的数据”。
5. **ID 生成**：nanoid 21 字符（`db.ts:1,1411`）；interactions 用复合 key `${userId}:${kind}:${targetType}:${targetId}` 同时作为 id 和主键（`db.ts:1531-1565`），阅读历史用 `${userId}:${bookId}`（`db.ts:1638`）——**幂等/去重设计是数据层少有的亮点**，但 ID 语义不统一（nanoid vs 确定性复合键），且 User.id 与登录体系无关。
6. **“写了不读 / 读了不写”抽查**（全量 grep 结果）：
   - **写而无读/根本无实现**：`db.bookmarks`（`db.ts:49,1154`；模型 `Bookmark` 在 `models.ts:124-131`，**无任何 CRUD**）、`User.role`（只在种子与 `MePage.tsx:146` 对 auth 对象误用）、`User.stats.postsCount/notesCount/followingCount`、`User.settings.notifications`（`SettingsPage.tsx:16-18,30-38` 写，业务无读）、`Book.audioIntroUrl`（`db.ts:608` 是 example.com 死链）、`Note.source`（只有种子写，UI 未读）、`pushNotification`（`db.ts:1669-1684`，**0 调用**）→ 消息中心永远只有 3 条种子（`db.ts:1157-1188`）；
   - **读而不写**：`Note.stats.comments/views/shares`、`followersCount`（假数）、`post.views` 只在详情页 +1（`db.ts:1394-1400`），刷新即涨、无去重；
   - **双写真相**：AI 聊天消息同时写 `rf_ai_chat_messages`（`GlobalAIAssistant.tsx:26-28,87-90,321-324`）和 `db.aiChatMessages`（`db.ts:1752-1767`），两套查询键（`AIChatHistoryPage.tsx:10,13` 用 db 用户 id）→ 必然分叉。

### 1.5 种子数据规模与质量（回答⑤）

**规模**（`createSeedDb`，`db.ts:457-1206`）：

| 实体 | 数量 | 证据 |
|------|------|------|
| 用户 | 8（“新手读者”+7 个种子昵称）| `db.ts:499-578` |
| 书籍 | 14 | `db.ts:596-903` |
| 章节 | 26（多数 1–2 章/本）| 同上；小王子2、P&P 1、红楼2、1984 2、围城2、三体2、活着2、Gatsby 2、朝花夕拾2、百年孤独2、瓦尔登湖2、万历2、饮食术2、时间简史1 |
| 帖子 | 5（另有 `ensureSciFiTopicSeed` 补丁 4 条，读取时按需注入）| `db.ts:911-972`；`db.ts:85-418` |
| 评论 | 7（另有 `ensureSciFiTopicSeed` 补丁 24 条）| `db.ts:982-1042`；`db.ts:85-418` |
| 笔记 | 6 | `db.ts:1051-1142` |
| 标签 | 13 | `db.ts:580-594` |
| 通知 | 3 | `db.ts:1157-1188` |
| 书架 | 2 | `db.ts:1189-1194` |

**质量（这是“书内容是否真实、帖子是否机器生成”的直接回答）**：

- **书内容不是真实全书，是 1–2 章片段，且三类混用**：
  - a) 相对忠实的经典片段：`1984` 第一章开场逐字（`db.ts:692`）、`The Great Gatsby` 第一/二章大段原文（`db.ts:779-792`）、`红楼梦` 第一回接近原文（`db.ts:662-666`）、`朝花夕拾` 两篇摘录（`db.ts:809-810`）、`时间简史` 第一章（`db.ts:897-899`，译文）；
  - b) 明显简化/改写：`小王子` 仅两句梗概（`db.ts:614-620`）、`围城` 首章改写（`db.ts:709`）、`活着` 开篇改写（`db.ts:760`）；
  - c) **AI 生成且事实/情节错误（高风险）**：`三体`“第一章：红岸基地”整段为虚构，不是刘慈欣原文（`db.ts:729-733`）；`红楼梦`“第二回”把甄士隐与贾雨村写成官驿相会（`db.ts:671-675`），与原著第二回（冷子兴演说荣国府、甄士隐已随道人出家）不符；`百年孤独` 第二章开头直接复述第一章首句（`db.ts:827`），后文是泛泛概述；`万历十五年` 两章（`db.ts:860-861`）、`饮食术` 两章（`db.ts:877-878`）均为“像书评/概述”的生成文本。
  - 结论：**不能对外宣称“内置真实书籍/支持全文阅读”**；若公开部署，1984 等仍在版权期的逐字典段有合规风险（需自行核实）。
- **帖子/评论区是手写或 LLM 生成的演示内容**，同一叙事口吻；所有计数是“装饰数值”，与真实记录不一致（见 1.4）。
- **随机性**：sci-fi 补丁用户的 `followersCount`/`readingMinutes` 用 `Math.random()`（`db.ts:130-134`）→ 每个浏览器看到的社区数据都不同、无法复现，不适合作为演示固定数据。
- **“AI 推荐理由”是静态字符串**（如 `db.ts:606,655`），首页“个性化推荐”实际是 `recommendedHeat` 排序 + 预置字段（`HomePage.tsx:32-38`）。
- **封面资源**：`public/covers/` 下 14 张 PNG/JPG 每张 0.9–2.0MB（合计约 17MB），部分书籍另用 Unsplash 外链（`db.ts:630,685`）→ 首屏体积和离线可用性都受影响。

### 1.6 查询函数：全表扫描、无分页、无搜索（回答⑥）

**全部查询都是内存操作，并且每次先 parse 整库。** 具体复杂度：

| 函数 | 复杂度 | 证据 |
|------|--------|------|
| `listPosts` / `listNotes` | O(n) + 排序 O(n log n)，每次调用都重排 | `db.ts:1372-1387,1456-1468` |
| `listComments` | O(全部评论) + 排序 | `db.ts:1402-1407` |
| `listContentByTag` | O(全部帖 + 笔记) | `db.ts:1572-1580` |
| `listUserInteractions` / `listNotifications` / `listVocab` / `listAIChatMessages` | O(全表) 过滤 | `db.ts:1596-1601,1686-1690,1623-1627,1762-1766` |
| `getUnreadNotificationCount` | O(全部通知)，MePage 每次渲染调用 | `db.ts:1693-1696`；`MePage.tsx:13` |
| `getPost` / `getBook` / `getNote` | 字典 O(1)，但前置 O(整个 blob) 的 JSON.parse | `db.ts:1389-1392,1341-1343,1470-1472` |

- **没有分页**：ForumPage 直接 map 全部帖子（`ForumPage.tsx:173-205`），NotesPage / 评论列表同理；所有 list API 都没有 limit/cursor/page 参数（grep 无）。首屏只是 `.slice(0, n)` 截断（`HomePage.tsx:36-46`）。
- **没有全文搜索**：SearchPage 输入框回车只跳 `/read?q=` 搜**书**（`SearchPage.tsx:64-68`）；`aiSearchBooks` 只是 `listBooks().filter(title/author/summary.includes)` + 300ms `setTimeout` 假延迟 + 对“匠心书单”随机打乱（`ai.ts:323-353`）。**帖子、笔记、用户完全不可搜。**
- **榜单/热词是硬编码**：热门搜索列表写死（`SearchPage.tsx:18-28`）；ReadSearchPage 结果数写死“999+ 条”（`ReadSearchPage.tsx:94`）；ForumPage 用 `setTimeout(500)` 假装加载（`ForumPage.tsx:41-53`）。这些是演示包装，不是数据能力。
- **渲染期查询**：19 个文件使用 `getCurrentUser`，多数在 render 函数体直接调用（grep 统计）；ReaderPage 每次渲染还触发一次写（见 1.3）。没有查询缓存/订阅/`useSyncExternalStore`，数据变更多靠局部 `setState` 手动刷新（如 `NotesPage.tsx:193,201`），跨页面不自动更新。

### 1.7 类型安全缺口（回答⑦）

1. **运行时零校验**：`readStorage<T>` 只做 `JSON.parse` 后强转，解析失败返回 fallback（`storage.ts:1-16`）；`package.json` 里没有 zod/valibot 等校验库（依赖见 `package.json:13-36`），全项目无 schema 校验。
2. **Database 类型不可共享**：类型声明在模块内部、未 export（`db.ts:39-62`）；页面只能靠 `ReturnType` 推断，无法在别处声明“这是 Database”。`version` 是字面量 `4`，但运行时没有任何代码真正把它守住。
3. **迁移是“补 key”不是“迁移结构”**：`migrateToV4` 只补顶层集合（`db.ts:70-83`），嵌套的 `User.settings/stats` 不会补；旧 blob 若缺 settings，`theme.ts:7` 的 `user.settings.theme` 直接 TypeError；而 `version !== 4` 时不是升级而是**重置**（`db.ts:1246`）。
4. **版本号与 key 漂移**：key 是 `read_forum_db_v5`（`db.ts:64`），`version` 是 4（`db.ts:40`）；v3 分支 if/else 相同（`db.ts:1239-1243`），说明迁移逻辑未想清楚（推测）。
5. **dbService 的类型是“谎报”**：承诺返回 `Post[]`/`User`（`dbService.ts:13-56`），实际 Supabase 返回 snake_case 行；没有数据库生成类型，且表不存在（`schema.sql`）。
6. **mock 客户端用 `as unknown as SupabaseClient` 通过编译**（`supabase.ts:55`）；`AuthProvider` 把 `roles: ['user']`、`permissions: []` 硬编码（`AuthProvider.tsx:57-58,105-106,169-171`），类型上却声称是 `AuthRole[]` / `AuthPermission[]`——类型完全没约束真实行为。
7. **双 User 模型**：`models.User`（`models.ts:3-33`）与 auth `AuthUser`（`types.ts:12-22`）字段/身份完全不同；`MePage.tsx:9` 用 `as unknown as { stats... }` 强转去“偷” stats，说明两套模型无法统一。
8. **种子里的非空断言** `sampleBooks[0]!`（`db.ts:1064` 等）绕过 strict；`getDbSnapshot` 把整库直接暴露给页面索引（`AdminPage.tsx:103,163`、`SearchPage.tsx:36-37` 等），页面承担了本应属于仓储层的关联查询。

> 补充：当前 `npx tsc -p tsconfig.app.json --noEmit` **可以通过（exit 0）**，所以问题不是“编译不过”，而是“编译期类型正确、运行期数据不可信”。这比直接报错的类型问题更危险。

## 二、问题清单

| 编号 | 严重度 | 位置（file:line） | 问题 | 影响 | 修复方向 |
|------|--------|------------------|------|------|---------|
| D-01 | **P0** | `storage.ts:18-22`；`db.ts:1254-1256`；`NewPostPage.tsx:9-22,186-194`；`NoteEditorPage.tsx:401-421` | 单 blob 全量写、无 quota 捕获；图片以 base64 原样入库、卡片图存两份 | 5MB 溢出时写入抛错且无提示，数据不落库；用户以为发布成功；阅读页定时器未捕获异常 | 图片压缩 + IndexedDB/对象存储；写包装 try/catch + 失败回滚 + 配额提示；导出/导入备份 |
| D-02 | **P0** | `db.ts:1236,1246,1301-1307`；`storage.ts:1-8` | JSON 解析失败 / 版本不符 / 当前用户缺失时直接 `createSeedDb()` 覆盖 | 一次损坏或一次升级即全部用户数据无提示丢失，且无备份可恢复 | 运行时校验 + 版本化迁移器 + 迁移前备份旧 key + 失败时不写回、给出恢复入口 |
| D-03 | **P0** | `AuthProvider.tsx:50-61`；`db.ts:458,1147`；`MePage.tsx:9-13`；`GlobalAIAssistant.tsx:154-163,462-470`；`AIChatHistoryPage.tsx:10,13` | 认证身份（Supabase uuid）与数据身份（种子 nanoid）两套且不关联 | MePage 帖/笔记数恒 0；AI 对话历史永远空；AI 收藏的笔记不进入“我的笔记”；换设备/清缓存全损 | 以 auth.uid 作为 users 主键；登录后一次性迁移本地数据；统一 `useCurrentUser`；删除所有本地种子用户假设 |
| D-04 | **P0** | `supabase.ts:20-56`；`AuthProvider.tsx:197-207`；`LoginPage.tsx:160-164`；`RequireAuth.tsx:10-14` | 缺 Supabase env 时 mock 返回 `error:null` 但不建会话：登录“成功”后立刻被 RequireAuth 重定向回登录页，无错误提示 | 全新克隆/未配 env 的部署完全无法进入应用（条件性，取决于部署环境是否有 env；仓库内无 `.env`/`.env.example`） | 启动时显式校验配置；无配置时明确报错或进入本地演示模式；补 `.env.example`；mock 返回真实错误 |
| D-05 | **P0** | `src/services/ai.ts:7,99` | 豆包 API Key 明文硬编码进前端 bundle | 密钥随构建产物公开，可被盗刷/滥用（安全 P0） | 立即轮换密钥；改服务端代理；secret 扫描进 CI；任何 key 不进前端 |
| D-06 | **P0** | 所有 mutation（如 `db.ts:1419-1433`） | 多标签页“读整库→改→写整库”无锁无版本；无 `storage`/`BroadcastChannel` 失效通知（grep 0） | 并发交错时整库覆盖，可能丢失另一标签页刚写入的整条记录；页面数据陈旧 | 单写者/版本号+冲突重试；IndexedDB 事务；`BroadcastChannel` 通知各标签页失效；最终切到服务端 |
| D-07 | **P1** | `dbService.ts:11-207`；`schema.sql:1-135`；`db.ts:25-36,1511-1518`；`supabase.ts:45-47` | dbService 13 个方法只用 2 个；目标业务表在 schema 中不存在；列名 camelCase/snake_case 不一致；healthCheck 假阳性；createNote 每次抛错被吞 | 伪装“已接 Supabase”，误导维护与面试；控制台噪音 | 删除或真正实现；健康检查改为查询真实业务表；用 supabase gen types 生成类型 |
| D-08 | **P1** | `db.ts:922,934,946,958,970` vs `db.ts:982-1042` | 种子评论/点赞计数与实际记录不一致 | 列表显示 42 评论、详情只有 2 条；89 赞但红心不亮——用户可见的数据自相矛盾 | 计数由记录派生或事务维护；重做种子数据并加数据一致性脚本 |
| D-09 | **P1** | `db.ts:1443-1454,1523-1529,1541-1570` | 删除帖子/笔记不清理 interactions、后台引用、用户计数 | 收藏/后台/统计残留孤儿数据；永久漂移 | 软删除 + 统一 cascade 清理函数（或数据库 FK on delete cascade） |
| D-10 | **P1** | `models.ts:11-17,77-83,115-121`；`db.ts:1394-1417,1505-1508`；`ReaderPage.tsx:104-115`；`MePage.tsx:9,53` | 计数冗余但读写链路不闭合：Note 计数永不更新、User 计数只增不减、readingMinutes 写 db 读 auth | 所有统计数字不可信 | 去掉冗余计数、按需聚合，或由触发器/事务维护并提供对账；统一读取来源 |
| D-11 | **P1** | `db.ts` 各 `list*`；`ForumPage.tsx:173-205`；`ai.ts:323-353`；`SearchPage.tsx:64-68` | 无分页、无社区/笔记搜索；所有查询内存过滤且每次先 parse 整库 | 数据量增长后不可用；搜索功能名不副实 | 服务端分页/索引；Postgres FTS/trgm；前端查询缓存；补真实搜索入口 |
| D-12 | **P1** | `db.ts:1208-1252,1258-1261` | 读路径有写副作用（迁移/种子补丁/初始化都写回）；`ensureDbInitialized` 每次启动全量写 | 不可预测的写入；被删除的种子内容可能复活；启动即写库 | 初始化/迁移独立于读；种子只跑一次；getter 纯读 |
| D-13 | **P1** | `HomePage.tsx:25-37`；19 个页面 render 期查询；`ReaderPage.tsx:39-43,93-97` | 渲染期执行 IO；首页一次渲染约 6 次整库 parse；ReaderPage 每次渲染写整库 | 主线程卡顿、写放大、竞态；图片变大后尤其严重 | 数据 hooks + 缓存/订阅（TanStack Query 或 `useSyncExternalStore`）；组件不再直接 import 仓储 |
| D-14 | **P1** | `GlobalAIAssistant.tsx:26-28,87-90` vs `db.ts:1752-1767`；`AIChatHistoryPage.tsx:10,13` | AI 消息双份存储（localStorage + DB）且两套身份查询键 | 数据分叉、历史页永远空、重复占用配额 | 单一真相 + 迁移；统一用户身份 |
| D-15 | **P1** | `AuthProvider.tsx:57-58,324-328`；`RequirePermission.tsx:14-18`；`App.tsx:102-108`；`MePage.tsx:146` | 权限列表恒空、角色写死；MePage 用 auth 用户的 `user.role` 判断后台入口（AuthUser 只有 roles 数组，运行期恒为 undefined） | AdminPage 在真实登录下不可达（后台/审核/删除功能死）；权限设计只是装饰 | 真实 RBAC 数据源（Supabase 表/JWT claim）；统一 User 模型；迁移后台页面 |
| D-16 | **P1** | `db.ts:49,1154`；`models.ts:124-131,110-114`；`db.ts:608,1669-1684` | 死字段/死功能：bookmarks、`Note.source`、`audioIntroUrl`、`pushNotification`、通知设置 | 书签功能不存在、死链、消息中心永远 3 条种子；面试被问即穿 | 落地或删除；通知由业务事件生成并读取用户设置 |
| D-17 | **P1** | `db.ts:1325-1333,1572-1580`；`ForumPage.tsx:194-195` | tag 名称自带 `#`、内容只存 tag 字符串无 id 关联；ForumPage 再拼 `#` 会出现 `##标签` | 数据脏、无法重命名/合并/治理；UI 显示错误 | tag 实体化 + 关联表；展示层统一格式化；补标签管理 |
| D-18 | **P1** | `db.ts:692,729-733,779-792,827,671-675,860-861,877-878` | 书内容混杂：AI 伪造、情节错配、原文/改写/概述混用；仅 1–2 章/本 | 不能宣称真实书籍/全文阅读；公开部署有版权风险（需核实） | 换用公版/授权文本或明确标注“演示摘录 + 来源”；内容审核 |
| D-19 | **P1** | `db.ts:130-134` | 种子用 `Math.random()` 生成粉丝数/阅读时长 | demo 不可复现，每个浏览器数据不同 | 固定数据或 seeded random |
| D-20 | **P1** | 全仓库无导出入口（grep 0）；`storage.ts` | 无备份/导出/导入/监控 | 清缓存即全损，无法恢复 | 导出/导入 JSON + 自动备份副本 + 数据健康检查页 |
| D-21 | **P1** | `storage.ts:10-16`；`db.ts:39-83,1263`；`dbService.ts:13-56`；`MePage.tsx:9` | 运行时无校验、盲 cast、Database 不导出、双 User 模型、dbService 类型谎报 | 运行期崩溃/数据漂移，而编译器不报错 | zod schema + 存储边界校验；生成数据库类型；统一领域模型 |
| D-22 | **P1** | `db.ts:1237-1251`；`theme.ts:7` | 迁移不处理嵌套字段、版本不符即重置、v3 分支 if/else 相同 | 老数据升级崩溃或被清空 | 版本化迁移器 + 每步单测；迁移失败不写回 |
| D-23 | **P2** | `项目文档.md:37,499,562,647,653`；`README.md:1` | 文档与实现不符：MySQL 8.0 / 跨设备同步 / 数据加密 / 100+ 并发；README 仍是 Vite 模板 | 面试可信度风险 | 重写 README 与架构文档，删掉未实现声明 |
| D-24 | **P2** | `ForumPage.tsx:41-53`；`ReadSearchPage.tsx:94`；`ai.ts:345` | 假加载 500ms、假“999+ 条”、搜索假延迟 300ms | 演示可信度低 | 用真实 loading/计数替换 |
| D-25 | **P2** | `authApi.ts`（0 import）；`auth/server/*`；`schema.sql`；`rls.sql`；`seed.mjs` | 自研认证后端整套死代码/死依赖（express/bcrypt/pg 不在根依赖） | 仓库噪音，面试被问“为什么有两套认证” | 删除或归档到 docs/experiments 并说明 |
| D-26 | **P2** | `public/covers/*`（0.9–2.0MB × 14） | 封面未压缩，静态资源约 17MB | 首屏体积/弱网体验差 | 压缩为 WebP/AVIF + 懒加载 |
| D-27 | **P2** | `package.json:4-12`；无测试文件 | 无测试、无 CI、无 lint 门禁（`typecheck` 存在但未进 CI） | 质量不可证明；重构无回归网 | Vitest + Playwright + GitHub Actions（typecheck/lint/test/build） |
| D-28 | **P2** | `db.ts:1208-1252` | `readDb` 在 SSR（window undefined）时返回空库而非报错（`db.ts:1220-1234`），掩盖环境问题 | 掩盖问题 | 显式抛错或统一注入存储适配器 |

> 统计口径：`db.ts` 共 52 个导出函数，仅 `pushNotification` 无任何外部调用；`dbService` 13 个方法仅 2 个被调用；全站无 `React.lazy`/动态 import/`Suspense`（grep 0 命中），与文档中的“代码分割、懒加载”不符。

## 三、重构建议

### 3.1 目标设计

**原则**：① 单一真相，计数不手工维护；② 页面只依赖“数据 hooks”，不直接 import 存储实现；③ 存储可替换（本地 IndexedDB ↔ 云端 Postgres），迁移和备份是一等公民；④ 用户身份以 `auth.uid` 为主键；⑤ 图片/大对象永远不进 JSON。

目标架构（ASCII）：

```
React 页面/组件（只消费 hooks，不在 render 里做 IO）
        │
        ▼
数据 hooks 层：usePosts / usePost / useCurrentUser / useNotifications …
（TanStack Query 或 useSyncExternalStore + 事件订阅 + 乐观更新 + 失效通知）
        │
        ▼
Repository 接口（TS 类型 = zod schema 推导；每个方法有契约测试）
   ├── LocalAdapter：IndexedDB（Dexie），一实体一表，事务；老 localStorage 一次性导入
   └── CloudAdapter：Supabase Postgres + RLS + Storage（图片）+ Realtime
        │
        ▼
迁移/备份子系统：schemaVersion、migrate(vN→vN+1)、导出/导入、迁移前自动备份
```

**目标数据模型（Supabase/Postgres 版，可直接作为 ER 图）**：

| 表 | 关键字段 | 约束/说明 |
|----|---------|----------|
| `profiles` | id (=auth.uid), nickname, bio, profile_tag, created_at | PK=auth.uid；注册触发器自动建行 |
| `books` | id, title, author, category, difficulty, cover_path, summary, language | 封面存 Storage path，不存外链/大图 |
| `chapters` | id, book_id, idx, title, content | FK book_id on delete cascade；正文单独表，不随 book 全量加载 |
| `posts` | id, author_id, title, content, created_at, updated_at, deleted_at | FK author_id→profiles；`deleted_at` 软删；全文索引 |
| `post_images` / `note_images` | id, post_id/note_id, storage_path, sort | FK on delete cascade；图片在 Storage |
| `comments` | id, post_id, author_id, parent_id, content, created_at | FK post_id cascade；parent_id 自引用 |
| `notes` | id, author_id, title, content, status, template, source_book_id, source_chapter_id, created_at | 状态 draft/published；source 用真 FK |
| `tags` / `post_tags` / `note_tags` | tag: id, name(unique, 不带#) | 关联表 PK(tag_id, post_id)；重命名/合并可行 |
| `interactions` | user_id, target_type, target_id, kind, created_at | unique(user_id,kind,target_type,target_id)；target 用两次插入触发器或拆表 post_likes/note_collects |
| `shelves` | user_id, book_id, added_at | PK(user_id, book_id) |
| `reading_history` | user_id, book_id, chapter_id, progress, updated_at | PK(user_id, book_id)；progress 0–1 服务端校验 |
| `follows` | follower_id, following_id, created_at | PK(follower_id, following_id)；粉丝数聚合查询/物化视图 |
| `notifications` | id, user_id, type, payload(jsonb), read_at, created_at | 由事件（评论/点赞/关注）产生；读设置决定是否生成 |
| `ai_threads` / `ai_messages` / `ai_analyses` | user_id, thread_id, role, content, payload, analysis(jsonb) | 统一存一份，不再 dual-write |

**必须写进验收的硬性规则**：
1. 计数（赞/评论/浏览/粉丝）只能是“派生值或事务维护值”，任何新增/删除路径都必须在同一事务内更新；
2. 删除一律软删 + 级联清理（评论、互动、图片、通知、索引）；
3. 时间戳由服务端生成（`timestamptz`），ID 用 ULID/uuid v7；
4. 所有跨表读取必须走 Repository 方法，页面不允许拿整库对象自己 `Object.values`；
5. 图片在入库前压缩（长边 ≤1280、JPEG/WebP、目标 ≤200KB），数据库只存 Storage path。

### 3.2 分阶段落地

#### Phase 0：止血（0.5–1 天，不改架构，先消除 P0）

1. 轮换并移除硬编码豆包 Key（`src/services/ai.ts:7,99`），改走服务端代理或至少 `.env` + 服务端签名；加 CI secret 扫描。
2. `storage.ts` 包 try/catch：捕获 `QuotaExceededError`，写失败回滚乐观状态并 toast 明确提示；加 localStorage 占用监控。
3. 新增“导出数据 / 导入数据”JSON（`getDbSnapshot` 序列化 + 校验后导入），并在迁移/重置前自动备份到 `read_forum_db_backup_<ts>`。
4. 删除 `deletePost`/`deleteNote` 的孤儿数据（至少 interactions + admin 引用 + 用户计数）；修种子计数（让计数与记录一致）。
5. 修 D-04：启动时检查 `import.meta.env.VITE_SUPABASE_*`，缺失时明确提示/进入本地演示模式，不再静默 mock；补 `.env.example`。
6. 统一 MePage/TopBar 与内容数据的用户身份：先临时改成 `getCurrentUser()`，同时把 auth user id 写入 db.currentUserId 作为过渡（登录后 `linkCurrentUser(auth.uid)`）。

**Phase 0 验收**：无明文密钥；配额失败有提示且不丢状态；导出→清空→导入可完整还原；MePage 数字与列表一致；新克隆有明确配置提示。

#### Phase 1：本地优先数据层重构（约 1 周，面试前必须完成）

1. 引入 Dexie：`db/indexeddb.ts` 定义 schema v1（表 = 3.1 的实体），索引 `authorId/postId/targetId/createdAt/updatedAt`。
2. `db/repository.ts` 定义接口 + `LocalAdapter` 实现（posts.create/listPage/get/update/remove，notes…），业务语义方法（`toggleLike`、`addComment`、`markAllRead`）内部用事务保证计数与记录一致。
3. `db/migrate.ts`：读取旧 `read_forum_db_v5` → zod 校验 → 逐条写入 IndexedDB → 校验条数 → 写迁移报告 → 保留旧 key 只读备份；失败不删旧数据。
4. 数据 hooks：`useCurrentUser/usePostList/usePost/useNotes/useInteractions`，用 `useSyncExternalStore` 或 TanStack Query 缓存；`BroadcastChannel('db-invalidate')` 让其他标签页失效刷新。
5. 图片：`compressImage(file)`（canvas→WebP/JPEG）+ IndexedDB Blob 表 + `URL.createObjectURL`；分享卡片同样压缩后存 Blob，DB 只存 imageId。
6. 删除 `db.ts` 的单 blob 实现（保留一个只读兼容层给未迁移页面，按页面逐个替换），页面不再出现 `getDbSnapshot`。
7. 契约测试：Repository 每个方法 before/after 状态断言；迁移测试用真实旧 blob 样本；并发测试（两个 tab 同时写）。

**Phase 1 验收（量化）**：
- 写入 1 条记录只写 1 张表（Dexie `put`），不再整库序列化；1000 条帖子时点赞 P95 < 10ms（本地，估算目标）；
- 列表页首屏查询 P95 < 50ms，且不再整库 parse；
- 旧 localStorage 数据迁移 100% 条数一致、字段抽检 100% 通过、失败可回退；
- 双标签页同时发帖/点赞 100 次无丢失（自动化脚本验证）；
- 1000 张压缩图（每张 ≤200KB）IndexedDB 总量 ≤200MB；localStorage 只保存 < 5KB 配置；
- `vitest` 覆盖率：repository + migrate ≥80%，E2E 覆盖发帖/评论/点赞收藏/删除。

#### Phase 2：接真云端（2–3 周，可选但强烈建议）

1. `supabase/migrations/*.sql`：建 3.1 的表、外键、索引、FTS（`to_tsvector` + GIN）、触发器（updated_at / 计数）、RLS 策略（user 只能写自己的内容；公开内容可读；admin 由 JWT claim/role 表判定）。
2. `CloudAdapter` 实现 Repository；登录后 `profiles` 以 auth.uid 建立；本地数据按用户确认后批量同步；Realtime 订阅帖子/评论变化。
3. 图片走 Supabase Storage（bucket + policy），前端只存 path；生成缩略图。
4. 豆包 API 走 Supabase Edge Function/自建 serverless 代理，key 只在服务端；加 rate limit 与审计。
5. 分页/搜索全部服务端化：`limit/offset` 或 cursor；`search_posts(q)` RPC。
6. 清理死代码：dbService、auth server、authApi、schema/rls 遗留（或迁移到 `docs/legacy/` 并说明）。

**Phase 2 验收**：两个浏览器同账号看到同一数据；断网可写、恢复同步不丢（outbox 重放）；RLS 渗透测试 A 用户不能改 B 内容；1000 帖 / 1 万评论分页 P95 < 200ms；删除帖子后评论/互动/图片/通知全清；E2E 全绿。

### 3.3 不要做的事

- ❌ 继续往 `db.ts` 加函数（会变成 3000 行的“上帝对象”）；
- ❌ 只把 localStorage 换成 Supabase、却保留“整表 select * + 前端过滤”的查询方式；
- ❌ 把图片 base64 塞进任何数据库字段；
- ❌ 让页面继续拿 `getDbSnapshot()` 自己遍历全库；
- ❌ 用演示数字（999+、种子点赞）当真实指标写进简历；
- ❌ 在面试里说“用了 Supabase 数据库/实现了跨设备同步”，除非 Phase 2 真完成。

## 四、面试可讲点

### 4.1 真正值钱的亮点（按可信度排序）

1. **产品完成度与前端工程（当前最强资产，真实可演示）**：26 个业务页面 + 4 个认证页面（`src/pages` 26 个 `*Page.tsx` + `auth/client/pages` 4 个），覆盖阅读器（字体/背景/AI 赏析/翻译/朗读）、笔记（编辑器/模板/分享卡片）、社区（发帖/评论/楼中楼/点赞/收藏/话题）、AI 助手（流式）、个人中心、后台；桌面/移动双 Shell 响应式（`App.tsx:61-62`）。这可以作为“从 0 到 1 交付能力”的主叙事，**但只能说是前端/产品能力**。
2. **完整的领域建模意识**：19 个领域类型（`models.ts`）+ 52 个函数的统一数据门面（`db.ts`），页面不直接碰 localStorage（唯一例外 `GlobalAIAssistant`）——说明作者有“存储与 UI 分离”的直觉。重构后把它升级为真正的 Repository 接口，这个故事就值钱了。
3. **幂等互动与乐观更新**：interaction 复合键 `${userId}:${kind}:${targetType}:${targetId}` 天然去重、toggle 可重入（`db.ts:1531-1569`）；点赞/收藏/转发先在本地更新 UI（`PostDetailPage.tsx:147-158,201-213`）。这是数据层里唯一“可以拿去讲设计”的点，重构时保留并加事务。
4. **认证方案迁移经验（需先清理遗留代码）**：从自研 RBAC（`auth/server` + `schema.sql` 的 users/roles/permissions/refresh token 设计）迁移到 Supabase Auth（`AuthProvider.tsx`），可以讲取舍：自研成本、运维、安全边界；但必须删掉两套并存的死代码，否则会被问“为什么有两套认证/到底哪套在用”。
5. **AI 集成工程**：流式响应逐字渲染（`GlobalAIAssistant.tsx:188-202`）、AI 赏析结构化解析（`ai.ts:243-287`）、AI 结果落库（`db.ts:1769-1786`）。讲“流式 + 结构化 + 持久化”的链路；但必须先把 key 挪到服务端。
6. **可演示数据工程**：14 本书 / 26 章 / 社区内容的 Demo 资产是花时间做的；讲“为演示准备可复现种子数据”没问题，但**不要说是真实书籍内容**，且要修掉计数/情节错误。

### 4.2 过度包装清单（文档声称 vs 代码事实）

| 叙述（出处） | 代码事实 | 证据 |
|------------|---------|------|
| “Supabase 数据库”（`项目文档.md:562,588-591`）| 只有 Auth；数据在 localStorage，dbService 死代码且表不存在 | 1.2、`schema.sql:1-135` |
| “跨设备同步”（`项目文档.md:647,471`）| 无同步；清缓存/换设备全丢；progress 恒 0 | 1.3.4、`ReaderPage.tsx:93-97` |
| “数据加密存储和传输”（`项目文档.md:653`）| localStorage 明文 JSON | `storage.ts:18-22` |
| “MySQL 8.0 数据库”（`项目文档.md:499`）| 未使用；SQL 只有认证表（且是 Postgres 语法）| `schema.sql` |
| “100+ 并发/性能指标”（`项目文档.md:35-39`）| 纯前端 demo，无后端可测 | 全仓库无服务端业务代码 |
| “AI 个性化推荐”（`项目文档.md:31,113`）| 静态 aiReason + recommendedHeat 排序；搜索是内存 includes + 300ms 假延迟 | `db.ts:606`、`HomePage.tsx:32-38`、`ai.ts:323-353` |
| “书签管理/关注/私信”（`项目文档.md:64,69,86`）| Bookmark 无 CRUD；无 follow 模型（FollowersPage 造假列表）；无私信 | `models.ts:124-131`、`FollowersPage.tsx:10-21,42` |
| “内容审核机制”（`项目文档.md:652`）| 客户端 `includes` 敏感词，改 localStorage 即绕过；无服务端/审核队列 | `keywordFilter.ts:3-9` |
| “代码分割、懒加载、缓存策略”（`项目文档.md:648`）| 无 `React.lazy`/动态 import/`Suspense`（grep 0 命中）| `src/` |
| “测试通过/安全可靠”（`项目文档.md:526-550`）| 无任何测试文件、无 CI | `package.json:6-12`；glob 0 |
| README（`README.md:1`）| 仍是 Vite 模板，项目说明缺失 | — |

> 面试原则：**主动暴露“这是本地优先 MVP，不是云社区”**，再讲你已经设计/完成了迁移——比被追问“你的数据库呢”后现场翻车好得多。

### 4.3 缺口怎么补（面试前 checklist）

| 时间 | 交付物 | 证明方式 |
|------|--------|---------|
| 0.5–1 天 | 密钥轮换 + 服务端代理或 .env；quota 捕获；导出/导入；删级联；种子计数修正；`.env.example`；README 重写 | 代码 diff + 导出/导入录屏 + 配额失败录屏 |
| 1 周 | IndexedDB + Repository + hooks + 迁移器 + 图片压缩 + 契约测试 + BroadcastChannel | migration 测试报告（条数/抽检）、并发写入脚本结果、before/after 指标表 |
| 2–3 周 | Supabase migrations + RLS + Storage + Realtime + Edge Function AI 代理 + 服务端分页/FTS + E2E | ER 图、RLS 渗透测试、P95 压测截图、双端同步录屏 |
| 面试前 2 天 | 架构文档（1 页图 + 关键取舍）、3 个 demo 脚本（发帖-评论-点赞；断网写入-恢复同步；迁移旧数据）、5 个追问的答案卡 | — |

**必须准备的 6 个追问与回答要点**：
1. *数据库为什么用 localStorage？* → 承认是 MVP 选择（零运维、可离线演示），并用 1.3 的量化说明它在哪里崩；展示迁移方案与旧数据导入报告。
2. *5MB 满了怎么办？* → 图片外置（Storage/IndexedDB Blob）+ 压缩 + quota 监控 + 导出备份 + 失败回滚。
3. *多标签页/多端一致性？* → 本地用事务 + 版本号 + BroadcastChannel；云端用 Postgres 事务 + 乐观并发 + RLS；给出并发测试数字。
4. *数据模型怎么保证一致？* → 外键 + 级联 + 计数由触发器维护 + 软删除 + 对账脚本 + 迁移单测。
5. *认证与数据隔离？* → `profiles.id = auth.uid`，RLS 按 owner；角色用 JWT claim/role 表；给 RLS 渗透测试结果。
6. *AI 安全？* → key 只在服务端（Edge Function），前端只拿结果；加限流、审计、内容安全过滤。

### 4.4 一段可用的 60 秒项目叙述（诚实版）

> “智阅灵思是一个阅读+社区+AI 辅助的 Web 应用，前端 26 个业务页面，包含阅读器、笔记编辑器、社区互动和 AI 对话。我第一版为了快速验证产品，用 localStorage 单 JSON 做数据层——这个选择让我两周内跑通了全部功能，但我也把它的边界摸清了：图片会让 5MB 配额爆炸、整库序列化带来写放大、多标签页会覆盖、账号数据也跨不了设备。所以第二阶段我把数据层重构成 Repository + IndexedDB（图片压缩后存 Blob、迁移器负责旧数据导入、BroadcastChannel 处理多标签页），第三阶段接 Supabase Postgres，用 RLS 做用户级隔离、Storage 存图、Edge Function 代理 AI 调用。重构后我可以给出 before/after 的指标：列表首屏从整库解析变成索引查询、任意写入不再重写全库、旧数据迁移零丢失。这个项目对我最大的价值不是页面数量，而是我理解了 MVP 的数据方案在什么条件下会失效，以及如何用可迁移的架构替换它。”

### 4.5 一句话判断

**真实亮点是产品完成度与前端工程；数据层是最大的短板，但也是最好的重构素材。** 面试前必须做的最小集：Phase 0 全部 + Phase 1 的 Repository/IndexedDB/迁移/图片压缩。做完这些，简历里可以诚实写“离线优先数据层，支持旧版本地数据迁移与多标签页一致性”，而不是写“Supabase 数据库/跨设备同步”。

---

## 附录 A：死代码/死字段清单（统计口径）

- `db.ts` 52 个导出函数，外部 0 调用：`pushNotification`（`db.ts:1669-1684`）。
- `dbService` 13 个方法，业务只调用 2 个：`healthCheck`（启动时）、`createNote`（假同步，必失败）。
- 无引用文件/导出：`authApi.ts`（0 import）、`lib/supabase.ts` 的 `checkSupabaseConnection`（0 import）、`auth/server/*`（根工程不引用）、`schema.sql`/`rls.sql`/`seed.mjs`（0 引用）、空目录 `read-forum-appv1.1`。
- 写了不读/无实现的模型字段：`Bookmark`/`db.bookmarks`、`Note.source`、`Book.audioIntroUrl`、`User.role`、`User.stats.postsCount/notesCount/followingCount`、`User.settings.notifications`、`Note.stats.comments/views/shares`（只读不维护）。
- 双写/双份存储：AI 消息 `rf_ai_chat_messages`（`GlobalAIAssistant.tsx:87-90`）+ `db.aiChatMessages`（`db.ts:1752-1767`）。

## 附录 B：方法与局限

- 调用点统计：对 `src/` 下 69 个 .ts/.tsx 全量 grep 导出名；行号以当前工作区为准（`db.ts` 1796 行）。
- 体积/延迟数字为静态估算，未在真实浏览器/低端设备上测量；重构验收时应以实测为准。
- 版权/合规判断（1984 等）需要法务核实，本报告只提示风险。
- 未修改任何源码；`npx tsc -p tsconfig.app.json --noEmit` exit 0。