# 数据模型设计（物理层）

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 输入 | [领域模型](../modeling/DOMAIN-MODEL.md) v1.0（D1/D2/D4/D5 已确认） |
| 范围 | Postgres 表结构与约束、IndexedDB 结构、v4→v5 迁移、RLS 策略 |
| 状态 | 待评审；通过后进入实现（M1.5） |

---

## 1. 设计原则

1. **服务端是关系模型，本地是文档模型**：两者共享同一套领域类型，由 Repository 映射，不要求物理同构。
2. **约束尽量下沉到数据库**：唯一键、外键、检查约束、触发器维护计数；应用层只做业务校验。
3. **删除一律软删**（`deleted_at`），清理任务 30 天后物理删除；查询默认过滤。
4. **单一真相**：笔记发布生成引用型帖子（`posts.kind='note'`），正文只存笔记表。
5. **计数反规范化**：由触发器在事务内维护，每日对账修正漂移。

## 2. Postgres 模式

> 目标库：Supabase Postgres（M2）。如需迁移到自建 Postgres，本 DDL 可直接复用。
> 约定：所有时间 `timestamptz`；主键 `uuid`；软删字段 `deleted_at`；计数字段非负。

### 2.1 枚举

```sql
create type user_role as enum ('user', 'admin');
create type note_status as enum ('draft', 'published', 'deleted');
create type post_kind as enum ('original', 'note');
create type interaction_kind as enum ('like', 'collect');
create type source_type as enum ('public-domain', 'authorized', 'excerpt');
create type ai_kind as enum ('analyze', 'chat', 'translate', 'word', 'embed');
create type ai_status as enum ('queued', 'running', 'succeeded', 'failed', 'rejected', 'canceled');
```

### 2.2 身份与邀请

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 30),
  bio text not null default '',
  profile_tag text not null default '',
  avatar_url text,
  role user_role not null default 'user',
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invites (
  code text primary key,
  created_by uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_by uuid references profiles(id),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_use_pair check ((used_by is null) = (used_at is null))
);
create index invites_active_idx on invites (expires_at) where used_at is null and revoked_at is null;
```

注册流程（M2）：BFF 以 service role 调用 `redeem_invite(code, email)`：

1. `select ... for update` 锁定邀请；校验未使用/未过期/未撤销；
2. 校验 `profiles where status='active'` 计数 < 50；
3. 创建 Auth 用户（admin API）与 profile；写入 `invites.used_by/used_at`；
4. 同一事务失败则回滚，邀请保持可用。

### 2.3 书库

```sql
create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  category text not null,
  difficulty text not null check (difficulty in ('入门','中级','进阶')),
  language text not null check (language in ('zh','en')),
  summary text not null default '',
  cover_url text,
  source_type source_type not null,
  source_title text not null,
  source_license text not null,
  source_url text,
  attribution text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  ordinal int not null check (ordinal >= 0),
  title text not null,
  content text not null,
  unique (book_id, ordinal)
);
create index chapters_book_idx on chapters (book_id, ordinal);
```

### 2.4 书架、进度、时长

```sql
create table shelf_items (
  user_id uuid not null references profiles(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table reading_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete set null,
  percent numeric(5,4) not null default 0 check (percent >= 0 and percent <= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  seconds int not null check (seconds > 0 and seconds < 86400),
  check (ended_at > started_at)
);
create index reading_sessions_user_idx on reading_sessions (user_id, started_at desc);
```

### 2.5 笔记与帖子（D1）

```sql
create table notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null,
  status note_status not null default 'draft',
  template text not null default 'minimal',
  source_book_id uuid references books(id) on delete set null,
  source_chapter_id uuid references chapters(id) on delete set null,
  excerpt text,
  published_post_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  kind post_kind not null default 'original',
  note_id uuid unique references notes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  like_count int not null default 0 check (like_count >= 0),
  comment_count int not null default 0 check (comment_count >= 0),
  collect_count int not null default 0 check (collect_count >= 0),
  view_count bigint not null default 0,
  share_count int not null default 0,
  constraint post_note_link check ((kind = 'note') = (note_id is not null))
);
alter table notes add constraint notes_published_post_fk
  foreign key (published_post_id) references posts(id) deferrable initially deferred;

create index posts_feed_idx on posts (created_at desc) where deleted_at is null;
create index posts_hot_idx on posts ((like_count * 3 + comment_count * 2 + view_count) desc) where deleted_at is null;
create index posts_author_idx on posts (author_id, created_at desc);
create index notes_author_idx on notes (author_id, updated_at desc);
```

> **关于正文**：`kind='note'` 的帖子正文不落库，读取时 join `notes`；列表摘要由查询拼接。
> 这样编辑笔记不需要同步帖子，也不存在两份正文。

### 2.6 评论、话题、互动（D2）

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comment_not_self check (parent_id is null or parent_id <> id)
);
create index comments_post_idx on comments (post_id, created_at) where deleted_at is null;

create table topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name <> '' and name not like '#%')
);

create table post_topics (
  post_id uuid not null references posts(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  primary key (post_id, topic_id)
);

create table interactions (
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  kind interaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, kind)
);
create index interactions_post_idx on interactions (post_id, kind);
```

计数器触发器（节选）：

```sql
create function sync_post_interaction_count() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update posts set
      like_count = like_count + case when new.kind = 'like' then 1 else 0 end,
      collect_count = collect_count + case when new.kind = 'collect' then 1 else 0 end
    where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update posts set
      like_count = greatest(0, like_count - case when old.kind = 'like' then 1 else 0 end),
      collect_count = greatest(0, collect_count - case when old.kind = 'collect' then 1 else 0 end)
    where id = old.post_id;
    return old;
  end if;
  return null;
end $$;
create trigger trg_interaction_count after insert or delete on interactions
  for each row execute function sync_post_interaction_count();
```

评论计数触发器同理（insert/delete 更新 `posts.comment_count`）。

### 2.7 通知

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('system','forum','book')),
  title text not null,
  body text not null default '',
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on notifications (user_id, created_at desc);
```

### 2.8 AI 与 RAG

```sql
create extension if not exists vector;

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default '阅读AI对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on chat_messages (thread_id, created_at);

create table analysis_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  book_id uuid references books(id) on delete set null,
  chapter_id uuid references chapters(id) on delete set null,
  text_hash text not null,
  analysis jsonb not null,
  model text not null,
  latency_ms int not null default 0,
  created_at timestamptz not null default now()
);

create table ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind ai_kind not null,
  status ai_status not null,
  model text,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  latency_ms int not null default 0,
  cost_micros bigint not null default 0,
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_requests_user_day_idx on ai_requests (user_id, created_at desc);

create table ai_quota_daily (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  requests int not null default 0,
  tokens int not null default 0,
  primary key (user_id, day)
);

create table corpus_chunks (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('book','note')),
  source_id uuid not null,
  ordinal int not null check (ordinal >= 0),
  text text not null,
  hash text not null,
  token_count int not null default 0,
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, ordinal)
);
create index corpus_chunks_hnsw on corpus_chunks using hnsw (embedding vector_cosine_ops);
create index corpus_chunks_fts on corpus_chunks using gin (to_tsvector('simple', text));

create table citations (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('message','analysis')),
  owner_id uuid not null,
  chunk_id uuid not null references corpus_chunks(id) on delete cascade,
  quote text not null,
  score real not null default 0
);
```

### 2.9 审计

```sql
create table audit_logs (
  id bigserial primary key,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_time_idx on audit_logs (created_at desc);
```

## 3. RLS 策略（M2）

| 表 | select | insert | update | delete |
|---|---|---|---|---|
| profiles | 所有登录用户可读公开字段 | 仅 service role（注册） | 本人或 admin | 禁止 |
| invites | 仅 admin | 仅 admin | 仅 admin | 仅 admin |
| books / chapters | 所有登录用户 | 仅 admin | 仅 admin | 仅 admin |
| shelf_items / reading_progress / reading_sessions | 本人 | 本人 | 本人 | 本人 |
| notes | 本人 | 本人 | 本人 | 本人（软删） |
| posts | `deleted_at is null` 或本人/admin | 本人 | 本人或 admin | 本人或 admin（软删） |
| comments | 同 posts | 本人 | 本人或 admin | 本人或 admin |
| interactions | 本人 | 本人 | 禁止 | 本人 |
| notifications | 本人 | service role | 本人（仅 read_at） | 禁止 |
| chat_threads / chat_messages / analysis_records | 本人 | 本人（经 BFF） | 禁止 | 本人 |
| ai_requests / ai_quota_daily | 本人只读 | service role | service role | 禁止 |
| corpus_chunks / citations | service role | service role | service role | service role |

要点：

- 客户端 **不直接写** `ai_requests`/`ai_quota_daily`/`corpus_chunks`，这些只由 BFF 的 service role 写入；
- `notes` 不公开：已发布笔记通过 `posts(kind='note')` 暴露，读取时用 `security definer` 视图或 BFF 聚合；
- 所有 admin 判定用 `profiles.role='admin'`，不要信任 JWT 里的自定义 claim（可被旧 token 过期时间影响）。

## 4. IndexedDB（本地）结构 v5

本地是文档模型：表 = 实体集合，记录是领域对象；索引只建在高频过滤/排序字段。

| 表 | 主键 | 索引 | 说明 |
|---|---|---|---|
| users | id | —— | 含 profile 字段 |
| books | id | category, language | 不含 chapters（拆分） |
| chapters | id | bookId+ordinal | 从 books 拆出 |
| shelfItems | [userId+bookId] | userId | —— |
| readingProgress | [userId+bookId] | userId, updatedAt | —— |
| readingSessions | id | userId+startedAt | 新增 |
| notes | id | authorId, updatedAt, status | 增加 deletedAt/publishedPostId |
| noteAssets | id | noteId | 新增（图片 Blob） |
| posts | id | authorId+createdAt, createdAt, kind | 增加 kind/noteId/deletedAt |
| comments | id | postId+createdAt, parentId | 增加 deletedAt |
| topics | id | name | 名称不含 # |
| postTopics | [postId+topicId] | topicId | 新增（替代字符串 tags） |
| interactions | [userId+kind+postId] | postId | 只针对帖子 |
| notifications | id | userId+createdAt | —— |
| chatThreads | id | userId+updatedAt | —— |
| chatMessages | id | threadId+createdAt | 增加 citations |
| analysisRecords | id | userId+createdAt | 只存成功结果 |
| meta | key | —— | schemaVersion/currentUserId/admin |

迁移时 `schemaVersion` 从 4（旧 key `read_forum_db_v5`）升到 5，旧 key 原样保留作为备份。

## 5. 迁移设计：v4 → v5

### 5.1 步骤

1. **备份**：把旧 JSON 原样复制到 `read_forum_db_v4.backup`（只读）；同时在 IndexedDB `meta` 记录 `backupAt`。
2. **拆章节**：`book.chapters[]` → `chapters` 表（保留原 id；补 `ordinal`）。
3. **补来源**：每本书写 `source = { type: 'excerpt', title: '历史演示摘录', license: 'unverified', attribution: '待补充' }`，并在管理后台标记需人工复核。
4. **帖子归一**：`kind='original'`、`noteId=null`、`deletedAt=null`；计数保持在 `stats`。
5. **关联已发布笔记**：对每个 `status='published'` 的笔记，按 `authorId + title + contentText` 查找同作者帖子；唯一命中则：
   - `post.kind='note'`、`post.noteId=note.id`；
   - `note.publishedPostId=post.id`；
   - 帖子正文清空（读取时从笔记取）。
   多条命中取最新一条并在迁移报告中记录冲突，其余保持 original。
6. **话题实体化**：`tags: string[]` → `topics` + `postTopics`；名称去掉前缀 `#`。
7. **互动收敛**：只保留 `targetType='post'` 的互动；笔记互动丢弃并记入迁移报告。
8. **新增空表**：`readingSessions`、`noteAssets`。
9. **校验**：
   - 用户数、书数、帖子数、笔记数、评论数与迁移前一致；
   - 每个 `kind='note'` 的帖子都有 `noteId`，且笔记的 `publishedPostId` 指回；
   - 章节 ordinal 连续；
   - 互动无重复。
10. **提交**：写 `meta.schemaVersion=5` 与迁移报告；失败则删除新库、保留旧数据。

### 5.2 回滚

- 迁移在独立事务/独立数据库名（`zhiyue-lingsi-v5`）中执行；成功后才切换读取源；
- 失败时删除新库，继续使用旧 blob，并提示用户导出备份；
- 旧 key 永不自动删除，直到用户手动清理。

### 5.3 迁移测试用例

| 用例 | 断言 |
|---|---|
| 空库 | 走种子流程，schemaVersion=5 |
| 仅笔记无帖子 | 不产生孤立关联 |
| 笔记 + 同内容帖子 | 正确关联为 note 型 |
| 两条同内容帖子 | 取最新，报告冲突 |
| 含笔记互动 | 丢弃并计数 |
| 章节缺失 ordinal | 自动补齐且连续 |
| 迁移中途抛错 | 回滚，旧数据可用 |

## 6. 对账与清理任务

| 任务 | 频率 | 内容 |
|---|---|---|
| 计数对账 | 每日 | 重算 like/comment/collect，修正漂移并告警 |
| 软删清理 | 每日 | `deleted_at < now() - 30d` 物理删除（级联） |
| 语料重建 | 手动/内容变更 | 按 hash 增量重建 chunks 与 embedding |
| 配额重置 | 每日 00:00 | 新的一天由 `ai_quota_daily` 主键自然切换 |
| 备份 | 每日 | 数据库 dump + 文件，保留 14 天 |

## 7. 与当前实现的差异

| 当前 | 目标 | 迁移动作 |
|---|---|---|
| `Book.chapters` 内嵌 | 独立 `chapters` 表 | 拆分并补 ordinal |
| `Post.stats` 嵌套 | 服务端列 + 本地仍嵌套 | Repository 映射 |
| `tags: string[]` | `topics`/`postTopics` | 实体化 |
| 笔记发布复制帖子 | 引用型帖子 | 关联历史数据 |
| 硬删除 | 软删 | 加 `deletedAt`，查询过滤 |
| 无来源字段 | `source` 必填 | 默认 `unverified` + 人工复核 |
| 笔记可点赞 | 仅帖子可互动 | 丢弃笔记互动 |