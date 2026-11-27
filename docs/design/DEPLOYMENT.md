# 部署设计（腾讯云 + 宝塔）

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 目标 | 邀请制 ≤50 用户；单机；可备份、可回滚 |
| 输入 | Q6（腾讯云 + 宝塔）、Q8（本地不加密）、SRS FR-I6~I9 |

---

## 1. 拓扑

```text
Internet
   │ 443 (HTTPS)
   ▼
┌──────────── 腾讯云 CVM（Ubuntu 22.04，2C4G）────────────┐
│  宝塔面板（仅内网/白名单访问）                            │
│  Nginx（宝塔站点）                                        │
│    ├─ /            → /www/wwwroot/zhiyue/current/dist     │
│    ├─ /api/*       → 127.0.0.1:8787（BFF，SSE）           │
│    └─ /healthz     → 127.0.0.1:8787/healthz               │
│  Node 20 LTS + PM2 / 宝塔 Node 项目管理 BFF               │
└───────────────────────────┬──────────────────────────────┘
                            │ 出站 HTTPS
                            ▼
        Supabase（Auth / Postgres / Storage）  +  模型 API（方舟/Embedding）
```

要点：

- BFF 只监听 `127.0.0.1:8787`，不直接暴露公网；
- Supabase 与模型供应商均为外部托管，密钥只在 BFF 的 env 中；
- 静态站点与 BFF 同域，避免 CORS 与 Cookie 问题；
- 50 用户规模不需要负载均衡与缓存集群。

## 2. 目录与发布

```text
/www/wwwroot/zhiyue/
  releases/
    20261127-1/dist/        # 前端构建产物
    20261127-1/server/      # BFF 代码（可选，或单独目录）
  current -> releases/20261127-1
  shared/
    env/bff.env             # chmod 600，含模型与 Supabase service key
    logs/
/www/backup/                # 本机备份暂存
```

发布流程：

1. 本地 `npm run verify` 全绿；
2. `npm run build`，上传 `dist` 到新 release 目录；
3. BFF 拉取代码 → `npm ci --omit=dev` → `pm2 reload zhiyue-bff`；
4. `ln -sfn releases/<new> current` 原子切换；
5. 访问 `/healthz` 与首页，失败则切回上一个 release。

保留最近 3 个 release，磁盘不足时自动清理更早的。

## 3. Nginx 关键配置

```nginx
server {
  listen 443 ssl http2;
  server_name zhiyue.example.com;
  root /www/wwwroot/zhiyue/current/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Request-Id $request_id;
    proxy_buffering off;          # SSE 必须关闭缓冲
    proxy_cache off;
    proxy_read_timeout 300s;
  }

  location = /healthz {
    proxy_pass http://127.0.0.1:8787/healthz;
    access_log off;
  }

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

CSP：当前 UI 大量内联样式，先只加 `frame-ancestors 'none'` 与 `base-uri 'self'`；
待 M4 清理内联样式后再启用完整 CSP（`default-src 'self'; connect-src 'self'; img-src 'self' data: https:`）。

## 4. BFF 运行

- Node 20 LTS；进程名 `zhiyue-bff`；`pm2 start server/index.js --name zhiyue-bff`；
- env 文件 `shared/env/bff.env`，权限 600，内容不回显到日志；
- 启动时校验必需变量，缺失直接退出（fail-fast）；
- `/healthz` 返回 `{ ok, db, ai, version, uptime }`；数据库或模型不可用时 `ok=false`；
- 日志：pino JSON，按天轮转，保留 14 天；不记录 prompt 与用户正文。

### 环境变量清单

| 变量 | 位置 | 说明 |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | 前端构建 | 公开密钥，受 RLS 约束 |
| `SUPABASE_SERVICE_ROLE_KEY` | BFF only | 禁止下发到前端 |
| `DATABASE_URL` | BFF only | 若改用自建 Postgres |
| `ARK_API_KEY` / `ARK_MODEL` | BFF only | 模型调用 |
| `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | BFF only | RAG 向量化 |
| `AI_DAILY_REQUESTS` / `AI_DAILY_TOKENS` | BFF | 每用户每日配额 |
| `APP_ORIGIN` | BFF | 用于 CORS/重置密码回跳 |

## 5. 备份与恢复

**备份（每日 03:00，宝塔计划任务）**：

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F-%H%M)
# 1) 数据库
pg_dump "$DATABASE_URL" | gzip > /www/backup/db-$STAMP.sql.gz
# 2) 配置与 BFF env
tar czf /www/backup/config-$STAMP.tar.gz -C /www/wwwroot/zhiyue/shared env
# 3) 上传到腾讯云 COS（凭证仅 root 可读）
coscmd upload /www/backup/db-$STAMP.sql.gz /backups/
coscmd upload /www/backup/config-$STAMP.tar.gz /backups/
# 4) 本地保留 14 天
find /www/backup -name '*.gz' -mtime +14 -delete
```

若继续使用 Supabase Postgres，可用 Supabase 自带备份 + 每周 `pg_dump` 双保险。

**恢复演练（每月一次，记录到 `docs/ops/RESTORE-DRILL.md`）**：

1. 在测试库执行 `gunzip -c db-*.sql.gz | psql $TEST_DATABASE_URL`；
2. 校验关键表行数（profiles/posts/notes）；
3. 用测试环境启动 BFF 与前端，走一遍登录/发帖/阅读；
4. 记录耗时与问题；失败则修正脚本。

## 6. 安全基线

| 项 | 要求 |
|---|---|
| 防火墙 | 仅开放 22/80/443；宝塔面板端口改非默认并限制来源 IP |
| SSH | 禁用 root 密码登录，仅密钥；fail2ban |
| 证书 | 宝塔 Let's Encrypt 自动续期；强制 HTTPS + HSTS |
| 密钥 | 仅 BFF env（600）；前端无模型密钥；GitHub 开 secret scanning + gitleaks CI |
| 数据库 | RLS 全表启用；service role 只在 BFF；备份文件加密存储 |
| 依赖 | 每月 `npm audit`；升级前跑 `npm run verify` |
| 日志 | 不落 prompt/正文；保留 14 天；访问日志含 requestId |

## 7. 监控与告警

- Uptime：外部探活 `https://域名/healthz`（5 分钟）；
- 应用：`/api/metrics`（仅内网）暴露请求量、错误率、AI 配额消耗；
- 告警：连续 3 次探活失败、错误率 >5%、当日 AI 成本超预算 → 邮件/企业微信；
- 磁盘：>80% 告警（备份与日志是主要增长源）。

## 8. 成本估算（月）

| 项 | 估算 |
|---|---|
| CVM 2C4G + 带宽 | ¥60–120 |
| 域名 + 证书 | ¥5–10（证书免费） |
| Supabase | 免费档或 $25 |
| 模型 API（50 人 × 20 次/日） | 按量，设日预算上限后可控 |
| COS 备份 | <¥5 |

## 9. 与需求的对应

| 需求 | 落点 |
|---|---|
| FR-I6 可部署 | 本文第 2–4 节 |
| FR-I7 健康检查 | `/healthz` + 外部探活 |
| FR-I8 腾讯云宝塔 | 第 1–3 节 |
| FR-I9 备份恢复 | 第 5 节 + 月度演练 |
| NFR-3 安全 | 第 6 节 |