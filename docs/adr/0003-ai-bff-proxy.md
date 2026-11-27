# ADR-0003：AI 调用统一走服务端 BFF 代理

- 状态：已采纳（M0 移除直连，M3 实现代理）
- 日期：2026-11-27

## 背景

重构前浏览器直接请求火山方舟 `/api/v3/responses`，API Key 以字符串硬编码在 `services/ai.ts` 中，
并随构建产物与 git 历史公开；同时没有 system 上下文、没有超时、没有限流，
所谓「流式」是把完整响应按 50ms/字符回放。

## 决策

1. 浏览器只调用同源 `/api/ai/*`；密钥只存在于服务端环境变量；
2. 服务端负责：鉴权 → 每用户配额 → 结果缓存 → 审计 → 超时/重试 → 内容安全；
3. 聊天使用 SSE 真流式（`data: {"delta":"…"}`），前端用 `AbortController` 支持停止；
4. 结构化输出（赏析/查词）要求 JSON，并做 schema 校验，失败重试一次后明确报错；
5. 未配置代理时，前端直接抛「AI 服务未配置」，**不允许**返回模板假数据。

## 后果

- 密钥泄露面归零（服务端环境变量 + secret 扫描）；
- 可以按用户配额、缓存、观测延迟与成本；
- 需要部署一个 Node 服务（可以是用户自己的服务器），本地开发用 Vite proxy；
- 前端 bundle 不再依赖模型 SDK。

## 接口契约

```text
POST /api/ai/responses   { input, system } -> { text }
POST /api/ai/chat        { messages, system } -> text/event-stream
POST /api/ai/word        { word } -> { phonetic?, pos?, meaning, example }
POST /api/ai/translate   { text, to } -> { text }
```

## 备选方案

- **前端直连 + 短期 token**：仍需可信服务端签发，复杂度不低于代理，放弃。
- **只在前端做 mock**：会让演示与真实能力脱节，正是这次重构要消除的问题。