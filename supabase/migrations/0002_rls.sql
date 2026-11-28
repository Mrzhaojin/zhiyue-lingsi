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
drop policy if exists admin_config_write on public.admin_config for all
  using (public.is_admin()) with check (public.is_admin());

-- 函数执行权限
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.can_read_post(text) to anon, authenticated;
grant execute on function public.owns_thread(text) to authenticated;