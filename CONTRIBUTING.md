# Contributing to Trove

Thanks for your interest. Trove is small and personality-driven — every module reflects real production dogfood. The contributions below preserve that quality.

If you're an AI coding agent working on this repo, also read [AGENTS.md](./AGENTS.md) — it specifies which files are public-distribution-bound and the conventions for editing them.

## 1. New modules

The single highest-value contribution. Each module makes Trove useful for one more service.

### Steps

1. Fork this repo
2. Create a directory under `library/<service-name>/` with:
   - `module.md` — YAML frontmatter + skill body (see [SPEC.md §2.1](./SPEC.md))
   - `credentials.example.json` — placeholder values; **no real secrets ever**, ever (the pre-commit hook will block them)
   - `files/` (optional, if any field is `type: file` per [SPEC §2.3](./SPEC.md)) — but don't ship real file contents in the PR; the example folder structure is enough
3. Run `bun run validate library/<service-name>` — must be 0 errors
4. Open a PR

### Quality bar for `module.md` — non-negotiable

This is what makes Trove valuable, not the format itself.

- **Lead with constraints / gotchas / footguns**, not the happy path. AI is most likely to mess up where you'd expect a senior engineer to mess up too. Document those first. The first `## ` H2 heading must be something like `Critical Constraints`, `Gotchas`, `Read first`, etc. — `trove validate` warns otherwise
- **Real, copy-pasteable code**, not pseudocode. TypeScript preferred, mention Python alternative if it's significantly different
- **Pricing / quota / rate-limit pitfalls** in a dedicated section. AI doesn't think about money unless you tell it to
- **Error code table** for the most common 4xx/5xx codes with one-line interpretations
- See [`library/minimax/module.md`](./library/minimax/module.md) and [`library/stripe/module.md`](./library/stripe/module.md) for reference implementations

### `last_verified` — the honesty contract

Every module MUST carry a `last_verified` field in frontmatter. This is Trove's quality moat — we ship modules with honest verification tiers, not LLM-hallucinated ones. Pick the tier that matches reality:

| Tier | Format example | When to claim |
|---|---|---|
| **production** | `last_verified: "production · 2026-05-13 — <evidence of regular use>"` | You use it in a real project regularly. Have seen the API succeed AND fail. Know what breaks |
| **verified** | `last_verified: "2026-05-13 · <single real call result>"` | One real API call has succeeded with this module's setup. Not just "the code typechecks" |
| **partial** | `last_verified: "2026-05-13 · <what passes> + <what's blocked>"` | Auth works but runtime is blocked (quota, account credits, scope warning, etc.) |
| **pending** | `last_verified: "pending — <reason>"` | You wrote the module from docs but haven't successfully called the API yet |

Pick HONESTLY. The hardest principle: **a single working call is `verified`, not `production`**. `production` requires repeated real use over time. Don't inflate.

### Privacy — OSS-bound content is generic

When writing your module, **do not include identifiers from your own private projects**. Generic placeholders only. Examples:

| ✗ Don't write | ✓ Write |
|---|---|
| `last_verified: "...real call against acme-corp's production DB"` | `last_verified: "...real call against a live database"` |
| `mcp:` env block hardcoding your specific project ref | Use `${credential.X}` or `<your-ref>` placeholder |
| `help:` text naming a specific product / customer | Generic service-shape descriptor |

The pre-commit hook detects the maintainer's known private tokens; if you fork, add your own to the hook locally (it lives at `~/.claude/hooks/check-commit-secrets.sh` for Claude Code users, or wire your own git pre-commit hook).

### File-type credentials (SPEC §2.3)

For credentials that are inherently files (Google service-account JSON, SSH keys, x509 certs, kubeconfig), use `type: file`:

```yaml
credentials:
  MY_SA_JSON:
    type: file
    file_format: json
    file_mode: "0600"
    required: true
    help: "Where to get the file + what role/scope is needed"
```

`${credential.MY_SA_JSON}` substitution then resolves to the absolute file path (not the contents). MCP `env:` blocks needing `*_CREDENTIALS=<path>` plug in cleanly.

## 2. Improving existing modules

If you use one of the bundled modules in your real project and hit a gotcha the module doesn't document — please add it. That's how the moat compounds.

PR shape: add a single bullet to the module's `## Critical Constraints` section, with one line of context (what you hit) and the prevention (what to do). Optionally bump the `last_verified` tier if your usage now meets a higher bar.

## 3. Spec feedback / issues

The format is pre-1.0. If you find an awkward edge case writing a module — a service whose auth doesn't fit `credentials` / `mcp:` shapes, or a substitution pattern that's genuinely missing — open an issue describing the case with a concrete example.

Spec changes that affect existing modules require a version bump (`trove_spec` field). The [SPEC §10 convention adherence log](./SPEC.md#10-convention-adherence-log) is where dogfood-driven spec evolutions are recorded.

## 4. Tooling code

The CLI surface is intentionally tiny. Current commands:

- `trove ui` — local Web UI
- `trove install <name>` — copy library module into `~/.trove/`
- `trove validate <module-dir>` — read-only spec conformance check
- `trove migrate <module>` — relocate legacy multiline-string creds into `files/` per SPEC §2.3

Planned (see [ROADMAP.md](./ROADMAP.md)): AI-assisted module authoring (v0.3), `trove install <git-url>` for community modules.

If you want to contribute code, **open an issue first** to discuss the change before writing significant code. Trove deliberately stays small — most useful contributions are modules + spec feedback, not new CLI commands.

## What we won't accept

- `trove inject` / `trove init` / project-level `.trove/` overrides — intentional non-goals (see [ROADMAP "Out of scope"](./ROADMAP.md))
- Modules with hard-coded real credentials in `credentials.example.json`
- Modules claiming `production` tier without evidence of repeated real use
- Modules referencing the contributor's specific private project / customer / domain
- Cloud sync / SaaS features
- Per-agent shims — modules are agent-agnostic; if an agent doesn't support `@-reference`, the answer is "use a different agent" not "add a shim"

## Module style guide

- File naming: lowercase with hyphens (`my-service`, not `MyService`)
- Frontmatter `applies_to`: list specific use cases, not generic categories ("real-time webhook signature verification", not "webhooks")
- Frontmatter `credentials.<KEY>.help`: include the URL where users get the key
- Multi-account services: name modules with suffixes (`stripe-personal`, `stripe-clientA`) — Trove deliberately doesn't have an override system; explicit naming beats implicit precedence
- File-mode for file-type creds: `"0600"` default, `"0400"` for keys you never want to overwrite (SSH private keys typically)

## Code of conduct

Be kind. Be specific. Be wrong sometimes — that's how we get to "right" together.
