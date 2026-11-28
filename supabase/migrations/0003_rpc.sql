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