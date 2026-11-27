# 设计文档索引

| 文档 | 内容 | 状态 |
|---|---|---|
| [DATA-MODEL](./DATA-MODEL.md) | Postgres/IndexedDB 表结构、约束、RLS、v4→v5 迁移与回滚 | v1.0 |
| [MODULES](./MODULES.md) | 分层、仓储接口、用例服务、错误模型、M1.5 路线 | v1.0 |
| [RAG](./RAG.md) | 语料、切分、混合检索、引用契约、评测与降级 | v1.0 |
| [DEPLOYMENT](./DEPLOYMENT.md) | 腾讯云 + 宝塔拓扑、Nginx、发布/回滚、备份与安全 | v1.0 |

相关决策：[ADR-0004](../adr/0004-note-post-reference.md)、[ADR-0005](../adr/0005-soft-delete.md)、[ADR-0006](../adr/0006-rag-architecture.md)、[ADR-0007](../adr/0007-deployment-baseline.md)。

实施顺序见 [MODULES §6](../design/MODULES.md)：M1.5a 仓储抽取 → M1.5b 页面 hooks → M1.5c 数据变更 → M1.5d 删除旧门面。