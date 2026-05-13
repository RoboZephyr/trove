# Trove

> Battle-tested service playbooks + a unified credentials & MCP home that any AI coding agent (Claude Code · Cursor · Codex · Aider) reuses across every project on your machine.

[简体中文](./README.zh-CN.md)

Trove is a directory format and a tiny tool around it. For each third-party service you use, one `~/.trove/<service>/` folder holds three layers the AI needs but no single existing tool unifies:

1. **The playbook** (the moat) — gotchas, billing pitfalls, error-code tables, real code snippets, written from production dogfood. Stripe amounts in cents. Supabase RLS opt-in default. GA4 service-account-as-user-not-IAM. The stuff that gets a senior engineer paged at 2am — pre-loaded so the AI doesn't step on it
2. **API credentials** — keys / tokens / refresh tokens, gitignored at file-mode 600
3. **MCP server pointers** — `mcp:` block per module, so the AI configures the agent it's running in

**No inject step. No init step. No cross-agent adapters.** AI is the runtime: it reads modules, fetches credentials on demand, and even installs MCP servers when needed. Switch projects: same trove. Switch agents (Claude Code → Cursor): same trove.

## Why this matters more in the MCP era

Before MCP, an AI agent needed natural-language docs to call your services. Now it can call MCP servers directly — but every agent has its own mcp.json: `~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/...`. Adding one service to four agents means editing four files. And MCP alone is not enough — most MCP servers cover the happy path only, leaving the AI to rediscover the production landmines that the playbook layer captures.

Trove's `module.md` carries all three layers (playbook + credentials + MCP config) in one file. The AI loads the module, reads the credentials, configures the agent's MCP, and consults the playbook when the MCP server doesn't cover the case (most of them don't, yet). **One file, three layers, every agent.**

## How it doesn't try to be other tools

| Trove is NOT replacing | Because |
|---|---|
| `.env` + `direnv` | Env files have no skill knowledge, no MCP config, and re-fragment per-project. Trove keeps creds but adds the two layers env can't carry |
| `~/.claude/skills/` (and equivalents) | Those are agent-specific. Trove modules are referenced from `CLAUDE.md` / `AGENTS.md` / `.cursorrules` by absolute path, so the same module serves every agent that supports `@-reference` |
| 1Password CLI / `op run` | Credentials only — no playbook, no MCP wiring. Use 1Password as the source-of-truth vault and pull values into trove if you want; the two compose |
| Writing your own skill files per project | Every project re-pays the same authoring cost; trove de-duplicates that across N projects, and the `last_verified` field makes "is this knowledge still correct?" auditable |
| A SaaS / cloud sync | Local-first by design. Sync via git remote / iCloud Drive / rsync — whichever you already use |

## How it works

A module is a directory under `~/.trove/`:

```
~/.trove/minimax/
├── module.md           # YAML frontmatter (schema, applies_to, MCP) + Markdown skill body
└── credentials.json    # Secret values (gitignored, file-mode 600)
```

Reference it from any project's `CLAUDE.md`:

```markdown
@/Users/you/.trove/minimax/module.md
```

That's it. The AI:
1. Auto-loads the module on session start (Claude Code native `@-reference`)
2. Reads `credentials.json` directly when calling the API (no env export needed)
3. Updates the project's CLAUDE.md when you ask it to add a new module

For services with MCP servers, the AI merges the `mcp:` config into your agent's MCP settings the first time you use it.

## Status

**v0.2.2** — Web UI shipped, 17 modules in `library/` gated by `last_verified` (5 production · 10 verified · 2 partial). SPEC §2.3 file-type credentials live (`trove migrate` relocates legacy multiline-string blobs into stable `files/<KEY>.<ext>` paths). `trove install <name>...` headless installer. Format spec is stable; AI-assisted module authoring (v0.3) in progress.

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
