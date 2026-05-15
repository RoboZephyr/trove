# Security Policy

Trove manages API credentials on contributors' and users' machines, so we take security reports seriously.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately via GitHub's security advisory flow:
<https://github.com/RoboZephyr/trove/security/advisories/new>

Include:
- A short description of the issue
- Reproduction steps or a proof-of-concept (if you have one)
- The version / commit hash you tested
- Your assessment of impact (who is affected, what they can do)

You can expect an initial acknowledgement within 7 days. Fix timelines depend on severity.

## Scope

In scope:
- The CLI (`@robozephyr/trove`) — credential read/write, file mode enforcement, path handling, MCP config merging
- The Web UI (`trove ui`) — local HTTP server on `127.0.0.1:7821`, credential form handling, SSRF, content escape on rendered module bodies
- The bundled module library (`library/`) — example credential files, skill body contents
- The hosted landing site (`site/`, `trove.robozephyr.com`) — content only

Out of scope:
- Issues that require the attacker to already have shell or read access to the user's `~/.trove/` directory (the threat model assumes filesystem perms are intact)
- Bugs in third-party services trove integrates with (Stripe, Supabase, Cloudflare, etc.) — please report those to the respective vendors

## Supported versions

Only the latest published `@robozephyr/trove` minor on npm is supported. We do not backport fixes to earlier versions; users should upgrade.

| version | supported |
|---------|-----------|
| `0.2.x` | ✅        |
| `< 0.2` | ❌        |

## Hardening that ships by default

- `credentials.json` is written `0600`
- `files/` subdirectories are written `0700`; individual files inherit each field's `file_mode` (default `0600`)
- `.gitignore` excludes `**/credentials.json`, `**/files/`, `*.env`, `*.env.local`, `.dev.vars*` at the repo root
- The Web UI binds to `127.0.0.1` only — no public listen by default
- The Web UI API `GET` endpoints **never** return file-credential contents (see [SPEC §2.3.5](./SPEC.md))

If you find a deviation from any of the above, that's a finding.
