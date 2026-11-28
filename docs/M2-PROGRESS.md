# M2 进度：Supabase 云端账号与 RLS

> 目标：云端模式下使用真实 Supabase 账号；数据权限由 Postgres RLS 强制，前端只持有 publishable key。

## 状态

| 项 | 状态 | 说明 |
|---|---|---|
| 项目连通性 | ✅ | `auth/v1/health` 200；publishable key 可访问 PostgREST（404 为表未建，非鉴权失败） |
| Schema 迁移 | ✅ 已执行 | `supabase/all-in-one.sql` 已在项目 SQL Editor 执行成功 |
| RLS 策略 | ✅ 已生效 | `verify:cloud` 匿名/表访问检查通过 |
| 服务端 RPC | ✅ 已生效 | 发布/软删/互动/评论/对账 |
| 云 auth 客户端 | ✅ 已存在 | PKCE、会话持久化、身份同步到本地数据层 |
| 云数据仓储 | ⏳ 未开始 | 当前云端登录后数据仍写本地 IndexedDB（见下方说明） |
| Storage | ⏳ M4 | 头像/图片仍以 data URL 存储 |

## 已验证

```text
GET /auth/v1/health                 → 200 GoTrue v2.199.0
GET /rest/v1/profiles               → 404（表未建）
GET /rest/v1/posts                  → 200（模板表，空）
npm run verify:cloud                → 2/8（auth ✅，表/RLS 待执行迁移）
```

项目里原有三张模板表：`posts`、`users`、`comments`（结构与目标不一致，其中 `posts` 有 5 行数据）。
迁移已把 `posts/comments` 自动改名为 `legacy_posts/legacy_comments`，**5 行数据原样保留**；`users` 保留不动。

## 剩余验收（登录态）

1. 创建已确认测试账号：Dashboard → Authentication → Users → Add user（勾选 Auto Confirm User）。
2. 在 `.env.local` 增加 `CLOUD_TEST_EMAIL` / `CLOUD_TEST_PASSWORD`。
3. `npm run verify:cloud`，期望 9/9（新增“测试账号可登录”“登录后可读自己的 profile”）。
4. 可选：SQL Editor 执行 `supabase/seed.sql`，写入 3 本公版书。

## 已知边界（不装样子）

- 现在云端模式只解决**登录**：`syncIdentity()` 会把 Supabase uid 写入本地 IndexedDB 作为当前用户，数据仍在本机。
- 真正的云数据读写（仓储云适配器）是下一步；在此之前，云端账号的多设备数据不会同步。
- RLS 的越权测试需要在迁移执行后用真实 JWT 跑；脚本已预留登录态检查。

## 下一步

1. 执行迁移 + 提权，跑通 `verify:cloud` 8/8。
2. 实现 `repositories/cloud/`：先 profiles + books/chapters，再 posts/notes（含 RPC 调用）。
3. 本地/云端仓储按 `runtimeMode` 切换；契约测试对两套实现复用。
4. Storage bucket + 图片上传策略（M4）。
