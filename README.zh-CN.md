# Trove

> The local-first resource manager for AI coding agents.

把 AI agent 工作所需的一切——API 凭证、MCP server 配置、用法文档（skill）——集中管理在一处。AI（Claude Code / Cursor / Codex / 自定义 agent）原生通过 `@~/.trove/<name>/module.md` 引用、自取凭证、按需使用。

**核心哲学**：AI 是 runtime，Trove 只定义格式 + 提供 Web UI。不做编译、不做注入、不做适配器——AI 自己能搞定的事不写工具。

## Status

**v0.1 spec draft** —— 早期阶段。先用于本人的 `~/.personal-data/` 迁移和自用提效，再推广。

## 为什么

- 凭证散落在 `.env` / 1Password / 各项目
- MCP 配置散落在 `~/.claude.json` / `~/.cursor/mcp.json` / `~/.codex/...`
- 用法文档散落在 `CLAUDE.md` / `AGENTS.md` / `.cursorrules`（每个 agent 一份，互不复用）

每加一个新服务、换一个项目、换一个 agent 都要重抄。**Trove 把这些全部集中到 `~/.trove/`，用统一格式管理，让 AI 跨 agent 通用。**

## 文档

- [SPEC.md](./SPEC.md) — v0.1 格式规范（Resource / Module / 引用语法 / inject 机制）
- `examples/` — worked examples（待补）

## 设计原则

1. **本地优先**：无云端、无账号、无 SaaS
2. **手工友好**：纯文本（JSON + Markdown），无任何工具也能编辑
3. **AI 友好**：skill 文档结构化，agent 一读就知道怎么用
4. **零依赖启动**：v0.1 不需要 CLI/GUI，目录约定 + AGENTS.md 引用就能跑
5. **开源**：MIT，不商业化

## License

MIT
