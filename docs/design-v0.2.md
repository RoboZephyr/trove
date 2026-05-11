# Trove v0.2 Web UI — Design Decisions

**Status**: Draft (2026-05-11), pending review before scaffolding starts.

## Goal

Ship a minimum-viable `trove ui` that delivers **one killer flow not possible with CLI alone**: AI-guided credential entry + AI Authoring From-URL. Modules list + editor are supporting cast.

## Stack (opinionated)

| Layer | Pick | Why |
|---|---|---|
| Runtime | **Bun** | Already used for `trove-validate`; single binary out via `bun build --compile`; bundled TypeScript |
| HTTP framework | **Hono** | Tiny (~14KB), Bun-native, JSX support for server-rendered HTML, native SSE for AI streaming |
| Frontend | **HTMX + Tailwind (CDN) + vanilla TS for AI chat** | No build step; server renders all forms / lists / details; HTMX swaps fragments; AI chat panel uses SSE + a 50-line vanilla TS handler |
| Markdown editor | **textarea + server-side preview via `marked`** | Simpler than EasyMDE / Monaco; "Preview" tab is a fragment swap |
| Auth | **localhost-only origin check** | refuse if request `Host:` isn't `127.0.0.1` or `localhost`; v1.0 may add per-user token |
| Distribution | **`bun build --compile`** → single binary `trove-ui` | `bun install` not required by end-users |

**Explicitly NOT using**: React (build step overhead), Vite (extra tool), Tauri/Electron (defeats local-first-web rationale), zod (overkill for our schema needs—handwritten validators do).

## Architecture

```
                            +----------------+
                            |  trove ui CLI  |
                            |  (bun + hono)  |
                            +-------+--------+
                                    |
                            +-------v---------+
                            |   HTTP server   |
                            |   :7821         |
                            +-------+---------+
                                    |
       +----------------+-----------+------------+-------------------+
       |                |                        |                   |
   GET /              GET /api/modules     POST /api/ai/new       SSE /api/ai/chat
   (HTML shell)       GET /api/modules/:n  (URL → draft module)   (credential entry guide)
                      PATCH /api/modules/:n
                      
                                    |
                          +---------v----------+
                          |  ~/.trove/         |
                          |  (filesystem)      |
                          +--------------------+
```

Server reads/writes `~/.trove/<name>/module.md` and `~/.trove/<name>/credentials.json`. Frontend never sees raw credential values for password-type fields after initial entry — server returns masked (`••••••••`) in GETs, accepts plaintext only on PATCH.

## v0.2 Scope (ruthlessly narrow)

### Shipping in v0.2
1. **Modules list view** — read-only, cards by category (~150 LOC)
2. **Module detail editor** — auto-form from frontmatter `credentials` schema + skill markdown editor (~300 LOC)
3. **AI-guided credential entry** — side chat panel, uses `~/.trove/anthropic/credentials.json` for LLM (~250 LOC + prompt design)
4. **AI Authoring: From URL only** — paste docs URL → AI generates module.md draft → preview/edit/save (~200 LOC + prompt design)

### Deferred to v0.3
- AI Authoring: From .env / From Description flows
- Refinement loop (failure case → diff suggestion)
- "Where is this module used" reverse lookup
- Test connection button (needs `test:` frontmatter field — SPEC change)

### Deferred to v1.0
- Marketplace (community modules)
- Multi-user / team mode
- Cloud sync

## Total budget

**~900 LOC** for v0.2 (server + client + prompts). Single-evening-of-real-work scope (≠ session, real-world hours).

## Open questions for review

1. **LLM provider for AI features** — default to `@trove:anthropic` (user's own credentials). Fallback: prompt user to install anthropic module first. Is this acceptable, or should we also accept openrouter as fallback?
2. **Frontend served as static or via Hono** — leaning Hono served (simpler dev, single binary). OK?
3. **Where to put frontend source** — proposed: `site-ui/` directory in the repo (distinct from `site/` which is the static landing). OK or different name?
4. **Hot reload during dev** — skip? Or use `bun --hot`? Leaning skip for now (page refresh is fine).
5. **CSS framework** — Tailwind CDN vs handwritten. Tailwind CDN bloats page slightly but speeds dev 5×. Lean Tailwind.

## Risks

- **Prompt quality for AI Authoring** is the #1 success factor. The generated module.md must pass `trove validate` AND read like the hand-written examples (gotchas-first, real code, calls out pitfalls). Will need 3-5 iterations to dial in the system prompt. Allocate time for this.
- **AI chat UX** can feel clunky if streaming is slow or errors are unclear. Aim for <2s to first token; on LLM error show "retry" button not a wall of stack trace.
- **Port collision** on 7821 → fall back to 7822, 7823, etc. (open question #4 in SPEC).

## Next step after this doc is approved

Move Task #1 → completed, start Task #2 (scaffolding).
