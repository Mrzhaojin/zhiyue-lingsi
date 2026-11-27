# 工程规范（Engineering Handbook）

> 这个文件定义「怎样改这个仓库才算合格」。目标只有一个：**半年后还能安全地改**。
> 面试叙事、演示效果都不在这里立项；它们是结果，不是标准。

## 1. 分层与依赖方向

```text
app/          路由、Provider、错误边界、布局壳        ← 可以依赖 pages/features
pages/        页面组合：只取数、调 service、渲染        ← 可以依赖 data 门面、ui、components
components/   跨页面组件（纯展示优先）                 ← 不允许依赖 data 存储实现
data/         领域模型、数据访问、迁移、订阅             ← 不允许依赖 React / 页面
modules/auth/ 认证 UI + 后端适配                        ← 可以依赖 data（身份绑定）与 lib
lib/          无业务的基础设施（storage/logger/runtime）  ← 不允许依赖 data / pages
```

硬性规则（ESLint 已强制）：

1. `src/pages`、`src/components`、`src/app` **禁止** import `data/db/store|persist|bootstrap`；
2. 表现层 **禁止** 直接使用 `localStorage` / `sessionStorage`，统一走 `lib/storage`；
3. `src/data`、`src/modules/auth` **禁止** `console.*`，统一走 `lib/logger`；
4. 数据写入必须经过 `mutate(db, ctx)`，禁止只改内存不登记持久化操作；
5. 页面不得新增对 `getDbSnapshot()` 的整库遍历；新代码优先用查询函数。

## 2. 数据层约定

### 写入

- 一次业务操作 = 一次 `mutate`，并在同一个回调里完成所有相关实体变更（计数、级联）。
- 每条变更都要 `ctx.put` / `ctx.del` / `ctx.meta`，否则不会被持久化。
- 计数字段（likes/comments/views/postsCount…）只能随记录在同一处更新，禁止在 UI 里 ±1。
- 删除必须级联：帖子 → 评论 / 互动 / 后台引用 / 作者计数；笔记 → 互动 / 作者计数。

### 迁移

- 表结构变更必须：`SCHEMA_VERSION` +1 → 写一个纯函数迁移 → 加迁移测试 → 保留旧数据备份。
- 迁移失败时**不写回、不删除**旧数据，并在 UI 给出可恢复提示。
- 导入/迁移的数据必须校验条数；关键字段缺失要报错，而不是静默补默认值。

### 订阅

- 读：内存快照（同步，O(1)）。
- 写：bump 版本 → 订阅者重渲染 → 异步落盘 → BroadcastChannel 通知其他标签页。
- 页面里被 `useMemo` 缓存的数据，必须显式依赖 `useDatabaseVersion()`，否则会读到旧值。

## 3. 错误处理

- 边界层（页面/service）抛 `Error` 或返回错误，不吞异常；UI 必须给出可操作提示。
- 基础设施层（storage/data adapter）捕获底层异常，转成统一事件或错误对象。
- 渲染期异常由 `app/ErrorBoundary` 兜底，错误写日志，页面提供刷新/复制详情。
- 日志：`createLogger(scope)`；生产只保留 warn/error；未来接 sink 上报，不改业务代码。

## 4. 测试策略

| 层级 | 工具 | 要求 |
|---|---|---|
| 纯函数/规则 | Vitest | 新增规则必须有用例 |
| 数据层 | Vitest + fake-indexeddb | 每个 repository/service 方法至少 1 条契约测试 |
| 迁移 | Vitest | 每个 schema 版本一条：旧数据 → 新结构，校验条数与字段 |
| 关键链路 | Playwright（待补） | 登录、发帖、点赞、刷新后仍在 |

当前：13 个用例（认证 5 + 数据层 8）。覆盖率目标：data 层 ≥ 80%。

## 5. 提交与评审

- 提交信息：`type(scope): 一句话`，body 写动机与影响；一个提交只做一件事。
- 合并前必须 `npm run verify`（typecheck + lint + test + build）全绿。
- 评审清单：
  1. 是否新增了直接依赖存储实现的页面代码？
  2. 写入是否登记了持久化操作？计数是否可能漂移？
  3. 新查询是否退化成整表扫描？数据量上来会怎样？
  4. 失败路径是否有用户可见的提示？
  5. 是否补了对应测试？
  6. 文档/ADR 是否需要更新？

## 6. 已知技术债（按优先级）

| 编号 | 债务 | 影响 | 计划 |
|---|---|---|---|
| T1 | `src/data/api.ts` 750 行，按领域混合在一起 | 难定位、难测试、易冲突 | M1.5 拆成 `data/repositories/*` 接口 + `data/services/*` |
| T2 | 页面同步读快照，无分页/索引查询 | 数据量大后内存与渲染压力 | M1.5 引入查询 hooks + 分页 |
| T3 | 迁移与导入只有结构性校验，字段级校验不足 | 脏数据可能进入库 | M1.5 引入 schema 校验（zod） |
| T4 | 图片仍以 dataURL 入库 | 单条记录过大、备份膨胀 | M1.5 压缩 + Blob 表 |
| T5 | 无 E2E 与覆盖率门禁 | 回归靠手工 | M5 补 Playwright + coverage |
| T6 | 社区内容无服务端权限 | 无法多人使用 | M2 profiles/RLS |

## 7. 命名与文件

- 组件 `PascalCase.tsx`；hooks `useXxx.ts`；纯函数 `camelCase.ts`。
- 一个文件一个主要导出；单文件超过 300 行要考虑拆分（例外：种子数据）。
- 类型放 `data/models.ts` 或同模块 `types.ts`，不要从实现文件里“顺手”导出类型。

## 8. Definition of Done

一个改动完成，需要同时满足：

1. 功能可用，失败路径有提示；
2. `npm run verify` 全绿；
3. 新增逻辑有测试；数据变更覆盖迁移/级联；
4. 不新增分层违规（ESLint 会拦）；
5. 相关文档（README / ARCHITECTURE / ADR / ENGINEERING）同步。