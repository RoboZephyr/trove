# Project AGENTS.md / CLAUDE.md (示例：在 AI agent 上下文里引用 Trove modules)

**Trove has no inject step.** AI is the runtime: it reads modules from `~/.trove/` directly, fetches credentials on demand, and configures MCP servers when needed.

## Recommended pattern: separate `trove.md`

Don't pollute `CLAUDE.md` with trove details. Keep CLAUDE.md focused on the project itself, and put trove module declarations in a sibling `trove.md` file:

### `CLAUDE.md`
```markdown
# My Project Name

A brief description of the project. Architecture notes, conventions, terminology…

@trove.md

## Conventions for AI
- Project-specific rules go here
- (Trove module use cases live in each module's frontmatter `applies_to`, no need to duplicate)
```

### `trove.md`
```markdown
@/Users/zephyr/.trove/github-robozephyr/module.md
@/Users/zephyr/.trove/minimax/module.md
@/Users/zephyr/.trove/cloudflare/module.md
```

That's it. No headers, no narrative—just `@-references`. Each module's `module.md` frontmatter declares `applies_to`, so the AI knows when to use what.

### Why split?

- **CLAUDE.md stays clean**—re-reading it doesn't drown in trove plumbing
- **`trove.md` is the single source of truth** for trove deps in this project—add/remove a module without touching CLAUDE.md
- **Cross-project visibility**: `diff project-a/trove.md project-b/trove.md` shows which Trove resources differ
- **No duplicated narrative**: `applies_to` already lives in each module's frontmatter

### Should `trove.md` be git-tracked?

- **Single-user / personal projects** → track it (records project deps)
- **Multi-user / OSS projects** → gitignore `trove.md` (contains personal absolute paths), commit `trove.example.md` instead with just the module-name list:

```markdown
# trove.example.md (tracked, portable)
Required Trove modules:
- github-<your-account>
- minimax
- cloudflare

Copy this list into your own trove.md as `@~/.trove/<name>/module.md` references.
```

---

## Credential usage convention

Even with `trove.md` referenced, credentials are NOT pre-exported to env. **AI fetches them on demand**:

- HTTP call → `Authorization: Bearer $(jq -r .XXX_API_KEY ~/.trove/<svc>/credentials.json)`
- Shell tool needing env (e.g. `wrangler`) → temporary `export $(jq ... ~/.trove/<svc>/credentials.json | xargs)` then invoke
- AI decides per-task which approach fits

**Why not pre-export**: avoids context pollution, minimizes blast radius, lets AI choose the right approach per task.

---

## MCP servers (the only resource that needs "installation")

If a module's frontmatter has `mcp:`, the AI can merge it into your agent's MCP config the first time you use it:

> "Add the supabase MCP server to Claude Code"

The AI reads `~/.trove/supabase/module.md`, extracts the `mcp:` section, edits `~/.claude.json`. No `trove inject` tool needed.

---

## Adding a new module to a project

Just talk to the AI:

> "Add minimax to this project's trove"

The AI:
1. Confirms `~/.trove/minimax/` exists
2. Reads `module.md` frontmatter to understand applies_to / required credentials
3. Appends `@/Users/you/.trove/minimax/module.md` to `trove.md`
4. Warns if any required credential field is empty

This is what "AI is the runtime + configurer" looks like in practice.
