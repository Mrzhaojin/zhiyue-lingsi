# 智阅灵思 · 认证与安全尽调报告

> 审计对象：`C:/Users/yzj15/Desktop/Works/YOU_NEED_NOT/Zhiyue_Lingsi`（React 19 + Vite 8 + TS）
> 审计范围：`src/modules/auth/client/**`、`src/modules/auth/server/**`、`src/modules/auth/db/**`、`src/lib/security.ts`、`src/lib/supabase.ts`、`src/services/ai.ts`、`src/services/doubao.ts`、`src/App.tsx`，以及根目录文档与仓库配置。
> 方法：只读静态审计（未修改任何源码）；结论均给 `file:line` 证据；标注【推测】的条目无法仅凭仓库验证。
> 审计时间：2026-11-26。仓库为公开 GitHub：https://github.com/Mrzhaojin/zhiyue-lingsi （13 个提交，main），本报告已结合 git 历史核查。

**一句话结论**：前端真实在跑的认证是 **Supabase Auth**；仓库里另有一整套 700+ 行的「企业级 Express + JWT 认证服务」和一套 206 行的「Bearer + HttpOnly 刷新」客户端，**二者均未被前端调用，是死代码**。与此同时存在 **公开泄露的真实方舟 API Key**、**无配置时「假登录」导致应用不可用**、**找回密码链路断裂**、**密码被 HTML 实体编码后登录失败** 等 P0 问题，以及 RLS 写了一套但从未执行、即便执行也挡不住的 P1 问题。

---

## 一、现状还原

### 1.1 真实架构：三套身份体系、两套认证实现、一条活链路

```
                             ┌─────────────────────────────────────────────┐
                             │ 浏览器（React SPA, src/App.tsx）             │
                             │                                             │
  /login /register /forgot   │  AuthProvider ── 直接调用 supabase.auth.*    │
  /password/change           │      │               （唯一活着的认证实现） │
        │                    │      └── 三态机: loading/anonymous/auth      │
        ▼                    │  RequireAuth / RequirePermission（客户端守卫）│
   Supabase JS SDK ──────────┼──► Supabase Auth（托管：密码/邮件/JWT/Session）│
        │                    │                                             │
        │ session            │  dbService.ts ── supabase.from('users'/...) │
        ▼                    │        └── anon key 直连 PostgREST            │
  localStorage               │                                             │
  ├ sb-<ref>-auth-token      │  死代码（无任何调用方）：                    │
  └ auth.accessToken         │   ├ authApi.ts（206 行，Bearer+HttpOnly 模型）│
                             │   └ tokenStorage.ts 的 willExpireSoon 等     │
                             └─────────────────────────────────────────────┘

        ✗ 无人调用（grep 全仓：/api/v1/auth 只出现在 authApi.ts 内）

  ┌──────────────────────────────────────────────────────────────────────┐
  │ 自建认证服务端 src/modules/auth/server/**（Express5 + JWT + pg）     │
  │  index.mjs 732 行：登录/刷新/登出/改密/重置/封禁/Swagger/审计         │
  │  auth.mjs：HS256 Access(2h)+Refresh(7d)、jti 黑名单、RBAC 查库       │
  │  db.mjs：Postgres 或 pg-mem；bcrypt cost=12；refresh token 存 sha256 │
  │  users/roles/permissions 表（schema.sql）+ rls.sql（从未被执行）      │
  └──────────────────────────────────────────────────────────────────────┘
        ▲ 仅文档让用户 `cd src/modules/auth/server && npm start`（项目文档.md:580-586），
          但前端没有任何一处请求它；vercel.json 只有 SPA 重写，也无法部署它。
```

**三套身份体系（互不联通）**

| # | 身份来源 | 主键 | 谁在用 | 证据 |
|---|----------|------|--------|------|
| 1 | Supabase Auth（`auth.users`） | Supabase UID | AuthProvider 真实登录态 | `AuthProvider.tsx:47-75`、`HomePage.tsx:23` |
| 2 | 自建 `public.users`（auth schema） | 自建 random uuid | 仅服务端 SQL 使用，前端从不读写（除 dbService 撞名） | `schema.sql:7-20`、`db.mjs:276-291` |
| 3 | 应用本地数据库 `db.users` + `db.currentUserId` | 本地种子 uuid | 所有业务页面（帖子/笔记/资料）都以 `currentUserId` 为准 | `db.ts:1147`、`db.ts:1267-1309` |

结论：**登录态（1）与业务数据（3）完全解耦**。`getCurrentUser()` 取的是 localStorage 种子库里的固定用户，与当前登录邮箱无关（`db.ts:1301-1308`）；退出登录也不会切换/清空业务数据。这解释了为什么「换一个账号登录」看到的仍是同一份数据——认证只是**进入应用的开关**，不是数据归属。

### 1.2 前端唯一真实登录链路（逐步骤）

```
LoginPage.onSubmit (LoginPage.tsx:142-169)
  ├─ sanitizeInput(email.trim()) / sanitizeInput(password)   ← P0：密码被 HTML 实体编码
  ├─ validateEmail / 非空校验
  └─ loginWithPassword({email,password,remember})
        └─ AuthProvider.tsx:193-217
             ├─ setState(loading)
             ├─ supabase.auth.signInWithPassword({email,password})   ← 只传 email，identifier 已废弃
             ├─ error? throw {code,message}
             └─ 成功不 setState，等 onAuthStateChange 回调
  └─ navigate(from)                                             ← 立刻跳转，可能先撞上 loading 态

经 Supabase SDK 托管：签发 access/refresh（默认存储见 supabase.ts:11-18），
SDK 自动刷新（autoRefreshToken:true），onAuthStateChange 回写 AuthProvider（:47-75）。
```

**注册**（`RegisterPage.tsx:126-154` → `AuthProvider.tsx:219-248`）：只做「用户名≥3、邮箱含 @、密码≥8、勾选协议」四项弱校验，直接 `supabase.auth.signUp`；成功后固定提示「请前往邮箱完成激活」（`RegisterPage.tsx:249`），无法区分 Supabase 项目是否开启邮箱确认。**没有确认密码输入框**（与文档 `项目文档.md:105` 不符）。

**退出**（`TopBar.tsx:9-16` → `AuthProvider.tsx:250-266`）：`supabase.auth.signOut()`，成功后依赖 `onAuthStateChange` 把状态置 anonymous，再跳登录页。

**刷新/过期**：真实刷新由 Supabase SDK 的 `autoRefreshToken` 负责；自己那套 `willExpireSoon`/`ensureFreshAccessToken` 只被死代码 `authApi.ts` 引用（`:91-98`、`tokenStorage.ts:49-51`），因此**仓库里没有可读的「刷新策略」实现**。

### 1.3 自建认证服务端：设计不差，但从未接通过

设计链路（`index.mjs`）：

```
POST /login ─┬─ Supabase 配置有效 → supabase.auth.signInWithPassword（:171-251）
             │     ├─ 成功后查自有 roles/permissions（:219）→ 自签 HS256 Access+Refresh
             │     └─ refresh 存 DB（sha256）、写 HttpOnly Cookie（:228-237）
             └─ Supabase 配置无效 → 查自有 users + bcrypt.compare（:253-338）

POST /token/refresh ── 校验 refresh cookie + DB 记录 → 事务内吊销旧 jti/插入新 token（:391-408）
POST /logout[/all] ── access jti 入黑名单 + 吊销 refresh（:419-471）
GET  /me ──────────── requireAuth：验签 → 黑名单 → 查 user → locked/banned → 查 RBAC（auth.mjs:49-98）
POST /admin/users/:id/ban ── requireAuth + requirePermission + requireStepUp（:656-705）
POST /stepup ──────── bcrypt 校验后签发 5 分钟 step-up token（:477-495）← 此处引用了未定义的 `jwt`
POST /password/forgot ─ 生成 reset token，仅 dev 打日志，不发邮件（:582-597）
```

**死代码判定（4 条硬证据）**

1. `grep -r '/api/v1/auth' src/`：除 `authApi.ts` 自身外 **0 命中**。
2. `AuthApi` 类（`authApi.ts:16-206`）**从未被实例化**，`src/modules/auth/client/index.ts:1-9` 也未导出该类。
3. `src/vite-env.d.ts:4` 声明了 `VITE_AUTH_BASE_URL`，**全仓无任何读取**（只有声明）。
4. 根 `package.json:6-12` 没有启动/构建 auth server 的脚本；`vercel.json:1` 只有 SPA 重写，没有 Serverless/后端部署配置。服务端独立 `package.json`（`src/modules/auth/server/package.json`）且依赖（express/pg/bcrypt/jwt）**不在根 node_modules**，从不参与前端构建。

顺带：该服务端自身也**没有被端到端跑通过**——`/stepup` 使用了未定义的 `jwt`（`index.mjs:486`，文件只 import 了 `createJwtService`），而 ban/unban 又强制要求 step-up，于是管理员封禁链必然失败（错误还会回显给客户端，`:491-493`）。

### 1.4 七个必答问题（结论速查）

| # | 问题 | 结论 | 关键证据 |
|---|------|------|----------|
| ① | 是否存在两套并行认证？前端实际走哪套？ | **存在两套（严格说三套身份）**。前端只走 **Supabase Auth**；自建 Express/JWT 服务端 + 客户端 `AuthApi` 全是死代码，`VITE_AUTH_BASE_URL` 死声明。没有第二套在跑。 | `AuthProvider.tsx:3,197`；`authApi.ts:16`；`vite-env.d.ts:4`；1.3 的 grep 证据 |
| ② | 令牌存哪里？XSS/CSRF 后果？刷新与过期？ | Supabase 默认把 access+refresh 存 **localStorage**（显式配置 `storage: window.localStorage`，`supabase.ts:11-18`），另有一份自有 accessToken 也写 localStorage（`tokenStorage.ts:14-15`，`App.tsx:65` 强制 persist）。**XSS ⇒ 会话（含 refresh）整体被带走、可长期接管**；CSRF 对真实链路影响小（走 Bearer header，不走 cookie），但死代码那套用 HttpOnly refresh cookie + `SameSite=Lax`，且服务端 CORS 反射任意 Origin（`index.mjs:72-77`），配置自相矛盾。刷新由 Supabase SDK 自动完成；**未显式配置 PKCE**（全仓无 `flowType`），邮件/恢复链接默认 implicit（token 在 URL fragment）【推测：依据 supabase-js 默认值】。`remember` 勾选框不生效（C01）。 | 见 B05、C01 |
| ③ | 密码哈希算法与参数？JWT 密钥来源？验证码/找回密码真发邮件吗？ | 仓库内可见的唯一哈希实现是 **bcrypt cost=12**（`index.mjs:543,607,634`；`db.mjs:156`；`seed.mjs:95`），仅自建服务端使用；线上真实哈希由 **Supabase GoTrue 托管**，仓库不可验证（【推测】其默认 bcrypt cost 10）。JWT 密钥来自 `JWT_ACCESS_SECRET/JWT_REFRESH_SECRET`，**缺省为硬编码公开字符串** `dev_access_secret_change_me` / `dev_refresh_secret_change_me`（`config.mjs:5-6`），仓库无 .env、文档未要求配置 → 实际会落到默认值。**验证码不存在**（无短信/OTP 实现；服务端 `/login/sms`、`/login/oauth/:provider` 直接 501，`index.mjs:648-654`；文档 `项目文档.md:106` 描述的验证码输入框在代码中不存在）。**找回密码**：前端调用 Supabase `resetPasswordForEmail`（`AuthProvider.tsx:285-300`）——邮件由 Supabase 真发；但重置落点路由不存在（A04），流程断。自建服务端版本**完全不发邮件**（`index.mjs:582-597`）。 | 见 A03、A04、B15 |
| ④ | 服务端 CORS/限流/输入校验/错误泄露/SQL 注入面？ | CORS `origin: true, credentials: true`（`index.mjs:72-77`）反射任意 Origin——错误配置；限流仅全局 120/min + 登录 10/min（`:82-89,159-161`），**账号维度锁定未接线**（B03），重置密码无独立限流；输入校验靠 `requireBodyFields` + 长度/`includes('@')`（`:500-506`），无 schema 校验；错误信息会把 `e.message` 回显（`:491-493,344-345,712-718`）；**SQL 注入面很低**：全部参数化查询（`db.mjs` 通篇 `$1/$2`），无字符串拼接 SQL。 | 见 B08、B03、C04 |
| ⑤ | rls.sql 真能挡越权吗？RequirePermission 是不是摆设？ | **不能**，且**它从未被执行**：全仓无 rls.sql 引用，`ensureAuthSchema` 只加载 `schema.sql`（`db.mjs:63-82`）。逐条问题见 A06/B10/B11：self-insert `with check(true)`、行主可改自己 status、`user_roles` 策略自引用导致 Postgres 无限递归、roles/permissions/role_permissions 三张表没有 RLS；另外自建 `users.id` 与 `auth.uid()` 永远不相等，策略即使执行也基本不命中。`RequirePermission` 比摆设更糟：`AuthProvider` 把 `permissions` 硬编码为 `[]`（`:58,106,171`），/admin 永远显示「无权限访问」；而后台实际写的是 localStorage（`db.ts:1604-1613`、`AdminPage.tsx:72-129`），改浏览器本地存储即可绕过内容审核（`keywordFilter.ts:1-8`）。 | 见 A06、B04、B10、B11 |
| ⑥ | security.ts 的 sanitizeHtml 能否被绕过？项目真用了吗？ | **能被轻易绕过，而且全仓 0 调用**（只 export，无人 import）。绕过示例：无引号事件处理器 `<img src=x onerror=alert(1)>`（正则 `security.ts:13` 要求引号）、多行 `<script>`（正则无 `s` 标志，`:11` 的 `.*?` 不跨行）、缺少闭合标签的 `<script src=...>`、实体编码 `javascript&#58;`、`<svg/onload=...>`。被误用的是 `sanitizeInput`：登录页拿它处理**密码**（`LoginPage.tsx:147-148`），直接造成 A05。 | 见 B13、A05 |
| ⑦ | 仓库是否泄漏密钥？ | **是，且是真实 Key 泄露到公开仓库**：`src/services/ai.ts:7,99` 硬编码方舟（Volcengine ARK）API Key `704801f6-...`，并在 `:20` 打印 key 前缀/后缀；该 key 出现在 git 历史的 **8 个提交**中，仓库为公开 GitHub（HTTP 200 可访问）。另有 `VITE_DOBAO_API_KEY` 客户端化（`doubao.ts:4`，必然进公开 bundle）。**未发现**：`.env` 文件（全仓无，`.gitignore:24-26` 已忽略）、真实 Supabase service_role（只有占位符 `your-service-role-key`，`supabase.mjs:4`）、真实 JWT secret（只有默认 dev 值，A03）。 | 见 A01、A03、B16 |

### 1.5 权限与数据的流向（为什么「认证」和「授权」是两回事）

```
Supabase Auth 登录 ──► session.user.id（Supabase UID）、user_metadata.username
        │
        ├─► AuthProvider 构造 AuthUser：roles:['user']、permissions:[]   ← 硬编码，无任何来源
        │        └─► RequirePermission 永远 false → /admin 永久 403
        │
        └─► 业务数据却走另一条线：db.ts 的 localStorage 种子库 + currentUserId
                 └─► 所有帖子/笔记/资料都属于这个固定 userId，与登录者无关

真实数据授权边界 = 浏览器里 supabase anon key 的 RLS 配置（仓库不可见）
        └─► 仓库内没有任何应用表的建表/RLS 文件（只有 auth schema.sql/rls.sql），
            前端却直接 supabase.from('posts').insert(...)（dbService.ts:58-71）。
```

这带来一个面试时最容易被追问、也最难圆的问题：**「你的应用里，谁有权改哪条数据？」** 当前答案是「不知道」——身份、权限、数据三者没有同一条链路。

---

## 二、问题清单

> 严重度：**P0** = 凭据泄露/数据丢失/功能不可用；**P1** = 架构性缺陷或明显安全/质量问题；**P2** = 工程规范。标注「（条件）」表示需特定部署条件才触发。

| 编号 | 严重度 | 位置（file:line） | 问题 | 影响 | 修复方向 |
|------|--------|-------------------|------|------|----------|
| A01 | **P0** | `src/services/ai.ts:7,99`（另 `:20`、`:106` 打印密钥片段） | 硬编码真实方舟/豆包 API Key，并提交到**公开 GitHub 仓库**（该 Key 存在于 git 历史 8 个提交中） | 任何人可盗用额度调用模型：费用损失、配额耗尽/封号、内容滥用；面试官或 GitHub 密钥扫描可立即发现 | **今天就轮换/删除该 Key**；所有模型调用移入服务端（Supabase Edge Function / BFF）并加限流与配额；`git filter-repo`/BFG 清历史后 force push；用 gitleaks 做 pre-commit + CI |
| A02 | **P0** | `src/lib/supabase.ts:20-55`、`AuthProvider.tsx:193-217`、`RequireAuth.tsx:9-10` | 未配置 `VITE_SUPABASE_*` 时启用 mock 客户端：`signInWithPassword` 返回 `error:null, session:null` 且 mock 的 `onAuthStateChange` 从不回调；登录页拿到 resolve 立即 navigate，全局状态永远停在 loading | **全新克隆 / 未配环境的部署整个应用不可用**（所有业务路由被 RequireAuth 包住，卡在「加载中...」）；注册页还会提示「注册成功，请前往邮箱激活」，实际什么都没创建 | 删除 mock，或改为显式「演示模式」并伪造完整会话；登录必须校验 `data.session` 是否存在；状态机补 error 分支与超时兜底 |
| A03 | **P0** | `config.mjs:5-6`、`db.mjs:19-44`、`index.mjs:91-111` | 自建服务端 JWT 密钥有硬编码默认值（`dev_access_secret_change_me`），仓库无 .env、文档从未要求设置 `JWT_ACCESS_SECRET/JWT_REFRESH_SECRET`；`DATABASE_URL` 为空时自动降级为 pg-mem 内存库 | 按文档启动该服务即用**公开密钥**签发 HS256 token，任何人可伪造任意 userId 的登录态；重启丢全部用户与 refresh token（宣称的 Postgres 持久化失效） | 启动时 fail-fast：生产环境缺失 secret/database 直接退出；密钥必填且文档化；引入轮换与 kid |
| A04 | **P0** | `AuthProvider.tsx:288` vs `App.tsx:68-75`、`:111` | 找回密码 `redirectTo` 指向 `/zhiyueling-si/password/reset`，但该路由**不存在**（只有 login/register/forgot/password-change，其余落到 `*`→`/`） | 邮件链接点击后回到首页，没有设置新密码的页面；`resetPassword()` 无人调用（`AuthProvider.tsx:302-317`）；**忘记密码功能 100% 不可用**，但 UI 仍提示已发送 | 新增 `/zhiyueling-si/password/reset` 页面，用 recovery session + `updateUser({password})` 完成重置；补 e2e |
| A05 | **P0** | `LoginPage.tsx:147-148`（注册端 `RegisterPage.tsx:147` 不转义） | 登录时用 `sanitizeInput` 把密码里的 `& < > '` 等字符转成 HTML 实体后再交给 Supabase；注册时存的是原文 → 密码含这些字符的账号**永远登录失败** | 用户被锁死在登录页；失败还会累计为「密码错误」触发 Supabase 限流；重置流程又是坏的（A04），无法自助恢复 | 密码原样透传，不做任何转义；`sanitizeInput` 只用于展示层；补特殊字符密码用例 |
| A06 | **P0**（条件） | `rls.sql:47-48`（insert with check true）、`:9-10`（update own 无列限制） | 若该 SQL 在 Supabase 执行：匿名 anon 客户端可 insert 任意 `users` 行（`status` 自填 active、id 任意）；行主可 update 自己的 `status='active'`、`banned_until=null`、`password_hash` 任意值 | 账号可被伪造、自我激活/解封/改密；该表还与前端 `dbService` 操作的 `users` 同名（`dbService.ts:15`），放大污染面 | 删除 self-insert 或限定 `to authenticated` + with check 校验；禁止客户端写 users；列级 revoke；status 变更只走 SECURITY DEFINER 函数 |
| B01 | P1 | `authApi.ts:1-206`、`client/index.ts:1-9`、`vite-env.d.ts:4`、`server/src/index.mjs:1-732` | **两套认证实现 + 大量死代码**：`AuthApi` 类无实例化、未导出；`VITE_AUTH_BASE_URL` 死声明；700+ 行 Express 服务端无任何调用方 | 两套互相矛盾的 token 模型（Bearer+localStorage vs HttpOnly refresh cookie）同时存在；维护者/面试官会误判架构，改 bug 先要判断改哪套；是「过度包装」的最大来源 | 删除 `authApi.ts`、`VITE_AUTH_BASE_URL`、`tokenStorage` 中未被 AuthProvider 使用的部分；服务端移出 `src/`（独立仓库或 `docs/security-design.md`），文档同步 |
| B02 | P1 | `index.mjs:486`；`:491-493`；`:656-705` | `/stepup` 使用**未定义变量 `jwt`**（文件只 import `createJwtService`），必然抛错并回显 `jwt is not defined`；而 ban/unban 强制 `requireStepUp` | 管理员封禁/解封功能在链路上不可能成功；也证明该服务**从未被端到端跑通** | 在 jwtService 内实现 signStepUp（同一套密钥与校验）；补 e2e 启动冒烟测试 |
| B03 | P1 | `db.mjs:387-411`（函数定义）vs `index.mjs:17-38`（未导入）、`:182-188`、`:284-293`（失败只写日志） | 宣称的「失败锁定」未接线：`incrementLoginFailure/resetLoginFailure` 从未被调用；`auth.mjs:65-67` 的 `locked_until` 检查永远为假 | 暴力破解仅受 IP 维度 10 次/分钟限制，换 IP/僵尸网络可无限撞库；「企业级安全」宣传不成立 | 登录失败调用 increment 并在成功后 reset（或明确删除该特性）；增加账号维度限流 |
| B04 | P1 | `AuthProvider.tsx:58,106,171`；`RequirePermission.tsx:13-18`；`App.tsx:105`；`db.ts:1604-1613`；`AdminPage.tsx:72-129`；`keywordFilter.ts:1-8` | 前端权限恒为空（硬编码 `permissions: []`），`/admin` 永远显示「无权限访问」；后台真正操作的却是 localStorage 里的 admin 配置（置顶/精选/敏感词） | 后台功能不可达；所谓「内容审核」只是浏览器本地过滤，用户改 localStorage 即可绕过；权限体系在前后端都没有可信来源 | 权限从可信来源读取（Supabase `app_metadata.role` 或 `profiles` 表经 RLS）；管理操作必须在服务端校验；做不到就删掉 /admin 与相关宣传 |
| B05 | P1 | `supabase.ts:11-18`、`tokenStorage.ts:14-15`、`App.tsx:65` | 会话 token 全部存 localStorage（Supabase 默认 + 自己又存一份 accessToken），未显式配置 `flowType:'pkce'` | 任意 XSS 可导出 access+refresh 并长期接管账号；implicit 流程使邮件/恢复链接的 token 出现在 URL fragment；自存第二份 token 无收益、只扩大暴露面 | 显式启用 PKCE；对高敏操作做二次验证；删除重复 token 存储；配 CSP（当前 CSP 关闭） |
| B06 | P1 | `ChangePasswordPage.tsx:14,29`；`AuthProvider.tsx:268-283` | 「修改密码」收集了当前密码却不校验：`changePassword` 直接 `updateUser({password})`，`currentPassword` 被丢弃 | 拿到会话（XSS/共享设备/未登出）即可静默改密并踢掉原主人，与 B05 组成完整接管链 | 要求旧密码并重新认证（`signInWithPassword` 或一次性 nonce），改密后吊销其他会话 |
| B07 | P1 | `index.mjs:171-251`、`:511-529`、`:530-548`、`db.mjs:226-248` | 自建服务端「Supabase 校验密码 + 自签 JWT」双信任根，且用户表割裂：Supabase 路径注册**不写**自有 `users` 表，登录后按 Supabase UID 查自有 RBAC → 角色/权限恒为空 | 签发出的 JWT 不带任何权限；两套用户 ID 永远对不上；逻辑上不可能自洽 | 二选一：全 Supabase（`auth.users` + `profiles`）或全自建；不要混合两套身份 |
| B08 | P1 | `index.mjs:72-77` | CORS `origin: true, credentials: true` 反射任意 Origin | 任意站点可发起带凭据的跨域请求；与 HttpOnly refresh cookie 组合时，要么受 SameSite=Lax 限制导致跨域刷新失效（配置自相矛盾），要么放宽后构成 CSRF；生产部署形态不清晰 | 显式 allowlist 前端域名；同站部署；必要时加 CSRF token/双提交 cookie |
| B09 | P1 | `index.mjs:559-580`、`db.mjs:307-310` | 邮箱验证接口与 Supabase 机制不匹配：`verifyOtp({token,type:'email'})` 缺少 email 参数，且 Supabase 确认邮件走它自己的 `/auth/v1/verify`，不会调用此接口；`verifyEmail()` 是永远返回 ok 的空壳 | 「邮箱验证」是死接口，与前端「去邮箱激活」的提示无任何关系 | 删除；或改为 Supabase `emailRedirectTo` + 前端回调路由 |
| B10 | P1 | 全仓无 `rls.sql` 引用；`db.mjs:63-82` 只加载 `schema.sql`；`rls.sql:6` 用 `auth.uid()` vs `db.mjs:276-291` 自建 uuid | RLS **从未被应用**；即使应用，自建 `users.id` 与 `auth.uid()` 也不相等，策略基本不命中 | 安全表要么裸奔（RLS 未启用），要么策略无效，两种都挡不住越权；「写了 RLS」是纸上安全 | 确定身份来源后重写 RLS；用 Supabase migrations 确保执行；CI 里跑 anon key 攻击用例 |
| B11 | P1 | `rls.sql:60-67`；`rls.sql` 全文（无 roles/permissions/role_permissions 的 RLS） | `user_roles` 的 admin 策略在策略表达式里 select `user_roles` → Postgres 会报 infinite recursion；权限相关的三张表完全没有 RLS | 该策略失效/报错；若在 Supabase 中按默认授权部署，anon 可直接插 `role_permissions` 给自己加权限（【推测】依赖 Supabase 默认 grant 与是否执行该 SQL） | admin 判定改为 SECURITY DEFINER 函数或 JWT claims；三张表启用 RLS 且只读 |
| B12 | P1 | `schema.sql:7-20` vs `dbService.ts:15,28-41,200` | 自建 `users` 表与前端 Supabase `users` 表**同名不同义**：一个存 password_hash，一个当业务用户资料；前端 `createUser` 还用 anon key 直接 insert | 同表双语义、字段互相污染；若 RLS 没开，前端等于拿到了该表的写权限（结合 A06） | 业务资料独立为 `profiles` 表；auth 表只由 Supabase 管理 |
| B13 | P1 | `security.ts:8-15`、`:58-65`；调用点仅 `LoginPage.tsx:5,147,148` | `sanitizeHtml` 用 4 条正则做 HTML 清洗，极易绕过且**全仓 0 调用**；`sanitizeInput` 被误用到密码 | 给人「有 XSS 防护」的错觉；实际 XSS 防护靠 React 转义（帖子/评论以文本渲染，`PostDetailPage.tsx:131,300`），与 sanitizeHtml 无关；误用还制造了 A05 | 删掉自研正则；需要富文本时用 DOMPurify/服务端白名单；渲染坚持 React 文本或受控白名单 |
| B14 | P1 | `package.json:6-12`、`:13-36`；仓库无 `.github` | 没有测试框架、没有测试文件、没有 CI（仅 dev/build/typecheck/lint） | A02/A04/A05/B02 这类问题本可被 3 条 e2e 拦住；重构时没有回归网，越改越不敢动 | 先补 auth e2e（登录/登出/刷新/重置/特殊字符密码）+ RLS 攻击用例；CI 跑 typecheck/lint/build/test/gitleaks |
| B15 | P1 | `index.mjs:582-597`；`server/package.json:10-25`（无邮件依赖） | 自建服务端找回密码是假实现：只生成 reset token、只在非生产环境打日志，从不发邮件 | 生产环境用户永远收不到重置邮件，接口却返回 ok；功能层面是空壳 | 前端已用 Supabase `resetPasswordForEmail`，删除服务端假实现；或接真实邮件服务并补测试 |
| B16 | P1 | `doubao.ts:4,13-17` | `VITE_DOBAO_API_KEY` 属 Vite 客户端环境变量，构建时**编译进公开 JS bundle** | 任何人打开 DevTools 即可拿到 key 并盗刷额度；与 A01 同类问题（一个硬编码、一个客户端环境变量） | 模型调用全部走服务端代理（Edge Function），密钥只在服务端；加限流与用户配额 |
| B17 | P1 | 全仓无 `.env`/`.env.example`（已 glob 确认）；`.gitignore:24-26`；`项目文档.md:574` | 环境变量契约缺失：文档写「复制 .env 文件（如果不存在）」自相矛盾；JWT/SMTP/`DATABASE_URL` 等变量从未文档化 | 新环境必然掉进 A02/A03 的默认值陷阱；面试演示换机器就崩 | 提供前后端各一份 `.env.example` + 启动时校验 + README 步骤；CI 用示例值做构建检查 |
| C01 | P2 | `App.tsx:65`；`AuthProvider.tsx:193-217`；`index.mjs:410` | `remember` 勾选框是装饰：前端 `persistAccessToken:true` 恒持久化、`loginWithPassword` 忽略 remember；服务端首次刷新后还强制写 7 天 cookie | UI 承诺的「记住登录状态」与实际会话生命周期不一致，用户预期被欺骗 | 统一策略：remember 决定 Supabase `persistSession` 与 cookie maxAge |
| C02 | P2 | `index.mjs:349-411` | refresh token 轮换缺重用检测与并发保护：旧 token 被并发/重放使用时不会触发「全家吊销」 | 被盗 refresh token 在 7 天内可反复续命；轮换的安全收益被削弱 | 引入 token family + reuse detection，检测到重用时吊销该用户全部 refresh token |
| C03 | P2 | `index.mjs:66-70` | Helmet 的 CSP 被关闭 | 对 XSS（B05）缺少最后一道浏览器侧防线 | 配置合理 CSP（为 Swagger UI 单独放行） |
| C04 | P2 | `index.mjs:491-493`、`:344-345`、`:712-718` | 错误信息回显内部异常（如 `jwt is not defined`） | 帮助攻击者画像内部实现；与「企业级」定位不符 | 统一错误码 + 脱敏 message，详情只进日志 |
| C05 | P2 | `RegisterPage.tsx:129-140`、`ForgotPasswordPage.tsx:97`、`index.mjs:500-506` | 校验规则弱且前后端各一套：邮箱只判断含 `@`；无长度上限/Unicode 规范化；密码策略三套（注册 8 位、`security.ts:33` 6 位+复杂度、Supabase 配置未知） | 脏数据与不一致的账号行为；安全策略无法统一演进 | 用 zod 定义单一 schema，前后端共享；密码强度用同一规则 |
| C06 | P2 | `AuthProvider.tsx:80-88,139-146` | 10 秒超时用 `Promise.race` 实现：计时器不清理、超时即登出、败方 promise 继续执行 | 弱网/慢设备用户被误登出；潜在状态错乱 | `AbortController` + 明确的 offline 状态；超时不等于未登录 |
| C07 | P2 | `LoginPage.tsx:135,164`；`RequireAuth.tsx:12` | 登录后回跳参数 `from` 未校验即交给 `navigate` | 构造 `?from=` 可触发异常/跳转行为（【推测】取决于 react-router 7 对绝对 URL 的处理） | 仅接受以 `/` 开头且不以 `//` 开头的站内路径 |
| C08 | P2 | `auth.mjs:59-91` | 每个受保护请求要 3-4 次 DB 查询（黑名单、user、roles、permissions），无缓存 | 高并发下 DB 放大；与 JWT 无状态设计初衷矛盾 | 短期缓存（如 30s）或把角色放入 claims + 版本号吊销 |
| C09 | P2 | `db.mjs:250-274`；`index.mjs:656-705` | 登录日志/审计日志只写不读：没有查询 API/UI，audit 仅 ban/unban 两处 | 安全事件无法回溯，只有存储成本 | 增加 admin 日志查询接口与保留策略；或删除以免误导 |
| C10 | P2 | `db.mjs:63-82` | schema 无迁移/版本化：每次启动执行 `create table if not exists`，没有版本号与升级路径 | 表结构无法演进/回滚；与 Supabase 线上表可能持续漂移 | 改用 Supabase migrations/Flyway，一次一迁移 |
| C11 | P2 | `authApi.ts:139-143` vs `types.ts:24-27` | mock 返回的 token 字段名是 `expiresAt`，而 `AuthTokens` 定义是 `accessTokenExpiresAt`，靠 `as T` 逃过类型检查 | 运行时过期判断全部失效（死代码内，但暴露类型安全习惯问题） | 删除 mock；禁止用 `as` 掩盖形状不匹配 |
| C12 | P2 | `项目文档.md:105-106,499,527,544-551,580-586,652-653` | 文档与实现系统性不符（详见 4.2）：确认密码/验证码输入框、MySQL、安全测试全部通过、加密存储与传输、启动自建后端等承诺多数不存在 | 面试被追问会当场翻车；也是「AI 生成文档」的典型特征 | 以代码为准重写文档，每条能力标注实现位置与验证方式 |

---

## 三、重构建议

### 3.1 先拍板：认证只保留一套（推荐 Supabase-only）

| 方案 | 组成 | 优点 | 代价 | 结论 |
|------|------|------|------|------|
| **A. Supabase 托管认证（推荐）** | Supabase Auth + `profiles` 表 + 全表 RLS + Edge Function 做 AI/管理代理 | 密码哈希、邮件、JWT 刷新、找回密码都由成熟服务承担；学生项目最忌自研密码学/邮件；RLS 能把「授权」真正落到数据库 | 厂商绑定；本地开发需 Supabase CLI；RLS 要逐表写并测试 | **选 A**：工作量最小、安全性上限最高、面试可讲「威胁模型 + RLS 攻击测试」 |
| B. 自建认证服务 | 保留 Express/JWT，修完 B02/B03/B06/B07/B09/B15，前端接 `AuthApi` | 可展示 JWT 双 token/黑名单/RBAC/审计等工程能力 | 邮件、限流、密钥管理、部署、测试全要自己兜；当前代码从未跑通，修复成本 ≥ 重写 | 只作为「安全设计文档/独立 demo」保留，**不要混进主仓库 src** |

**目标架构（方案 A）**

```
┌────────────┐   supabase-js (PKCE, 短会话)   ┌──────────────────────────────┐
│ React SPA  │ ─────────────────────────────► │ Supabase Auth（托管）         │
│            │                                │  auth.users = 唯一身份源      │
│            │   supabase.from(...) 全走 RLS  ├──────────────────────────────┤
│            │ ─────────────────────────────► │ Postgres: profiles/posts/... │
│            │                                │  RLS: auth.uid() / is_admin() │
│            │   invoke Edge Function         ├──────────────────────────────┤
│            │ ─────────────────────────────► │ Edge Functions:              │
│            │                                │  ai-proxy（Key 只在服务端）   │
│            │                                │  admin-actions（校验角色+审计）│
└────────────┘                                └──────────────────────────────┘
     ▲
     └── GitHub Actions: typecheck / lint / build / e2e / gitleaks
```

数据流一句话：**Auth 身份 → profiles → RLS → 业务数据**，同一条链路。杜绝 1.1 里的三套身份。

### 3.2 分阶段落地（按风险排序，每阶段都有可验证产出）

**Phase 0 · 安全止血（0.5–1 天，立刻做）**

1. **轮换 ARK/豆包 Key**；从代码中删除硬编码，AI 调用改为服务端代理（或先临时 mock），清理 git 历史（`git filter-repo`/BFG）后 force push，并启用 gitleaks。
2. **修 A02**：无 `VITE_SUPABASE_*` 时启动即显式报错，禁止 mock「假登录」；`loginWithPassword` 必须检查返回的 session。
3. **修 A05**：登录页删除对密码的 `sanitizeInput`，密码原样透传。
4. **修 A04**：新增 `/zhiyueling-si/password/reset` 页面与路由，用 recovery session 完成 `updateUser({password})`。
5. **修 A03/B08**：服务端缺 secret/DATABASE_URL 时 fail-fast；CORS 改显式白名单。

验收：`grep -rE '704801f6|service_role|dev_access_secret' src/` 0 命中；新克隆按 `.env.example` 可登录；重置密码链路手动跑通。

**Phase 1 · 认证收敛（2–4 天）**

1. 删除 `authApi.ts`、`VITE_AUTH_BASE_URL`、`tokenStorage` 中仅死代码使用的函数；把 `src/modules/auth/server/**` 移出 `src/`（独立 demo 仓库或 `docs/security-design.md` 的附录代码）。
2. `permissions` 改为从 `app_metadata.role`（或 `profiles.role` 经 RLS 读取）派生；`RequirePermission` 接真权限；`/admin` 要么接到服务端校验，要么直接删（不要留一个永远 403 的页面）。
3. `changePassword` 增加旧密码重认证；`remember` 映射到 `persistSession`/cookie 生命周期；显式 `flowType:'pkce'`；补 CSP。
4. 删除 `sanitizeHtml`/`sanitizeInput` 的误用点，富文本渲染改受控组件。

验收：`grep -r 'authApi\|VITE_AUTH_BASE_URL' src/` 0 命中；权限矩阵用例（普通用户/管理员）通过；密码含特殊字符可登录。

**Phase 2 · 数据与权限（1–2 周，需与数据层改造协同）**

1. 新建 Supabase migrations：`profiles / posts / notes / comments / tags / interactions` 建表 + 全部启用 RLS + 每张表写齐 select/insert/update/delete 策略。
2. 前端 `dbService` 改为「查询天然按当前用户」，删除 localStorage 数据层与 `currentUserId` 概念；登录用户与数据行通过 `user_id = auth.uid()` 绑定。
3. 重写/废弃现有 `rls.sql`：修正 A06/B10/B11，角色判定统一用 `is_admin()` SECURITY DEFINER 函数或 JWT claims。
4. 每个策略配一条攻击测试（用 anon key 尝试越权读写，断言 0 行/被拒）。

验收：6 条越权用例全部被拒；换账号登录看到不同数据；删库重建可复现。

**Phase 3 · 工程化与面试叙事（持续）**

1. vitest（工具函数/权限判断）+ Playwright（注册→登录→发帖→登出→重置密码）e2e；GitHub Actions + gitleaks + Dependabot。
2. `.env.example`（前端/服务端各一份）、README、`docs/security.md`（威胁模型、取舍、已知限制）。
3. 部署：Vercel（SPA）+ Supabase；录 3 分钟 demo（含「用 anon key 攻击自己被 RLS 挡住」的片段）。

### 3.3 验收标准（可执行清单）

- [ ] `grep -rE '704801f6|eyJ|service_role|dev_access_secret|sk-' src/` 0 命中；gitleaks 在 CI 中通过，git 历史无真实 Key。
- [ ] 全新克隆：`cp .env.example .env` + 填 2 个变量 → `npm run dev` → 注册/登录/刷新/登出/找回密码全通；缺 env 时给出明确错误而不是假登录。
- [ ] 密码包含 `& < > ' 引号` 的账号可正常注册并登录（A05 回归用例）。
- [ ] 忘记密码邮件点击后进入重置页，能设置新密码并用新密码登录（A04 回归用例）。
- [ ] 修改密码必须提供旧密码，错误旧密码被拒（B06）。
- [ ] 连续 5 次错误密码后账号被锁定 15 分钟（B03，或明确删除该宣传）。
- [ ] 用 anon key 执行 6 条越权攻击（读他人 notes、改他人 posts、insert users、update role_permissions 等）全部被 RLS 拒绝。
- [ ] 普通用户访问 /admin 被拒、管理员可进入；权限来源可指向具体表/字段（B04）。
- [ ] `grep -r 'authApi\|VITE_AUTH_BASE_URL\|/api/v1/auth' src/` 0 命中（B01）。
- [ ] CI 绿：typecheck + lint + build + test + gitleaks；README 每条能力都能指到代码或测试。

### 3.4 关键修正示例

**RLS 正确写法（roles 判定不递归）**

```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- 关键：角色字段不允许自助修改
revoke update (role, status) on public.profiles from authenticated;
```

**删除「匿名可插入用户」策略（A06）**

```sql
drop policy if exists allow_insert_for_new_users on public.users;
revoke insert, update, delete on public.users from anon, authenticated;
-- 用户创建只走 Supabase Auth 触发器（handle_new_user）或服务端
```

**密码重置路由（A04）**

```tsx
// App.tsx 增加
<Route path='/zhiyueling-si/password/reset' element={<ResetPasswordPage />} />

// ResetPasswordPage：进入时已有 recovery session
const { error } = await supabase.auth.updateUser({ password: newPassword })
if (!error) await supabase.auth.signOut()  // 重置后要求重新登录
```

**AI 密钥只留服务端（A01/B16）**

```ts
// 前端只调用自己的函数，不再出现任何模型 Key
const res = await supabase.functions.invoke('ai-proxy', { body: { prompt } })
// Edge Function 内：Deno.env.get('ARK_API_KEY') → fetch(ark...) + 限流/配额
```

---

## 四、面试可讲点

### 4.1 真正值钱的工程亮点（按「可讲深度 × 真实性」排序）

#### 亮点 1：一套按企业级范式设计的 JWT 认证服务端（**最值钱，但必须重新定位**）

它在 `src/modules/auth/server/**` 里真实存在，且以下细节**都是正确的**，每一条都能经得起追问：

| 设计点 | 证据 | 为什么值钱 |
|--------|------|------------|
| refresh token 只存 **sha256 哈希**，不存明文 | `auth.mjs:131-133`、`db.mjs:46-48,338-344` | 数据库泄露不等于会话泄露 |
| 刷新时**事务内吊销旧 jti + 写入新 token**（轮换） | `index.mjs:391-408` | 刷新令牌重放窗口收敛，是 OAuth2 最佳实践 |
| access token **jti 黑名单**，登出立即失效 | `auth.mjs:59-60`、`index.mjs:419-449` | 解决「JWT 无状态无法撤销」的经典难题 |
| 每次请求**从 DB 重读 roles/permissions**，不信任 token 内声明 | `auth.mjs:76-89` | 很多教程会把权限塞进 claims 然后永不更新，这里做对了 |
| `locked_until` / `banned` 在鉴权中间件里检查 | `auth.mjs:65-74` | 封禁能立刻生效，而不是等 token 过期 |
| 危险操作要求 **step-up 二次验证** | `auth.mjs:108-124`、`index.mjs:656-705` | 概念正确（实现有 bug，见 B02） |
| 登录日志 + 审计日志（actor/target/ip/ua/meta） | `db.mjs:250-274` | 可追溯性，是安全系统的基本盘 |
| bcrypt cost=12、参数化 SQL、pino redact 敏感头、64kb body 限制、双层限流 | `index.mjs:59-64,79,82-89,161`；`db.mjs` 全参数化；`index.mjs:543` | 细节密度说明作者读过安全实践，不是纯 AI 拼装 |
| 完整的数据模型：refresh/blacklist/verification/reset/logs | `schema.sql:66-134` | 能画出完整 token 生命周期状态机 |

**讲法（20 分钟提纲）**：① 目标与威胁模型（XSS 窃取、refresh 重放、撞库、越权、内部滥用）→ ② 为什么选双 Token + 短 access TTL + rotation + jti 黑名单（对比 session 表方案）→ ③ RBAC 为什么从 DB 读而不是塞 claims → ④ 危险操作为什么要 step-up + 审计 → ⑤ 诚实说出它没上线、stepup 有 bug、最终为什么删掉自建方案（邮件/运维/测试成本，托管服务更成熟）。

**红线**：不能说「已上线/已接入前端」。代码事实是死的（B01），面试官 grep 一下就会拆穿；只有按「设计 + 复盘」讲才安全。

#### 亮点 2：Supabase 托管认证的薄封装 + 三态状态机（**唯一在跑且真实**）

- 三态 union（`types.ts:29-36`）把「未登录 / 加载中 / 已登录」在类型层面分开，避免 UI 误判；
- `RequireAuth` 保留 `from` 并编码回跳（`RequireAuth.tsx:9-13`），是完整产品该有的细节；
- `onAuthStateChange` 统一驱动状态 + 10 秒超时降级（`AuthProvider.tsx:46-134`）——超时策略粗糙（C06），但「防卡死」意识真实；
- **选 Supabase 而不是自研**本身就是正确的安全工程判断：密码哈希、邮件、找回密码、token 刷新交给成熟服务，这是「不要自己造密码学」原则的落地。

定位：5-8 分钟，属于「工程判断」亮点，不是「技术深度」亮点。

#### 亮点 3：模块化边界的意图（有架构感，但只做到目录）

`src/modules/auth/{client,server,db}` + 服务端独立 `package.json` + OpenAPI 文档（`openapi.mjs`）说明作者有「把认证做成可复用模块」的架构意识。可惜没有契约、没有边界（死代码就是证据），面试只能作为「我识别并重构了模块边界」的素材，不能作为「我已经实现模块化」的证据。

#### 明确回答：最值得在面试中讲的一个亮点

**选亮点 1 ——「认证威胁模型与 token 生命周期设计」**。理由：它能把面试从「你用了什么库」拉到「你理解哪些攻击面、如何权衡取舍」，这是本科生里稀缺的能力；而且代码证据真实存在（不是包装）。**前提**是按建议把它整理为 `docs/security-design.md` 或独立 demo 仓库，并标注「设计原型，未接入线上、已知缺陷如下」。

**备选（完成 Phase 2 后更有说服力）**：「我用 anon key 攻击了自己的数据库，6 条越权用例全部被 RLS 挡住」——可现场演示、可复现，比任何描述都硬。

### 4.2 过度包装清单（文档声称 vs 代码事实）

| 文档声称 | 位置 | 代码事实 | 判断 |
|----------|------|----------|------|
| 「认证系统：登录/注册、密码找回、权限管理」 | `项目文档.md:33` | 找回密码断（A04）、权限恒空（B04） | 3 项里 1 项半可用 |
| 「注册页包含确认密码框；忘记密码页含验证码输入框、新密码、确认新密码」 | `项目文档.md:105-106` | 均不存在（`RegisterPage.tsx:116-154` 无 confirm；`ForgotPasswordPage.tsx:112-136` 只有邮箱） | 文档是按「设想」写的，不是按代码 |
| 「安全测试结果：输入验证/权限/数据安全 全部通过」 | `项目文档.md:544-551` | 全仓无测试框架（B14）；RLS 未执行（B10）；token 在 localStorage（B05） | 不存在这些测试 |
| 「实现了用户数据的加密存储和传输」 | `项目文档.md:653` | 数据在 localStorage 明文；业务数据甚至不与登录用户绑定（1.1） | 不成立 |
| 「后端安装：cd src/modules/auth/server && npm start」 | `项目文档.md:580-586` | 后端无任何调用方（B01）；`vercel.json` 无法部署 | 启动了也没人用 |
| 「数据库：MySQL 8.0」 | `项目文档.md:499` | 实际 Supabase/Postgres（`config.mjs:7-8`、`supabase.ts:3-4`） | 文档未同步技术选型 |
| 「支持 100+ 并发用户，响应 <500ms」 | `项目文档.md:534-538` | 无压测脚本、无服务端（数据在浏览器本地） | 无法支撑该结论 |
| OpenAPI 自称 Enterprise-grade authentication & RBAC module | `openapi.mjs:7` | 服务端未接入、stepup 坏（B02）、无测试 | 营销词，删掉或改 |
| 「建立了内容审核机制」 | `项目文档.md:652` | 客户端 localStorage 敏感词过滤（`keywordFilter.ts:1-8`），改本地存储即绕过 | 不是机制，是装饰 |

### 4.3 面试前必须补的缺口（按优先级）

1. **轮换 ARK/豆包 Key 并清理 git 历史**——今天就做；不做这一条，后面所有努力都可能被一个公开密钥事故抵消。
2. **只保留一套认证**（Phase 1），顺手修掉 A02/A04/A05/A03 四个 P0；目标是「全新克隆一条命令能跑通登录」。
3. **把 RLS 真正落地 + 6 条攻击测试**——这是最能自证、也最难造假的能力，比任何「企业级」措辞都有说服力。
4. **补测试与 CI**（Playwright e2e + vitest + gitleaks）——用来对冲 Vibe-coding 印象；面试官看到 CI 徽章和 e2e 用例，信任度完全不同。
5. **重写文档**：删掉所有不存在的能力；保留的每条能力都标注代码位置/测试名/demo 步骤。
6. **部署 + 3 分钟 demo**（Vercel + Supabase），demo 第二段就演示「越权被 RLS 拒绝」。
7. **可选**：把 JWT 服务端整理成 `docs/security-design.md`（含已知缺陷清单），作为深聊材料，而不是留在 `src/` 里当死代码。

### 4.4 一句话定位与建议

> 这是一个**前端完成度约 80%、后端与安全完成度约 20% 的 Vibe-coding 项目**：它确实动过企业级认证的设计（这是真亮点），但存在**公开泄露的真实 API Key**、**自认为在跑其实从未接入的认证服务**、**文档与实现系统性脱节**三大问题。

如果只做三件事：**① 轮换 Key 并清历史；② 只保留 Supabase 一套认证并修完 P0；③ 补 RLS + 攻击测试 + CI**。做完之后，这个项目可以从「演示品」变成「有安全叙事、可复现、可追问的工程作品」——这正是保研/考研面试里最稀缺的东西。

---

> 说明：本次为只读审计，未修改 `src/` 或任何源码/配置；唯一写入的文件是本报告 `analysis/02-auth-security.md`。

