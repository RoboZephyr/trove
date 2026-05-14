# AGENTS.md — conventions for AI coding agents working on trove

This file is for AI agents (Claude Code, Codex, Cursor, and any other agent that supports absolute-path `@-reference`) contributing to **trove itself**. Trove is a published OSS project (`@robozephyr/trove` on npm), so anything you commit ships to public users.

## Distribution-bound files MUST be generic

The following directories/files ship to npm and are public on GitHub:

```
library/       # bundled module templates — copied verbatim into users' ~/.trove/
SPEC.md        # format specification
README.md      # public README
ROADMAP.md     # public roadmap
CONTRIBUTING.md
site/          # marketing site (deployed)
```

**Never write maintainer-specific identifiers into these files.** Concretely:

| Don't write | Write instead |
|---|---|
| A specific project name (e.g. a real customer / product name) | "the maintainer's downstream project" / "a real production project" |
| A Supabase project ref / GA property ID / npm scope owned by the maintainer | `<your-ref>` / `@your-org` / `<project-ref>` |
| A specific table / env-var / file name from the maintainer's setup | "a live transactional table" / "the project's main env file" |
| Specific incident counts ("2/4 rows had NULL") | "a non-trivial fraction of rows" / "in some cases" |
| Maintainer's domain names | "your domain" / "your production host" |

Describe the **method**, **shape**, and **principle** — not the specific instance from your dogfood run.

Allowed: the package's own identity (`@robozephyr/trove`), public service names (Stripe, Supabase, etc.), and module/category names that exist in the public `library/`.

A pre-commit hook scans staged diffs for the maintainer's known private identifiers and blocks commits that include them. If it fires, the message will tell you which file:line to fix.

## Other trove-specific conventions

- **`last_verified` is the release gate**. When promoting a module's tier (verified → production), edit the `last_verified` field to describe what specifically was verified, by what method, when. Don't promote based on "it called and didn't error once" — see SPEC §2.1 for tier semantics.
- **Read SPEC §0 before changing format behavior**. The hand-friendly / plain-text / zero-tooling principles are load-bearing — anything that violates them needs explicit user discussion.
- **Validate before committing**. `bun run validate --library` must be 0 errors. `bun run typecheck` must be clean.
- **TROVE_HOME = `~/.trove/`** — module disk shape: `~/.trove/<svc>/module.md` + `credentials.json` + optional `files/<KEY>.<ext>` (SPEC §2.3).
- **No new agent-specific shims**. trove deliberately doesn't have per-agent adapters; modules are referenced via absolute path from any agent that supports `@-reference`. If a new agent needs special handling, raise the design question first — don't unilaterally add a code path.

## File map for agents

```
bin/
  cli.ts              CLI entry — dispatches subcommands
  validate.ts         `trove validate` — read-only checks
  migrate.ts          `trove migrate` — relocates legacy multiline creds → files/
  install.ts          `trove install` — copies library/<name> → ~/.trove/<name>
ui/
  server.ts           Hono + @hono/node-server, runs at 127.0.0.1:7821
  views.ts            HTMX server-rendered views (hono/html template literals)
  modules.ts          Module FS layer + frontmatter parsing
  credentials.ts      Single source of truth for credential I/O (SPEC §2.2 + §2.3)
library/              Bundled modules; copied verbatim into users' ~/.trove/
SPEC.md               The format definition — read §0 (principles), §2.1–2.3 (schema)
ROADMAP.md            Phased plan with explicit non-goals
```

## Build / verify commands

```
bun run typecheck            # TypeScript noEmit
bun run build                # esbuild bundle → dist/cli.js
bun run validate --library   # validate every bundled module
bun run ui                   # open Web UI dev server
```

For publish: see SPEC + the npm module's own `last_verified` field for the maintainer's tested release flow.
