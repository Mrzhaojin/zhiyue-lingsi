# ADR-0001：移除自研认证服务端，统一认证入口

- 状态：已采纳（M0 执行）
- 日期：2026-11-27

## 背景

仓库里同时存在三套身份与两套认证实现：

1. Supabase Auth（前端唯一活链路）；
2. `src/modules/auth/server` 自研 Express + JWT + bcrypt 服务端（约 1900 行，前端 0 调用）；
3. 应用本地数据层的 `db.currentUserId`（种子用户，与登录身份无关）。

自研服务端的设计并不差（refresh 只存 sha256、事务内轮换、jti 黑名单、每请求读 RBAC、step-up），
但它从未被端到端跑通：`/stepup` 引用了未定义的 `jwt`，而封禁/解封又强制要求 step-up。
同时它还带着一整套未执行的 RLS 与硬编码默认 JWT 密钥。

对使用者来说，最直接的问题是：**登录了，但内容不属于你**。

## 决策

1. 归档 `src/modules/auth/server`、`src/modules/auth/db`、`authApi.ts`、`tokenStorage.ts` 到
   `docs/archive/auth-server/`，不参与构建；
2. 认证收敛为「一个 Provider + 两个后端」：
   - `localAuth`：无配置时的本地 persona（默认，保证开箱即用）；
   - `cloudAuth`：Supabase Auth（PKCE）；
3. 登录成功后由 `syncIdentity()` 把 `auth.uid` 写为数据层当前用户，统一身份。

## 后果

- 删除约 2000 行死代码，README 与架构不再需要解释「为什么有两套认证」。
- 失去自建 RBAC / step-up / 审计日志；如果未来需要，在 BFF 中按同一套设计重做，
  而不是与 Supabase 并存。
- 本地演示模式没有密码校验：这是刻意的（它不是安全边界），UI 已明确提示。
- 归档代码保留其设计价值，面试时可以讲「设计 + 复盘」，但不能声称已上线。

## 备选方案

- **修复自研服务端并接回来**：需要修 step-up、部署数据库、重做前端 AuthApi、处理两条会话链路，
  工期 2–3 周且没有产品收益，放弃。
- **保留两套、按环境切换**：会让「配置错误」变成「登录到错的地方」，放弃。