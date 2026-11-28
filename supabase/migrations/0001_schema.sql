-- M2 / 0001: 云端 schema（与本地 v2 数据形状对齐）
-- 运行方式：Supabase Dashboard → SQL Editor 粘贴执行，或 supabase db push
create extension if not exists pgcrypto;


-- 兼容项目里已有的模板表（posts/users/comments 结构与目标不一致）：
-- 仅在空表时自动改名为 legacy_*，非空则直接报错要求人工处理，避免误删数据。
do $
declare
  r record;
  v_count bigint;
begin
  for r in
    select * from (values
      ('posts', 'author_id'),
      ('comments', 'content_text'),
      ('users', 'username')
    ) as t(tbl, marker_col)
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = r.tbl)
       and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tbl and column_name = r.marker_col)
    then
      execute format('select count(*) from public.%I', r.tbl) into v_count;
      if v_count > 0 then
        raise exception '表 % 结构与目标不一致且非空（% 行），请先备份并手动改名', r.tbl, v_count;
      end if;
      execute format('alter table public.%I rename to %I', r.tbl, 'legacy_' || r.tbl);
      raise notice '已把模板表 % 改名为 legacy_%（空表）', r.tbl, r.tbl;
    end if;
  end loop;
end $;
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