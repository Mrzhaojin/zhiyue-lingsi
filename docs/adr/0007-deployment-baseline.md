# ADR-0007：部署基线为腾讯云 + 宝塔 + 同域 BFF

- 状态：已采纳（设计阶段）
- 日期：2026-11-27
- 关联：需求 Q6、FR-I6~I9；设计 `docs/design/DEPLOYMENT.md`

## 背景

项目最终要部署到自有腾讯云服务器（宝塔面板）。
需要同时满足：静态站点、AI 代理（密钥不能下发）、HTTPS、备份与单人运维。

## 决策

1. 单台 CVM（2C4G，Ubuntu 22.04）+ 宝塔；
2. Nginx 同域提供静态站点与 `/api/*` 反向代理；
3. BFF 为 Node 20 进程，只监听 127.0.0.1，由 PM2/宝塔 Node 项目管理；
4. Supabase 负责 Auth/Postgres/Storage；模型与 embedding 走外部 API；
5. 按 release 目录 + `current` 软链发布，保留 3 个版本回滚；
6. 每日备份数据库与配置到 COS，保留 14 天，月度恢复演练。

## 后果

- 同域避免 CORS/Cookie 复杂度；SSE 需关闭 Nginx 缓冲；
- 密钥集中在 BFF env，前端零密钥；
- 依赖 Supabase 云服务；若后续要求数据完全自持，可迁移到同机 Postgres（DDL 已兼容）；
- 单机故障即全站不可用，需接受（50 人规模）；备份用于恢复而非高可用。

## 备选方案

- **Vercel + 独立 API**：部署简单，但数据与密钥分散，且与“自有服务器”要求冲突，放弃。
- **Docker Swarm/K8s**：对 50 用户过度设计，放弃。