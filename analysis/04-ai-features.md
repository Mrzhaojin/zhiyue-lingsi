# 04 · AI 能力真实性尽调报告

> **对象**：`Zhiyue_Lingsi`（智阅灵思，React 19 + Vite 8 + TS 的阅读社区）。HEAD `cbec792`，remote `https://github.com/Mrzhaojin/zhiyue-lingsi.git`。
> **范围**：`src/services/ai.ts`、`src/services/doubao.ts`、`src/services/keywordFilter.ts`、`src/components/GlobalAIAssistant.tsx`、`src/pages/AIChatHistoryPage.tsx`、`src/pages/AIAnalysisRecordsPage.tsx`；`ReaderPage / NoteEditorPage / PostDetailPage / NewPostPage / LearningPage / ReadSearchPage` 全量 AI 触点；`src/modules/auth/server` 是否提供 AI 端点。
> **判定口径**：只有"浏览器真实发起大模型/第三方请求、且响应决定 UI 输出"才算 AI；本地规则、静态数据、模板文案一律不算。
> **证据**：`文件:行号`，逐条只读核对；离线无法验证的外部状态标注"推测"。

**一句话结论**：项目里有 2 条真实大模型调用链（阅读页赏析、全局伴读聊天），但都是**密钥硬编码在前端、无服务端代理、无上下文注入、结构化解析脆弱、失败也落库**的"裸调用"；翻译是第三方免费 API + 硬编码分支；查词 / AI 搜索 / AI 推荐 / 个性化推荐 / AI 笔记生成基本是本地规则、静态数据或模板。`项目文档.md` 对 AI 的描述大面积超出实现——"协同过滤推荐""求助帖 AI 自动回复""缓存机制""AI 功能测试通过"在代码中**零实现**。

## 一、现状还原（架构、关键流程、数据流）

### 1.1 代码地图（谁在真正干活）

| 文件 | 规模 | 角色 | 判定 |
|---|---|---|---|
| `src/services/ai.ts` | 831 行 / 33.5KB | 唯一在用的 AI 服务层：真实 Ark 调用 + 伪流式 + 第三方翻译 + 本地查词/搜索 + 约 300 行规则话术死代码 | 主实现 |
| `src/services/doubao.ts` | 119 行 | 第二套 Ark 调用（env 取 Key、`chat/completions`、`doubao-pro-32k`） | **死代码，全仓库无任何 import** |
| `src/services/keywordFilter.ts` | 10 行 | 客户端敏感词过滤（默认 4 个词） | 只审 UGC 发布，不覆盖 AI 输出 |
| `src/components/GlobalAIAssistant.tsx` | 530 行 | 全站悬浮 AI 聊天面板 | UI 真、调用是裸 LLM 调用 |
| `src/pages/AIChatHistoryPage.tsx` | 107 行 | AI 对话历史（只读 + 删除） | 因两套用户 ID 错位，基本不可用 |
| `src/pages/AIAnalysisRecordsPage.tsx` | 117 行 | 赏析记录（只读 + 删除 + 转笔记） | 可用，但会把失败结果也当记录展示 |
| `src/modules/auth/server/src/index.mjs` | 732 行 | 唯一服务端 | **只有 `/api/v1/auth/*`，无 AI 端点** |

### 1.2 关键流程与数据流（ASCII）

```text
┌──────────── 浏览器：React 19 SPA（Vercel 纯静态托管，vercel.json:1）────────────┐
│                                                                              │
│  ReaderPage                                                                  │
│    ├─ aiAnalyzeText(整章/选区) ─► ai.ts::aiAnalyzeTextWithDoubao ─► callDoubaoAPI ─┐
│    │     └─ addAIAnalysisRecord ─► localStorage["read_forum_db_v5"].aiAnalysisRecords │
│    ├─ aiTranslate ────────────► https://api.mymemory.translated.net（第三方，无 Key）  │
│    ├─ aiWordExplain ──────────► 本地模板：/demo/ 音标、（演示释义）前缀 ─► UI          │
│    └─ speakText ──────────────► window.speechSynthesis（浏览器 TTS，非 AI）          │
│                                                                              │
│  ReadSearchPage                                                              │
│    └─ aiSearchBooks ─► listBooks() 本地 includes 过滤 + recommendedHeat 排序  │
│                       + "书单"关键词随机洗牌 + 300ms 假延迟                    │
│                                                                              │
│  GlobalAIAssistant（全站悬浮，App.tsx:113）                                   │
│    └─ streamDoubaoAPI ─► 同一 Ark 端点：先取完整响应，再 setInterval(50ms/字符) ├
│          ├─ addAIChatMessage ─► localStorage["read_forum_db_v5"].aiChatMessages │
│          └─ localStorage["rf_ai_chat_messages"]（第二份副本，无 userId 隔离）   │
└──────────────────────────────────────────────────────────────────────────────┘
        │ 服务端 src/modules/auth/server：只有 auth 路由；config.mjs:9 读 DOBAO_API_KEY 但全仓库无使用
        ▼
  Ark API https://ark.cn-beijing.volces.com/api/v3/responses
  ▲ 浏览器直接持有硬编码 Key（ai.ts:7, ai.ts:99），构建后随 JS bundle 公开
```

### 1.3 AI 功能真实性矩阵（逐项结论，对应问题①）

| # | 功能（UI 文案） | 入口 | 判定 | 关键依据 |
|---|---|---|---|---|
| 1 | 整段 AI 赏析 | ReaderPage:326-349 | **真大模型**（前提：Key/端点有效、CORS 放行） | `ai.ts:238-288` 构造中英文 prompt 调 Ark；`ai.ts:5-94` 发起 `/api/v3/responses`；结果落库 `ReaderPage:129-131` |
| 2 | AI 句子赏析 | ReaderPage:521 | **真大模型**（同上） | `ReaderPage:139-155` 走同一个 `aiAnalyzeText` |
| 3 | AI 伴读助手聊天 | 全站悬浮按钮 | **真大模型，但为裸调用** | `GlobalAIAssistant:188` → `ai.ts:97-194`；**不传 systemPrompt、无上下文、伪流式** |
| 4 | 翻译（中英） | ReaderPage:442 / 458 / 507 | **真第三方 API，非大模型** | `ai.ts:373-393` 调 MyMemory；无 Key、无配额管理 |
| 5 | 转白话 / 转文言 | ReaderPage:461-490 | **假（硬编码）** | `ai.ts:359-371`：只命中 4 条 includes 写死文案，其余返回（现代文）原文 /（文言文）原文 |
| 6 | 查词 | ReaderPage:523-528 | **假（本地模板）** | `ai.ts:484-494` 返回 /demo/ 音标、（演示释义）前缀释义、模板英文例句，200ms 假延迟 |
| 7 | AI 推荐 / AI 搜索 | ReadSearchPage:35,111 | **假（本地关键词搜索）** | `ai.ts:323-353`：`title/author/summary.includes` + `recommendedHeat` 排序 + 300ms 假延迟 + "书单"随机洗牌；"AI推荐理由"是种子静态字段 `db.ts:433-434` 等 |
| 8 | 个性化推荐 | HomePage:38,66-68；CategoriesPage:57；SearchPage:32 | **不存在** | 全部按静态 `recommendedHeat` 排序；`readingHistory/shelf/interactions` 仅用于展示页（`BookshelfPage:13`、`ReadingHistoryPage:10`），从不参与推荐 |
| 9 | AI 笔记生成 | ReaderPage:744；AIAnalysisRecordsPage:93；GlobalAIAssistant:459-473 | **半真（搬运）** | 大模型产出内容后由用户手动填进笔记编辑器；无"一键生成整篇笔记"调用 |
| 10 | 求助帖 AI 自动回复 | 无入口 | **不存在** | 全 `src` 无"求助"字样、无帖子→AI 的调用；与 `项目文档.md:131,459-467` 冲突 |
| 11 | 语音朗读 | ReaderPage:542；ReadSearchPage:137 | 真但**非 AI** | `ai.ts:413-472` Web Speech API 封装（异步 voices、lang 匹配、onend） |
| 12 | 语音识别 | 无入口 | **死代码** | `ai.ts:474-482` `getSpeechRecognition` 全仓库无引用 |
| 13 | 内容审核 / AI 内容安全 | AdminPage:62-90 | **客户端关键词过滤** | `keywordFilter.ts:3-9` + `db.ts:79` 默认 4 个词；AI 输出不经过它 |
| 14 | AI 对话历史 | AIChatHistoryPage | **功能不可用** | 历史页按 `getCurrentUser().id` 查（`AIChatHistoryPage:10,13`），聊天按 auth `user.id` 写（`GlobalAIAssistant:22,163`），两套 ID 不同 |
| 15 | 赏析记录 | AIAnalysisRecordsPage:27 | 可用但**含失败记录** | 落库在 `db.ts:1769-1783`；失败兜底对象同样入库（见 A-08） |

**Q1 直接回答**：所谓"AI 答疑"——真正能到大模型的是两个入口：阅读页赏析、悬浮聊天；"深度分析/翻译"中，深度分析真（但解析脆弱），翻译是第三方机翻 + 硬编码；"推荐"完全不调用任何模型，是本地关键词过滤 + 静态热度排序。**社区侧（PostDetailPage / NewPostPage）没有任何 AI 调用**，只有敏感词过滤。

### 1.4 五个指定页面的 AI 触点清单

| 页面 | 是否调用 AI | 具体位置 | 结论 |
|---|---|---|---|
| ReaderPage | 是（4 类） | `ReaderPage:129`（整章赏析）、`:147`（句子赏析）、`:162`（翻译）、`:173`（查词）、`:542`（TTS 朗读） | 全站 AI 主战场 |
| NoteEditorPage | **否** | 只有 `NoteEditorPage:15` import、`:394` 敏感词过滤、`:480` 分享卡角标"智能阅读笔记" | 接收 AI 结果作为 excerpt，但不调 AI |
| PostDetailPage | **否** | 只有 `PostDetailPage:16` import、`:256` 评论敏感词过滤 | 无 AI 答疑/摘要 |
| NewPostPage | **否** | 只有 `NewPostPage:4` import、`:166` 发布敏感词过滤 | 无 AI |
| LearningPage | **否** | 133 行全部是生词本列表/排序/导出（`LearningPage:1-35`） | 无 AI；文档说的"AI 分析记录"实际是另一个独立页面 |

补充：`GlobalAIAssistant` 挂在 `App.tsx:113`（Routes 之外），所有页面可见；提交需登录态（`GlobalAIAssistant:147`）。

### 1.5 密钥 / 代理 / 超时 / 重试 / 限流 / 成本（对应问题②）

**① 密钥位置：前端源码硬编码，且有两份实现。**
- 在用的 Key：`ai.ts:7`（`callDoubaoAPI`）与 `ai.ts:99`（`streamDoubaoAPI`），值完全相同，注释写明"使用用户提供的API密钥"（`ai.ts:6`）。
- 另有一套"规范写法"：`doubao.ts:4` 读 `import.meta.env.VITE_DOBAO_API_KEY`——但 `doubao.ts` 整文件无任何 import（grep 证据：`services/doubao` 只出现在定义处），属于**死代码**。
- 仓库根目录**没有 `.env`**（无 `.env*` 文件），`.gitignore:25-26` 只忽略 `.env/.env.local`；文档 `项目文档.md:576` 要求填 `VITE_DOBAO_API_KEY`，但当前代码不用它。
- **是否打进前端 bundle**：在用链路是硬编码字符串，必然进 bundle；`doubao.ts` 若被启用，Vite 也会把 `VITE_*` 构建期内联进 JS → 同样公开。**两种写法都不安全**。
- **已泄露放大器**：`ai.ts:20` 打印 Key 前 5 + 后 5 位；`ai.ts:21,47,62,104-107,120,137,152,172` 打印 prompt、完整响应、Key 长度；Key 已提交进 git（`git log -S 704801f6...` 命中 `9c7e04a`），remote 指向公开 GitHub，且部署为静态站点（`vercel.json:1`）。**结论：若该 Key 仍有效，属已公开泄露。**

**② 服务端代理：没有。**
- `src/modules/auth/server/src/index.mjs` 732 行只注册 `/api/v1/auth/*`（登录/刷新/登出/注册/改密/admin 等，见 `index.mjs:153-706`），无任何 AI 路由。
- `config.mjs:9` 读取 `DOBAO_API_KEY` 并放入配置（`config.mjs:19`），但全仓库无使用点 → **服务端 AI 代理是空壳**。
- `vite.config.ts:1-7` 无 dev proxy；`vercel.json:1` 是纯静态 rewrite；`src/modules/auth/server/package.json:10-25` 无任何 AI SDK。
- 因此前端 `fetch("https://ark.cn-beijing.volces.com/...")`（`ai.ts:30,123`）是浏览器跨域直连：**能否成功取决于 Ark 是否允许浏览器 CORS（离线无法验证，推测为高风险）**；即使成功，也无法做服务端限流、审计、成本控制。

**③ 超时 / 重试 / 限流 / 成本：基本缺位。**
- 超时：`ai.ts:30`、`ai.ts:123` 的 `fetch` 均无 `AbortController`/`AbortSignal.timeout`，无取消按钮；请求挂起时 UI 永远 loading。
- 重试：只有 `callDoubaoAPI` 有 `retries = 3` + 指数退避 1s/2s（`ai.ts:17,85-88`），但 **4xx（含 Key 失效）、JSON 解析失败也会重试**；`streamDoubaoAPI`（聊天主链路）**一次重试都没有**（`ai.ts:97-194`）。
- 限流：无。服务端只对 auth 登录做了 `express-rate-limit`（`index.mjs:83-89,161`）；AI 调用没有任何 per-user 限制。
- 成本控制：无 token 上限（在用请求体只有 `model`+`input`，`ai.ts:36-39,115-118`；死代码 `doubao.ts:32` 才有 `max_tokens:1000`）、无缓存、无配额、无计费统计、无请求去重；同一章节每打开一次赏析就重复调用一次（`ReaderPage:122-137`）。

**④ 失败降级**：聊天失败显示固定文案并 toast（`GlobalAIAssistant:213-219`）；赏析失败返回固定对象（`ai.ts:277-287,400-409`）。没有错误分类、没有重试入口、没有离线兜底。

### 1.6 回复质量如何保证（对应问题③）

| 环节 | 现状 | 判断 | 证据 |
|---|---|---|---|
| Prompt 结构 | 有中文角色说明 + 4 段输出要求；但 system 与 user 被拼成同一个字符串塞进 `input`（`ai.ts:26-28,110-113`），没有真正的 system 优先级，无 few-shot、无输出示例 | 及格偏弱 | `ai.ts:238-241` |
| 上下文注入 | **无**。赏析只发文本本身，不注入书名、章节、作者；聊天只发最近 6 条消息的扁平文本，不注入正在读的书、书库、用户水平（`GlobalAIAssistant:165-167,182-188`） | 缺失 | `ai.ts:239` |
| 多轮对话 | `messages` 被拼成 role-colon-content 单串（`ai.ts:110-113`），角色语义丢失；聊天历史来自 localStorage 且跨线程混用 | 弱 | 同左 |
| 流式输出 | **伪流式**：先非流式拿全文，再用 `setInterval(50ms/字符)` 回放（`ai.ts:176-193`），每个字符触发一次全量 `setMessages`（`GlobalAIAssistant:193-202`）。1000 字回答约 50 秒，无法取消 | 假能力 + 性能问题 | 同左 |
| 结构化输出 | 无 JSON 契约。解析方式：`response.split` 双换行 + includes 关键词 + 正则贪婪替换（`ai.ts:247-268`；`doubao.ts:65-86` 重复一份）。模型一旦用 Markdown 标题/编号/无空行，四段字段就丢或错位 | 脆弱 | 同左 |
| 失败兜底 | 返回"AI赏析失败，请稍后重试"当作**正常内容**，且该内容会被当成功结果落库（`ai.ts:277-287` + `ReaderPage:129-131`）；`ReaderPage:132-136` 的 catch 永不可达 | 错误处理方向错 | 同左 |
| 质量评估 | 无 prompt 评测集、无回归样本、无 token/latency 指标、无测试文件（仓库仅有 node_modules 里的测试） | 缺失 | 全仓库 glob 无 `*.test.*` |

### 1.7 "个性化推荐 / 协同过滤"真相（对应问题④）

- **不存在**。全仓库无 `协同 / cosine / 相似度 / embedding / 向量 / 评分矩阵` 等任何推荐算法代码（grep 无结果）。
- 所有"推荐"位置都是静态热度排序：首页热门书籍 `HomePage:38,66-68`、分类页 `CategoriesPage:57`、搜索页 `SearchPage:32`、书库检索 `aiSearchBooks` 末尾 `ai.ts:352`。
- "AI 推荐理由"是种子数据里写死的文本字段：`aiReason`（`models.ts:47`；样例 `db.ts:433-434,605-606,633-634` 等），前端只做"根据关键词 xxx，推荐理由："前缀拼接（`ai.ts:340-343`）。
- 行为数据其实存在（`readingHistory`、`shelves`、`interactions`，`db.ts:48-53`），但目前只用于展示页（`BookshelfPage:13`、`ReadingHistoryPage:10`），**没有一条进入推荐计算**。
- 文档 `项目文档.md:449-457` 写"基于用户阅读历史和偏好，使用协同过滤算法"，与代码完全不符；这是答辩时最容易被追问穿帮的一条。
- 补充：`aiSearchBooks` 里专门写了"如果是匠心书单或类似关键词，随机乱序以体现随机生成"（`ai.ts:347-350`）——**明确为演示效果伪造随机性**，同时加了 300ms 假延迟（`ai.ts:345`）。

### 1.8 AI 聊天/分析记录的落库方式（对应问题⑤）

- **存储介质**：单个 localStorage key `read_forum_db_v5`（`db.ts:64`），整个"数据库"（用户/书/帖/笔记/聊天/赏析……）序列化成一个 JSON；`writeDb` 每次都全量重写（`db.ts:1254-1256`，`storage.ts:18-22`）。
- **赏析记录**：`addAIAnalysisRecord` → `db.aiAnalysisRecords`（`db.ts:1769-1783`），记录页 `listAIAnalysisRecords(user.id)`（`db.ts:1785-1790`；`AIAnalysisRecordsPage:27`）。
- **聊天记录**：`createAIChatThread`/`addAIChatMessage`（`db.ts:1720-1760`）写入同一个 blob；**同时**再存一份 `localStorage["rf_ai_chat_messages"]`（`GlobalAIAssistant:28,88-90`），线程 ID 存 sessionStorage（`:26,157`）。两份数据会不一致（删除线程只清 db 那份，`AIChatHistoryPage:66`）。
- **多端同步**：无。Supabase 只在 `addOrUpdateNote` 时同步笔记（`db.ts:1511-1518`），AI 数据完全没接后端。
- **用户隔离**：聊天消息用 auth `user.id`（`GlobalAIAssistant:163,205-212`），历史页用 `getCurrentUser().id`（种子用户，`db.ts:1301-1308`；`AIChatHistoryPage:10`）。auth 在未配置 baseUrl 时返回 mock 用户 `id: "1"`（`authApi.ts:119-147`），与种子用户 ID 必然不同 → **AI 对话历史页查不到任何线程**。
- **容量风险**：AI 长文本让单个 localStorage blob 快速膨胀；`localStorage.setItem` 未捕获 `QuotaExceededError`（`storage.ts:18-22`），超限时写失败但 UI 无感知，可能导致聊天/记录写不进去（数据丢失）。
- **分页/索引**：无。历史页与记录页都全量读取并渲染（`AIChatHistoryPage:32`、`AIAnalysisRecordsPage:27`），删除后靠 `navigate(0)` 整页刷新（`AIChatHistoryPage:68`、`AIAnalysisRecordsPage:103`）。

### 1.9 证据方法与未决项

- 证据方法：`read`/`grep`/`glob` 只读核对；`git log -S` 追踪硬编码 Key 的提交；`Get-ChildItem` 核对根目录无 `.env`、无 `api/` serverless 目录；`grep` 确认 `doubao.ts`、`aiAssistantReply`、`getAIAssistantResponse`、`book_cards` 引用关系。
- **未决项 1（推测）**：硬编码 Key/端点当前是否仍有效、Ark 是否允许浏览器 CORS。本环境网络受限，无法请求外网验证；但无论有效与否，A-01/A-02 的安全结论都成立，且若 CORS 拒绝则整条聊天/赏析链路在部署环境不可用。
- **未决项 2（推测）**：Key 是否已被推送到 GitHub。仓库配置了 origin remote，本地 git 历史含 Key（`9c7e04a`），按常规开发流程"已推送"概率高；需要上 GitHub 确认后立刻轮换。
- **未决项 3**：`streamDoubaoAPI` 的 `ReadableStream<string>` 泛型、Ark `/responses` 的 `input` 字符串格式是否被服务端接受，需真机验证；从代码看只覆盖了一种响应结构（`ai.ts:156-166`）。


## 二、问题清单

> 分级：P0 = 数据丢失 / 安全漏洞 / 功能不可用；P1 = 架构性或明显质量缺陷；P2 = 工程规范。AI 子功能失效的"功能不可用"若严格套 P0 定义可升级，但按真实影响面我按 P1 处理并单独说明。

| 编号 | 严重度 | 位置 | 问题 | 影响 | 修复方向 |
|---|---|---|---|---|---|
| A-01 | **P0** | `src/services/ai.ts:7`、`src/services/ai.ts:99`；git `9c7e04a` | 豆包 API Key 硬编码在客户端源码，两份重复；已进入 git 历史；remote 为公开 GitHub；Vercel 纯静态部署（`vercel.json:1`） | Key 随 bundle 公开，任何人可提取盗刷，产生费用/封号/额度耗尽；属于**已泄露凭据** | 立即到火山控制台吊销并轮换；改服务端 env；用 git filter-repo 清理历史；加 secret 扫描 CI |
| A-02 | **P0** | `src/services/ai.ts:30,123`；`src/modules/auth/server/src/index.mjs:153-706`；`config.mjs:9`；`vercel.json:1`；`vite.config.ts:1-7` | 无服务端 AI 代理，浏览器直连 Ark；服务端读了 `DOBAO_API_KEY` 但从未使用；无 dev proxy、无 serverless 函数 | Key 必然落在前端；无法限流/审计/降级/切换模型；第三方 CORS 若拒绝则整条 AI 链路不可用（推测需实测） | 新增 `/api/v1/ai/*` 代理（复用现有 express-rate-limit/helmet），前端只调同源接口；Vercel 侧用 Serverless/Edge Function |
| A-03 | **P0** | `src/components/GlobalAIAssistant.tsx:28,88-90` | AI 聊天记录存全局 localStorage key `rf_ai_chat_messages`，没有 userId 命名空间，登出也不清理 | 同一浏览器换账号后，新用户能直接看到上一个用户的完整 AI 对话（可能含隐私内容），属**跨用户数据泄露** | key 加 userId 命名空间；登出清理；迁移到 IndexedDB 或服务端会话表 |
| A-04 | P1 | `src/components/GlobalAIAssistant.tsx:182-188`；`src/services/ai.ts:110-113,290-303` | 聊天不传 systemPrompt、不注入任何上下文（书名/章节/书库/用户水平）；多轮 messages 被压平成 role-colon-content 单串 | 回答不 grounded，"找书/情节梳理/人物关系"等引导语（`GlobalAIAssistant:38`）无法兑现；模型不知道用户在读什么 | 用 messages 数组 + 固定 system + 检索书库 top-k 作为上下文；会话头记录当前书籍 |
| A-05 | P1 | `src/services/ai.ts:176-193`；`GlobalAIAssistant:193-202` | 伪流式：先等完整非流式响应，再 50ms/字符回放；每字符触发一次全量 setMessages | 1000 字回答约 50 秒，长回答极慢；O(n²) 渲染；无法取消；与文档"AI响应延迟<30 秒"（`项目文档.md:36`）矛盾 | 改真 SSE/ReadableStream 流式；按帧批量 flush；提供停止按钮 + AbortController |
| A-06 | P1 | `src/services/ai.ts:17-90,97-194` | 无超时、无取消；`callDoubaoAPI` 对 4xx/解析错误也重试 3 次；聊天链路零重试 | 网络异常时 UI 永久 loading；密钥错误白白重试 3 次；最坏体验不可控 | `AbortSignal.timeout(15s)`；只对 429/5xx/网络错误重试 2 次 + 抖动；错误码分类展示 |
| A-07 | P1 | `src/services/ai.ts:247-268`（`doubao.ts:65-86` 重复实现） | 结构化输出靠双换行 split + includes 匹配 + `/^.*：/` 贪婪替换；无 JSON 契约 | 模型输出 Markdown/编号/无空行时四段字段丢失或错位，赏析抽屉常常只有一段有内容 | 明确要求 JSON 输出；用 zod 校验；校验失败重试 1 次后降级原文 |
| A-08 | P1 | `src/services/ai.ts:277-287,396-411`；`ReaderPage:129-131,147-149,132-136` | 失败被当成成功：内层 catch 返回"AI赏析失败，请稍后重试"对象；外层无条件 `addAIAnalysisRecord`；外层 catch 永不可达 | 失败结果被当成赏析记录持久化，污染记录页；用户以为生成成功 | 抛错或返回 Result 类型；仅成功时落库；失败重试/提示明确 |
| A-09 | P1 | `src/services/ai.ts:359-371,373-393`；`ReaderPage:56-61,427-461,494-509` | 翻译半假：文白互译只有 4 条硬编码命中，其余加前缀返回原文；中文非《红楼梦》《三体》《Gatsby》的书点"翻译"走 zh→zh-CN 恒等翻译却显示"英译中" | 用户看到"翻译"实际是原文/错误方向；功能穿帮 | 文言转换走 LLM prompt；按 `book.language` 决定按钮；结果标注"机器翻译/来源"；恒等翻译直接短路 |
| A-10 | P1 | `src/services/ai.ts:484-494`；`ReaderPage:523-528,171-178` | 查词 100% 假：返回 /demo/ 音标、（演示释义）前缀、模板英文例句 | 英语学习模式核心入口是假的，演示时一点就穿帮 | 接 LLM 或开源词典 API；不可用就移除入口 |
| A-11 | P1 | `src/services/ai.ts:323-353`；`ReadSearchPage:35,94,111`；`src/data/db.ts:433-434` | "AI 搜索"是本地 title/author/summary includes + recommendedHeat 排序；"书单"关键词随机洗牌；300ms 假延迟；"AI 推荐理由"是静态种子字段；结果数"999+ 条"写死（`ReadSearchPage:94`） | 演示"AI 推荐"时无法解释为什么是这几本；面试官要求看模型调用会落空 | 改名"关键词检索"或接语义检索；推荐理由由模型生成并缓存；去掉假延迟/假计数 |
| A-12 | P1 | `项目文档.md:36,131,302-303,449-457,507,531,646` | 文档声称协同过滤推荐、求助帖 AI 自动回复、缓存机制、AI 功能测试通过、AI 笔记生成；代码零实现（grep 无相似度/求助/自动回复；无测试文件） | 答辩 PPT 与仓库对不上，任一条被追问即崩；属学术诚信风险 | 文档改为"已实现/设计目标"两栏；删除无实现的能力描述 |
| A-13 | P1 | `src/services/doubao.ts`（全 119 行无 import）；`src/services/ai.ts:534-831`（约 300 行无外部调用）；`GlobalAIAssistant:409` | 死代码：两套 `callDoubaoAPI` 端点/模型/错误策略不一致；`aiAssistantReply` + `getAIAssistantResponse`（含四级词汇表、学习监督话术）无调用者；`book_cards` 渲染存在但唯一 payload 生产者在死代码里（`ai.ts:701,712,734`） | 误导维护/面试；一旦有人唤醒规则话术就是"假 AI"翻车；书卡 UI 永远不会出现 | 删除死代码；需要 fallback 就收敛成单一、可测的降级函数；语义检索实现后恢复书卡 |
| A-14 | P1 | `GlobalAIAssistant.tsx:459-473`；`keywordFilter.ts:3-9`；`NoteEditorPage:394`、`PostDetailPage:256`、`NewPostPage:166` | AI 输出不经审核即可一键存为笔记并继续发布；敏感词过滤只覆盖 UGC 发布，且词表存 localStorage 可被用户篡改（`db.ts:79`） | AI 幻觉/违规内容进入社区；演示时被问"AI 内容怎么治理"无法回答 | 统一 output guard（客户端预检 + 服务端兜底）；bannedKeywords 落到服务端配置 |
| A-15 | P1 | `AIChatHistoryPage:10,13` 对比 `GlobalAIAssistant:22,163,205-212`；`authApi.ts:119-147`；`db.ts:1147,1301-1308` | 两套用户身份：聊天写 auth user.id（mock 下恒为 1），历史页查种子用户 id；"继续对话"只写 sessionStorage（`AIChatHistoryPage:54`），已挂载的 GlobalAIAssistant 不会重读（`:26` 只在初始化读） | AI 对话历史永远为空；继续对话无效——AI 页面功能不可用 | 统一用户身份来源（auth user 为唯一真相）；thread 切换用 context/事件驱动；历史页直接用 auth user |
| A-16 | P1 | `db.ts:1752-1760,1254-1256`；`storage.ts:18-22` | 每条 AI 消息都把整个 DB（全部书章节/帖子/笔记）序列化重写单个 localStorage key；超 5MB 抛 QuotaExceededError 未捕获 | AI 长文本加速膨胀；写失败无提示，聊天/记录静默丢失 | AI 数据拆到 IndexedDB 分表（threads/messages/analysis）；写入失败显式提示；单条长度上限 |
| A-17 | P1 | `src/services/ai.ts:36-39,115-118` | 在用请求无 max_tokens/temperature；无 per-user 配额、无缓存、无去重；同章节重复赏析重复计费 | 成本不可控；演示/被刷时账单风险；重复请求浪费延迟 | 服务端加每日配额 + 结果缓存（key=bookId+chapterId+textHash）+ 请求合并 |
| A-18 | P2 | `ai.ts:20-21,47,62,104-107,120,137,152,172` | 生产代码打印 Key 前后 5 位、完整 prompt、模型完整回复；无日志分级 | 隐私（用户对话/书摘）落控制台；截图演示即泄密 | 删除或 dev-only + 脱敏；用结构化日志且不落 prompt 原文 |
| A-19 | P2 | `ai.ts:200-236` 的 mock 分支因 Key 硬编码不可达；`ai.ts:345,361,486` 人为 300/600/200ms 延迟 | 不可达的 mock 与"假思考"延迟 | 让读代码的人误判有降级能力；演示刻意拖慢 | 删除；需要 mock 用显式开关 |
| A-20 | P2 | `ai.ts:66-76,156-166` | Ark 响应解析用多层 unknown + 运行时 in 断言堆叠，无 schema，错误细节被吞 | 接口一变即静默失败；难排障 | zod 定义响应 schema；保留 error code/message |
| A-21 | P2 | `ai.ts`（831 行）混合 TTS/翻译/搜索/硬编码话术/LLM 调用；`doubao.ts` 与 `ai.ts` 重复实现 | 模块职责过载、重复代码 | 维护成本高、面试展示不专业 | 拆 `providers/ark.ts`、`analysis.ts`、`chat.ts`、`search.ts`、`tts.ts` |
| A-22 | P2 | `AIChatHistoryPage:68`、`AIAnalysisRecordsPage:103` | 删除后用 `navigate(0)` 整页刷新 | 体验差、丢状态 | 状态驱动刷新 |
| A-23 | P2 | `AIChatHistoryPage:32`、`AIAnalysisRecordsPage:27` | 全量读取 + 全量渲染，无分页/虚拟列表 | 记录变多后卡顿 | 分页 + 懒渲染 |
| A-24 | P2 | 无 `*.test.*`；`项目文档.md:507,531` 声称测试通过 | AI 模块零测试、零评测集、零回归样本 | 无法证明质量；面试问"怎么验证 AI 回复质量"答不出 | 6 个单测（prompt 构造/JSON 解析/推荐排序/降级）+ 30 条黄金集 |
| A-25 | P2 | `README.md:1-3` | 仍是 Vite 模板 README，无项目说明 | 仓库第一印象差 | 补项目介绍、AI 架构图、运行方式 |

### P0 展开（三条必须立刻处理）

1. **A-01 泄露凭据**：`ai.ts:7` 与 `ai.ts:99` 的字符串是可直接使用的 Bearer Token（`Authorization: Bearer ${apiKey}`，`ai.ts:34,127`）。它随 `src` 提交进 `9c7e04a`，被 `ReaderPage` 与 `GlobalAIAssistant` 静态 import，构建后原样出现在 Vercel 的 JS bundle 里；同时 `ai.ts:20` 还主动打印它的前后各 5 位。**处置顺序：先轮换，再改架构，最后清历史**，顺序错了等于没做。
2. **A-02 没有代理层**：这是 A-01 的根因，也是"AI 能力能否算工程能力"的分水岭。当前 732 行服务端只服务 auth，而 `config.mjs:9` 已经预留了 `DOBAO_API_KEY` 却没接路由——说明做过一半设计但没落地。补一个代理路由的成本很低（可复用现有 express-rate-limit/helmet/pino），收益是同时解决密钥、限流、审计、换模型、CORS 五个问题。
3. **A-03 跨用户隐私**：`GlobalAIAssistant:28` 直接 `localStorage.getItem("rf_ai_chat_messages")` 恢复消息，`:89` 无条件写回，全程没有 userId 参与。共享电脑场景下前一个用户的阅读对话/书摘会展示给下一个用户；这不是理论风险，是打开页面就能复现的缺陷。

## 三、重构建议

### 3.1 目标架构

```text
┌──────────── Browser（React）────────────┐        ┌───────────── 自有服务端（Express / Vercel Function）─────────────┐
│ pages / components                      │        │  POST /api/v1/ai/chat        （SSE 真流式）                      │
│   └─ src/services/aiClient.ts ──────────┼───────►│  POST /api/v1/ai/analyze     （JSON 结构化输出）                  │
│         · fetch 同源接口                │        │  POST /api/v1/ai/search      （检索 + 可选 rerank）               │
│         · SSE 增量渲染                  │        │  POST /api/v1/ai/translate                                        │
│         · AbortController 取消          │        │                                                                  │
│         · 失败重试（仅可恢复错误）       │        │  中间件：requireAuth → 配额(per-user/day) → 结果缓存 → 审计日志   │
└─────────────────────────────────────────┘        │            │                                                     │
                                                    │            └─ ArkAdapter（DOBAO_API_KEY 仅存服务端 env）             │
                                                    │               · system + messages + JSON schema + 超时/重试        │
                                                    │               · 限流/成本统计/内容安全后置检查                      │
                                                    └──────────────────────────────────────────────────────────────────┘
数据层：aiThreads / aiMessages / aiAnalysisRecords 拆到 IndexedDB（本地）+ 可选 Supabase 表（跨端），按 user_id + thread_id 建索引
```

### 3.2 接口与 Prompt 契约（可直接抄进重构）

- **`POST /api/v1/ai/analyze`** 入参 `{ bookId, chapterId, text, segmentType }`，出参固定：

```json
{
  "textInterpretation": "……",
  "writingHighlights": "……",
  "deepMeaning": "……",
  "backgroundInfo": "……",
  "model": "ep-xxx",
  "latencyMs": 1234
}
```

- **Prompt 结构**：system（角色 + 四段定义 + 只输出 JSON + 禁止编造）+ user（书名/作者/章节 + 文本 + 输出 schema 示例）；服务端做 `JSON.parse` + zod 校验，失败重试一次后降级为纯文本摘要（明确标注"降级"）。
- **聊天**：`messages: [{role, content}]` 原样传递，system 中注入当前书籍摘要 + 候选书单（从本地书库检索 top-3，作为可展示的证据）+ 安全守则；流式用 SSE `data: {delta}`，前端 `requestAnimationFrame` 批量渲染。
- **缓存**：`cacheKey = sha256(bookId + chapterId + textHash + promptVersion)`，命中直接返回，并带 `cached: true`；同页二次打开 0 网络请求。
- **配额**：服务端 per-user 每日调用数 + token 上限（可用内存/DB 计数，不必上 Redis）。
- **安全**：Key 只存服务端；日志只记录 `requestId/model/tokens/latency/status`，不落 prompt 原文；AI 输出过统一 output guard（复用 bannedKeywords，但词表落服务端）。

### 3.3 分阶段落地与验收标准

| 阶段 | 工作量 | 动作 | 验收标准（可执行验证） |
|---|---|---|---|
| **P0 安全止血** | 0.5-1 天 | 轮换 Key；新增 `/api/v1/ai/*` 代理（复用 auth server 中间件）；删 `ai.ts:20-21,47,62,104-120,137,152,172` 日志；加 `AbortSignal.timeout`；前端改为同源调用 | `grep <旧Key> dist/ -r` 无结果；Node 服务端 env 有 Key；浏览器 DevTools 无第三方 AI 请求；4xx 时 15 秒内出现可重试提示；服务端对该路由有 429 |
| **P1 真流式 + 上下文 + 结构化** | 1-2 天 | SSE 流式；messages 数组 + system + 书籍上下文；赏析 JSON 输出 + zod + 失败重试；前端批量渲染 + 停止按钮 | 首 token P95 < 2s；JSON 解析成功率 ≥ 99%（黄金集 30 条）；聊天能正确回答"我正在读的这本书讲了什么"（上下文生效）；同一章节二次打开 0 次网络请求 |
| **P2 推荐真实化** | 1-2 天 | 用已有 `interactions/shelves/readingHistory` 做 item-based CF + content-based 兜底；推荐理由由规则+模板生成（诚实标注"基于你读过的 X"）；热门榜保留为冷启动 | 离线评测：对 8 个种子用户留一法，nDCG@10 高于热度基线 ≥ 15%；接口返回 `reason` 字段且每条可解释；前端"猜你喜欢"与热门榜数据源不同 |
| **P3 假功能清理/对齐** | 0.5 天 | 删 `doubao.ts`、`ai.ts:534-831` 死代码、假延迟、随机洗牌；查词接 LLM/词典或删入口；翻译按语言展示并标注来源；文档改为"已实现/规划中"两栏 | 全仓库无 `aiWordExplain` 演示文案；文档能力清单与 grep 结果一一对应；无 `navigate(0)` |
| **P4 数据层与测试** | 1 天 | AI 记录迁 IndexedDB/Supabase 分表 + 分页 + userId 索引；统一 auth 用户身份；补单测与黄金集 | 切换账号后聊天记录不串；AI 历史页能列出当前用户线程；单测 ≥ 6 个全绿；localStorage 超限有显式提示 |

### 3.4 假功能"最小真实化"对照

| 假功能 | 当前实现 | 最小真实化方案 | 成本 |
|---|---|---|---|
| 个性化推荐 | 热度排序 | 已有本地行为数据 → item-based CF（余弦相似度）+ 分类/难度 content-based 兜底；先用离线脚本验证再上 UI | 1-2 天，**ROI 最高** |
| AI 搜索 | includes 过滤 | 短期改名"关键词检索"并在 UI 说明；中期把书名/简介拼成 embedding 或直接让 LLM 从候选 20 本里挑并给理由（成本低、可解释） | 0.5-1 天 |
| 查词 | 本地模板 | 服务端 `/api/ai/word`：prompt 返回 JSON（音标/词性/释义/例句），加内存缓存；或接开源词典 API | 0.5 天 |
| 文白翻译 | 4 条硬编码 | 服务端 LLM prompt："把下文转为白话/文言，保留原意，只输出译文"；失败明确提示 | 0.5 天 |
| AI 笔记生成 | 手动搬运 | ReaderPage 抽屉加"生成笔记草稿"按钮：把四段结果按模板组装并调用 `addOrUpdateNote` 直接落草稿（零额外模型调用，纯产品闭环） | 0.5 天 |
| 求助帖 AI 答疑 | 无 | 若时间允许：帖子发布选"求助"标签 → 服务端异步生成一条 `author=AI助手` 的评论（要限流与免责声明）；否则从文档删除 | 1 天 / 0 |
| 流式输出 | 50ms 回放 | SSE 直连；前端增量渲染 | 0.5-1 天 |

### 3.5 不建议做的（避免为面试过度设计）

- 不要上向量数据库/微调：书只有 12 本、用户是种子数据，本地余弦相似度 + 规则足够，复杂架构反而讲不清。
- 不要保留"伪流式/假延迟/随机洗牌"这类表演型代码——面试官看代码时是减分项。
- 不要为了"AI 笔记生成"再调一次模型：已有四段结构，直接组装即可。
- 不要把 AI 记录塞进 localStorage 大 blob：拆 IndexedDB 的收益（性能/可靠/可讲）远大于成本。


## 四、面试可讲点

### 4.1 能站住的真实亮点

| # | 亮点 | 证据链 | 怎么讲（建议话术方向） |
|---|---|---|---|
| 1 | **AI 输出的产品化闭环**：模型输出 → 四段结构化类型 → 抽屉渲染 → 记录持久化 → 记录页管理 → 一键转笔记草稿 → 打 tag 进社区 | `models.ts:202-217`（AITextAnalysis/AIAnalysisRecord）；`ReaderPage:122-155`（调用+落库）；`ReaderPage:690-750`（四段渲染）；`AIAnalysisRecordsPage:9-21,48-56`（格式化展示）；`AIAnalysisRecordsPage:93`（转笔记）；`ReaderPage:657`（AI赏析 tag） | "我不是做了个聊天框，而是把模型输出接进读、记、存、分享的业务链路"——这是大多数学生 AI demo 缺的一层 |
| 2 | **前端交互工程量**：选区菜单坐标定位 + clamp、可拖拽悬浮助手（鼠标/触摸双支持）、TTS 封装（voices 异步加载、lang 精确/前缀匹配、onend/onerror 回调）、三态 UI（loading/成功/失败） | `ReaderPage:189-204`；`GlobalAIAssistant:92-142`；`ai.ts:413-472`；`ReaderPage:581-593` | "AI 功能的体验细节我都自己做完了，包括 Web Speech API 的 voices 异步坑" |
| 3 | **领域数据模型意识**：AIChatThread/AIChatMessage（含 payload 扩展点）、AITextAnalysis、AIAnalysisRecord，讨论/笔记记录与普通内容模型分开建模 | `models.ts:182-217`；`db.ts:1720-1795` | "我把 AI 会话当一等数据实体设计，而不是把字符串塞进 state" |
| 4 | **鲁棒性意识的雏形**：重试 + 指数退避 + 降级文案 + 独立 loading 态 + 失败 toast | `ai.ts:17-90`；`GlobalAIAssistant:213-219` | 必须配一句反思："当时重试策略不成熟（4xx 也重试、没有超时），重构时改成只重试可恢复错误 + AbortSignal.timeout"——讲问题比讲功能可信 |
| 5 | **内容治理意识**：敏感词可配置 + 管理后台 + 发布前拦截 | `AdminPage:62-90`；`keywordFilter.ts:3-9`；`NoteEditorPage:394`、`PostDetailPage:256`、`NewPostPage:166` | "我做了 UGC 关键词审核"是真话，但必须补"AI 输出目前没接审核，这是重构项" |

**最值得讲的一个亮点（我的选择）**：第 1 条 + 第 3 条组合——**"AI 能力的产品化 + 数据建模"**。因为它有完整证据链（模型→类型→渲染→落库→记录页→转笔记→社区 tag）、可现场演示、且不依赖"AI 多聪明"这种不可控叙事。相比之下"我调用了豆包 API"是最不值钱的一句话。

### 4.2 一问就穿帮的过度包装

| 文档/简历里的说法 | 代码现实 | 被追问时的后果 | 建议 |
|---|---|---|---|
| "个性化推荐 / 协同过滤算法"（`项目文档.md:449-457`） | 静态 `recommendedHeat` 排序（`HomePage:38`、`CategoriesPage:57`、`SearchPage:32`）；无任何相似度代码 | 面试官让画推荐数据流/问相似度公式，立刻穿帮 | 要么按 3.3-P2 真做（数据已具备），要么从简历删除 |
| "流式输出 / 实时响应" | 非流式取全文 + 50ms/字符回放（`ai.ts:176-193`） | 问"用的 SSE 还是 WebSocket？首 token 延迟多少？"无法回答，代码一看就露 | 改成真 SSE（0.5-1 天）后再讲 |
| "AI 翻译"（`项目文档.md:439-447`） | MyMemory 免费 API + 4 条硬编码文白（`ai.ts:355-394`）；中文书恒等翻译还标"英译中" | 让现场翻译一句文言文即穿帮 | 文白走 LLM，其余标注"机器翻译" |
| "AI 笔记生成"（`项目文档.md:303`） | 模型产出后用户手动复制进编辑器（`AIAnalysisRecordsPage:93`、`ReaderPage:744`） | 演示"一键生成"时只能展示跳转 | 加一个组装按钮即可变真（0.5 天） |
| "求助帖 AI 自动回复 / AI 实时答疑"（`项目文档.md:131,459-467`） | 社区侧零 AI 调用（`PostDetailPage` 只有敏感词） | 面试官问"哪个文件实现"即穿帮 | 从简历删除，或按 3.4 实现最小版 |
| "通过缓存优化 AI 响应"（`项目文档.md:646`） | 全仓库无缓存；每次赏析都重新调用（`ReaderPage:122-137`） | 问"缓存 key 是什么？命中率多少？"无法回答 | 重构时实现并按 3.3 验收 |
| "AI 功能测试通过、响应及时"（`项目文档.md:507,531`） | 无测试文件、无超时、无评测 | 要测试用例/评测报告时拿不出 | 补 6 个单测 + 30 条黄金集后再写 |
| "Key 走环境变量管理"（`项目文档.md:576`） | 在用 Key 硬编码（`ai.ts:7,99`），env 版在死代码里（`doubao.ts:4`） | **看一眼仓库即穿帮，且是安全问题** | 轮换 + 服务端 env（A-01/A-02） |

### 4.3 用最小改动把"假 AI"变成真能力（按 ROI 排序）

| 顺序 | 动作 | 工作量 | 从"假"变"真"的点 | 面试收益 |
|---|---|---|---|---|
| 1 | **安全闭环**：轮换 Key → 服务端代理 → 删日志 → 超时/限流 | 0.5-1 天 | 不再是"裸调 Key 的 demo" | 高分：能讲"我识别并修复了项目里最危险的问题"，体现工程判断 |
| 2 | **真流式 + 上下文注入 + JSON 输出解析** | 1-2 天 | 流式/上下文/结构化输出三件套全是真 | 高分：可讲 LLM 应用工程的三个核心点 |
| 3 | **推荐真实化**：item-based CF + content-based 兜底 + 离线评测 | 1-2 天 | 从"热度排序"到"真个性化" | 最高分：唯一能把"AI 推荐"讲成算法能力的点，数据已存在（`db.ts:48-53`） |
| 4 | **删假功能/假延迟 + 文档对齐** | 0.5 天 | 不再有"演示型代码" | 中高分：诚实 + 代码干净；避免负面追问 |
| 5 | **AI 记录迁 IndexedDB/Supabase + 修复身份错位** | 0.5-1 天 | AI 历史/记录真可用、可跨端 | 中：数据建模与持久化能力 |
| 6 | **单测 + 黄金集 + README** | 0.5 天 | 有质量证据 | 中：可讲"怎么验证 AI 质量"，多数学生答不上 |

合计约 5-7 个工作日。做完后可以把叙事从"我做了个带 AI 的阅读社区"升级为"我发现并治理了 AI 原型的四类问题：安全、真实性、回复质量、数据一致性，并给出可度量方案"。

### 4.4 答辩叙事建议

- **主线**：不要按"功能列表"讲，按"问题 → 方案 → 指标"讲。开场承认这是原型：直连 API、伪流式、热榜推荐；然后给重构后的架构图（3.1）、验收指标（3.3）和代码点。面试官对"能识别自己项目问题"的评价远高于"功能多"。
- **准备 3 个可现场讲的代码点**（每个 60 秒，配 file:line）：
  1. **密钥治理**：`ai.ts:7` 硬编码 → 服务端 `/api/v1/ai/*` 代理 + per-user 配额 + 删除 `ai.ts:20` 的 Key 日志。
  2. **结构化输出**：`ai.ts:247-268` 正则 split 解析 → JSON schema + zod + 失败重试/降级，附带"解析成功率 99%"的黄金集结果。
  3. **伪流式**：`ai.ts:176-193` 50ms 回放 → SSE 真流式 + 首 token 指标 + 停止按钮。
- **不要说的三句话**："用了协同过滤"、"实现了流式输出"、"做了 AI 笔记生成"——目前都不成立；改说"设计并落地中"或干脆等做完再说。
- **加分项**：把 4.1 的"AI 输出产品化闭环"画成一张图（模型输出→结构化→落库→记录页→转笔记→社区 tag），这张图比任何功能列表都有说服力。

