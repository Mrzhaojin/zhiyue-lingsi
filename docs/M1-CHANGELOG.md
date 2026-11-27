# M1 变更记录：数据层迁移到 IndexedDB

> 日期：2026-11-27 ｜ 分支 `main` ｜ 对应 ADR-0002

## 目标

把「一个 localStorage JSON 存全站」换成「实体分表 + 精确写入 + 版本订阅」，并保证旧数据可迁移、可回滚。

## 做了什么

### 1. 存储

- 新增 `src/data/db/schema.ts`：`Database` 类型、默认管理配置、旧数据规范化、16 张表名。
- 新增 `src/data/db/persist.ts`：Dexie schema（每张表带索引）、全量导入、实体级 `applyOps`。
- 新增 `src/data/db/store.ts`：内存快照 + 版本号 + 订阅 + 串行写队列 + BroadcastChannel。
- 新增 `src/data/db/bootstrap.ts`：打开数据库、首次运行迁移或种子、条数校验、保留旧 key。

### 2. API

- `src/data/api.ts`：原有 50+ 个同步函数全部保留签名，内部改为「读快照 / 走 mutate + 登记操作」。
- `src/data/db.ts`：变成薄入口，导出 `initializeDatabase()`。
- 修掉一批旧问题：删除帖子/笔记的级联清理、计数回退、后台引用清理。

### 3. 响应式

- 新增 `useDatabaseVersion()`（`useSyncExternalStore`）。
- `WebShell` / `MobileShell` 统一订阅：任意写入后整棵页面树重渲染。
- 页面里按用户 id 缓存的列表补上版本依赖（AI 历史、赏析记录、生词本、消息、后台统计）。

### 4. 页面

- `ForumPage` 去掉 500ms 假加载与一次性快照 state，改为从实时快照派生。
- `FollowersPage` 删除「随机生成关注者」的假数据，改为明确的未实现说明。

### 5. 启动

- `App.tsx` 在渲染路由前 `await initializeDatabase()`；失败时显示可恢复的错误页（提示备份旧 key）。

## 验证

```text
npx tsc -b            0 error
npx eslint .          0 error（2 个既有 warning）
npx vitest run        2 files / 13 tests passed
npx vite build        OK（入口 899KB，gzip 259KB）
```

单测覆盖：种子初始化、身份绑定、按实体落盘、写入 bump 版本、删除级联、导出/导入、
非法导入拒绝、旧 localStorage 迁移（含旧 key 保留）。

浏览器验收（headless Chrome + CDP，真实点击）：

```text
db_created            = zhiyue-lingsi
url_after_login       = /
forum_posts_rendered  = true
like_before           = 点赞 89
like_after            = 点赞 90          ← 写后 UI 即时更新（旧版本此处不变）
indexeddb_counts      = { posts: 5, interactions: 1 }
like_after_reload     = 点赞 90          ← 刷新后仍存在（IndexedDB 持久化）
```

## 已知取舍

- 页面仍同步读取内存快照（M1.5 换成查询 hooks），但写入已经是实体级、异步落盘。
- 图片仍是 dataURL（但存 IndexedDB，配额远大于 localStorage）；压缩与 Blob 在 M1.5/M4。
- `BroadcastChannel` 的多标签页刷新已实现，尚未做自动化验证。

## 下一步（M1.5）

1. 图片压缩 + Blob 表 + `asset://` 引用；
2. 列表分页与索引查询，替换剩余的全表扫描；
3. 软删除 + 回收站；
4. 把页面从 `getDbSnapshot()` 迁到 `useQuery` 风格 hooks，彻底移除页面里的同步读。