# RAG 设计（检索增强问答）

| 项目 | 内容 |
|---|---|
| 版本 | v1.0 |
| 依赖 | [数据模型](./DATA-MODEL.md) 的 `corpus_chunks/citations`；[模块契约](./MODULES.md) 的 `askAssistant` |
| 范围 | 语料、切分、索引、检索、引用、评测、降级 |

---

## 1. 目标与非目标

**目标**：回答必须基于书库/笔记内容，并给出可点击的引用；无依据时明确拒答。

**非目标**：不做开放域搜索；不做多跳推理；不做全文语义搜索 UI（先服务问答）。

## 2. 语料

| 来源 | 范围 | 更新时机 |
|---|---|---|
| 书章节 | 公版/授权内容（`books.source_type != 'excerpt'` 才入索引） | 书/章节变更 |
| 已发布笔记 | `status='published'` 且未删除 | 发布/编辑/取消发布 |

> `books.source_type` 语义：`public-domain`（公版全文/摘录，可入索引）、`authorized`（已授权，可入索引）、
> `excerpt`（未核实版权的演示摘录，**不入索引**）。迁移把历史演示书目标为 `excerpt`，人工复核后再改。

不进入索引：草稿、私密笔记、评论、用户资料。

## 3. 切分（Chunking）

- 以段落为最小单位，合并到 **300–450 tokens**，相邻块重叠 **60 tokens**；
- 保留定位信息：`sourceType, sourceId, ordinal, chapterId, paragraphStart, paragraphEnd`；
- 每块计算 `hash = sha256(normalizedText)`，用于增量重建与去重；
- 过短块（<50 tokens）与目录/版权页不索引；
- 语言以书/笔记语言为准，混合语言按段落切分。

## 4. 向量与索引

- `EmbeddingProvider` 接口：`embed(texts: string[]): Promise<number[][]>`，默认模型可配置，维度 1536；
- 批量 ≤64 条/请求，失败重试 2 次（指数退避），仍失败则标记该批次待重试；
- 存储：`corpus_chunks.embedding vector(1536)`，HNSW（cosine）；同时建 `to_tsvector('simple', text)` 的 GIN 索引；
- 增量：按 `hash` 比对，内容未变则跳过；删除源内容时删除其 chunks；
- 重建：`npm run index:rebuild`（脚本，M3 实现），先写新表再切换，失败保留旧索引。

## 5. 检索

```text
query
  ├─ 向量检索：top 30（cosine）
  ├─ 关键词检索：top 30（ts_rank）
  └─ RRF 融合（k=60）→ 去重 → 可选 rerank → top 8
```

过滤条件：

- 默认只检索「书 + 已发布笔记」；
- 若当前在阅读页，优先该书（`bookId` 加权 1.2）；
- 用户自己的笔记加权 1.1；
- 管理员可关闭某本书的索引（内容复核中）。

阈值：融合分数 < 0.02 视为无命中；命中 < 2 条时拒答。

## 6. 生成与引用

### 6.1 Prompt 结构

```text
system: 你是阅读助手。只依据给定资料回答；资料不足时明确说“资料中没有”。
        每个结论后用 [n] 标注来源；禁止编造引用。
user:
  【资料】
  [1] 《书名》· 第三章：……
  [2] 笔记《……》：……
  【问题】……
```

### 6.2 输出协议（SSE）

```text
event: delta
data: {"text":"……"}

event: citations
data: {"items":[{"chunkId":"…","quote":"…","sourceTitle":"…","locator":"…","score":0.82}]}

event: done
data: {"messageId":"…","tokensOut":312,"latencyMs":1840}

event: error
data: {"code":"UNAVAILABLE","message":"…","retryable":true}
```

### 6.3 引用校验

1. 模型输出的 `[n]` 必须对应资料编号；
2. 引用片段（quote）必须是 `chunk.text` 的**子串**（归一化空白后）；否则丢弃该引用并记录 `citation_invalid`；
3. 回答中无有效引用且非拒答 → 标记 `ungrounded`，返回给前端时提示“未找到可靠出处”；
4. 引用数量上限 5 条，按分数排序。

## 7. 索引流水线

```text
内容变更（发布/编辑/删除）
  → 写入 index_jobs（bookId/noteId, 类型, 版本）
  → worker 取任务 → 切分 → hash 比对 → embed → upsert chunks → 清理过期 chunks
  → 记录 job 状态与耗时
```

- worker 与 BFF 同进程（单人运维），用内存队列 + 数据库任务表保证重启可恢复；
- 同一源串行处理，避免并发写乱序；
- 失败重试 3 次后标 `failed`，管理后台可见并可手动重跑。

## 8. 评测

### 8.1 黄金集（30 条）

| 类别 | 数量 | 示例 |
|---|---|---|
| 事实定位 | 10 | “《1984》里老大哥的海报出现在第几章？” |
| 跨章节综合 | 5 | “这本书对‘自由’的定义前后有什么变化？” |
| 笔记检索 | 5 | “我关于《活着》的笔记里提到的三个关键词是什么？” |
| 应拒答 | 5 | “这本书的作者对量子计算的看法？”（资料中没有） |
| 引用正确性 | 5 | 给定回答，判断引用片段是否真的支持结论 |

### 8.2 指标与阈值

| 指标 | 定义 | 阈值 |
|---|---|---|
| Recall@8 | 黄金证据块是否在检索结果中 | ≥0.80 |
| Citation precision | 引用片段确实支持结论的比例 | ≥0.90 |
| Refusal accuracy | 应拒答的题目正确拒答 | ≥0.90 |
| Groundedness | 回答结论有引用支撑的比例 | ≥0.90 |
| 首 token P95 | 从请求到首个 delta | ≤2.0s |
| 端到端 P95 | 完成一次问答 | ≤8.0s |

评测脚本（M3 实现）：`npm run eval:rag`（离线数据集 + 人工抽检），结果写入 `docs/design/RAG-EVAL.md`，每次改 prompt/模型/切分都跑。

## 9. 失败与降级

| 场景 | 行为 |
|---|---|
| 向量服务不可用 | 退化为关键词检索；仍失败则明确报错 |
| 无命中 | 明确回答“资料中没有”，不编造 |
| 引用校验失败 | 丢弃引用并标注未找到出处 |
| 配额不足 | 429 + 重置时间；不进入模型调用 |
| 模型超时 | 20s 超时，前端可重试；失败不计成功用量 |
| 索引落后 | 回答标注“索引更新中”，并返回可用的旧结果 |

## 10. 隐私与成本

- 发送给模型的内容仅限：检索到的 chunks + 用户问题 + 最近 6 轮对话；
- 不发送用户邮箱、id、设备信息；
- 日志不落 prompt 原文，只记录长度、chunk 数、模型与耗时；
- 每次问答记录 `tokens_in/out` 与估算成本；配额见 [MODULES](./MODULES.md) 与 SRS FR-E7；
- 分析类请求按 `(textHash, promptVersion, model)` 缓存，命中不计费。