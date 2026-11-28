-- ============================================================
-- 智阅灵思 · M2 云端初始化（schema + RLS + RPC）
-- 使用方式：Supabase Dashboard → SQL Editor → 全选粘贴 → Run
-- 可重复执行：表用 if not exists，策略先 drop 再建，函数用 create or replace
-- 若已有同名模板表（posts/comments）结构与目标不一致，会自动改名为 legacy_*（数据保留）
-- ============================================================

-- M2 / 0001: 云端 schema（与本地 v2 数据形状对齐）
-- 运行方式：Supabase Dashboard → SQL Editor 粘贴执行，或 supabase db push
create extension if not exists pgcrypto;


-- 兼容项目里已有的模板表（posts/users/comments 结构与目标不一致）：
-- 仅在空表时自动改名为 legacy_*，非空则直接报错要求人工处理，避免误删数据。
do $$
declare
  r record;
  v_count bigint;
  v_target text;
begin
  for r in
    select * from (values
      ('posts', 'author_id'),
      ('comments', 'content_text')
    ) as t(tbl, marker_col)
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = r.tbl)
       and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = r.marker_col)
    then
      execute format('select count(*) from public.%I', r.tbl) into v_count;
      v_target := 'legacy_' || r.tbl;
      if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = v_target) then
        v_target := v_target || '_' || to_char(now(), 'YYYYMMDDHH24MISS');
      end if;
      execute format('alter table public.%I rename to %I', r.tbl, v_target);
      raise notice '模板表 % 已改名为 %（% 行，数据保留）', r.tbl, v_target, v_count;
    end if;
  end loop;
end $$;
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- 账号与资料 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '读者',
  avatar_url text,
  bio text not null default '',
  profile_tag text,
  role text not null default 'user' check (role in ('user','admin')),
  stats jsonb not null default '{"readingMinutes":0,"postsCount":0,"notesCount":0,"followersCount":0,"followingCount":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  reading jsonb not null default '{"fontSize":17,"lineHeight":1.9,"textColor":"#1f2937","backgroundColor":"#ffffff","fontFamily":"sans"}'::jsonb,
  notifications jsonb not null default '{"like":true,"comment":true,"collect":true}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 新用户自动建资料与设置
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nickname', ''), '读者'))
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 书库 ----------
create table if not exists public.books (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  author text not null,
  category text not null,
  difficulty text not null,
  cover_url text,
  summary text not null default '',
  recommended_heat integer not null default 0,
  ai_reason text not null default '',
  has_audio_intro boolean not null default false,
  audio_intro_url text,
  language text not null check (language in ('zh','en')),
  source jsonb not null default '{"type":"excerpt","title":"未标注","license":"unverified","attribution":"待复核"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id text primary key default gen_random_uuid()::text,
  book_id text not null references public.books(id) on delete cascade,
  ordinal integer not null,
  title text not null,
  content text not null default '',
  unique (book_id, ordinal)
);
create index if not exists chapters_book_idx on public.chapters (book_id, ordinal);

create table if not exists public.tags (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  icon text,
  cover_url text,
  created_at timestamptz not null default now()
);

-- ---------- 社区内容 ----------
create table if not exists public.posts (
  id text primary key default gen_random_uuid()::text,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'original' check (kind in ('original','note')),
  note_id text,
  title text not null,
  content_text text not null default '',
  image_urls text[] not null default '{}',
  tags text[] not null default '{}',
  stats jsonb not null default '{"likes":0,"comments":0,"collects":0,"views":0,"shares":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists posts_created_idx on public.posts (created_at desc) where deleted_at is null;
create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists posts_kind_idx on public.posts (kind) where deleted_at is null;

create table if not exists public.notes (
  id text primary key default gen_random_uuid()::text,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content_text text not null default '',
  image_urls text[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published')),
  template text not null default 'minimal',
  share_card_data_url text,
  source jsonb,
  published_post_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists notes_author_idx on public.notes (author_id, updated_at desc);
create index if not exists notes_public_idx on public.notes (status) where deleted_at is null;

alter table public.posts drop constraint if exists posts_note_fk;
alter table public.posts add constraint posts_note_fk
  foreign key (note_id) references public.notes(id) on delete set null;
alter table public.notes drop constraint if exists notes_post_fk;
alter table public.notes add constraint notes_post_fk
  foreign key (published_post_id) references public.posts(id) on delete set null;

create table if not exists public.comments (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content_text text not null,
  image_urls text[] not null default '{}',
  parent_id text references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.interactions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('like','collect')),
  target_type text not null default 'post' check (target_type = 'post'),
  target_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, target_type, target_id)
);
create index if not exists interactions_target_idx on public.interactions (target_type, target_id);

-- ---------- 阅读与学习 ----------
create table if not exists public.shelves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table if not exists public.bookmarks (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create table if not exists public.reading_history (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  chapter_id text,
  progress numeric not null default 0 check (progress >= 0 and progress <= 1),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create table if not exists public.vocab (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('word','sentence')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('like','comment','collect','system','follow')),
  title text not null,
  body text not null default '',
  link jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- AI 记录与后台配置 ----------
create table if not exists public.ai_chat_threads (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '阅读AI对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id text primary key default gen_random_uuid()::text,
  thread_id text not null references public.ai_chat_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_thread_idx on public.ai_chat_messages (thread_id, created_at);

create table if not exists public.ai_analysis_records (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id text,
  chapter_id text,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_config (
  id text primary key default 'global',
  pinned_post_ids text[] not null default '{}',
  featured_post_ids text[] not null default '{}',
  banned_keywords text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.admin_config (id) values ('global') on conflict (id) do nothing;

-- ---------- updated_at 触发器 ----------
do $$
declare
  t text;
begin
  foreach t in array array['profiles','user_settings','books','posts','notes','ai_chat_threads','admin_config'] loop
    execute format('drop trigger if exists touch_%s on public.%s', t, t);
    execute format('create trigger touch_%s before update on public.%s for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
-- M2 / 0002: RLS 策略
-- 原则：公共内容可读；写入只能写自己；后台配置只读、仅管理员写；软删内容对普通用户不可见。

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.can_read_post(p_post_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.deleted_at is null
      and (
        p.kind = 'original'
        or exists (
          select 1 from public.notes n
          where n.id = p.note_id and n.status = 'published' and n.deleted_at is null
        )
        or p.author_id = auth.uid()
      )
  )
$$;

create or replace function public.owns_thread(p_thread_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ai_chat_threads t where t.id = p_thread_id and t.user_id = auth.uid())
$$;

-- 防止用户改自己的 role / stats
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() 为空 = SQL Editor / service role，用于初始化管理员
  if auth.uid() is null then
    return new;
  end if;
  -- security definer 函数写统计前会打开这个事务级开关；普通客户端请求没有该开关。
  if current_setting('app.internal_profile_write', true) = 'on' then
    return new;
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'role 只能由管理员修改';
    end if;
    if new.stats is distinct from old.stats then
      raise exception 'stats 由系统维护，不能直接修改';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.tags enable row level security;
alter table public.posts enable row level security;
alter table public.notes enable row level security;
alter table public.comments enable row level security;
alter table public.interactions enable row level security;
alter table public.shelves enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reading_history enable row level security;
alter table public.vocab enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_chat_threads enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_analysis_records enable row level security;
alter table public.admin_config enable row level security;

-- ---------- profiles / settings ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_select_self on public.user_settings;
create policy settings_select_self on public.user_settings for select using (user_id = auth.uid());

drop policy if exists settings_update_self on public.user_settings;
create policy settings_update_self on public.user_settings for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 书库：公共只读，管理员写 ----------
drop policy if exists books_select on public.books;
create policy books_select on public.books for select using (true);
drop policy if exists books_write_admin on public.books;
create policy books_write_admin on public.books for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists chapters_select on public.chapters;
create policy chapters_select on public.chapters for select using (true);
drop policy if exists chapters_write_admin on public.chapters;
create policy chapters_write_admin on public.chapters for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select using (true);
drop policy if exists tags_write_admin on public.tags;
create policy tags_write_admin on public.tags for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 帖子 ----------
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select using (
  (
    deleted_at is null
    and (
      kind = 'original'
      or exists (
        select 1 from public.notes n
        where n.id = posts.note_id and n.status = 'published' and n.deleted_at is null
      )
    )
  )
  or author_id = auth.uid()
  or public.is_admin()
);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert
  with check (author_id = auth.uid() and kind = 'original');

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update
  using (author_id = auth.uid() and kind = 'original')
  with check (author_id = auth.uid() and kind = 'original');

drop policy if exists posts_update_admin on public.posts;
create policy posts_update_admin on public.posts for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 笔记 ----------
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select using (
  (status = 'published' and deleted_at is null)
  or author_id = auth.uid()
  or public.is_admin()
);

drop policy if exists notes_insert_own on public.notes;
create policy notes_insert_own on public.notes for insert
  with check (author_id = auth.uid());

drop policy if exists notes_update_own on public.notes;
create policy notes_update_own on public.notes for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists notes_update_admin on public.notes;
create policy notes_update_admin on public.notes for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 评论 ----------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (
  deleted_at is null and (public.can_read_post(post_id) or public.is_admin())
);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments for insert
  with check (author_id = auth.uid() and public.can_read_post(post_id));

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists comments_update_admin on public.comments;
create policy comments_update_admin on public.comments for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 互动：只落帖子 ----------
drop policy if exists interactions_select_own on public.interactions;
create policy interactions_select_own on public.interactions for select using (user_id = auth.uid());

drop policy if exists interactions_insert_own on public.interactions;
create policy interactions_insert_own on public.interactions for insert
  with check (user_id = auth.uid() and public.can_read_post(target_id));

drop policy if exists interactions_delete_own on public.interactions;
create policy interactions_delete_own on public.interactions for delete using (user_id = auth.uid());

-- ---------- 阅读与学习：仅本人 ----------
drop policy if exists shelves_own on public.shelves;
create policy shelves_own on public.shelves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reading_history_own on public.reading_history;
create policy reading_history_own on public.reading_history for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists vocab_own on public.vocab;
create policy vocab_own on public.vocab for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- AI 私有数据 ----------
drop policy if exists threads_own on public.ai_chat_threads;
create policy threads_own on public.ai_chat_threads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists messages_own on public.ai_chat_messages;
create policy messages_own on public.ai_chat_messages for all
  using (user_id = auth.uid() and public.owns_thread(thread_id))
  with check (user_id = auth.uid() and public.owns_thread(thread_id));

drop policy if exists analyses_own on public.ai_analysis_records;
create policy analyses_own on public.ai_analysis_records for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 后台配置：公共可读，管理员写 ----------
drop policy if exists admin_config_select on public.admin_config;
create policy admin_config_select on public.admin_config for select using (true);
drop policy if exists admin_config_write on public.admin_config;
create policy admin_config_write on public.admin_config for all
  using (public.is_admin()) with check (public.is_admin());

-- 函数执行权限
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_read_post(text) to anon, authenticated;
grant execute on function public.owns_thread(text) to authenticated;
-- M2 / 0003: 服务端 RPC（计数、发布、软删、对账）
-- 计数写入集中在 security definer 函数里，客户端无法直接伪造 stats。

create or replace function public.adjust_author_stat(p_user uuid, p_field text, p_delta int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field not in ('postsCount','notesCount') then
    raise exception '非法统计字段: %', p_field;
  end if;
  perform set_config('app.internal_profile_write', 'on', true);
  update public.profiles
  set stats = jsonb_set(
    stats,
    array[p_field],
    to_jsonb(greatest(0, coalesce((stats->>p_field)::int, 0) + p_delta))
  )
  where id = p_user;
  perform set_config('app.internal_profile_write', 'off', true);
end $$;

create or replace function public.publish_note(p_note_id text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_note public.notes;
  v_post_id text;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_note from public.notes where id = p_note_id and deleted_at is null;
  if not found then raise exception '笔记不存在或已删除'; end if;
  if v_note.author_id <> v_user and not public.is_admin() then raise exception '只能发布自己的笔记'; end if;

  if v_note.published_post_id is not null then
    update public.posts
    set deleted_at = null, title = v_note.title, tags = v_note.tags, updated_at = now()
    where id = v_note.published_post_id
    returning id into v_post_id;
  end if;

  if v_post_id is null then
    insert into public.posts (author_id, kind, note_id, title, content_text, tags)
    values (v_note.author_id, 'note', v_note.id, v_note.title, '', v_note.tags)
    returning id into v_post_id;
    perform public.adjust_author_stat(v_note.author_id, 'postsCount', 1);
  end if;

  update public.notes
  set status = 'published', published_post_id = v_post_id, updated_at = now()
  where id = v_note.id;

  return v_post_id;
end $$;

create or replace function public.unpublish_note(p_note_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_note public.notes;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_note from public.notes where id = p_note_id and deleted_at is null;
  if not found then raise exception '笔记不存在或已删除'; end if;
  if v_note.author_id <> v_user and not public.is_admin() then raise exception '只能取消发布自己的笔记'; end if;

  if v_note.published_post_id is not null then
    update public.posts set deleted_at = now(), updated_at = now()
    where id = v_note.published_post_id and deleted_at is null;
    perform public.adjust_author_stat(v_note.author_id, 'postsCount', -1);
  end if;

  update public.notes set status = 'draft', updated_at = now() where id = v_note.id;
end $$;

create or replace function public.soft_delete_post(p_post_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_post public.posts;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_post from public.posts where id = p_post_id and deleted_at is null;
  if not found then return; end if;
  if v_post.author_id <> v_user and not public.is_admin() then raise exception '无权删除该帖子'; end if;
  update public.posts set deleted_at = now(), updated_at = now() where id = p_post_id;
  if v_post.kind = 'original' then
    perform public.adjust_author_stat(v_post.author_id, 'postsCount', -1);
  end if;
end $$;

create or replace function public.soft_delete_note(p_note_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_note public.notes;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_note from public.notes where id = p_note_id and deleted_at is null;
  if not found then return; end if;
  if v_note.author_id <> v_user and not public.is_admin() then raise exception '无权删除该笔记'; end if;
  update public.notes set deleted_at = now(), updated_at = now() where id = p_note_id;
  if v_note.published_post_id is not null then
    update public.posts set deleted_at = now(), updated_at = now()
    where id = v_note.published_post_id and deleted_at is null;
    perform public.adjust_author_stat(v_note.author_id, 'postsCount', -1);
  end if;
  perform public.adjust_author_stat(v_note.author_id, 'notesCount', -1);
end $$;

create or replace function public.restore_post(p_post_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_post public.posts;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_post from public.posts where id = p_post_id and deleted_at is not null;
  if not found then return; end if;
  if v_post.author_id <> v_user and not public.is_admin() then raise exception '无权恢复该帖子'; end if;
  update public.posts set deleted_at = null, updated_at = now() where id = p_post_id;
  if v_post.kind = 'original' then
    perform public.adjust_author_stat(v_post.author_id, 'postsCount', 1);
  end if;
end $$;

create or replace function public.restore_note(p_note_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_note public.notes;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_note from public.notes where id = p_note_id and deleted_at is not null;
  if not found then return; end if;
  if v_note.author_id <> v_user and not public.is_admin() then raise exception '无权恢复该笔记'; end if;
  update public.notes set deleted_at = null, updated_at = now() where id = p_note_id;
  if v_note.published_post_id is not null then
    update public.posts set deleted_at = null, updated_at = now() where id = v_note.published_post_id;
    perform public.adjust_author_stat(v_note.author_id, 'postsCount', 1);
  end if;
  perform public.adjust_author_stat(v_note.author_id, 'notesCount', 1);
end $$;

create or replace function public.toggle_interaction(p_kind text, p_target_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_active boolean;
  v_field text;
  v_delta int;
begin
  if v_user is null then raise exception '未登录'; end if;
  if p_kind not in ('like','collect') then raise exception '非法互动类型'; end if;
  if not public.can_read_post(p_target_id) then raise exception '帖子不存在或不可见'; end if;

  select exists (
    select 1 from public.interactions
    where user_id = v_user and kind = p_kind and target_type = 'post' and target_id = p_target_id
  ) into v_active;

  v_field := case when p_kind = 'like' then 'likes' else 'collects' end;
  if v_active then
    delete from public.interactions
    where user_id = v_user and kind = p_kind and target_type = 'post' and target_id = p_target_id;
    v_delta := -1;
  else
    insert into public.interactions (user_id, kind, target_type, target_id)
    values (v_user, p_kind, 'post', p_target_id);
    v_delta := 1;
  end if;

  update public.posts
  set stats = jsonb_set(
    stats,
    array[v_field],
    to_jsonb(greatest(0, coalesce((stats->>v_field)::int, 0) + v_delta))
  )
  where id = p_target_id;

  return not v_active;
end $$;

create or replace function public.increment_post_view(p_post_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_read_post(p_post_id) then return; end if;
  update public.posts
  set stats = jsonb_set(stats, array['views'], to_jsonb(coalesce((stats->>'views')::int, 0) + 1))
  where id = p_post_id;
end $$;

create or replace function public.add_comment(p_post_id text, p_content text, p_parent_id text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id text;
begin
  if v_user is null then raise exception '未登录'; end if;
  if not public.can_read_post(p_post_id) then raise exception '帖子不存在或不可见'; end if;
  if length(btrim(p_content)) = 0 then raise exception '评论不能为空'; end if;

  insert into public.comments (post_id, author_id, content_text, parent_id)
  values (p_post_id, v_user, p_content, p_parent_id)
  returning id into v_id;

  update public.posts
  set stats = jsonb_set(stats, array['comments'], to_jsonb(coalesce((stats->>'comments')::int, 0) + 1))
  where id = p_post_id;

  return v_id;
end $$;

create or replace function public.soft_delete_comment(p_comment_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_comment public.comments;
begin
  if v_user is null then raise exception '未登录'; end if;
  select * into v_comment from public.comments where id = p_comment_id and deleted_at is null;
  if not found then return; end if;
  if v_comment.author_id <> v_user and not public.is_admin() then raise exception '无权删除该评论'; end if;
  update public.comments set deleted_at = now() where id = p_comment_id;
  update public.posts
  set stats = jsonb_set(stats, array['comments'], to_jsonb(greatest(0, coalesce((stats->>'comments')::int, 0) - 1)))
  where id = v_comment.post_id;
end $$;

create or replace function public.reconcile_counters() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_fixed int := 0;
  v_post record;
begin
  if not public.is_admin() then raise exception '仅管理员可对账'; end if;
  for v_post in select * from public.posts loop
    update public.posts p
    set stats = jsonb_set(
      jsonb_set(
        jsonb_set(p.stats, array['likes'], to_jsonb((select count(*) from public.interactions i where i.target_id = p.id and i.kind = 'like'))),
        array['collects'],
        to_jsonb((select count(*) from public.interactions i where i.target_id = p.id and i.kind = 'collect'))
      ),
      array['comments'],
      to_jsonb((select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null))
    )
    where p.id = v_post.id
      and p.stats is distinct from jsonb_set(
        jsonb_set(
          jsonb_set(p.stats, array['likes'], to_jsonb((select count(*) from public.interactions i where i.target_id = p.id and i.kind = 'like'))),
          array['collects'],
          to_jsonb((select count(*) from public.interactions i where i.target_id = p.id and i.kind = 'collect'))
        ),
        array['comments'],
        to_jsonb((select count(*) from public.comments c where c.post_id = p.id and c.deleted_at is null))
      );
    if found then
      v_fixed := v_fixed + 1;
    end if;
  end loop;
  return v_fixed;
end $$;

revoke all on function public.adjust_author_stat(uuid, text, int) from public;
grant execute on function public.publish_note(text) to authenticated;
grant execute on function public.unpublish_note(text) to authenticated;
grant execute on function public.soft_delete_post(text) to authenticated;
grant execute on function public.soft_delete_note(text) to authenticated;
grant execute on function public.restore_post(text) to authenticated;
grant execute on function public.restore_note(text) to authenticated;
grant execute on function public.toggle_interaction(text, text) to authenticated;
grant execute on function public.increment_post_view(text) to anon, authenticated;
grant execute on function public.add_comment(text, text, text) to authenticated;
grant execute on function public.soft_delete_comment(text) to authenticated;
grant execute on function public.reconcile_counters() to authenticated;