# 智阅灵思（Zhiyue Lingsi）前端架构与 UI 技术尽调报告

> 分析对象：`C:\Users\yzj15\Desktop\Works\YOU_NEED_NOT\Zhiyue_Lingsi`（分支 main，HEAD `cbec792`，2026-04-15）
> 技术栈：React 19.2.4 + react-router-dom 7.13.2 + Vite 8.0.1 + TypeScript 5.9 strict（package.json:13-35）
> 分析方式：全量阅读 31 个页面/组件 tsx、App/main/theme/shell/ui、App.css/index.css、auth client 全部文件、lib 全部文件；静态统计（行数、inline style、硬编码色值、aria、重复实现）；实测门禁（`tsc -p tsconfig.app.json --noEmit` = 0 error，`eslint src` = 4 条）。**未执行 `vite build`/`dev`**（任务要求只读、只允许写本报告），因此包体/运行时性能数字标注“推测”并给出估算方法，其余结论均有 file:line 依据。

**结论摘要（先给判断）**

1. **这不是一个“React 应用”，而是一个“用 React 渲染的 localStorage 客户端”**：数据在 render 期间同步读、写操作不同步通知、登录身份与数据身份完全脱钩。页面看起来完整，但 12 处以上的交互在点击后界面不会更新（点赞、移除书架、删除单词、标记已读……），作者自己用 `navigate(0)` / `window.location.reload()` 兜底刷新（AIChatHistoryPage.tsx:68、AIAnalysisRecordsPage.tsx:103、ReadingHistoryPage.tsx:51）。这是全仓最该先修的结构性问题。
2. **认证与数据是两套互不相干的身份**：Supabase Auth 给出 UUID 用户，本地 DB 的 `currentUserId` 在种子数据里写死为演示用户（db.ts:1144-1147），`AuthProvider` 从不回写；结果是“用谁的号登录，发出来的内容都属于演示用户”，跨账号数据串号。
3. **存在 5 个 P0**：身份双源、localStorage 配额击穿无异常处理（且图片/分享卡以 dataURL 存本地）、AI API Key 硬编码进前端 bundle 并打印到 console（services/ai.ts:7,99,20）、破坏性删除无确认无恢复、无 env 时登录永久卡在“加载中”且找回密码闭环断裂。
4. **脚手架质量意外地好**：TS strict + noUnusedLocals、`tsc` 0 error、ESLint 仅 4 条、依赖版本新。这是可讲的真亮点，但也说明现有代码是“逐条修类型错误”的产物（git log 标题几乎全是 Fix TypeScript error / Fix lint）。
5. **UI 有设计品味，但没有设计系统**：index.css 有完整的亮/暗色 token，但 App.css 是 1366 行“追加式覆盖”（13 组选择器重复定义），3 个认证页在模块加载时向 `document.head` 注入 `<style>`（96 处 `!important`），TSX 里 97 处硬编码色值；暗色模式下底部导航/Toast 仍是白色。
6. **面试风险点**：`项目文档.md` 的“测试报告/性能指标/Vite 2.3.8/MySQL/跨设备同步/代码分割懒加载”与实现不符（0 个测试文件、实际 Vite 8 + localStorage），这份文档不能原样用于保研/考研面试。

---

## 一、现状还原

### 1.1 工程底座与实测门禁

| 项 | 现状 | 证据 |
| --- | --- | --- |
| 构建 | Vite 8 + `tsc -b`，无 `base`、无代码分割配置、无环境变量示例 | vite.config.ts:5-7；package.json:8 |
| 路由 | react-router-dom 7（`BrowserRouter`），无 loader/action/data router，无 basename | main.tsx:7-12；App.tsx:67 |
| 类型 | `strict` + `noUnusedLocals/Parameters` + `erasableSyntaxOnly`，`models.ts` 196 行完整领域类型 | tsconfig.app.json:19-25；data/models.ts:1-196 |
| 实测类型检查 | `tsc -p tsconfig.app.json --noEmit`：**0 error / 69 files** | 本次实测 |
| 实测 Lint | `eslint src`：**4 条**——App.tsx:56 `set-state-in-effect`、AuthProvider.tsx:26 `only-export-components`、NoteEditorPage.tsx:117/160 `exhaustive-deps` | 本次实测 |
| 测试 | **0 个测试文件**，package.json 无 test 脚本 | package.json:6-11；本次统计 |
| CI | 无 GitHub Actions / 无流水线配置 | 仓库根目录 |
| 提交历史 | 13 个 commit，标题几乎全是 Fix TypeScript errors / 修复所有 lint 错误 / based on screen size | `git log --oneline` |

判断：**工程门禁（类型、lint）达标甚至偏好，工程保障（测试、CI、监控）为 0**。本科生项目里属于“底座合格、上层失控”。

### 1.2 路由与布局架构（图 A）

```text
main.tsx:7   <StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>
└─ App.tsx:64  <AuthProvider config={{persistAccessToken:true}}>        ← App.tsx:65
   └─ ToastProvider                                                    ← App.tsx:66
      ├─ <Routes>（36 条 Route = 30 个页面 + 5 条兼容重定向 + 1 布局 + 1 通配）App.tsx:67-112
      │   ├─ /zhiyueling-si/{login,register,forgot,password/change}     App.tsx:68-71   （Shell 外，页面自带全屏布局）
      │   ├─ /auth/* → Navigate 到上一组                                App.tsx:72-75   （历史遗留的第二套路径）
      │   ├─ <Route element={<RequireAuth><Shell/></RequireAuth>}>      App.tsx:76
      │   │    Shell = isMobile ? MobileShell : WebShell                App.tsx:62
      │   │    ├─ WebShell:  TopBar + (Sidebar?) + <main><Outlet/></main>       WebShell.tsx:11-19
      │   │    └─ MobileShell: TopBar + <main><Outlet/></main> + (BottomNav?)   MobileShell.tsx:11-17
      │   │    └─ 26 个业务页面: / /shelf /search /categories /read /read/:bookId /forum /forum/new
      │   │       /forum/:postId /forum/topics/:tagName /notes /notes/new /notes/:id/edit /me ...
      │   │       /me/settings /me/learning /me/collections /admin(RequirePermission)  App.tsx:77-109
      │   └─ "*" → Navigate "/"                                        App.tsx:111
      └─ <GlobalAIAssistant/>（渲染在所有路由之外，包括登录/注册页）      App.tsx:113
```

关键事实与判断：

- **全部页面静态导入**：App.tsx:5-29 一次性 import 25 个页面，App.tsx:33-41 导入 4 个认证页；`NoteEditorPage` 顶部静态 import 了 `quill` 与 `html-to-image`（NoteEditorPage.tsx:1,4,5），`LearningPage` 静态 import `html-to-image`（LearningPage.tsx:1），`AuthProvider` 静态 import `@supabase/supabase-js`（AuthProvider.tsx:3）。全仓 `React.lazy`/`Suspense` 出现次数为 0（grep 实测）。
- **Shell 选择用 JS 断点**：`window.innerWidth < 768`（App.tsx:51），初始值写死 `false`（App.tsx:47），到 `useEffect` 后才纠正（App.tsx:54-59）。两个后果：①移动端首帧先渲染 WebShell（侧边栏版式）再替换，出现布局闪动；②`ShellComponent` 是不同组件类型（App.tsx:62），跨 768px 时 React 卸载整棵树再重建——页面内表单草稿、滚动位置、阅读器 `useState` 全部丢失。而 CSS 同样在 768px 切换布局（App.css:1084-1127），造成**两套响应式真源**；在恰好 768px 的视口下 JS 判定为桌面、CSS 按移动布局渲染，WebShell 的侧边栏被压成全宽条（App.css:1084-1094）。
- **导航隐藏逻辑复制两遍且靠字符串匹配**：`path.startsWith('/read/') || path === '/forum/new' || path.includes('/edit')`（WebShell.tsx:8、MobileShell.tsx:8）。`includes('/edit')` 会误伤任何含 edit 的路径，且与路由表无关联——新增全屏页面必须改两个 shell。
- **阅读页双顶栏**：Shell 始终渲染 `<TopBar/>`（WebShell.tsx:12、MobileShell.tsx:12），ReaderPage 自己又渲染一个 `position: sticky; top: 0; zIndex: 10` 的顶栏（ReaderPage.tsx:211-223）；TopBar 的 `.web-top-bar` z-index 为 20（App.css:913）。阅读页顶部因此是“应用顶栏 + 阅读器顶栏”堆叠/遮挡，而不是沉浸阅读。
- **`/zhiyueling-si` 前缀没有系统性**：只有 4 条认证路由带前缀，业务路由全部裸路径；`vite.config.ts` 无 `base`、`BrowserRouter` 无 `basename`（main.tsx:3,9），说明它不是子路径部署需求，而是一次品牌化重命名的遗留。全仓该前缀硬编码 16 处（App.tsx:68-75、TopBar.tsx:12/77/85、LoginPage.tsx:430/442、RegisterPage.tsx:251/394、ForgotPasswordPage.tsx:119/133、RequireAuth.tsx:11、AuthProvider.tsx:288）。同时保留 `/auth/*` 兼容重定向（App.tsx:72-75），等于同一功能存在两套 URL 体系。
- **守卫是“包一层”而不是路由元数据**：`RequireAuth` 包 Shell（App.tsx:76），`RequirePermission` 又嵌套 `RequireAuth`（RequirePermission.tsx:13）。`/admin` 的路由叶子再包一次权限守卫（App.tsx:102-109）。这种方式能工作，但权限、布局、懒加载无法集中管理，也无法做路由级 code split。

### 1.3 状态管理与数据流（图 B、图 C）——本报告的核心判断

**图 B：一次点击的真实生命周期（无 Store、无订阅）**

```text
        ┌──────────────────────────── 渲染期（render）─────────────────────────────┐
        │ HomePage()                                                                  │
        │   getAdminConfig()  ┐                                                       │
        │   getDbSnapshot()   ├─ 每次调用 → readDb() → localStorage.getItem(KEY)    │
        │   listBooks()       │              → JSON.parse(整个 DB)                    │
        │   listPosts('hot')  │   data/db.ts:1208-1252；lib/storage.ts:10-16；KEY 见 db.ts:64
        │   listNotes('hot')  ┘   首页一次渲染 = 6 次全量解析（HomePage.tsx:25-38）    │
        └─────────────────────────────────────────────────────────────────────────────┘
                                   │ JSX
                                   ▼
        用户点击“点赞” → toggleInteraction(authUser.id,...)   HomePage.tsx:127-135
                                   │
                     readDb() → 改 stats.likes → writeDb()  db.ts:1541-1570 / 1254-1256
                                   │
                     toast.push('已点赞')                     ToastProvider.tsx:7-14
                                   │  setItems → ToastProvider 重渲染
                                   ▼
        ToastProvider 的 children 是 App 渲染时创建的同一个 React element（App.tsx:67-113）
        Context value 由 useMemo 缓存且 [push] 稳定（ToastProvider.tsx:16）→ value 引用不变
        ⇒ React bailout：页面组件不会重渲染，点赞数停在旧值，直到下一次路由切换
```

这不是理论风险，而是全站一致的实现模式：**数据函数是同步 localStorage 读写，不是 hook、不订阅、不发事件**（`addEventListener/CustomEvent` 全仓仅 theme.ts:22 一处系统主题监听）。全仓 `currentUserId` 只读不写（grep 实测），也没有 `subscribe/notify/emit`（grep 实测）。

受影响且可复现的交互（点完界面不变）：

| 页面 | 操作 | 代码 | 实际表现 |
| --- | --- | --- | --- |
| 首页 | 点赞/收藏帖子、笔记 | HomePage.tsx:127-135, 224-241, 301-318 | Toast 出现，计数不变；再点一次会把上一次的赞抵消（用户以为没生效） |
| 书架 | 移除书籍 | BookshelfPage.tsx:51-60 | Toast 出现，书仍在；只有离开再回来才消失 |
| 学习中心 | 删除单词/句子 | LearningPage.tsx:109-118 | 同上（`items` 的 useMemo 依赖 [sort,tab,user.id]，不含数据版本） |
| 消息 | 全部已读 / 单条已读 | MessagesPage.tsx:40-49, 83-85 | 未读数、未读样式不变 |
| 社区 | 新建话题 | ForumPage.tsx:135-141 | Toast 出现，话题列表不刷新（`setTags` 未被调用） |
| 阅读器 | 字号/背景调节 | ReaderPage.tsx:180-187 | 滑块位置可动，正文样式不变（`reading` 来自本次 render 的 `user`） |
| 设置 | 保存昵称/主题 | SettingsPage.tsx:30-41 | 主题因手动 `refreshTheme()` 生效，昵称在其他页面不更新 |
| 管理后台 | 加敏感词/置顶/删除 | AdminPage.tsx:67-93, 114-147 | 列表不刷新（且整页不可达，见 P1） |
| 阅读历史 | 删除记录 | ReadingHistoryPage.tsx:48-52 | 作者用 `window.location.reload()` 强行刷新 |
| AI 对话历史 | 删除对话 | AIChatHistoryPage.tsx:63-70 | 作者用 `navigate(0)` 整页重载 |
| 赏析记录 | 删除记录 | AIAnalysisRecordsPage.tsx:98-107 | 作者用 `navigate(0)` |

少数页面用“手动 setState 假刷新”绕过：NotesPage.tsx:189-204 在点赞后重新 `setNotes(listNotes(...))`；PostDetailPage.tsx:144-164 用 `setPost` 做局部乐观更新；ReadSearchPage.tsx:127 用 `setShelfTick(v=>v+1)` 空转触发重渲染。这三处反证了作者已经感知到“数据不会自动刷新”，但没有抽象出通用机制。

**图 C：身份双源（Auth 用户 vs 本地 DB 用户）**

```text
Supabase Auth                                       本地数据库 read_forum_db_v5
──────────────                                      ────────────────────────────
AuthProvider.tsx:52-61 / 100-109 / 165-174          createSeedDb(): db.currentUserId = userId（演示用户）
  state.user = {id: <Supabase UUID>,                  data/db.ts:1144-1147
    username, email, roles:['user'],                  getCurrentUser() 永远返回这个演示用户
    permissions: [] }                                 data/db.ts:1267-1309（currentUserId 只读，全仓无写入口）
        │                                                  ▲
        │ 使用者：TopBar / HomePage / MePage               │ 使用者：ReaderPage:40, PostDetailPage:31,
        │ （MePage.tsx:9 用 cast 把两套字段硬拼）           │ NotesPage:14, NewPostPage:26, BookshelfPage:12,
        ▼                                                  │ LearningPage:21, SettingsPage:12, ...
读/写行为分裂：                                            │
· 首页点赞用 Supabase UUID（HomePage.tsx:130）              │ 写库 authorId = 演示用户 id（NewPostPage.tsx:26/187）
· 详情页判断是否已赞用演示 id（PostDetailPage.tsx:75）      │
· MePage 用 Supabase id 统计发帖数（MePage.tsx:11-13）→ 永远 0
```

直接后果（都可现场演示）：

1. 用 A 账号发的帖子，`authorId` 是演示用户；换 B 账号登录后仍能看到/编辑“自己的”帖子，A、B 之间数据完全串通（本地 DB 只有一份 `currentUserId`）。
2. 首页点赞用 Supabase UUID 写 interaction 键，`PostDetailPage.tsx:75-76` 用演示 id 查询 → 同一帖子“首页显示已赞、详情页显示未赞”。
3. `MePage.tsx:51-68` 的阅读时长/发帖/笔记/关注统计全部取自 `state.user`（AuthUser 无 stats，`MePage.tsx:9` 用 `as unknown as` 兜底成 0）→ 统计恒为 0；而数据其实存在本地 DB 里。
4. 退出登录不清理本地 DB；换账号等于换了个“前台身份”，数据层仍是同一个演示用户。

此外，**Supabase 只被 Notes 用了一半**：`addOrUpdateNote` 在 `supabaseConnected` 时尝试同步（db.ts:1511-1518），但 `addPost`（db.ts:1419-1433）、`addComment`（1409-1417）、`toggleInteraction`（1541-1570）都只写 localStorage；`dbService` 只有 note 相关方法（dbService.ts:11-209）。所以“云端同步/多端同步”在代码里不成立。

### 1.4 关键流程还原

**① 登录**：LoginPage 提交（LoginPage.tsx:142-170）→ `AuthProvider.loginWithPassword`（AuthProvider.tsx:193-217）→ Supabase `signInWithPassword` → 监听 `onAuthStateChange`（46-75）写入 `state`、`setAccessToken` → `RequireAuth` 放行（RequireAuth.tsx:10-16）。

- **无环境变量时（本仓库没有 `.env*`，实测）**：`lib/supabase.ts:20-33` 使用 mock 客户端，`signInWithPassword` 返回 `{error:null}` 但永不触发 auth 事件；`loginWithPassword` 已把 state 置为 `loading`（AuthProvider.tsx:195）且成功分支不恢复状态（209 行只有注释）→ `RequireAuth.tsx:9` 永远显示“加载中...”。**登录后整个应用卡死**。
- “记住登录状态”是假开关：LoginPage.tsx:138/163 传了 `remember`，但 `loginWithPassword` 从不使用；持久化由 `App.tsx:65` 的 `persistAccessToken: true` 硬编码控制。

**② 找回/修改密码**：`forgotPassword` 的 `redirectTo` 指向 `/zhiyueling-si/password/reset`（AuthProvider.tsx:288），但 App.tsx 没有任何 reset 路由（68-75）；邮件链接会命中通配路由跳回首页（App.tsx:111）。`ChangePasswordPage` 有路由（App.tsx:71）却没有任何入口链接（全仓 grep `password/change` 只在 App.tsx 与 authApi 出现）；且该页把 `currentPassword` 收集后完全不用（ChangePasswordPage.tsx:14,29 → AuthProvider.tsx:268-283）。

**③ 首页**：没有任何 `useState`，每次渲染现算推荐流（HomePage.tsx:20-46：置顶帖子 + 高热书 + 热门笔记混排），点赞按钮直接写库（127-135）。数据量小，但结构上属于“render 里做 IO”，且无法响应任何写操作。

**④ 阅读器（ReaderPage，753 行 / 16 个 useState）**：

- 章节状态：`chapterId` state + `pickChapter`；进入页面从阅读历史恢复（80-91），章节切换写阅读历史（93-97）。但 `saveReadingHistory(..., 0)` 的 progress 恒为 0（第 95 行）→ “阅读进度”功能不存在。
- 选区菜单：`onMouseUp/onTouchEnd` → `getSelectedText` → `getRangeAt(0).getBoundingClientRect()` 定位 + clamp（189-204）。这是本项目交互含量最高的代码，但只支持鼠标/触摸，无键盘选区菜单。
- 阅读设置：字号/背景/字体写 `updateCurrentUser`（180-187），因为不触发 re-render，**拖动滑块看不到实时预览**。
- AI：整段赏析（122-137）、句子赏析（139-155）、翻译（157-169）、查词（171-178）、朗读（536-546，`speechSynthesis`）、学习模式（271-285）。异步调用无 AbortController、无请求序号，连点两次会发两个请求且 `addAIAnalysisRecord` 写两条记录（131、149）。
- 阅读时长：`setInterval` 每 60s 把 `user.stats.readingMinutes + 1` 写库（104-115）。但 `user = getCurrentUser()` 在 render 期间调用（ReaderPage.tsx:40），每次渲染都是新对象 → effect 依赖 `[user]` 每次渲染都重建计时器；且闭包里的 `user.stats` 永远是那次渲染的旧值。结果是“阅读时长”几乎不增长（最多 +1），而 MePage 又读另一个身份（见上）→ 卖点不成立。
- 布局：页面自身再渲染一个 sticky 顶栏（211-223），与 shell TopBar 冲突（见 1.2）。

**⑤ 笔记编辑器（NoteEditorPage，509 行）**：Quill 初始化（120-160）→ 监听 `text-change` 把 `quill.root.innerHTML` 写入 `content` state（150-152）→ 另一个 effect 在每次 `content` 变化时把 `content` 写回 `quill.root.innerHTML`（163-167）。**HTML 被 React state 往返重写**，属于“把富文本编辑器当受控 textarea 用”的典型错误：每次按键都可能重建编辑器 DOM、丢失光标/选区（推测，需实测；代码路径确定）。

- 图片直接 `FileReader.readAsDataURL` 存进 note（20-33）；发布时还用 `html-to-image` 生成 `pixelRatio:2` 的 PNG dataURL 存入 `note.shareCardDataUrl`（178-187, 401-412）。一张 400px 卡片 2x 的 PNG base64 常见 0.5~2MB，9 张手机照片 dataURL 可达 20MB+，而 localStorage 通常只有 5MB → 见 P0-2。
- 无自动保存、无未保存离开提示（56-70 只做初始化），配合 1.2 的 shell 重挂载，切屏/旋转都可能丢草稿。

**⑥ 社区发帖/评论**：NewPostPage 同步 `addPost`（186-194），PostDetailPage 同步 `addComment`（261-267）后依赖 `setCommentText('')` 的 re-render 才刷新评论列表；删除帖子/笔记无二次确认（PostDetailPage.tsx:91-100、NoteEditorPage.tsx:238-248、AdminPage.tsx:139-147）。

**⑦ 全局 AI 助手（GlobalAIAssistant，530 行）**：消息存 `localStorage['rf_ai_chat_messages']`（28, 89）、线程 id 存 `sessionStorage`（26），流式读 `ReadableStream` 逐字更新（189-202）；悬浮球可拖拽（92-142, 229-271），面板固定 55vh 底部抽屉（274-292）。问题：**消息不按用户隔离**（换账号能看到上一个人的对话）；悬浮球渲染在所有路由外（App.tsx:113），登录页也有；无自动滚动到底部；拖拽用 `onMouseOver` 直接改 DOM style（255-260）与 React style 冲突。

### 1.5 组件规模、职责与重复实现

| 文件 | 行数 | 职责 | 主要问题 |
| --- | --- | --- | --- |
| src/pages/ReaderPage.tsx | 753 | 阅读器 + 选区菜单 + AI 赏析 + 翻译 + 查词 + 朗读 + 学习模式 + 样式面板 | 16 个 useState（42-72）、6 个浮层、89 处 inline style、职责过载 |
| src/components/GlobalAIAssistant.tsx | 530 | 悬浮球 + 对话抽屉 + 流式 AI + 拖拽 + 消息持久化 | 全局组件内嵌业务逻辑与持久化，24 处 inline style |
| src/pages/NoteEditorPage.tsx | 509 | Quill 编辑 + 图片 + 分享卡生成/预览 + 发布/草稿 + Quill CSS | 富文本与 state 双向同步、模板配置硬编码、卡片预览手写 |
| src/modules/auth/client/pages/LoginPage.tsx | 459 | 登录 + 营销页 + 社交登录占位 + 注入 CSS | 模块级副作用、34 处 inline style、假按钮 |
| src/modules/auth/client/pages/RegisterPage.tsx | 406 | 注册 + 几乎复制登录页的注入 CSS | 与 LoginPage 重复的样式字符串 |
| src/App.css | 1366 | 全站样式 | 追加式覆盖、13 组重复选择器、7 种断点 |
| src/pages/MePage.tsx | 163 | 个人中心 | 第 9 行单行 200+ 字符的身份 cast |

inline style 数量（`style={{` 计数，实测）：ReaderPage 89、MePage 58、HomePage 56、ForumPage 39、LoginPage 34、RegisterPage 33、NotesPage 30、GlobalAIAssistant 24、BookshelfPage 21、TopicDetailPage 18……合计约 600 处。

重复代码块（可量化）：

| 重复内容 | 出现位置 |
| --- | --- |
| `getAvatarColor`（同 8 色调色板） | HomePage.tsx:9、ForumPage.tsx:9、NotesPage.tsx:7、PostDetailPage.tsx:21、TopicDetailPage.tsx:7 |
| 头像渲染块（img / 首字母 fallback） | 至少 15 处：HomePage.tsx:113-120,164-171,200-207,278-285；PostDetailPage.tsx:108-114,284-290,310-316；ForumPage.tsx:178-184；TopicDetailPage.tsx:75-81,100-106；NotesPage.tsx:107-132 等 |
| `readFilesAsDataUrls` | NewPostPage.tsx:9-22、NoteEditorPage.tsx:20-33（完全相同） |
| `downloadText` | NoteEditorPage.tsx:37-45、LearningPage.tsx:9-17（完全相同） |
| `parseTags` | NewPostPage.tsx:55-62、NoteEditorPage.tsx:169-176（完全相同） |
| 搜索框（div + onClick） | HomePage.tsx:51、ForumPage.tsx:58、NotesPage.tsx:32、BookshelfPage.tsx:18 |
| AI 赏析五段文本拼接 | ReaderPage.tsx:640,655,667,738 + AIAnalysisRecordsPage.tsx:9-21（formatAnalysisText） |
| 图标体系 | 手写 NavIcons.tsx（296 行）+ ui/SearchIcon.tsx（27 行）+ lucide-react（14 个页面使用）；`SearchIcon` 在 NavIcons.tsx:225 与 ui/SearchIcon.tsx:1 重复两套 |
| 卡片/列表项结构 | HomePage 的 post/note/book 三种卡片各写 2 遍（105-183、192-322），TopicDetailPage 再抄一遍（69-120） |

判断：**没有共享 UI 层**。`components/` 只有 BookCover、LoadingSpinner、GlobalAIAssistant；`ui/` 只有图标、Toast、Chevron 图标。所有卡片、头像、按钮组合、表单块都在页面里就地手写。

### 1.6 样式系统现状

- **有 token 雏形**：`index.css:1-35` 定义 `--bg/--card/--surface/--text/--accent/--radius/--shadow` 等，`html[data-theme='dark']` 覆盖（37-64）；`theme.ts:4-13` 按用户设置 + `prefers-color-scheme` 计算主题，`theme.ts:19-25` 监听系统变化。方向正确，全仓 TSX 中 `var(--*)` 使用 253 处。
- **但没有任何强制**：TSX 里仍有 97 处十六进制颜色（`#fff` 30 次、头像调色板 8 色、`#f59e0b` 等）；App.css 里暗色不兼容的硬编码：`.bottom-nav` 背景 `rgba(255,255,255,.85)`（App.css:107）、`.toast` 白底（867）、`.btn.primary { color:#fff }`（560）、LoadingSpinner 边框 `rgba(0,0,0,.1)`（LoadingSpinner.tsx:22）。
- **App.css 是“追加式覆盖”**：同一选择器重复定义——`.brand`(28/1167)、`.brand-mark`(34/1173)、`.brand-name`(67/1195)、`.search-box`(74/1203)、`.search-icon`(296/1222)、`.btn`(532/1235)、`.card`(178/1268)、`.page`(146/1316)、`fadeIn`(153/1323)、`.section`(158/1329)、`.section-head`(164/1335)、`.h2`(171/1342)、`.list`(240/1309)；`.grid` 两套互相冲突的规则（228-238 固定列 vs 1290-1306 auto-fill），后者把 460px 断点的 2 列规则覆盖掉。文件里可见“更多组件样式优化 / 搜索框样式统一 / 卡片样式优化”等注释——典型“继续往文件末尾加样式”的产物。
- **断点 7 套**（460/480/768/769/1024/1200/1440：App.css:234,1059,1084,1130,1145,1296,1302,1350），加上 JS 的 768（App.tsx:51），共 8 个“响应式真源”。
- **3 个认证页在模块加载时向 document.head 注入 style**：LoginPage.tsx:116-121、RegisterPage.tsx:103-108、ForgotPasswordPage.tsx:74-79。这些字符串里合计 96 处 `!important`（App.css 只有 1 处），RegisterPage 的样式串几乎完整复制 LoginPage 的；ChangePasswordPage 则完全没有样式（裸 input/button，硬编码 `#027a48`/`#b42318`：ChangePasswordPage.tsx:42-68）。同一个认证模块内存在 4 种视觉风格。
- 结论：**有视觉语言（奶白/薄荷绿/大圆角/低对比度），没有设计系统（无组件层、无约束、无暗色完整性、无样式隔离）**。

### 1.7 交互完整性、响应式、无障碍、性能（分项摘要）

**三态覆盖（loading / empty / error）**

| 能力 | 现状 | 证据 |
| --- | --- | --- |
| loading | 仅 2 页有：ForumPage（假的，`setTimeout(...,500)`）、ReadSearchPage（真实等待 AI 搜索） | ForumPage.tsx:41-53；ReadSearchPage.tsx:32-46 |
| empty | 覆盖较好：NotesPage:210、BookshelfPage:65、ForumPage:206、TopicDetailPage:121、CollectionsPage:61、MessagesPage:127、ReadingHistoryPage:57、AIChatHistoryPage:101、AIAnalysisRecordsPage:112 | 同上 |
| error | **没有页面级错误视图**，全部只有 `toast.push(...失败...)`；AI 失败还会被吞成正文（见 P1-9） | ReaderPage.tsx:129-136 + services/ai.ts:396-411 |
| 骨架屏/乐观回滚 | 无；乐观更新只有 PostDetailPage 点赞/收藏/转发（144-221），写库失败时无法回滚 | — |

**表单校验**：注册只要求用户名≥3、`email.includes('@')`、密码≥8（RegisterPage.tsx:129-144），`security.ts` 里现成的 `validatePassword/validateUsername/validateLength` 全仓未使用（grep 实测）；登录用 `sanitizeInput` 对密码做 HTML 转义（LoginPage.tsx:147-148）——用户密码若含 `& < >` 与引号会被改写，导致“注册成功但登录失败”；评论区无长度上限（PostDetailPage.tsx:245-274）；删除无二次确认（见 P0-4）。

**响应式**：见 1.2 双断点问题；`shelf-grid` 固定 3 列（App.css:642-646），320px 屏上每格约 90px；`web-main` 固定 32px padding（App.css:1048-1056）；ReaderPage 用 `padding: 0` 覆盖自己（ReaderPage.tsx:209）却无法突破父级 `.web-main` 的卡片内边距。

**无障碍**：`role=` 全仓 0 处；`tabIndex/onKeyDown` 全仓 1 处（SearchPage.tsx:64 的 Enter 搜索）；`onClick` 148 处，其中多处挂在 div/span 上（HomePage.tsx:51、ForumPage.tsx:58、NotesPage.tsx:32、BookshelfPage.tsx:18、NotesPage.tsx:189/197、TopBar.tsx:22 的 brand）；3 个模态/抽屉无 `role=dialog`、无 `aria-modal`、无 Esc 关闭、无焦点陷阱（ReaderPage.tsx:411-425、567-584、690-700；GlobalAIAssistant.tsx:274-292）；颜色对比度实测（WCAG 公式）：`--accent #a3c2b5` 作为文字 on 白 = **1.92:1**、`--muted #b2b8b4` on 白 = **2.02:1**、白字 on accent 按钮 = **1.92:1**（均远低于 AA 4.5:1，连大字号 3:1 也不到；token 见 index.css:8-29，大量 11-12px 小字使用它们）；`<html lang=en>` 但全站中文（index.html:2）；触控目标：`.chip` 约 30px、`.tab` 约 31px、`.mini-action` 约 24px、`.btn.sm` 约 39px（App.css:548-577、738-748、766-776）。

**性能**

- 首屏加载结构：所有页面 + quill + html-to-image + supabase-js 全在入口图（见 1.2）。**推测**：入口 JS 未压缩约 0.9~1.2MB、gzip 约 250~350KB（方法：quill 2 打包约 200KB min + 24KB CSS、@supabase/supabase-js 约 150KB min、react-dom 约 130KB min、30 个页面源码约 250KB，未做拆包；未实际 build 验证）。
- 图片：`public/covers/` 实测 15,583,875B（14 张封面），其中 11 张 PNG 合计 **14,827,839B ≈ 14.1MiB**（单张 0.9~2.0MB）；首页热门书籍区一次渲染 8 张 `size=lg` 封面（HomePage.tsx:66-94），首屏图片估算约 10MB。`BookCover` 只有 `loading=lazy`（BookCover.tsx:32-35），无 `srcset/sizes/webp`；阅读页顶栏用 36px 缩略图也加载原图（ReaderPage.tsx:228 → BookCover size=xs）。
- 列表：全部一次性渲染，无分页、无虚拟化（db.ts:1372 `listPosts` 全量返回；HomePage.tsx:105-183、ForumPage.tsx:172-207 全量 map）。当前 seed 数据少，影响小；但这是“数据量一涨就崩”的结构。
- 渲染：全仓 `React.memo` 0 处（grep 实测），`useMemo` 20 处但多处 memo 的是“数据快照”而非昂贵计算（如 NotesPage.tsx:22-27 在 effect 里重新 setState）。

### 1.8 `src/ui/toast.tsx` 是否为 0KB / 需要清理？

- `src/ui/toast.tsx` 实测 **1 行、49 字节**：`export { ToastProvider } from './ToastProvider'`（ui/toast.tsx:1）。全仓没有任何 import 指向它（grep `ui/toast'` 0 命中）。
- 真实实现在 `ui/ToastProvider.tsx:4-30` + `ui/toastContext.ts` + `ui/useToast.ts`，`App.tsx:30` 直接从 `./ui/ToastProvider` 引入。
- 结论：**`toast.tsx` 是死文件，重构时直接删除**；`ToastProvider` 本身要保留但需改进：定时器未在卸载时清理（ToastProvider.tsx:11-13）、无最大条数、固定 2200ms、没有退出动画、success 文案颜色仍是低对比的 accent（App.css:884-887）。

---

## 二、问题清单

判定口径：**P0** = 数据丢失/安全漏洞/功能不可用；**P1** = 架构性或明显质量问题；**P2** = 工程规范。

### P0（必修，演示前必须处理）

| 编号 | 严重度 | 位置 | 问题 | 影响 | 修复方向 |
| --- | --- | --- | --- | --- | --- |
| P0-1 | P0 | db.ts:1144-1147,1267-1309；AuthProvider.tsx:52-61；HomePage.tsx:130；PostDetailPage.tsx:31,75；MePage.tsx:9-13 | 身份双源：登录身份（Supabase UUID）与本地数据身份（seed 写死的演示用户）互不同步，且不同页面各用一个 | 内容归属错误、换账号数据串通、点赞/收藏态两页不一致、个人统计恒 0；数据层等于无鉴权 | 登录成功后以 auth user 为唯一 id 初始化/迁移本地数据；所有读写只接受一个 `userId` 来源；MePage 统计改从数据层聚合 |
| P0-2 | P0 | lib/storage.ts:18-22；db.ts:1254-1256；NoteEditorPage.tsx:20-33,401-412；NewPostPage.tsx:9-22 | 唯一持久层是 localStorage 全量 JSON 序列化，写入无 try/catch；图片与分享卡片 PNG 以 dataURL 直接入库 | 9 张图或 2~3 张分享卡即可超过 5MB 配额 → `QuotaExceededError` 在发布流程中抛出且无人捕获 → 无提示、内容全丢；浏览器清缓存即全站数据清零 | 图片/卡片改存 IndexedDB 或对象存储，DB 只存引用；写入包 try/catch + 配额检测 + 用户可见错误；加导入/导出备份 |
| P0-3 | P0 | services/ai.ts:7,99,14-20,30-38；services/doubao.ts:4-7,13-18 | AI API Key 硬编码在前端源码并打入 bundle，且 `console.log` 打印 key 片段；请求从浏览器直连火山方舟 | 任何访问者都能在 DevTools 拿到 key 盗刷；key 已进 git 历史，等于已泄露；面试方一眼可见安全问题 | 立即在控制台吊销/轮换；改为后端/Serverless 代理（密钥只在服务端）；生产构建加 secret 扫描 |
| P0-4 | P0 | PostDetailPage.tsx:91-100；NoteEditorPage.tsx:238-248；AdminPage.tsx:139-147,174-182；db.ts:1443-1454,1523-1529 | 删除帖子/笔记/敏感词/阅读记录均无二次确认、无软删除、无回收站，且底层是硬删 | 误触一次永久丢失内容（评论也级联删除 db.ts:1448-1452），本地无备份不可恢复 | 加 confirm/撤销 Toast；数据层加 `deletedAt` 软删除 + 30 天回收站；danger 按钮二次确认 |
| P0-5 | P0 | lib/supabase.ts:9-33；AuthProvider.tsx:193-217；RequireAuth.tsx:9；AuthProvider.tsx:288；App.tsx:68-75,111 | 认证闭环不可用：仓库无 `.env`，mock 客户端登录后 state 停在 loading → 永远“加载中”；找回密码 `redirectTo=/zhiyueling-si/password/reset` 指向不存在的路由，且 ChangePasswordPage 无任何入口 | 新环境/评审现场登录即卡死；忘记密码功能完全不可用；“认证系统”卖点无法演示 | 缺配置时启动即明确报错并给引导页；登录成功/失败都要落状态；补 reset 路由或在邮件里改用 OTP；ChangePassword 加入设置页入口并校验旧密码 |

### P1（架构性 / 明显质量）

| 编号 | 严重度 | 位置 | 问题 | 影响 | 修复方向 |
| --- | --- | --- | --- | --- | --- |
| P1-1 | P1 | db.ts:1208-1252,1541-1570；HomePage.tsx:20-46,127-135；BookshelfPage.tsx:51-60；LearningPage.tsx:109-118；MessagesPage.tsx:40-49,83-85；ReaderPage.tsx:180-187；SettingsPage.tsx:30-41；AdminPage.tsx:67-93 | 数据层是同步 localStorage 读写，无订阅/无缓存/无失效通知；页面在 render 期直接读快照，写后不重渲染 | 见 1.3 表：10+ 处交互“点了没反应”，用户重复点击造成反向 toggle；作者用 navigate(0)/reload 兜底 | 引入 Repository + `useSyncExternalStore`（或 TanStack Query）单一数据入口；页面对 hook 结果渲染，写操作触发版本失效；禁止页面直接 import db |
| P1-2 | P1 | App.tsx:47-62；WebShell.tsx:8；MobileShell.tsx:8；App.css:1084-1094 | 用 `window.innerWidth < 768` 在 JS 里选 Shell（初始 false），与 CSS 断点形成两套响应式；跨断点整棵树卸载重建；导航隐藏逻辑在 shell 里靠字符串 contains 判断 | 移动端首帧错误布局；旋转/缩放丢表单草稿与阅读进度；768px 边界 JS/CSS 打架；新增全屏路由要改两处 | 布局用 CSS Container/Media Query 驱动（同一 DOM 两套样式），JS 只用于行为（如手势）；全屏路由改为路由元数据（`meta.fullscreen`）；断点统一到 token |
| P1-3 | P1 | App.tsx:68-75；TopBar.tsx:12,77,85；LoginPage.tsx:430,442；RegisterPage.tsx:251,394；ForgotPasswordPage.tsx:119,133；RequireAuth.tsx:11；AuthProvider.tsx:288 | `/zhiyueling-si` 前缀只覆盖 4 条认证路由，全仓 16 处硬编码；无 `base`/`basename` 支撑，还并存 `/auth/*` 重定向 | 改域名/部署子路径/改品牌名必须全仓替换，易漏；URL 体系混乱，面试展示时显得随意 | 认证页回到 `/login` 等常规路径，或统一由 `vite base` + `basename` 驱动；删兼容重定向 |
| P1-4 | P1 | App.tsx:5-29,33-41；NoteEditorPage.tsx:1-5；LearningPage.tsx:1；AuthProvider.tsx:3 | 30 个页面全静态导入，quill（+ 24KB CSS）、html-to-image、@supabase/supabase-js 全部进入入口依赖；无 `React.lazy`/`Suspense`/手动 chunk | 首屏 JS 与解析成本高（推测 gzip 250~350KB），与 `项目文档.md:648` 声称的“代码分割、懒加载”相反；弱网首屏慢 | 路由级 `lazy()` + `Suspense` 骨架；quill/html-to-image 在使用处动态 import；构建产物可视化并设 budget |
| P1-5 | P1 | WebShell.tsx:12；MobileShell.tsx:12；ReaderPage.tsx:211-223；App.css:913 | TopBar 在 shell 中无条件渲染，ReaderPage 再渲染独立 sticky 顶栏，z-index 10 对 20 | 阅读页顶部两个吸顶栏堆叠/遮挡，沉浸阅读体验被破坏 | 阅读器路由改全屏布局（不渲染应用 TopBar）；或把阅读器顶栏上提到 shell 的插槽 |
| P1-6 | P1 | ReaderPage.tsx:1-753；GlobalAIAssistant.tsx:1-530；NoteEditorPage.tsx:1-509；App.css:1-1366 | 巨型组件：753 行/16 个 useState/6 个浮层；530 行全局助手；509 行编辑器；1366 行全局 CSS | 不可测试、重渲染范围大、改一处易回归；面试讲不清边界 | 按职责拆 hooks（useReaderSettings/useSelectionMenu/useAiDrawer）+ 子组件 + 每组件 <200 行；单文件 <300 行为目标 |
| P1-7 | P1 | App.css:28/1167,74/1203,178/1268,532/1235,146/1316,158/1329,171/1342,240/1309,228-238/1290-1306；App.css:234,1059,1084,1130,1145,1296,1302,1350；LoginPage.tsx:116-121；RegisterPage.tsx:103-108；ForgotPasswordPage.tsx:74-79 | App.css 追加式覆盖，13 组选择器重复、`.grid` 两套规则互相覆盖；7 种 CSS 断点 + 1 个 JS 断点；3 个页面在模块加载时注入 `<style>`（96 处 !important） | 样式优先级不可预测、改 A 坏 B；暗色主题下 bottom-nav/toast 仍是白色；认证页 4 种风格；生产页面存在重复无用样式 | 只保留一层 token + 语义层；组件级 CSS Modules/vanilla-extract；删除全部运行时注入；断点收敛为 2 个；视觉回归截图 |
| P1-8 | P1 | 全仓（role= 0 处；SearchPage.tsx:64 唯一键盘处理；HomePage.tsx:51；ForumPage.tsx:58；NotesPage.tsx:189,197；TopBar.tsx:22；ReaderPage.tsx:411-425,567-584,690-700；GlobalAIAssistant.tsx:274-292；index.css:8-29；index.html:2） | 无障碍系统性缺失：可点击 div/span、0 个 ARIA role、模态无 dialog 语义/焦点陷阱/Esc、对比度 1.92:1~2.02:1、`lang=en`、触控目标 24~39px | 键盘/读屏用户无法操作；小字在强光下不可读；违反 WCAG AA；这也是“本科项目最容易补、最容易讲”的加分项 | 建 Button/Modal/Tabs 原语（原生元素 + role + focus trap + Esc）；对比度 token 重算到 ≥4.5:1；`lang=zh-CN`；触控最小 44px；CI 接 axe-core |
| P1-9 | P1 | ForumPage.tsx:41-53；ReaderPage.tsx:129-136 + services/ai.ts:396-411；GlobalAIAssistant.tsx:213-219；ReadSearchPage.tsx:41-45 | 三态不完整：全站只有 2 处 loading（其中 ForumPage 是 `setTimeout` 500ms 假加载），无页面级 error 视图；AI 失败被 `aiAnalyzeText` 内部 catch 成占位文本当正文返回，ReaderPage 的 catch 永远不会触发 | 失败被静默吞掉，用户看到“AI赏析失败，请稍后重试”被当作赏析内容；体验不可信 | 统一异步层（query）自动给 loading/error/retry；删除假 loading；错误必须抛出到 UI 有明确重试按钮 |
| P1-10 | P1 | FollowersPage.tsx:10-21,42；ForumPage.tsx:20,47,101-109（对比 db.ts:1372 的 listPosts 无 category 参数）；CategoriesPage.tsx:49-52,103-104,116-120；ReadSearchPage.tsx:94；services/ai.ts:323-353,349,355-394 | 假功能：粉丝列表客户端随机生成、帖子分类筛选不参与查询、时间/地区筛选只改提示文案、搜索结果写死“999+ 条”、所谓 AI 搜索是本地字符串过滤 + 随机排序、翻译走 MyMemory 免费接口 | 面试追问即穿帮；用户以为筛选生效 | 要么实现（数据层支持过滤/分页），要么从 UI 移除；AI 功能明确标注“本地检索”或改为真实后端 |
| P1-11 | P1 | ForumPage.tsx:43-52；ReadSearchPage.tsx:32-57；ReaderPage.tsx:122-169；GlobalAIAssistant.tsx:179-223；PostDetailPage.tsx:48-51；NoteEditorPage.tsx:103-117 | 竞态与副作用：setTimeout 无 cleanup（快速切 tab 时旧回调覆盖新状态）；搜索无 AbortController/请求序号；AI 调用无取消/防重入（连点写两条记录）；阅读页每 60s interval 在每次渲染重建；浏览数 effect 在 StrictMode 下双执行 | 数据错乱（旧结果覆盖新结果）、重复记录、浏览量虚高、计时器泄漏 | 所有异步加 AbortController + requestId；effect 加 cleanup；幂等写入（去重 key）；dev 用 StrictMode 自测副作用 |
| P1-12 | P1 | ReaderPage.tsx:40,95,104-115；MePage.tsx:9,51-68 | 阅读时长/进度统计失真：`saveReadingHistory(...,0)` 进度恒 0；时长 interval 依赖每次渲染都新建的 `user` 对象且闭包值过期，最多 +1；展示层又读 auth user 的 stats（恒 0） | “阅读时长/进度同步”两个卖点实际不成立，统计页永远 0 | 时长用 ref/时间戳增量 + 卸载/visibilitychange 时结算；进度记录章节内滚动百分比；展示读数据层聚合并订阅 |
| P1-13 | P1 | RegisterPage.tsx:129-144；LoginPage.tsx:147-148；lib/security.ts:32-91；PostDetailPage.tsx:245-274；LoginPage.tsx:138,163；AuthProvider.tsx:268-283 | 表单与校验不一致：注册只校验长度/`includes('@')`；现成 validatePassword 未用；登录对密码做 HTML 转义（可能改写真实密码）；评论无长度上限；记住登录无效；修改密码不校验当前密码 | 注册后登录失败、弱口令、超长内容卡死、安全假象 | 统一 zod/yup schema 前后端共用；密码绝不转义；remember 与 token 持久化打通；改密先验证旧密码 |
| P1-14 | P1 | AuthProvider.tsx:52-61,100-109,165-174；App.tsx:102-109；MePage.tsx:146；types.ts:12-22 | 权限是摆设：认证用户 roles 固定 `['user']`、permissions 固定 `[]`；`/admin` 用 `auth:admin:users:read` 守卫 → 永远无权限；MePage 用 `user.role` 判断（AuthUser 根本没有 role 字段，运行时 undefined）→ 入口永不显示 | 后台与 RBAC 完全不可达；“权限管理”卖点不成立 | 权限从服务端返回（JWT claims/DB），前端只消费；Admin 入口用同一权限常量；删除 `user.role` 的隐式字段 |
| P1-15 | P1 | 项目文档.md:29-39,105-106,131,487-551,644-653（对照 package.json:6-35、tsconfig、0 测试文件） | 项目文档与实现严重不符：声称 Vite 2.3.8/Node14/MySQL8、支持 100+ 并发、加载 <2s、所有测试用例通过、代码分割懒加载、跨设备同步、注册含确认密码/验证码、AI 论坛回复 | 面试/保研材料存在诚信风险；任何懂行的老师对照 package.json 即可发现 | 重写文档为“真实实现 + 真实限制 + 已知问题”；补最小可信测试报告（可复现命令与截图）后再谈数据；不写未实现功能 |
| P1-16 | P1 | GlobalAIAssistant.tsx:26,28,89；App.tsx:113,66 | AI 对话存 `localStorage['rf_ai_chat_messages']`（不按用户隔离），线程 id 存 sessionStorage；组件在 Routes 外 → 登录页也有悬浮球；无用户时提交静默返回 | 换账号可看到上一个人聊天记录（隐私）；登录页出现无意义悬浮按钮；历史消息跨会话污染 | key 带 userId 前缀或在 DB 层隔离；组件仅在 Shell 内渲染；未登录隐藏/引导登录 |
| P1-17 | P1 | NoteEditorPage.tsx:147,150-152,163-167 | Quill 与 React state 双向同步：text-change 写 state → state 变化再 `quill.root.innerHTML=` 回写（推测会丢光标/选区、破坏 Quill 内部模型，并放大 XSS 面）；直接 innerHTML 赋值绕过 sanitize | 编辑器输入体验异常（需实测确认）；富文本内容安全边界不清 | Quill 只做非受控（uncontrolled）挂载，用 ref 读写；保存时取 `quill.root.innerHTML`；渲染处统一 sanitize + DOMPurify |
| P1-18 | P1 | public/covers（实测 15,583,875B；11 张 PNG 合计 14,827,839B）；HomePage.tsx:66-94；BookCover.tsx:32-35；ReaderPage.tsx:228 | 静态图片体积失控：单张封面 0.9~2.0MB，首页 8 张大图约 10MB；缩略图沿用原图、无 srcset/webp | 弱网首屏极慢，移动流量浪费；Lighthouse 性能分必然低 | 构建期图片处理（sharp 生成 3 档 webp/avif）；组件 `<img srcset sizes>`；封面统一压到 <150KB |
| P1-19 | P1 | 仓库全局（0 测试文件；无 CI；无 ErrorBoundary/document.title，grep 0） | 质量保障为零：无单测/E2E、无 CI、无错误边界（任一渲染异常整页白屏）、无页面标题/SEO | 重构无回归保护；演示时一个异常即白屏；无法证明“测试通过” | vitest + RTL 覆盖数据层与关键交互；Playwright 3 条主链路；ErrorBoundary + 错误上报；每页 `document.title` |

### P2（工程规范）

| 编号 | 严重度 | 位置 | 问题 | 影响 | 修复方向 |
| --- | --- | --- | --- | --- | --- |
| P2-1 | P2 | ui/toast.tsx:1；ToastProvider.tsx:7-14；App.css:852-892 | toast 死文件；实现层 timer 未清理、无上限、无退出动画、success 色对比不足 | 冗余文件误导；持续 toast 堆积 | 删除 toast.tsx；重写 Toast：队列上限、可关闭、移出动画、token 颜色 |
| P2-2 | P2 | LoadingSpinner.tsx:34-39；BookCover.tsx:21-27 | 每个 Spinner 实例注入 `<style>@keyframes`；BookCover 有多余 effect 重置 state | 重复样式、无谓渲染 | 动画放全局 CSS；BookCover 用 key 或派生状态代替 effect |
| P2-3 | P2 | App.css:10-27；security.ts:32-91；db.ts:1511-1518；NavIcons.tsx:1-296 + ui/SearchIcon.tsx | 死代码/重复体系：`.top-bar/.top-bar-row` 无引用；security 4 个函数未用；dbService 只同步 notes；手写 SVG 与 lucide 并存 | 认知负担、维护成本 | 删死代码；图标统一用 lucide（或统一自绘）；后端同步要么通用化要么删 |
| P2-4 | P2 | AIChatHistoryPage.tsx:68；AIAnalysisRecordsPage.tsx:103；ReadingHistoryPage.tsx:51；ProfileEditPage.tsx:53-57 vs SettingsPage.tsx:30-38 | 用整页刷新兜底；昵称编辑在 ProfileEdit 与 Settings 重复实现 | 体验割裂、状态丢失；两处逻辑漂移 | 同上 P1-1 后删除 reload；资料编辑收敛为一个表单 |
| P2-5 | P2 | index.html:2,7；App.tsx:111 | `lang=en`、固定 title、通配路由重定向首页而非 404 | 可访问性/SEO/分享体验差 | `lang=zh-CN`；按路由设置标题；加 NotFound 页 |
| P2-6 | P2 | App.css:642-646；App.css:1048-1056 | 书架固定 3 列、web-main 固定 padding，窄屏拥挤 | 320px 屏可用性差 | 用 `auto-fill minmax` + clamp 间距 |
| P2-7 | P2 | 全仓 69 处 console.*（含 ai.ts:20 打印 key 片段）；6 处 `key={idx}`；React StrictMode（main.tsx:8）下副作用双跑 | 生产日志噪音/信息泄漏；列表复用错位风险 | 加日志封装与生产裁剪；稳定 key；副作用幂等 |
| P2-8 | P2 | LoginPage.tsx:383,400,417；RegisterPage.tsx:358 | 社交登录按钮用 `alert('功能开发中')`；用户协议/隐私政策是 `href=#` | 假功能暴露不专业 | 未实现的功能不渲染，或明确标注“敬请期待”并禁用 |

---

## 三、重构建议

### 3.1 目标设计（先定边界，再动手）

原则只有三句话：**① 数据只有一个入口；② 页面只描述 UI；③ 重的东西按路由切分。**

```text
src/
├─ app/
│   ├─ router.tsx        // 唯一路由表（数据驱动）：path / lazy / layout / guard / meta.fullscreen
│   ├─ layouts/          // WebLayout、MobileLayout、FullscreenLayout（CSS 断点驱动，不再切组件）
│   └─ providers.tsx     // QueryClient、Auth、Theme、Toast、ErrorBoundary 组合
├─ data/
│   ├─ repository.ts     // 唯一读写口：subscribe/getSnapshot/mutate（useSyncExternalStore）
│   ├─ local/            // IndexedDB 适配（图片、分享卡、大对象）
│   ├─ remote/           // Supabase 适配（按需同步，带乐观更新与失败回滚）
│   └─ models.ts         // 领域类型（已有，保留并补 zod schema）
├─ features/
│   ├─ reader/           // reader.api.ts / useReaderSettings / ReaderPage / components/*
│   ├─ notes/  forum/  auth/  ai/  me/
├─ components/ui/        // Button/Input/Card/Chip/Tabs/Modal/Empty/ErrorState/Skeleton/Toast
└─ styles/               // tokens.css（亮/暗）→ semantic.css → 组件级 CSS Modules
```

三条硬规则写进 ESLint（`no-restricted-imports`）与 code review：

1. `src/pages/**`、`src/features/**` **禁止** import `data/db`，只能通过 feature hooks/services；
2. 任何组件禁止直接 `localStorage`/`document.head.appendChild`；
3. 每个路由必须声明 `lazy` 与 `layout`，新增路由只改 `router.tsx` 一处。

### 3.2 分阶段落地（按依赖顺序，每阶段可独立交付）

| 阶段 | 周期（个人） | 内容 | 产出/验收 |
| --- | --- | --- | --- |
| **P0 止血** | 1~2 天 | ① 吊销并移除硬编码 AI key，改 Serverless/后端代理；② 登录后以 auth user id 初始化本地数据（或重建 seed 与身份映射）；③ 删除操作加确认 + 软删除；④ 统一写入封装 try/catch + 配额错误提示；⑤ 缺 env 时 fail-fast 并给引导页，补 reset 路由 | key 不在 bundle（`grep` 验证）；换账号数据隔离（手动 e2e）；删除可撤销；无 env 启动有明确提示 |
| **P1 地基** | 3~5 天 | ① `repository.ts` + `useSyncExternalStore`，把 30 个页面的数据读取改成 hook；② `router.tsx` 路由表 + 全部路由 `React.lazy`；③ 拆 ReaderPage/GlobalAIAssistant/NoteEditorPage 为 hooks + 子组件；④ 建 `components/ui` 8 个原语 + tokens 收敛，删 App.css 重复块与运行时注入；⑤ 假功能二选一：实现或删除（分类筛选、粉丝、999+、AI 搜索标注） | 页面 0 处直接 import db；任意 mutation 后 UI 一帧内更新；首屏 chunk 拆分（可视化报告）；`App.css` < 400 行或无重复选择器 |
| **P2 体验与无障碍** | 3~5 天 | ① 统一异步层三态 + ErrorBoundary + 重试；② 图片管线（webp/avif + srcset + 缩略图）；③ 表单 schema 统一（zod）+ 删除确认/撤销；④ a11y：对比度、dialog 语义、焦点管理、键盘路径、44px 触控；⑤ 列表分页（数据层） | axe-core 0 critical；对比度全 ≥4.5:1；键盘可完成登录/发帖/评论/阅读设置；首页图片 < 500KB |
| **P3 质量与讲述** | 2~3 天 | ① vitest + RTL 覆盖 repository/阅读设置/编辑器；② Playwright 3 条主链路（登录、发帖评论、阅读赏析）；③ CI（typecheck + lint + test + build）；④ 重写项目文档为“真实版”，补重构前后对比数据 | CI 绿；覆盖率报告；README 一页讲清架构取舍；面试演示脚本（含失败兜底） |

### 3.3 验收标准（可量化，面试可直接展示）

| 维度 | 验收标准 | 验证方式 |
| --- | --- | --- |
| 数据一致性 | 任意写操作后对应 UI 在 1 帧内更新；换账号看不到他人数据 | RTL 断言 + 手动双账号 e2e |
| 数据安全 | 仓库与产物中无 key/token；localStorage/IndexedDB 写失败有用户可见错误 | `grep -E 'sk-|Bearer [A-Za-z0-9]'` 扫描 + 断网/配额模拟 |
| 架构约束 | `src/pages` 不 import db；新增页面只改 router 一处；无 `window.location.reload`/`navigate(0)` | ESLint 规则 + code review checklist |
| 性能 | 首页 LCP < 2.5s（本地 4G 节流）；入口 gzip < 200KB；首页图片 < 500KB | Lighthouse + rollup-plugin-visualizer |
| 可访问性 | axe-core 0 critical；文字对比度 ≥ 4.5:1；Tab 可走完核心流程 | axe + 键盘手工测试 |
| 质量保障 | 单测 ≥ 15 个、e2e ≥ 3 条；CI 全绿；`tsc --noEmit` 与 eslint 0 error | CI 报告 |
| 文档诚信 | 文档中每条功能都能在演示中点开；明确列出未实现项 | 对照 doc 逐条走查 |

### 3.4 不建议做的事（节省时间）

- 不要为了“看起来架构”而引入 Redux/Zustand + 全套 DDD：这个体量 `useSyncExternalStore` 或 TanStack Query 就够，反而好讲。
- 不要重写全部 UI：保留现有视觉语言（奶白/薄荷绿、大圆角），只把 token 与组件层抽出来，视觉改动越小越好讲“增量重构”。
- 不要保留 AI 直连前端：无论怎么改 UI，前端暴露 key 都是硬伤，必须先解决再谈其他优化。

---

## 四、面试可讲点

### 4.1 真实亮点（可以理直气壮讲）

1. **类型与门禁是达标的**：TS strict + `noUnusedLocals/Parameters`、`models.ts` 196 行覆盖 User/Book/Post/Note/Comment/Interaction 等 8 个领域、`tsc --noEmit` 0 error、ESLint 仅 4 条（本次实测）。可以讲“我如何用类型系统约束数据模型与页面契约”，并现场跑命令。
2. **有设计 token 与双主题意识**：`index.css:1-64` 亮/暗变量、`data-theme` 切换、`prefers-color-scheme` 监听（theme.ts:4-26）、`color-mix()` 的使用。虽然执行不到位，但“从硬编码颜色走向 token”的方向是对的——重构后正好讲“我如何把 token 变成真正的设计系统”。
3. **阅读器交互复杂度是真的**：选区菜单用 `getSelection + getRangeAt + getBoundingClientRect + clamp` 做定位（ReaderPage.tsx:189-204）；阅读样式（字号/背景/字体）持久化；`speechSynthesis` 朗读；英文学习模式（查词/存单词本）；AI 赏析抽屉；`html-to-image` 生成分享卡片。这些都能现场演示，且代码里有真实坐标/边界计算，不是纯 CRUD。
4. **有一个完整的认证骨架**：AuthProvider 的 `onAuthStateChange` 订阅 + 10s 超时兜底（AuthProvider.tsx:46-134）、`RequireAuth/RequirePermission` 分层、权限字符串常量（types.ts:3-8）。可以讲“认证状态机与路由守卫的分层”，但要主动说明“权限目前是硬编码占位”。
5. **交付广度**：30 个页面、8 个数据域、双 Shell、AI 流式读取（GlobalAIAssistant.tsx:189-202，`ReadableStream` + `getReader`）。适合讲“从 0 到完整产品”的推进能力，而不是架构深度。
6. **细节意识**：BookCover 三级降级（覆盖图 → 原图 → 首字母，BookCover.tsx:17-47）、Toast 用 `aria-live=polite`（ToastProvider.tsx:21）、图标组件统一 `aria-hidden`（NavIcons.tsx 全量）、返回逻辑区分 `history.length`（ReadSearchPage.tsx:66-73）。

### 4.2 过度包装（不能讲，或必须先改口）

| 不能说的 | 真实情况 | 证据 |
| --- | --- | --- |
| “完整测试报告、全部用例通过、支持 100+ 并发” | 0 个测试文件、无 CI；localStorage 单机存储谈不上并发 | 项目文档.md:487-551；本次统计 |
| “Vite 2.3.8 / Node 14 / MySQL 8” | Vite 8、React 19、Supabase + localStorage mock | 项目文档.md:495-499 vs package.json:13-35；lib/supabase.ts:9-33 |
| “代码分割、懒加载、首屏 <1s” | 无 lazy/Suspense；15.6MB 图片 + 全量页面静态导入 | App.tsx:5-29；public/ 实测 |
| “跨设备同步 / 云端存储” | 仅 note 尝试同步 Supabase，其余只写 localStorage；无登录态与数据绑定 | db.ts:1511-1518；P0-1 |
| “AI 搜索 / AI 推荐 / AI 实时答疑” | 搜索是本地字符串过滤 + 随机排序；翻译是 MyMemory 免费接口；AI key 硬编码且可能失效 | services/ai.ts:323-353,355-394,7 |
| “权限管理 / 管理后台” | 权限固定空数组，后台不可达；MePage 用不存在的 `user.role` 判断 | AuthProvider.tsx:52-61；RequirePermission；App.tsx:102-109 |
| “关注/私信/消息中心” | 粉丝是前端随机生成，通知是 seed 数据 | FollowersPage.tsx:10-21,42 |
| “注册含确认密码/验证码，找回密码完整” | 无确认密码、无验证码；reset 路由缺失，改密页无入口 | 项目文档.md:105-106；App.tsx:68-75；AuthProvider.tsx:288 |
| “记住登录状态/当前密码校验” | remember 参数被忽略；改密不校验旧密码 | LoginPage.tsx:138,163；AuthProvider.tsx:268-283 |

### 4.3 缺口怎么补（把“我做完了”变成“我判断过”）

建议把这次重构本身当作第二个项目讲，结构是：**发现问题 → 定原则 → 分阶段 → 量化验收**，每个环节都能落到本报告的证据上。

1. **首选深挖故事（数据层单一入口）**：从本报告图 B 出发——“为什么 localStorage 直读 render 是错的”（React 纯度、无订阅、O(n) 解析、不可测试），到 `repository + useSyncExternalStore` 的迁移方案与 1 帧更新验收。这是最能体现工程判断的一段。
2. **第二故事（阅读器交互）**：选区坐标计算、移动端 `getBoundingClientRect` 与视口边界的 clamp、异步 AI 的取消/去重、阅读设置持久化。讲“交互复杂度”比讲“页面数量”更有分量。
3. **第三故事（AI 集成边界）**：key 不能进前端 → 后端代理 → 成本/超时/降级 → 流式渲染的取消。把“AI 功能”从卖点变成“接入与治理”的讨论，更符合研究生面试口味。
4. **诚实定位**：这是本科阶段的产品型项目，亮点是**完整度 + 交互复杂度 + 一次真实的重构**，不是“高并发架构”。面试时说清边界，比堆术语安全。
5. **演示前检查清单（务必执行）**：① 配好 `.env` 并确认登录能进；② 准备一个“不依赖 AI key 也能演示”的路径（阅读器设置、发帖、评论）；③ 把 `项目文档.md` 换成诚实版或不在面试材料里放；④ 现场只演示 P0/P1 修完后的版本。

---

*（本报告所有行号基于 HEAD cbec792；统计数字均为本次只读实测，性能估算已标注“推测”。）*
