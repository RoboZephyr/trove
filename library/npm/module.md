---
name: npm
version: 0.1.0
category: dev-tool
description: npm registry — publishing, installing, and authoring Node packages. Focus on publish-side gotchas that bite first-time package authors
homepage: https://docs.npmjs.com
tags: [registry, publish, node, package-manager]
applies_to:
  - publishing a package to npmjs.com (one-shot or from CI)
  - authoring `package.json` for distribution (`bin`, `files`, `engines`, `publishConfig`, `exports`)
  - choosing a package name (handling name squat, scoped vs unscoped)
  - npm auth tokens for CI / unattended publish
  - installing global CLIs (`npm install -g`) and verifying the `bin` shim resolves
  - migrating an internal project to a published package
trove_spec: "0.1"
last_verified: "production · 2026-05-12 — `@robozephyr/trove@0.2.0` actually published to https://registry.npmjs.org/ via Granular Token with Bypass-2FA enabled, token sourced from `~/.trove/npm/credentials.json` (full trove dogfood loop closed). Confirmed: registry returns the version on `npm view`, fresh `npm install @robozephyr/trove` in /tmp succeeds, `bin/` shim resolves and `trove validate --library` finds the bundled 17 modules. Schema lessons from same session: OWNED_SCOPES must reflect the TOKEN's reach not account-level theoretical ownership (otherwise AI hits 403); CLI flag `--//registry.npmjs.org/:_authToken=` form is shell-eaten — use `NPM_CONFIG_USERCONFIG=<tempfile>` instead; 2FA on account requires the Granular Token's Bypass-2FA checkbox or every publish dies with EOTP in non-interactive shells"

credentials:
  NPM_USERNAME:
    type: text
    required: true
    help: "Your npmjs.com username. Used by the AI to default to your personal scope (`@<username>/foo`) when picking new package names. Run `npm whoami` after `npm login` to find it."
  NPM_DEFAULT_SCOPE:
    type: text
    required: false
    help: "Scope the AI should default to when publishing new packages. Format with leading `@`, e.g. `@robozephyr`. If unset, falls back to `@<NPM_USERNAME>`. Set this to e.g. `@your-company` if work packages should NOT go under your personal scope."
  NPM_OWNED_SCOPES:
    type: multiline
    required: false
    help: "Scopes that the CREDENTIAL IN THIS FILE can actually publish to (NOT the broader account-level theoretical ownership). If you're using a Granular Token, list ONLY the scopes that token authorizes (the token UI lets you pick \"All packages\" or specific scopes — match what you selected). If interactive `npm login`, list every scope you own. The AI uses this to refuse package names you can't reach with the credential here — preventing 403 round-trips. Format: comma-separated `@scope` names. Find what you own via https://www.npmjs.com/settings/<username>/packages and /orgs."
  NPM_TOKEN:
    type: password
    required: false
    help: "Personal Access Token for unattended publish (CI). Generate at https://www.npmjs.com/settings/<user>/tokens with type `Automation` (bypasses 2FA prompts). For local interactive publish, `npm login` is fine and no token is needed. NEVER commit this — `~/.trove/npm/credentials.json` has 600 perms and is gitignored."
  NPM_REGISTRY:
    type: url
    required: false
    default: "https://registry.npmjs.org/"
    help: "Override only for private registries (Verdaccio, GitHub Packages, corporate proxy). Default is public npmjs.org."
---

# npm Usage Guide

## ⚠️ Critical Constraints (read before publishing)

1. **Bare names are mostly squatted — check with `npm view <name>` BEFORE writing code**. Lots of single-word names point to abandoned 2010–2015 packages at `v0.0.0`. The registry **does not auto-release squatted names**. Three options when the name you want is taken:
   - Use a **scoped name**: `@yourname/foo` — no squat conflicts, ever
   - Pick a related name (`foo-cli`, `foos`, `foox`) — but check typo collisions
   - File a [dispute](https://docs.npmjs.com/policies/disputes) — slow, rarely successful unless name infringes trademark
2. **Scoped packages publish PRIVATE by default and fail without a paid account** — `@you/foo` will error with "402 Payment Required" on a free account. Two fixes (pick one):
   - Put `"publishConfig": { "access": "public" }` in `package.json` ← persistent, recommended
   - Pass `npm publish --access public` ← per-invocation
3. **`private: true` blocks publish entirely** — must be removed (or set `false`) before publishing. Forgetting this is the #1 "why did publish hang up" reason
4. **Without a `files:` array, EVERYTHING in the package dir ships** — including `node_modules` (if no `.npmignore`), `.env`, `.DS_Store`, `coverage/`, raw source. Always set `files:` to an explicit allowlist. `package.json`, `README.md`, `LICENSE` are auto-included; you don't need to list them
5. **`bin` scripts need a shebang AND executable bit** — `bin: { "mycli": "./dist/cli.js" }` requires `dist/cli.js` to start with `#!/usr/bin/env node` and have `chmod +x`. npm sets the executable bit on install, but only on real shebang-led files. Forgetting either gives a cryptic `EACCES` or "command not found" after global install
6. **Cannot unpublish after 72 hours** — only `npm deprecate <pkg>@<version> "message"`. The bad version stays installable but warns. Test with `npm pack --dry-run` first, every time
7. **`prepublishOnly` runs before publish but NOT before `npm pack`** — if you use `npm pack` to inspect what'll ship, the tarball may NOT reflect a fresh build. Use `npm publish --dry-run` instead to run the full pipeline without actually pushing
8. **2FA on the account blocks `npm publish` without an OTP** — for automation, use a token of type `Automation` (bypasses 2FA), NOT `Publish`. Or pass `--otp=123456` interactively
9. **`type: "module"` makes every `.js` file ESM** — `require()` won't work; CommonJS consumers need a `.cjs` build or `exports` map. JSON imports use `import x from "./pkg.json" with { type: "json" }` (Node 22+)
10. **`engines.node` is informational by default** — npm installs anyway on older Node. To enforce, set `"engineStrict": true` (deprecated, no-op in modern npm) — better: test in CI on the minimum Node version. pnpm DOES respect `engines.node` strictly
11. **2FA on the account blocks `npm publish` from the CLI by default — you need a Granular Token with "Bypass two-factor authentication (2FA)" CHECKED to publish non-interactively**. The checkbox is in the token creation form (https://www.npmjs.com/settings/<username>/tokens → New Granular Token). Without it, even with a valid token, every `npm publish` falls back to the browser OAuth handshake and dies in non-interactive shells (`EOTP`). The npm UI also nudges you toward "Trusted Publishing" (OIDC from GitHub Actions / GitLab CI) — that's the modern best practice for CI publish, but it does NOT apply to local dev / AI agent publish from your machine; for those, Bypass-2FA Granular Token is the right answer
12. **`npm publish` reads auth from `~/.npmrc`, NOT from `NPM_TOKEN` env var** — the `NPM_TOKEN` convention is just a placeholder you reference from an `.npmrc` template (`//registry.npmjs.org/:_authToken=${NPM_TOKEN}`). To pass a token inline for one publish without overwriting `~/.npmrc`, use `NPM_CONFIG_USERCONFIG=<tempfile>` pointing at a tempfile containing the `_authToken=` line. The CLI flag form `--//registry.npmjs.org/:_authToken=$T` gets eaten by some shells (the `//` is interpreted as a comment or path); the userconfig-override approach is the reliable inline path

---

## Identity setup (fill credentials before first use)

Before the AI can publish on your behalf, the `credentials.json` for this module needs to know **who you are on npm** — not just your token. The four identity fields:

```bash
# 1. Username
npm whoami
# → robozephyr

# 2. Default scope (what the AI should reach for first)
# Convention: same as your username, prefixed with @. Override only if
# work packages should go elsewhere by default.
# → @robozephyr   (or @your-company)

# 3. All scopes you can publish to
# Personal scope is implicit: @<username>
# Org scopes — list every org you belong to:
npm org ls <orgname>        # confirms you're a member of <orgname>
# Or visually: https://www.npmjs.com/settings/<username>/orgs
# → @your-username, @your-personal-org, @your-company-org

# 4. (Optional) Automation token for unattended publish
# https://www.npmjs.com/settings/<username>/tokens → Generate New Token → Automation
# Save the `npm_...` value to credentials.json's NPM_TOKEN field.
```

**Why this matters**: without `NPM_OWNED_SCOPES`, the AI will happily try to publish `@coolname/foo` for you, hit `403 Forbidden`, and waste a round-trip. With it set, the AI restricts new-package names to scopes you actually own (or asks you to add one). This is the whole point of having a Trove module — encode the identity once, never re-ask.

**Multi-account scenario**: if you have two npm accounts (e.g. personal + work), follow the same pattern as the Cloudflare / GitHub modules — create two separately-named Trove modules: `~/.trove/npm-personal/`, `~/.trove/npm-work/`, each with its own credentials.

---

## Publishing a package: end-to-end

### Step 1: Pick a name

```bash
npm view <name>                    # 404 = available; otherwise see version + maintainer
npm view <name> versions           # see if it's a dead v0.0.0 or actively maintained
```

If squatted, switch to scoped: `@yourname/<name>`. Your npm username is the only scope you own by default; create an org for team scopes.

### Step 2: package.json for a CLI

```jsonc
{
  "name": "@yourname/foo",
  "version": "0.1.0",
  "description": "...",
  "license": "MIT",
  "type": "module",
  "bin": {
    "foo": "./dist/cli.js"
  },
  "files": [
    "dist",
    "LICENSE",
    "README.md"
  ],
  "engines": {
    "node": ">=22"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "...",
    "prepublishOnly": "npm run build"
  }
}
```

**Field-by-field**:
- `bin` — maps command name (left) to script (right). Script needs shebang `#!/usr/bin/env node` and must be executable. After `npm install -g`, the command appears in `$PATH`
- `files` — allowlist. `dist`, `library`, etc. `package.json` / `README.md` / `LICENSE` always shipped; do NOT list them
- `engines.node` — minimum Node version. Use `">=22"` for native TS import attributes; `">=20"` for broad LTS reach
- `publishConfig.access: "public"` — required for scoped packages on free accounts; ignored for unscoped
- `prepublishOnly` — runs only on `npm publish`, NOT on `npm pack`. Put your build + typecheck here

### Step 3: Verify before publishing

```bash
npm pack --dry-run                 # prints the file list and tarball size without writing anything
# Read every line. Look for: source files you didn't mean to ship, secrets, oversized binaries
```

```bash
# Real install test from local tarball
npm pack                           # produces yourname-foo-0.1.0.tgz
cd /tmp && mkdir test && cd test && npm init -y
npm install /path/to/yourname-foo-0.1.0.tgz
./node_modules/.bin/foo --version  # must work end-to-end
```

### Step 4: Publish

```bash
# First-time: log in
npm login                          # opens browser for OAuth

# Publish
npm publish
# If account has 2FA "auth and writes":
npm publish --otp=123456
```

**`--dry-run` first**:
```bash
npm publish --dry-run              # runs prepublishOnly, builds the tarball, but skips the actual upload
```

### Step 5: CI publish via token

GitHub Actions example:
```yaml
- run: npm ci && npm run build
- run: npm publish --provenance --access public
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

`.npmrc` for token auth:
```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

`--provenance` requires OIDC (works natively in GitHub Actions) — emits a signed attestation linking the npm tarball back to the commit. Increasingly expected for security-sensitive packages.

---

## Token types (npmjs.com → Settings → Access Tokens)

| Type | Use case | 2FA prompted? |
|---|---|---|
| **Classic / Publish** | Local interactive use | Yes, prompts for OTP on publish |
| **Classic / Automation** | CI publish | **No** — bypasses 2FA. Use this for GH Actions etc. |
| **Granular** | Fine-grained per-package, per-org, with expiration | No (configurable) |

Use `Granular` for new tokens — supports scope to a single package and an expiration date. Old `Classic / Automation` works but is account-wide and never expires.

---

## Installing global CLIs (consumer side)

```bash
npm install -g @yourname/foo       # installs to npm's global prefix
which foo                          # /Users/you/.nvm/versions/node/v22.x.x/bin/foo (or similar)

# Alternative: npx without install (one-shot)
npx @yourname/foo --version
```

**Gotchas**:
- Some environments (`brew`-installed node, system node on macOS) put the global prefix in a path that needs `sudo`. Either fix the prefix (`npm config set prefix ~/.npm-global` + add to `$PATH`) or use a node version manager (nvm, fnm, volta)
- After global install, if `command not found`: check `npm bin -g` for the actual install path, and that it's in `$PATH`
- For scoped packages, the `bin` command name comes from the `bin` field, NOT the package name. `@yourname/foo` with `bin: { "foo": "..." }` installs as `foo`, not `@yourname/foo`

---

## ESM-specific traps

- **`type: "module"` + bundled JSON**: `import pkg from "../package.json" with { type: "json" }` works in Node 22+ natively. esbuild also handles it during bundling (inlines as a literal object). TypeScript 5.3+ syntax
- **No `__dirname` / `__filename`**: use `fileURLToPath(import.meta.url)` + `dirname()` from `node:url` / `node:path`
- **`require()` is not defined**: in ESM, use `import()` (dynamic) or `import` (static)
- **esbuild bundling + shebang**: esbuild preserves the shebang from the source entry file. **Do not also add `--banner:js="#!/usr/bin/env node"`** — that produces a double shebang and a SyntaxError on the second line. Pick one (preferring source shebang so dev runs work too)

---

## Versioning

```bash
npm version patch                  # 0.1.0 → 0.1.1, commits + tags
npm version minor                  # 0.1.0 → 0.2.0
npm version major                  # 0.1.0 → 1.0.0
npm version 0.2.0-alpha.1          # explicit prerelease

npm publish --tag next             # publish under `next` dist-tag, NOT `latest`
# Consumers install with: npm install @yourname/foo@next
```

**`--tag next`** is critical for prereleases — without it, your alpha becomes the default `npm install` version.

---

## Error reference

| Error | Cause | Fix |
|---|---|---|
| `402 Payment Required` | Publishing scoped pkg as private without paid plan | `publishConfig.access: "public"` |
| `403 Forbidden — cannot publish over previously published version` | Version already exists; npm never lets you re-publish the same `name@version` | Bump version: `npm version patch` |
| `403 Forbidden — package name too similar to existing` | Name collides with an existing package by edit distance | Change name |
| `EACCES: permission denied` on global install | Global prefix needs sudo (system node) | Use nvm / fnm, or `npm config set prefix ~/.npm-global` |
| `command not found: foo` after global install | `bin` shim's `$PATH` not configured, or missing shebang | `which foo`; check shebang + exec bit |
| `Invalid or unexpected token` on bin script run | Double shebang from `--banner` + source | Remove banner, keep source shebang |
| `Cannot find package` after install | ESM consumer trying CJS-only package, or vice versa | Check `type:` field; add `exports` map |
| `npm ERR! code ENEEDAUTH` | No token / not logged in | `npm login` or set `NODE_AUTH_TOKEN` |

---

## When you'd want to NOT publish to npm

- **Pure library code for an internal repo**: GitHub Packages or a tarball in S3 may suffice
- **You want a single binary, not a node_modules install**: use `bun build --compile` or `pkg` to produce a standalone executable; ship via Homebrew tap or GitHub Releases
- **Sensitive code**: npm tarballs are public + permanently archived. Even after deprecate, content remains downloadable. Don't ship anything you can't put on GitHub
