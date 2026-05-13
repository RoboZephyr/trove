# Trove Roadmap

> Status as of 2026-05-12.

Trove is a hobby OSS project. There is no fixed timeline. Items are roughly ordered by priority within each phase.

## v0.1 — Self-dogfood ✅ Shipped

**Goal**: format spec is stable, the author actually uses it daily across personal projects.

- [x] Format spec draft ([SPEC.md](./SPEC.md))
- [x] Worked module: `library/minimax/`
- [x] Worked module: `library/cloudflare/`
- [x] Library expansion: 16 modules in `library/` across LLM / search / payments / analytics / video gen / identity (2 dropped at v0.2 release as unverified)
- [x] `trove validate` — frontmatter + credentials.json field alignment check, with `.example.json` fallback
- [x] Real-world dogfood log (SPEC §10): multiple entries from actual usage, each producing a SPEC revision
- [x] `last_verified` field + verify-gate baseline across all modules ([SPEC §2.1](./SPEC.md))
- [ ] Translate SPEC.md to English (defer until spec stabilizes after MCP work below)

## v0.2 — Web UI 🟡 Released, polish pending

**Goal**: managing modules visually is faster than editing markdown by hand. **Credentials entered via Web UI, never through `$EDITOR` on credentials.json.**

Design pivot (2026-05-11): dropped embedded AI chat — AI work happens in the user's existing agent (Claude Code / Cursor), Web UI is npmjs.com-equivalent. See [docs/design-v0.2.md](./docs/design-v0.2.md).

Stack: Bun + Hono + HTMX + Tailwind CDN, server-side rendered.

- [x] `trove ui` — local dashboard scaffolded (`ui/server.ts` + `views.tsx` + `modules.ts`)
- [x] Home / Modules grid — cards grouped by category with `last_verified` badge
- [x] Module detail view — frontmatter + rendered skill.md body
- [x] Library browse screen — list bundled `library/` modules
- [x] Empty state — setup wizard when `~/.trove/` is empty
- [x] Landing site rewrite for v0.2 reality (`site/index.html`, deployed at trove.roboz.dev)
- [ ] Credentials inline edit form (GET returns masked `••••••••`, PATCH overwrites plaintext file)
- [ ] Library install three-step flow: copy `module.md` → prompt credentials → reload grid
- [ ] Quick Start cards on empty state (minimax / cloudflare / anthropic)
- [x] **npm distribution** — `@robozephyr/trove` scoped package; `trove validate` / `trove ui` subcommands via single `bin/cli.ts`; esbuild bundle to `dist/cli.js`; Node 22+; `bin/` field maps `trove` command. Bare `trove` name on npm is squatted by a 2014 dead package — scoped name chosen. Homebrew tap deferred to v1.0
- [ ] Homebrew tap (`brew install robozephyr/trove/trove`) — v1.0 item, needs binary build (`bun build --compile` or pkg-style)

## v0.2.x — MCP work面 (current focus)

**Goal**: 把 MCP 从 "可选 frontmatter 字段" 升级成模块的一等内容,统一文件型凭证的供给。

逻辑顺序: **#16 → #26 → #24 / #25 / #23**(#23 最独立,可单独先做)。

- [x] **#16 — SPEC §2.1 正式记录 `mcp:` 两种 sub-schema**(stdio + http)— SPEC §2.1 新增 `mcp:` 字段完整 sub-schema、字段语义表、3 条反模式;`${credential.X}` substitution 扩到 `url:`
- [x] **#23 — stripe 模块加 `mcp:` block + Payment Links + MCP skill 章节** — 加 `type: http url: https://mcp.stripe.com`、Payment Links 整节(`buy.stripe.com` CTA 形态)、Stripe MCP usage 章节
- [x] **#25 — supabase MCP-first 重写** + Edge Functions skill 章节 — `mcp:` 从过时 stdio (含 secret-in-args 反模式) 切到官方 hosted `https://mcp.supabase.com/mcp?project_ref=...&read_only=true`;Edge Functions 章节加上生产形态(raw HTTP / `<project-ref>.supabase.co/functions/v1` / `--no-verify-jwt` 取舍);加 Supabase MCP 整节
- [x] **#26 — SPEC §2.3 文件型凭证一等公民** — `type: file` schema、`files/<KEY>.<ext>` 存储约定、`${credential.X}` 按字段类型分发为路径或字面值、单独 `trove migrate` 子命令、UI 表单拆 widget。`ui/credentials.ts` 集中所有凭证 disk I/O。simplify pass 3 个并行 agent 评审 (reuse / quality / efficiency)
- [x] **#24 — google-analytics stdio MCP** — `mcp:` block 配 `pipx run google-analytics-mcp` + `GOOGLE_APPLICATION_CREDENTIALS: ${credential.GOOGLE_SERVICE_ACCOUNT_JSON}`（自动解析为文件路径），end-to-end migrate 通过
- [x] **google-search-console 升级 type:file** — 同上模式（GSC MCP server 出现时一行 frontmatter 即可接通）

## v0.2.x — Backlog (低优先)

- [ ] More modules: upstash (redis), neon/turso (db), replicate / groq (AI), **npm** (registry + publish workflow — dogfood from shipping `@robozephyr/trove` itself)
- [ ] `trove install <name-or-path>` CLI sidecar (copy from `library/` 或 git URL 到 `~/.trove/`)
- [ ] Re-verify the rest of the modules to production-grade `last_verified`(目前多数还是 single-call smoke,非 "production · daily use")

## v0.3 — AI-Assisted Module Authoring

**Goal**: creating a new module is conversational, not manual. **AI 工作在用户自己的 agent 里发生,Trove 只提供 CLI sidecar 给没有交互式 agent 的用户。**

- [ ] `trove ai new <url>` — From URL flow: AI fetches docs, generates module.md draft
- [ ] `trove ai new <env-file>` — From .env flow: AI groups env vars by service, batch-generates module skeletons
- [ ] `trove ai new "<description>"` — From Description flow: web search + From URL
- [ ] `trove ai improve <module>` — Refinement loop: "AI got this wrong" → AI proposes skill diff
- [ ] LLM provider selection in `~/.trove/config.json` (default: anthropic, fallbacks: openai, ollama)
- [ ] "Where is this module used" reverse lookup in Web UI

## v1.0 — OSS launch

**Goal**: first external users can adopt without hand-holding.

- [ ] Polish docs, complete English translation of all materials
- [ ] Module marketplace (community contributions, browse/install in Web UI)
- [ ] Cross-agent verification: same module works correctly in Claude Code / Cursor / Codex / Aider
- [ ] Distribute via npm (`@trove/cli`, scoped to avoid old `trove` v0.1.0 conflict) and Homebrew
- [ ] Launch blog post + submission to awesome-claude-code

## Out of scope (intentional non-goals)

- ❌ `trove inject` / `trove init` — AI is the runtime, no compile step needed
- ❌ Cross-agent adapter matrix — anything supporting `@-reference` to absolute paths works
- ❌ Cloud sync / multi-device sync — let users pick their own (git remote, iCloud Drive, rsync)
- ❌ SaaS / pricing / accounts — local-first, no business model
- ❌ Project-level `.trove/` overrides — defeats the cross-project sharing core value (use named modules instead, e.g. `cloudflare-personal` vs `cloudflare-business`)
- ❌ Embedded AI chat / authoring inside Web UI — pivoted away 2026-05-11; AI lives in the user's agent
