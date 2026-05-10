# Trove

> The local-first, AI-native resource manager for AI coding agents.

[简体中文](./README.zh-CN.md)

Trove is a directory format and a tiny tool around it. You keep API credentials, MCP server configs, and usage docs (skills) for every service you use in one place — `~/.trove/` — and any AI coding agent (Claude Code, Cursor, Codex, Aider) reuses them across all your projects.

**No inject step. No init step. No cross-agent adapters.** AI is the runtime: it reads modules, fetches credentials on demand, and even configures MCP servers when needed.

## Why

Today, AI coding agents need to work with many third-party services (Stripe, Anthropic, MiniMax, Cloudflare, Supabase…). The resources for using these services are scattered:

- API credentials → `.env` files in every project, or 1Password, or somewhere else
- MCP server configs → `~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/...`
- Usage docs → `CLAUDE.md`, `AGENTS.md`, `.cursorrules` (one per agent, no reuse)

Switching projects means re-configuring. Switching agents means re-writing. Adding a new service means editing four places. **Trove consolidates this into one place that all agents read from.**

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

**v0.1 draft** — early stage. Format spec is stable; tooling (Web UI, AI Authoring) in progress.

See:
- [SPEC.md](./SPEC.md) — full format specification (Chinese, English translation forthcoming)
- [ROADMAP.md](./ROADMAP.md) — what's planned
- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to contribute modules

## Quick start (manual mode, no tooling required)

```bash
# 1. Create your trove
mkdir -p ~/.trove

# 2. Add a module (e.g. copy from this repo's examples/)
cp -r examples/minimax ~/.trove/
chmod 600 ~/.trove/minimax/credentials.json

# 3. Fill in your real credentials
$EDITOR ~/.trove/minimax/credentials.json
# ⚠️ This is the v0.1 fallback. v0.2 ships `trove ui` with AI-guided credential entry
# that avoids leaking secrets into shell history / screenshots.

# 4. Reference it from any project's CLAUDE.md
echo '@/Users/you/.trove/minimax/module.md' >> /path/to/project/CLAUDE.md

# 5. Start your AI agent there
cd /path/to/project && claude
```

The AI now knows MiniMax: how to call it, what gotchas to avoid, where to find the key.

For multi-account scenarios (e.g. multiple GitHub or Cloudflare accounts), make multiple named modules — see `examples/github-robozephyr/` and `examples/github-a404coder/` for a worked example.

## License

MIT
