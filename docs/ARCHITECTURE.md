# 架构说明（重构进行中）

> 本文描述**目标架构**与**当前进度**。M0 已完成，M1 起逐步替换。
> 决策理由见 `docs/adr/`，重构前的问题清单见 `analysis/00-总体分析报告.md`。

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

## 5. 数据层

**当前（M0）**：仍是 `localStorage['read_forum_db_v5']` 单 JSON，但已经补上：
写入配额捕获与用户可见提示、导出/导入备份、缺失当前用户时不再整库覆盖、身份绑定。

**目标（M1）**：

```text
Repository 接口
  ├─ LocalAdapter（Dexie）
  │    users / posts / comments / notes / interactions / shelves / …
  │    images 表存 Blob；记录只存 imageId
  │    事务保证「计数 + 记录」一致
  └─ 迁移器：旧 JSON → zod 校验 → 逐表写入 → 条数校验 → 保留只读备份
```

硬性规则：

1. 页面不 import 存储实现，只消费 hooks；
2. 计数由数据派生或事务维护，不手工 ±1；
3. 图片压缩后存 Blob/对象存储，数据库只存引用；
4. 删除一律软删 + 级联清理；
5. 迁移失败不写回、不删旧数据。

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

M1 起补：Vitest（Repository 契约、迁移器）+ Playwright（登录、发帖评论、阅读赏析）+ CI。

## 8. 进度

| 阶段 | 状态 | 关键产出 |
|---|---|---|
| M0 止血 | ✅ | 密钥清理、运行时模式、身份绑定、配额处理、备份、认证瘦身 |
| M1 数据层 | 进行中 | Repository / IndexedDB / 迁移器 / hooks |
| M2 身份与权限 | 计划 | profiles、RLS、角色来源 |
| M3 AI | 计划 | BFF、SSE、结构化输出、评测集 |
| M4 体验 | 计划 | 懒加载、设计系统、a11y、性能 |
| M5 交付 | 计划 | CI、文档、演示脚本 |