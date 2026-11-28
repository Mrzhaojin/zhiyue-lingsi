# M2 进度：Supabase 云端账号与 RLS

> 目标：云端模式下使用真实 Supabase 账号；数据权限由 Postgres RLS 强制，前端只持有 publishable key。

## 状态

| 项 | 状态 | 说明 |
|---|---|---|
| 项目连通性 | ✅ | `auth/v1/health` 200；publishable key 可访问 PostgREST（404 为表未建，非鉴权失败） |
| Schema 迁移 | ✅ 已交付，⏳ 待执行 | `supabase/all-in-one.sql`（789 行） |
| RLS 策略 | ✅ 已交付，⏳ 待执行 | 见 `supabase/README.md` 权限矩阵 |
| 服务端 RPC | ✅ 已交付，⏳ 待执行 | 发布/软删/互动/评论/对账 |
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

检测到项目里已有三张同名模板表：`posts(id,title,created_at)`、`users(id,username,email)`、`comments(id,post_id,content)`，均为空。
迁移会先把它们改名为 `legacy_*` 再建目标表；若某张非空则报错，要求人工处理。

## 待执行（需要项目 owner 操作）

1. Dashboard → SQL Editor → 粘贴 `supabase/all-in-one.sql` → Run。
2. Authentication → Email：开发期关闭 Confirm email，或确认测试账号。
3. 注册账号 → SQL Editor 提权：

   ```sql
   update public.profiles set role='admin'
   where id=(select id from auth.users where email='you@example.com');
   ```

4. `npm run verify:cloud`，期望 8/8（含登录态检查需配置 `CLOUD_TEST_EMAIL/PASSWORD`）。

## 已知边界（不装样子）

- 现在云端模式只解决**登录**：`syncIdentity()` 会把 Supabase uid 写入本地 IndexedDB 作为当前用户，数据仍在本机。
- 真正的云数据读写（仓储云适配器）是下一步；在此之前，云端账号的多设备数据不会同步。
- RLS 的越权测试需要在迁移执行后用真实 JWT 跑；脚本已预留登录态检查。

## 下一步

1. 执行迁移 + 提权，跑通 `verify:cloud` 8/8。
2. 实现 `repositories/cloud/`：先 profiles + books/chapters，再 posts/notes（含 RPC 调用）。
3. 本地/云端仓储按 `runtimeMode` 切换；契约测试对两套实现复用。
4. Storage bucket + 图片上传策略（M4）。
