# Trove Roadmap

> Status as of 2026-05-11.

Trove is a hobby OSS project. There is no fixed timeline. Items are roughly ordered by priority within each phase.

## v0.1 — Self-dogfood

**Goal**: format spec is stable, the author actually uses it daily across personal projects.

- [x] Format spec draft ([SPEC.md](./SPEC.md))
- [x] Worked example: `examples/minimax/`
- [x] Worked example: `examples/cloudflare/`
- [ ] Worked examples: anthropic, openai, supabase
- [ ] Translate SPEC.md to English
- [ ] Real-world dogfood log: pain points & spec revisions discovered through use
- [ ] `trove validate` (~30 lines) — frontmatter + credentials.json field alignment check

## v0.2 — Web UI

**Goal**: managing modules visually is faster than editing markdown by hand.

- [ ] `trove ui` — local web dashboard (Bun + Hono + React, single binary)
- [ ] Modules list view (cards by category, "used in which projects" lookup)
- [ ] Module editor (auto-form from frontmatter `credentials` schema, side-by-side skill markdown editor)
- [ ] "Install MCP for this module" one-click action
- [ ] "Add to current project" — appends `@~/.trove/<name>/module.md` to a project's CLAUDE.md

## v0.3 — AI-Assisted Module Authoring

**Goal**: creating a new module is conversational, not manual.

- [ ] `trove ai new <url>` — From URL flow: AI fetches docs, generates module.md draft
- [ ] `trove ai new <env-file>` — From .env flow: AI groups env vars by service, batch-generates module skeletons
- [ ] `trove ai new "<description>"` — From Description flow: web search + From URL
- [ ] `trove ai improve <module>` — Refinement loop: "AI got this wrong" → AI proposes skill diff
- [ ] LLM provider selection in `~/.trove/config.json` (default: anthropic, fallbacks: openai, ollama)

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
