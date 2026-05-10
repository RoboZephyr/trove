# Project AGENTS.md (示例：在 AI agent 上下文里引用 Trove modules)

This is a worked example of how a project's `AGENTS.md` (or `CLAUDE.md` / `.cursorrules`) references Trove modules. **Trove has no inject step**—the AI is the runtime: it reads modules from `~/.trove/` directly, fetches credentials on demand, and even configures MCP servers when needed.

---

## Pattern A — Eager load (Claude Code 原生)

```markdown
## Services
@/Users/zephyr/.trove/minimax/module.md
@/Users/zephyr/.trove/cloudflare/module.md
```

Claude Code 启动时自动加载这两个 module 到 context。Cursor / Codex 用各自原生的 `@-reference` 语法（同样接受绝对路径）。**适合**：项目高频用这些服务，token 成本可接受。

## Pattern B — Lazy declare（更省 token）

```markdown
## Services
This project uses Trove modules: `minimax`, `cloudflare`.
- minimax for TTS / image / music / LLM (Chinese-strong)
- cloudflare for Pages deploy & cache purge

When you need to use them, read `~/.trove/<name>/module.md` first for usage and gotchas.
Credentials are at `~/.trove/<name>/credentials.json`.
```

AI 只在真要用某个服务时去 `Read ~/.trove/<svc>/module.md`。**适合**：项目里这些服务是「偶尔用」，不希望 base context 太大。

---

## 凭证使用约定

**AI 自取，不预先 export 到 env**：
- HTTP 调用 → `Authorization: Bearer $(jq -r .XXX_API_KEY ~/.trove/<svc>/credentials.json)`
- shell 工具（如 `wrangler` 必须读 env）→ AI 临时 `export $(jq ... ~/.trove/<svc>/credentials.json | xargs)` 再调
- AI 自己决定哪种合适

**为什么不预先 export**：
- 不污染上下文 / 不浪费 token
- Blast radius 最小（只暴露当前任务用到的 key）
- AI 自决，比规则更灵活

---

## MCP 服务（唯一需要「安装」的资源）

如果某个 module.md 的 frontmatter 含 `mcp:` 字段（例如 stripe / supabase），**第一次使用时**让 AI 把它 merge 到 agent 的 MCP 配置：

> "把 `~/.trove/supabase/module.md` 里的 mcp 配置加到 Claude Code"

AI 会读 module.md → 抽 mcp section → Edit `~/.claude.json` 的 mcpServers。无需 inject 工具。

---

## 想加新 module 到当前项目？

直接对话即可：

> "在这个项目用 minimax"

AI 会：
1. `ls ~/.trove/` 确认 minimax 存在
2. 读 `~/.trove/minimax/module.md` 看 frontmatter（applies_to / credentials 字段）
3. 把 `@/Users/zephyr/.trove/minimax/module.md` 写进当前项目 CLAUDE.md（Pattern A）或加一段 lazy declare（Pattern B）
4. 提示缺失字段（如 `CLOUDFLARE_ACCOUNT_ID` 没填）

**这就是「无 inject、无 init」的本质**——AI 是 runtime + configurer，工具不去抢它的活。
