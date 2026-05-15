# Trove Roadmap

> Status as of 2026-05-13.

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
- [ ] ~~Translate SPEC.md to English~~ — now moved to **v0.2.x → OSS launch prep** below (MCP work is done, spec has stabilized)

## v0.2 — Web UI 🟡 Released, polish pending

**Goal**: managing modules visually is faster than editing markdown by hand. **Credentials entered via Web UI, never through `$EDITOR` on credentials.json.**

Design pivot (2026-05-11): dropped embedded AI chat — AI work happens in the user's existing agent (Claude Code / Cursor), Web UI is npmjs.com-equivalent. See [docs/design-v0.2.md](./docs/design-v0.2.md).

Stack: Bun + Hono + HTMX + Tailwind CDN, server-side rendered.

- [x] `trove ui` — local dashboard scaffolded (`ui/server.ts` + `views.tsx` + `modules.ts`)
- [x] Home / Modules grid — cards grouped by category with `last_verified` badge
- [x] Module detail view — frontmatter + rendered skill.md body
- [x] Library browse screen — list bundled `library/` modules
- [x] Empty state — setup wizard when `~/.trove/` is empty
- [x] Landing site rewrite for v0.2 reality (`site/index.html`, deployed). Repositioned 2026-05-13 around cross-project credential reuse (MCP demoted to feature)
- [x] Credentials inline edit form — masked password fields with eye-icon reveal, file-type fields with present/replace/delete widget, HTMX PATCH preserves unchanged fields. Implemented per SPEC §2.3
- [x] Library install three-step flow: `installFromLibrary` copies module.md → POST `/api/install` redirects to `/m/<name>` → user fills form. Also exposed as `trove install <name>` CLI
- [x] Quick Start cards on empty state — `homePage` shows `QUICK_START = ["minimax", "cloudflare", "anthropic"]` when `~/.trove/` is empty
- [x] **npm distribution** — `@robozephyr/trove` scoped package; `trove validate` / `trove ui` / `trove install` / `trove migrate` subcommands via single `bin/cli.ts`; esbuild bundle to `dist/cli.js`; Node 22+. Bare `trove` name on npm is squatted by a 2014 dead package — scoped name chosen. Latest published version: **0.2.3**
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

- [ ] More modules: upstash (redis), neon/turso (db), replicate / groq (AI) — **deferred until OSS launch is closer**; new module breadth serves future users, not current need
- [x] **npm module** (registry + publish workflow — dogfood from shipping `@robozephyr/trove` itself); covers token types, scoped-package private-by-default, bare-name squat, double-shebang trap, Bypass-2FA Granular Token, `NPM_CONFIG_USERCONFIG=<tempfile>` for non-interactive publish. `last_verified: production`
- [x] `trove install <name>...` CLI sidecar — copy library modules into `~/.trove/`; `--list` shows available + installed status; `--force` to overwrite; idempotent
- [ ] `trove install <git-url>` — install from arbitrary git repo (community modules); needed for the marketplace story but not for v1.0 launch
- [ ] Re-verify the rest of the modules to production-grade `last_verified` — happens organically as maintainer (or contributors) use modules in real projects. Currently **5 production · 11 verified · 2 partial** out of 18

## v0.2.x → OSS launch prep (active)

**Goal**: bring trove from "maintainer's tool" to "first external users can adopt without hand-holding." Per the 4-week soft-launch sequence (see [README §Status](./README.md)).

**Content polish (Week 1)**

- [x] CONTRIBUTING.md refresh — current CLI surface, `last_verified` tier contract, OSS privacy rules, file-type creds, module-improvement track (2026-05-13)
- [x] AGENTS.md — agent-contributor conventions (2026-05-12)
- [x] Three-layer private-leak protection — PreToolUse hook + memory + AGENTS.md (2026-05-13). Mechanism caught its own first SPEC §10 entry — see entry for live evidence
- [x] Positioning rewrite — "one ~/.trove/ shared across every agent in every project" as H1; MCP demoted to optional H2 (2026-05-13)
- [ ] **SPEC.md English translation** — pass 1 done 2026-05-14: §0–§4 (core schema, mcp sub-schemas, file-type creds, runtime behavior, Web UI) translated. §5–§11 (AI-Assisted Authoring, worked example, migration, CLI surface, open questions, dogfood log §10, v0.1 priorities) still Chinese — pass 2 lower priority since §10 is historical dogfood evidence and §11 is v0.1-era planning
- [ ] **"Killer demo"** — short screencast / animated GIF of the core flow: `npm i -g @robozephyr/trove` → `trove install stripe` → fill creds → `echo '@~/.trove/stripe/module.md' >> CLAUDE.md` → AI knows Stripe. Should NOT use the maintainer's real project — synthesize a generic flow
- [x] README.zh-CN.md dead link removed (PR #2, 2026-05-14) — translated parallel README deferred until there's actual zh-CN audience signal

**Beta circle (Week 2)**

- [ ] Show to 5–10 AI-engineering friends; collect 5 specific pieces of feedback
- [ ] Triage feedback: bugs → fix; positioning gaps → README edits; missing module categories → log for backlog
- [ ] Iterate on the killer demo if it's not landing in 5 seconds

**Public launch (Week 3–4)**

- [ ] Launch post — lead with the demo story (cross-project credential reuse), not the SPEC. Mention MCP support as a bonus, not the headline
- [ ] awesome-claude-code PR
- [ ] Anthropic Discord — mention in #show-and-tell
- [ ] Pinned X / Twitter post
- [ ] Show HN — accept that it may not front-page; "trickle adoption" is the expected outcome

**Sustainability commitment**

- [x] Maintainer commits to ~2 hrs/week issue + PR triage for at least 6 months post-launch (2026-05-13 affirmation)

**Pending live verifications (no rush, opportunistic)**

- [ ] supabase Edge Functions — `last_verified` says "production-active separately" but no independent smoke. Run one signed Edge Function call to fully verify
- [ ] fal-ai promotion — currently `verified` from a single image gen. Promote to `production` once a real downstream usage matures with real volume / failure modes captured; module body should pick up any gotchas surfaced (cold start, queue, rate limit, model-specific param quirks)
- [ ] google-ads upgrade to `type: file` — currently uses string-typed multiline. Maintainer hasn't verified the Ads API recently (refresh_token state unclear), so the file-type retrofit waits for a real verification round

## v0.3 — AI-Assisted Module Authoring

**Goal**: creating a new module is conversational, not manual. **AI 工作在用户自己的 agent 里发生,Trove 只提供 CLI sidecar 给没有交互式 agent 的用户。**

- [ ] `trove ai new <url>` — From URL flow: AI fetches docs, generates module.md draft
- [ ] `trove ai new <env-file>` — From .env flow: AI groups env vars by service, batch-generates module skeletons
- [ ] `trove ai new "<description>"` — From Description flow: web search + From URL
- [ ] `trove ai improve <module>` — Refinement loop: "AI got this wrong" → AI proposes skill diff
- [ ] LLM provider selection in `~/.trove/config.json` (default: anthropic, fallbacks: openai, ollama)
- [ ] "Where is this module used" reverse lookup in Web UI

## v1.0 — Post-launch consolidation

**Goal**: stable platform with community contributions flowing.

- [ ] Module marketplace (community contributions, browse/install in Web UI; depends on `trove install <git-url>` from v0.2.x backlog)
- [ ] Cross-agent verification: same module works correctly in Claude Code / Codex / Cursor (today's targets; other `@-reference`-supporting agents added as contributors verify them)
- [x] ~~Distribute via npm~~ — done in v0.2 as `@robozephyr/trove` (the old `@trove/cli` plan was abandoned since the maintainer's own scope was sufficient)
- [ ] Homebrew tap — for the "I don't have Node" audience
- [ ] Complete English translation of all materials (SPEC done in v0.2.x prep above; this covers any remaining Chinese-only docs that surface during launch)

## Out of scope (intentional non-goals)

- ❌ `trove inject` / `trove init` — AI is the runtime, no compile step needed
- ❌ Cross-agent adapter matrix — anything supporting `@-reference` to absolute paths works
- ❌ Cloud sync / multi-device sync — let users pick their own (git remote, iCloud Drive, rsync)
- ❌ SaaS / pricing / accounts — local-first, no business model
- ❌ Project-level `.trove/` overrides — defeats the cross-project sharing core value (use named modules instead, e.g. `cloudflare-personal` vs `cloudflare-business`)
- ❌ Embedded AI chat / authoring inside Web UI — pivoted away 2026-05-11; AI lives in the user's agent
