# Trove

> **One `~/.trove/` directory. Every AI coding agent — Claude Code, Codex, Cursor — in every project on your machine reuses the same API credentials and service playbooks.**

No more re-pasting Stripe keys into a fresh `.env` for every project. No more re-explaining "this service has a quirk that bit me last time" to a fresh agent session. Add a service once at `~/.trove/<service>/`; reference it from any project's `CLAUDE.md` / `AGENTS.md` / `.cursorrules` with one line:

```markdown
@/Users/you/.trove/stripe/module.md
```

The AI loads the module on session start. It now knows your Stripe key, the gotchas (amounts in cents, restricted keys over secret keys, idempotency-key requirement), and — if a Stripe MCP server is wired up — calls it directly.

**No inject step. No init step. No per-agent shims.** Trove is a plain directory; the AI is the runtime.

## What's in each module

Per service, one folder holds three layers:

1. **The playbook** — gotchas, billing pitfalls, error-code tables, real code snippets, written from production dogfood. Stripe amounts in cents. Supabase RLS opt-in default. GA4 service-account-as-user-not-IAM. The stuff that gets a senior engineer paged at 2am
2. **API credentials** — keys / tokens / files (for service-account JSON / SSH keys / certs), gitignored at file-mode 600
3. **MCP server pointers** (optional) — `mcp:` block per module, so the AI configures the agent's MCP settings on first use

Same module works in every agent that supports absolute-path `@-reference`. Switch projects: same trove. Switch agents (Claude Code → Codex → Cursor): same trove.

## How it doesn't try to be other tools

| Trove is NOT replacing | Because |
|---|---|
| `.env` + `direnv` | Env files re-fragment per project — every new repo means re-pasting the same Stripe key. They also carry no skill knowledge and no MCP config. Trove is the cross-project home env files never tried to be |
| `~/.claude/skills/` (and equivalents) | Agent-specific — locked to Claude Code. Trove modules are referenced by absolute path from any agent that supports `@-reference`, so the same module serves Claude Code / Codex / Cursor without re-authoring |
| 1Password CLI / `op run` | Credentials only — no playbook, no MCP wiring. Use 1Password as the source-of-truth vault and pull values into trove if you want; the two compose |
| Writing your own skill files per project | Every project re-pays the authoring cost; trove de-duplicates that across N projects, and `last_verified` makes "is this knowledge still correct?" auditable |
| A SaaS / cloud sync | Local-first by design. Sync via git remote / iCloud Drive / rsync — whichever you already use |

## How it works

A module is a directory under `~/.trove/`:

```
~/.trove/minimax/
├── module.md           # YAML frontmatter (schema, applies_to, optional MCP) + skill body
├── credentials.json    # secret values — gitignored, mode 600
└── files/              # (optional) file-type creds: SA JSON / SSH key / cert
```

On session start, the AI:

1. Auto-loads the referenced modules (any agent supporting `@-reference` to an absolute path)
2. Reads `credentials.json` and `files/` directly when calling the API — no env export, no shell-history exposure
3. Consults the playbook body when it hits a code path that has known gotchas
4. Updates the project's `CLAUDE.md` / `AGENTS.md` / `.cursorrules` if you ask it to add a new module

For services with MCP servers, see the next section.

## MCP support (optional layer)

Most modern services ship MCP servers — Stripe, Supabase, Google Analytics, npm, etc. Each agent has its own MCP config file (`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/...`). Adding one service to three agents currently means editing three files.

Trove modules can carry an `mcp:` block declaring the canonical install:

```yaml
mcp:
  type: http
  url: https://mcp.stripe.com
```

Or for stdio servers:

```yaml
mcp:
  type: stdio
  command: pipx
  args: ["run", "google-analytics-mcp"]
  env:
    GOOGLE_APPLICATION_CREDENTIALS: ${credential.GOOGLE_SERVICE_ACCOUNT_JSON}
```

The `${credential.X}` substitution resolves to the field's value (string fields) or absolute path (file fields, SPEC §2.3). The AI merges the block into the agent's MCP config on first use — one place to declare, one place to update, applies to every agent.

## Status

**v0.2.3** — Web UI shipped, 18 modules in `library/` gated by `last_verified` (5 production · 11 verified · 2 partial). SPEC §2.3 file-type credentials live (`trove migrate` relocates legacy multiline-string blobs into stable `files/<KEY>.<ext>` paths). `trove install <name>...` headless installer. Format spec is stable; AI-assisted module authoring (v0.3) in progress.

See:
- [SPEC.md](./SPEC.md) — full format specification (Chinese, English translation forthcoming)
- [ROADMAP.md](./ROADMAP.md) — what's planned
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute modules

## Quick start

```bash
# 1. Install
npm install -g @robozephyr/trove
# (Node 22+ required. Homebrew tap planned for v1.0.)

# 2. Open the local Web UI to install a module and fill credentials
trove ui
# → http://127.0.0.1:7821
# Pick e.g. `minimax` from the Library tab, click Install, fill the form.

# 3. Reference it from any project's CLAUDE.md
echo '@/Users/you/.trove/minimax/module.md' >> /path/to/project/CLAUDE.md

# 4. Start your AI agent there
cd /path/to/project && claude
```

The AI now knows MiniMax: how to call it, what gotchas to avoid, where to find the key.

### Zero-tooling mode

If you don't want the binary, the directory convention IS the runtime — just clone, copy, edit:

```bash
mkdir -p ~/.trove
cp -r library/minimax ~/.trove/
chmod 600 ~/.trove/minimax/credentials.json
$EDITOR ~/.trove/minimax/credentials.json
# ⚠️ Direct file editing is the fallback. `trove ui` keeps secrets out of
# shell history / screenshots / pair-programming.
echo '@/Users/you/.trove/minimax/module.md' >> /path/to/project/CLAUDE.md
```

For multi-account scenarios (e.g. multiple GitHub or Cloudflare accounts), duplicate the `library/github-account/` template under a per-account directory name (e.g. `~/.trove/github-personal/`, `~/.trove/github-work/`) and fill each with that account's identity.

## License

MIT
