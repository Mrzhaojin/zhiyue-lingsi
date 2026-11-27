# 智阅灵思（Zhiyue Lingsi）

一个**离线优先**的阅读工作台：阅读器、读书笔记、社区讨论，以及一个基于书库上下文的 AI 阅读助手。

> 这个仓库正在从「前端演示」重构为**可长期维护的应用**：分层边界、数据迁移、错误处理、测试与 CI。
> 工程约定见 [`docs/ENGINEERING.md`](docs/ENGINEERING.md)，架构见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，决策见 [`docs/adr/`](docs/adr/)。

## 快速开始

```bash
npm install
npm run dev
```

打开终端里提示的地址即可。**不需要任何配置**：默认会进入「本地演示模式」，
输入任意邮箱 + 至少 6 位密码就能使用，数据只保存在当前浏览器。

```bash
npm run verify      # 一键跑完：typecheck + lint + test + build
npm run typecheck   # tsc -b，类型检查
npm run lint        # ESLint（含分层边界规则）
npm test            # Vitest（数据层 + 认证）
npm run build       # 生产构建
```

CI 在每次 push / PR 时执行同一套门禁，并附带 gitleaks 密钥扫描。

## 两种运行时模式

| 模式 | 触发条件 | 账号 | 数据 |
|---|---|---|---|
| 本地演示（默认） | 未配置 Supabase，或 `VITE_LOCAL_MODE=true` | 本机 persona，不校验密码 | 浏览器 IndexedDB（`zhiyue-lingsi`） |
| 云端 | 配置了 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Supabase Auth，支持找回密码 | 目前仍是本地，云端同步在 M2 |

环境变量见 [`.env.example`](.env.example)。**任何模型密钥都不会出现在前端**：
AI 调用统一走服务端代理，见 [ADR-0003](docs/adr/0003-ai-bff-proxy.md)。

## 功能

- 阅读：书库、分类、阅读器（字号/行高/背景、选区菜单、朗读、生词本）
- 笔记：富文本编辑、模板、分享卡片、发布到社区
- 社区：发帖、楼中楼评论、点赞/收藏、话题
- AI：段落赏析、句子赏析、悬浮阅读助手（M3 起为真流式 + 书库上下文）
- 个人中心：资料、阅读历史、收藏、消息、学习记录、AI 记录
- 设置：主题、通知、**数据导出/导入备份**

## 目录结构

```text
src/
  app/            # 主题、布局壳（Web/Mobile）
  pages/          # 页面（目标：只做组合，不直接读存储）
  components/     # 跨页面组件
  modules/auth/   # 认证：client（UI + 两种后端）/ 已删除的服务端见 docs/archive
  data/           # 领域模型 + IndexedDB 数据层（schema / 持久化 / 迁移 / 订阅）
  services/       # AI 传输层（M3 接 BFF 代理）
  lib/            # 运行时配置、存储封装、安全工具
docs/
  adr/            # 架构决策记录
  archive/        # 已下线的实现（自研认证服务端）
analysis/         # 重构前的尽调报告（历史资料）
```

## 工程约定

- 分层与依赖方向：见 [`docs/ENGINEERING.md`](docs/ENGINEERING.md)（ESLint 强制：页面不得依赖存储实现、禁止裸用 localStorage、数据层禁止 console）。
- 数据写入必须经过 `mutate(db, ctx)` 并登记实体级操作，禁止只改内存不落盘。
- 表结构变更必须带版本号、迁移函数与迁移测试，失败不写回。
- 渲染异常由全局 `ErrorBoundary` 兜底；日志统一走 `lib/logger`。

## 已知限制（诚实清单）

- 数据已从 localStorage 单 JSON 迁移到 IndexedDB（实体分表、精确写入、可备份），但**仍只在本机**：跨设备同步要等 M2。
- 图片目前仍以 dataURL 存在数据库里（IndexedDB 配额远大于 localStorage）；压缩 + Blob 存储在 M1.5/M4。
- 社区没有服务端：不存在多人实时协作，也没有真正的权限系统。
- AI 功能在未配置代理时会明确报「AI 服务未配置」，不会用模板假装回答。
- 页面仍是同步读取内存快照（Shell 统一订阅数据版本），真正的查询 hooks 在 M1.5 逐步替换。

## 重构路线

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 安全止血、运行时模式、身份绑定、存储配额处理、备份、认证瘦身 | ✅ 本轮完成 |
| M1 | IndexedDB 分表 + 实体级写入 + 旧数据迁移 + 版本订阅 + 13 个单测 | ✅ 本轮完成 |
| M2 | 身份与权限闭环、云端 profiles/RLS | 计划 |
| M3 | AI BFF：SSE 流式、结构化输出、上下文注入、评测集 | 计划 |
| M4 | 路由懒加载、设计系统、无障碍、性能 | 计划 |
| M5 | 文档、CI、演示脚本 | 计划 |

## 许可

仅用于个人学习与作品展示。书库中的文本为演示摘录，版权归原作者所有。