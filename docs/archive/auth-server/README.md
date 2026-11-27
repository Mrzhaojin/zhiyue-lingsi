# 已归档：自研认证服务端（2026-04 版本）

这里保存的是重构前那套 **Express 5 + JWT + bcrypt + Postgres** 认证服务，
以及配套的 SQL schema、RLS、种子脚本和前端 `AuthApi` 客户端。

## 为什么归档

- 前端从未调用过它：`/api/v1/auth` 在 `src/` 里只出现在 `authApi.ts` 自身，`AuthApi` 类从未被实例化。
- 它与 Supabase Auth 并存，形成两套 token 模型、三套用户身份，是维护与答辩时最大的减分项。
- 它本身也没有被端到端跑通过：`/stepup` 使用了未定义的 `jwt`（见 `server/src/index.mjs`），
  而封禁/解封又强制要求 step-up，链路必然失败。

## 这套设计里值得保留的经验

- refresh token 只存 sha256，不存明文；
- 刷新时在事务内吊销旧 jti 并写入新记录；
- access token 黑名单（按 jti）实现即时登出；
- 每个请求都从数据库重新读取角色/权限，不信任 token 里的声明；
- 敏感操作要求 step-up 二次验证；
- bcrypt cost=12。

如果未来确实需要自建认证，这些点可以直接复用；当前阶段统一使用 Supabase Auth，
决策与取舍见 [`../../adr/0001-remove-custom-auth-server.md`](../../adr/0001-remove-custom-auth-server.md)。

## 注意

归档代码**不参与构建，也不要直接运行**：依赖不在根 `package.json`，且存在上述已知 bug。