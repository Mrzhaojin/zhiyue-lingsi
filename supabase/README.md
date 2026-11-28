# Supabase 云端初始化（M2）

本目录是云端模式的数据库定义与验证脚本。目标是：**浏览器只拿 publishable key，所有权限由 Postgres RLS 决定**。

## 目录

| 文件 | 作用 |
|---|---|
| `migrations/0001_schema.sql` | 表、索引、外键、updated_at 触发器、auth 用户落资料触发器 |
| `migrations/0002_rls.sql` | RLS 策略、`is_admin()` / `can_read_post()` / `owns_thread()` 辅助函数 |
| `migrations/0003_rpc.sql` | 发布、软删/恢复、互动、评论、浏览数、计数对账等服务端函数 |
| `all-in-one.sql` | 上面三个文件的合并版，供 Dashboard 一次性粘贴 |
| `../scripts/verify-cloud.mjs` | 只读验证：连通性、表是否存在、匿名 RLS、登录态 profile |
| `seed.sql` | 公版书种子（可重复执行） |

## 应用步骤

1. 打开 Supabase Dashboard → **SQL Editor**。
2. 复制 `supabase/all-in-one.sql` 全文 → Paste → **Run**。
   - 可重复执行；若检测到模板表 `posts/users/comments` 且为空，会自动改名为 `legacy_*`。
   - 非空冲突会直接报错，不会误删数据。
3. Authentication → Providers → Email：开发期可关闭 “Confirm email”，或手动确认测试账号邮件。
4. 在 `.env.local` 写入（已为本项目填好）：

   ```dotenv
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable / anon key>
   VITE_LOCAL_MODE=false
   ```

5. 注册一个账号后，把它设为管理员（在 SQL Editor 执行，auth.uid() 为空时触发器放行）：

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

6. 可选：执行 `supabase/seed.sql`，写入 3 本公版书（红楼梦 / The Great Gatsby / 狂人日记），用于云端演示。

7. 验证：

   ```bash
   npm run verify:cloud
   ```

   期望输出（共 8 项）：Auth 可达 ✅、6 张表 ✅、匿名看不到草稿 ✅；
   若在 `.env.local` 配置了 `CLOUD_TEST_EMAIL` / `CLOUD_TEST_PASSWORD`，还会验证登录后读取自己的 profile。

## 权限模型（RLS）

| 数据 | 匿名 | 登录用户 | 管理员 |
|---|---|---|---|
| 书籍 / 章节 / 标签 | 读 | 读 | 读 + 写 |
| 原创帖子 | 读（未软删） | 读 + 写自己的 | 读 + 写 |
| 引用型帖子 | 仅当笔记已发布 | 读 + 读自己的 | 读 + 写 |
| 笔记 | 仅已发布 | 读已发布 + 写自己的 | 读 + 写 |
| 评论 | 读（未软删） | 写自己的 | 读写 |
| 互动 | 不可读 | 只读自己的 | 同左 |
| 书架 / 书签 / 进度 / 生词 / 通知 / AI 记录 | 不可读 | 仅本人 | 同左 |
| `admin_config` | 读 | 读 | 读 + 写 |
| `profiles` | 读公开字段 | 读 + 改自己的 | 读 + 改 |

补充约束：

- `profiles.role` 与 `profiles.stats` 有触发器保护，普通用户不能自提权/改统计；
- 帖子计数（likes/collects/comments/views）只能通过 RPC 修改，客户端无法直接伪造；
- 发布笔记、取消发布、软删/恢复都走 `security definer` 函数，函数内再校验作者身份。

## RPC 清单

| 函数 | 说明 |
|---|---|
| `publish_note(note_id)` | 幂等创建/恢复引用型帖子，返回 post id |
| `unpublish_note(note_id)` | 软删帖子并把笔记改回 draft |
| `soft_delete_post / restore_post` | 帖子软删/恢复，维护作者 postsCount |
| `soft_delete_note / restore_note` | 笔记软删/恢复（连带其帖子） |
| `toggle_interaction(kind, post_id)` | 点赞/收藏切换，原子更新帖子计数 |
| `increment_post_view(post_id)` | 浏览数 +1 |
| `add_comment(post_id, content, parent_id)` | 评论 + 计数 |
| `soft_delete_comment(comment_id)` | 评论软删 + 计数回退 |
| `reconcile_counters()` | 管理员对账，返回修正行数 |

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| REST 返回 404 | 表还没建 | 执行 `all-in-one.sql` |
| REST 返回 401 | key 不对 / 请求头缺 `apikey` | 检查 `.env.local`，请求头同时带 `apikey` 与 `Authorization: Bearer <key>` |
| 注册后没有会话 | 开启了邮箱确认 | 关闭 Confirm email，或先确认邮件 |
| 提示 role/stats 不能改 | 触发器保护 | 管理员初始化请用 SQL Editor（auth.uid() 为空） |

## 安全红线

- `service_role` / 数据库密码**永远不进前端、不进仓库**；
- publishable / anon key 是公开的，泄露不致命，真正的边界是 RLS；
- 文件上传（头像、帖子图片）需要 Storage bucket + policy，属于 M4，不在本迁移内。
