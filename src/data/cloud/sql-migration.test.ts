// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

type AnyRow = Record<string, unknown>
const rowsOf = (result: { rows: unknown[] }): AnyRow[] => result.rows as AnyRow[]

const SQL = readFileSync('supabase/all-in-one.sql', 'utf8').replace(/create extension if not exists pgcrypto;/i, '')
const SEED = readFileSync('supabase/seed.sql', 'utf8')

const PRELUDE = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.uid', true), '')::uuid $$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
`

async function setup() {
  const db = new PGlite()
  await db.exec(PRELUDE)
  await db.exec(SQL)
  await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111','a@example.com','{"nickname":"测试A"}'::jsonb)`)
  await db.exec(`insert into public.books (id,title,author,category,difficulty,language) values ('b1','红楼梦','曹雪芹','小说','中级','zh')`)
  await db.exec(`set request.jwt.uid = '11111111-1111-1111-1111-111111111111'`)
  await db.exec('set role authenticated')
  return db
}

describe('云端 SQL 迁移（PGlite 真实执行）', () => {
  it('建表、触发器、发布、互动计数与 RLS 都按设计工作', async () => {
    const db = await setup()

    const profile = await db.query(`select nickname from public.profiles where id='11111111-1111-1111-1111-111111111111'`)
    expect(rowsOf(profile)).toEqual([{ nickname: '测试A' }])

    await db.exec(`insert into public.notes (id,author_id,title,content_text,status) values ('n1','11111111-1111-1111-1111-111111111111','测试笔记','正文','draft')`)
    const published = await db.query(`select public.publish_note('n1') as id`)
    expect(rowsOf(published)[0].id).toBeTruthy()

    const postId = String(rowsOf(published)[0].id)
    await db.exec(`select public.toggle_interaction('like','${postId}')`)
    const stats = await db.query(`select stats from public.posts where id='${postId}'`)
    expect(rowsOf(stats)[0].stats).toMatchObject({ likes: 1 })

    let blocked = false
    try {
      await db.exec(`update public.profiles set role='admin' where id='11111111-1111-1111-1111-111111111111'`)
    } catch {
      blocked = true
    }
    expect(blocked).toBe(true)

    await db.exec('reset role')
    await db.exec(`set request.jwt.uid = ''`)
    await db.exec('set role anon')
    const notes = await db.query('select id from public.notes')
    const posts = await db.query('select id from public.posts')
    expect(rowsOf(notes)).toHaveLength(1)
    expect(rowsOf(posts)).toHaveLength(1)

    await db.exec('reset role')
    await db.exec(`update public.profiles set role='admin' where id='11111111-1111-1111-1111-111111111111'`)
    await db.exec(`set request.jwt.uid = '11111111-1111-1111-1111-111111111111'`)
    await db.exec('set role authenticated')
    const reconciled = await db.query('select public.reconcile_counters() as fixed')
    expect(Number(rowsOf(reconciled)[0].fixed)).toBeGreaterThanOrEqual(0)
  })

  it('seed.sql 可在迁移后执行', async () => {
    const db = new PGlite()
    await db.exec(PRELUDE)
    await db.exec(SQL)
    await db.exec(SEED)
    await db.exec(SEED)
    const books = await db.query('select count(*)::int as count from public.books')
    const chapters = await db.query('select count(*)::int as count from public.chapters')
    expect(Number(rowsOf(books)[0].count)).toBe(3)
    expect(Number(rowsOf(chapters)[0].count)).toBe(3)
  })

  it('迁移可重复执行（幂等）', async () => {
    const db = new PGlite()
    await db.exec(PRELUDE)
    await db.exec(SQL)
    await db.exec(SQL)
    const tables = await db.query("select count(*)::int as count from information_schema.tables where table_schema='public'")
    expect(Number(rowsOf(tables)[0].count)).toBeGreaterThan(10)
    const chapters = await db.query("select count(*)::int as count from information_schema.tables where table_schema='public' and table_name='chapters'")
    expect(Number(rowsOf(chapters)[0].count)).toBe(1)
  })

  it('模板表非空时自动改名，数据不丢', async () => {
    const db = new PGlite()
    await db.exec(PRELUDE)
    await db.exec(`
      create table public.posts (id uuid primary key default gen_random_uuid(), title text, body text, created_at timestamptz default now());
      insert into public.posts (title, body) select 'template-' || g, 'body' from generate_series(1, 5) g;
      create table public.comments (id uuid primary key default gen_random_uuid(), post_id uuid, content text);
    `)
    await db.exec(SQL)

    const legacyPosts = await db.query('select count(*)::int as count from public.legacy_posts')
    expect(Number(rowsOf(legacyPosts)[0].count)).toBe(5)

    const legacyComments = await db.query("select table_name from information_schema.tables where table_schema='public' and table_name='legacy_comments'")
    expect(rowsOf(legacyComments)).toHaveLength(1)

    const authorColumn = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='posts' and column_name='author_id'")
    expect(rowsOf(authorColumn)).toHaveLength(1)
  })
})