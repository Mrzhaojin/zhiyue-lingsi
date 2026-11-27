# 架构说明（重构进行中）

> 本文描述**目标架构**与**当前进度**。M0/M1 已完成，M1.5 按设计实施。
> 流程文档：[需求](../requirements/REQUIREMENTS.md) → [领域模型](../modeling/DOMAIN-MODEL.md) → [设计](../design/)；决策见 [`docs/adr/`](../adr/)，重构前问题清单见 `analysis/00-总体分析报告.md`。

## 1. 定位

**离线优先的 AI 阅读工作台**：数据先落本地、可迁移、可备份；AI 助手基于书库与笔记上下文回答，
而不是一个只会调 API 的聊天框。不承诺多人并发与实时协作——那需要服务端业务数据，属于错误的叙事。

## 2. 分层

```text
┌───────────────────────── 浏览器 ─────────────────────────┐
│ app/           路由、布局壳、Provider 组合                 │
│ features/      按领域组织：reader / forum / notes / ai     │
│   *.page.tsx   只做组合，不直接访问存储                    │
│   use*.ts      查询与变更（M1 起：订阅式 hook）            │
│ components/ui/ 基础组件（M4）                              │
├──────────────────────────────────────────────────────────┤
│ data/repository.ts  唯一读写口（M1）                       │
│   ├─ local/    IndexedDB（Dexie）：事务、索引、Blob        │
│   └─ remote/   Supabase：profiles/posts/…、RLS、Storage    │
├──────────────────────────────────────────────────────────┤
│ services/aiClient  同源 /api/ai/*，SSE、AbortController    │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌──────── BFF（Node / 你的服务器）────────┐
        │ /api/ai/chat    SSE 真流式               │
        │ /api/ai/responses  JSON 结构化输出       │
        │ /api/ai/translate  /api/ai/word          │
        │ 鉴权 → 配额 → 缓存 → 审计 → 内容安全      │
        │ ArkAdapter：密钥只在服务端 env            │
        └──────────────────────────────────────────┘
```

## 3. 运行时模式

`src/lib/runtimeConfig.ts` 决定一切：

- `runtimeMode = 'local'`：未配置 Supabase（默认），或 `VITE_LOCAL_MODE=true`。
  本地 persona，数据只在本机，适合离线演示与开发。
- `runtimeMode = 'cloud'`：配置了 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`。

这样「新克隆能不能跑」不再取决于面试官有没有 Supabase 账号。

## 4. 认证

```text
AuthProvider（状态机 + 身份同步）
   ├─ backends/localAuth.ts    本地 persona，账号存 localStorage
   └─ backends/cloudAuth.ts    Supabase Auth（PKCE）
```

- `AuthProvider` 不再直接 import `supabase`，只依赖 `AuthBackend` 接口；
- 登录成功后调用 `syncIdentity()`，把 `auth.uid` 写成数据层的当前用户——
  这是修复「登录是 A、内容是 B」的关键一步；
- 自研 Express/JWT 服务端已归档到 `docs/archive/auth-server/`，不再参与构建。

## 5. 数据层（M1 已实施）

```text
┌──────────── 页面（同步读取，不改签名）────────────┐
│ getDbSnapshot / listPosts / getCurrentUser …        │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────── src/data/api.ts ────────────────────────┐
│ 读：直接读内存快照（O(1)）                          │
│ 写：mutate(db, ctx) —— 改内存 + 登记实体级操作       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────── src/data/db/store.ts ───────────────────┐
│ 版本号 + 订阅（Shell 统一订阅，写后一帧内重渲染）    │
│ 写队列：按实体 put/delete，交给 Dexie 事务           │
│ BroadcastChannel：其他标签页收到变更后重新载入       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────── IndexedDB（Dexie）──────────────────────┐
│ users / books / posts / comments / notes / tags /   │
│ interactions / bookmarks / readingHistory / vocab /  │
│ notifications / shelves / aiChatThreads / aiMessages │
│ / aiAnalysisRecords / meta（16 张表，均带索引）      │
└──────────────────────────────────────────────────────┘

启动：bootstrap → 首次运行迁移旧 localStorage 或写入种子
      → 校验条数 → 载入内存快照
```

已落地的规则：

1. 写入只落「被改动的记录」，不再序列化整库；
2. 删除有级联：帖子 → 评论 / 互动 / 后台引用 / 作者计数；笔记 → 互动；
3. 迁移失败直接报错并保留旧 key，前端显示可恢复的错误页；
4. 迁移与写盘都有条数校验，单测覆盖；
5. 页面暂不改签名（M1.5 再换成查询 hooks），但 Shell 已统一订阅版本。

仍待办（M1.5 / M2）：图片压缩 + Blob 表、分页与索引查询、软删除与回收站、
真正的 Repository 接口抽象（LocalAdapter / CloudAdapter）。

## 6. AI 层

浏览器只与同源 `/api/ai/*` 通信，密钥只在服务端：

| 接口 | 入参 | 出参 |
|---|---|---|
| `POST /responses` | `{ input, system }` | `{ text }`（JSON） |
| `POST /chat` | `{ messages, system }` | `text/event-stream`，`data: {"delta":"…"}` |
| `POST /word` | `{ word }` | `{ phonetic, pos, meaning, example }` |
| `POST /translate` | `{ text, to }` | `{ text }` |

约束：服务端超时与重试策略、每用户配额、结果缓存（key 含 prompt 版本）、
审计日志只记录 requestId/model/tokens/latency/status，不落 prompt 原文。

## 7. 质量门禁

```bash
npm run typecheck   # 必须 0 error
npm run lint        # 必须 0 error
npm run build       # 产物预算：入口 gzip < 200KB（M4 目标）
```

已补：Vitest（认证 5 个 + 数据层 8 个，含旧数据迁移、级联删除、写入订阅）。
待补：Playwright 回归、CI 门禁（M5）。

## 8. 进度

| 阶段 | 状态 | 关键产出 |
|---|---|---|
| M0 止血 | ✅ | 密钥清理、运行时模式、身份绑定、配额处理、备份、认证瘦身 |
| M1 数据层 | ✅ | IndexedDB 16 表 / 实体级写入 / 迁移器 / 版本订阅 / 13 个单测 |
| M2 身份与权限 | 计划 | profiles、RLS、角色来源 |
| M3 AI | 计划 | BFF、SSE、结构化输出、评测集 |
| M4 体验 | 计划 | 懒加载、设计系统、a11y、性能 |
| M5 交付 | 计划 | CI、文档、演示脚本 |

**设计 v1.0 已完成**：物理数据模型与迁移（[DATA-MODEL](../design/DATA-MODEL.md)）、模块与接口契约（[MODULES](../design/MODULES.md)）、RAG（[RAG](../design/RAG.md)）、部署（[DEPLOYMENT](../design/DEPLOYMENT.md)）。
M1.5 按设计实施：仓储接口 → 页面 hooks → 软删/章节/来源/笔记关联 → 删除旧门面。