# Trove v0.2 Web UI — Design Decisions

**Status**: Draft (revised 2026-05-11, AI-chat dropped).
**Pivot from earlier draft**: NO embedded AI features in Web UI. The user's existing AI agent (Claude Code / Cursor / etc.) is where AI work happens. Web UI is npmjs.com-equivalent for Trove: browse, view, simple CRUD.

## Goal

Web UI shows **what modules you have, what each can do, and lets you adjust their values via simple forms**. It's a visualization + onboarding layer, not an AI surface.

## Stack

| Layer | Pick |
|---|---|
| Runtime | **Bun** |
| HTTP framework | **Hono** (with JSX for server-side rendering) |
| Frontend | **HTMX + Tailwind CDN** (no build step) |
| Markdown rendering | server-side via `marked` |
| Auth | localhost-only origin check |
| Distribution | `bun build --compile` → single binary `trove-ui` |

**Explicit non-picks**: React, Vite, Tauri/Electron, zod, SSE, embedded LLM, chat UI library.

## Architecture (drastically simpler)

```
+----------------+
|  trove ui CLI  |
+-------+--------+
        |
+-------v-----------+
|  Hono server :7821 |
+-------+-----------+
        |
GET /                   → home (modules grid)
GET /m/:name            → module detail
PATCH /api/m/:name/cred → save credentials.json values (form post)
GET /library            → browse repo's library/ (community modules later)
POST /api/install       → copy a library item to ~/.trove/<name>/
        |
+-------v-----------+
|   ~/.trove/        |
+-------------------+
```

Everything server-side rendered. HTMX swaps fragments for inline edits. No client state.

## v0.2 Scope (ruthlessly narrow, ~500 LOC)

### Four screens

1. **Home / Modules grid** — cards per installed module grouped by category. Each card: name, version, description, credentials-filled status indicator, applies_to tags
2. **Module detail** — rendered frontmatter (metadata + applies_to as chips + credentials schema as a form), rendered skill.md body (marked), "edit credentials" inline form (HTMX fragment swap)
3. **Library** — browse this repo's `library/` directory; clicking an item opens preview + "Install to ~/.trove/" button
4. **Empty / setup state** — when `~/.trove/` is empty, show setup wizard: "Welcome. Browse the Library to install your first module."

### What v0.2 does NOT do

- ❌ AI chat / credential guidance / authoring (user does this in their AI agent)
- ❌ Marketplace (community module discovery — v0.3)
- ❌ Test connection button (needs `test:` frontmatter field — SPEC change first)
- ❌ "Where is this module used" reverse lookup (v0.3)
- ❌ Multi-user / team features (never)

### How users actually do "AI Authoring" / credential guidance

**In their AI agent's chat**, not in Web UI:
- "Claude, write me a Trove module for upstash" → AI reads SPEC + an example module, generates one, saves to `~/.trove/upstash/module.md`
- "Claude, I have a new API key for resend, walk me through where to put it" → AI reads resend module frontmatter, asks the user the values per-field, writes credentials.json
- "Claude, my latest minimax send to gmail failed, fix the skill" → AI updates `~/.trove/minimax/module.md`'s skill body based on failure

**The Web UI does NOT need to embed any of this**. The agent IS the AI.

## Optional v0.2.x CLI sidecars (NOT Web UI)

These are 30-line Bun scripts, can ship anytime separately:
- `trove ai new <url>` — for users without an interactive AI agent; fetches URL + LLM call + writes module draft. Optional, not required for v0.2 release.
- `trove install <name-or-path>` — copy from repo's library/ or a git URL to ~/.trove/. Could also just be a Web UI button.

## Total budget

**~500 LOC** for v0.2 (server + HTMX templates + Tailwind). Single-evening work.

## Decisions (resolved 2026-05-11 before scaffolding)

1. **Frontend directory**: `ui/` (short, clear; distinct from landing `site/`)
2. **Examples source**: **bundled at build time** into the binary (works offline; no need to know install location)
3. **Credential form**: GET returns masked (`••••••••`); PATCH accepts plaintext, overwrites file. Plaintext never round-trips
4. **Empty state**: auto-suggest top 3 (minimax / cloudflare / anthropic) as Quick Start cards
5. **Read-only mode**: deferred to v0.3 (not in v0.2)

## Risks

- **Looking too sparse** — without AI chat, Web UI might feel "just a viewer". Mitigate with rich detail view (good typography, applies_to chips, syntax-highlighted skill body, credentials-filled indicators)
- **Tab switching back to AI agent** — user has to leave Web UI to do AI tasks. This is fine — Trove's pitch is "AI is the runtime", consistent
- **Module install UX** — clicking "Install" needs to (a) copy module.md to ~/.trove/ (b) prompt to fill credentials (c) reload Modules grid. Three steps, design carefully.

## Next step after this doc is approved

Task #1 → completed.
Task #5 (AI chat panel) → **DROPPED** (matches this revised scope).
Task #6 (AI Authoring From-URL) → **DROPPED from Web UI scope**, re-filed as optional v0.2.x CLI sidecar.
Tasks #2/#3/#4 stay but smaller (no AI panel integration).
New Task: "Build Examples gallery + install flow" (~100 LOC).
