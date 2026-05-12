# Trove

> The local-first, AI-native resource manager for AI coding agents.

[简体中文](./README.zh-CN.md)

Trove is a directory format and a tiny tool around it. Per service, you keep the **hard-won usage knowledge** (gotchas, billing pitfalls, error-code maps — the stuff that gets a senior engineer paged at 2am), plus the API credentials and MCP server pointers, in one place — `~/.trove/` — that any AI coding agent (Claude Code, Cursor, Codex, Aider) reuses across all your projects.

**No inject step. No init step. No cross-agent adapters.** AI is the runtime: it reads modules, fetches credentials on demand, and even installs MCP servers when needed.

## Why

The marketing pitch for "AI configures your services" is easy. The real bottleneck is different: every service has a **landmine field** of gotchas that the AI will step on unless someone — a human who actually ran it in production — wrote them down. Stripe amounts in cents, Supabase RLS opt-in default, Google Analytics service-account-as-user-not-IAM, Resend's two independent sandbox gates: an AI agent gets all of these wrong if you don't pre-load the warning.

**Trove's primary value is that landmine map**, per service, written from dogfood use. Around that, it also consolidates the bookkeeping:

- **Usage docs** (the moat) — gotchas, real code snippets, billing pitfalls, error tables — sourced from your actual production runs, not LLM training data
- **API credentials** → instead of `.env` files in every project, or 1Password, or somewhere else
- **MCP server pointers** → instead of `~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/...`

Switching projects means re-configuring. Switching agents means re-writing. Adding a new service means editing four places. **Trove consolidates this into one place that all agents read from**, with skill knowledge as the part nothing else replaces.

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

**v0.2** — Web UI shipped, 16 modules in `library/` gated by a `last_verified` field (modules without real verification were dropped at v0.2 release). Format spec is stable; AI-assisted module authoring (v0.3) in progress.

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
