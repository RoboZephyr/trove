---
name: aitoearn
version: 0.1.0
category: social-publishing
description: AiToEarn — one-call multi-platform publishing for 14 channels (TikTok, YouTube, X, Instagram, Threads, Pinterest, Facebook, LinkedIn, Bilibili, Douyin, Kwai, Xiaohongshu, WeChat Channels, WeChat Gzh) via unified MCP server
homepage: https://aitoearn.ai
tags: [publishing, social, mcp, multi-platform, oauth-relay]
applies_to:
  - publishing one piece of content to many social platforms in one call
  - getting platform-specific publishing rules (char limits, media specs) before composing
  - polling publish task status by flowId
  - reading cross-platform account/post analytics via data-cube REST
  - avoiding the cost of applying for 14 platform developer accounts (Relay borrows official OAuth credentials)
trove_spec: "0.1"
lastmod: "2026-05-25"
last_verified: "2026-05-16 · module scaffolded, MCP endpoint reachable, not yet smoke-tested with real publish (pending first OAuth on a sacrificial account). Tier: partial — auth + endpoint reachability OK, runtime not exercised"

credentials:
  AITOEARN_API_KEY:
    type: password
    required: true
    help: "https://aitoearn.ai (international) or https://aitoearn.cn (China) → Settings → API Key → Create. Key is environment-scoped: .ai key cannot use .cn MCP and vice versa (401)."
  AITOEARN_ENV:
    type: select
    options: [ai, cn]
    required: true
    default: ai
    help: "ai = international (TikTok / YouTube / Meta / X / Pinterest / LinkedIn dominant). cn = China (Douyin / Xiaohongshu / Kwai / Bilibili / WeChat Channels dominant). Must match the host where the API key was created."
  AITOEARN_MCP_URL:
    type: url
    required: false
    default: "https://aitoearn.ai/api/unified/mcp"
    help: "Override only if self-hosted via docker-compose (then use http://localhost:8080/api/unified/mcp). For hosted use, leave default and switch via AITOEARN_ENV."

mcp:
  type: http
  url: "${credential.AITOEARN_MCP_URL}"
---

# AiToEarn Usage Guide

## ⚠️ Critical Constraints (read first)

1. **Environment / API key must match** — `.ai` key against `.cn` MCP endpoint → 401. Pick one host when creating the key and stick with it. Cross-region accounts need two separate trove project-level installs.
2. **Account ownership vs token custody** — when authorizing a social account, you go through the real OAuth flow with your own credentials, but the `access_token` is custodied on aitoearn's server (only `relayAccountRef` is stored locally). **Account is yours, but every publish call routes through aitoearn's infrastructure.** They can in principle throttle, charge, or shut down the Relay at any time — design for replaceability (see Risk Isolation below).
3. **Publish itself is currently free; AI Create costs credits.** `publishing.service.ts` has zero credit deduction. `aitoearn-ai/image|video|chat` services deduct credits ($1 = 100 credits). If you only use the publish surface, you can run on a free account indefinitely (as of 2026-05) — **no contractual guarantee this stays free**.
4. **Hashtag format must NOT use inline `#tag1#tag2`** — pass as `topics: string[]` array. The `publishRestrictions` tool returns per-platform exact rules; **always call it before composing**.
5. **`flowId` is the only handle to a publish task** — return value of `publishPostTo*` is `{flowId}`; you must call `getPublishingTaskStatus({flowId})` to poll for `published | failed | processing | waiting`. Don't assume sync success.
6. **Media must be uploaded first** — if you have a local file, the docker-compose stack provides RustFS at `localhost:9000` (S3-compatible). For hosted use, upload via the web UI's asset manager or use `createMedia` MCP tool to register a public URL.
7. **Cover image required for video on most platforms** — if missing, use `createThumbnailTask` + `getThumbnailTaskStatus` MCP tools to auto-generate before calling publish.
8. **The "Gold Rush Square" / Monetize marketplace is irrelevant to this module's purpose.** That's the creator side (you accept brand tasks). The publish MCP serves the creator-as-self-publisher use case. Don't conflate.

---

## MCP tool inventory (unified-mcp)

### Account
- `getAccountGroupList` — list your account groups
- `getAccountListByGroupId({groupId})` — list authorized accounts in a group, returns `[{accountId, accountType, nickname, ...}]`

### Publish (one per platform)
- `publishPostToTiktok` / `publishPostToYoutube` / `publishPostToTwitter` / `publishPostToInstagram` / `publishPostToFacebook` / `publishPostToThreads` / `publishPostToPinterest` / `publishPostToBilibili` / `publishPostToKwai` / `publishPostToWxGzh`
- All take `{accountId, title, desc, videoUrl?, coverUrl?, imgUrlList?, topics?, publishTime?, option?}` (option is platform-specific, e.g. Bilibili `tid` category, YouTube `categoryId` + `privacyStatus`)
- Returns `{flowId, ...platform-specific extras (e.g. Douyin returns shortLink + permalink QR)}`

### Status & rules
- `getPublishingTaskStatus({flowId})` — poll task state (`waiting | processing | published | failed`)
- `publishRestrictions({platforms: [...]})` — returns char / size / duration limits per platform. **Call this first**, especially for batch fan-out.

### Content / media management
- `getMediaGroupInfoByName({title})` — find/create media group
- `createMedia({groupId, type, mediaUrl, thumbUrl?, title?, desc?})` — register a public-URL asset
- `getDraftGroupInfoByName({title})` — find/create draft group
- `createDraft({groupId, ...})` — store a draft for later publish

---

## Quick start (Claude Code / Cursor)

This module ships an `mcp:` block in its frontmatter — `trove install aitoearn` then ask your AI agent to merge the block into its MCP config (`~/.claude.json`, `~/.cursor/mcp.json`, etc.) per the trove SPEC §3 MCP-configuration pattern. After that, in any project:

```
List my authorized aitoearn accounts.
```

→ resolves via `getAccountGroupList` + `getAccountListByGroupId`.

```
Publish "Testing MCP integration" to my Twitter via aitoearn.
```

→ resolves via `publishPostToTwitter({accountId, desc: "..."})` → returns `flowId` → polls `getPublishingTaskStatus`.

---

## Composing for many platforms (the right way)

Cross-platform publish is NOT "same payload, N calls" — each platform has hard constraints. The disciplined flow:

1. Call `publishRestrictions({platforms: [...selected]})` once
2. Have the AI / your code generate **per-platform variants** of title / desc / topics / media (Twitter 280 char vs YouTube 5000 char vs Pinterest needs board)
3. Fan-out: call `publishPostTo*` per platform with adapted payload
4. Collect `flowId[]`, poll each with `getPublishingTaskStatus`
5. Aggregate `{platform, status, publishedUrl, errorMsg}` into a structured launch-bundle result

---

## Authorizing accounts (one-time per platform)

The MCP tools assume accounts are already authorized. To authorize:

1. Log into your aitoearn account (web UI at https://aitoearn.ai or your self-hosted `http://localhost:8080`)
2. Account Management → pick platform → click "Authorize"
3. Browser redirects to platform's official OAuth page → log in with **your** social account → grant permission
4. Redirected back; account now appears in `getAccountListByGroupId`

Note: TikTok / YouTube / Twitter / Pinterest / Meta auth flows are fast (minutes). **Bilibili / Douyin / Xiaohongshu / WeChat Channels** require platform-side review of the relay app's developer credentials — sometimes these auth links break temporarily when aitoearn's official dev account hits a review cycle. If a platform auth fails repeatedly, try the other env (e.g. switch from .cn to .ai) or wait a day.

---

## Data-cube (REST, not MCP)

For published-post analytics, the `/dataCube/*` REST endpoints (not exposed as MCP tools, hit them directly with `x-api-key`):

- `GET /accountDataCube/:accountId` — account-level stats
- `GET /getAccountDataBulk/:accountId` — bulk recent stats
- `GET /getArcDataCube/:accountId/:dataId` — single post stats
- `GET /getArcDataBulk/:accountId/:dataId` — bulk post stats over time

Supports 9 platforms (Bilibili, Facebook, Instagram, Kwai, Pinterest, Threads, WeChat Gzh, Xiaohongshu, YouTube). Use these for cross-platform analytics ingest in your project rather than scraping individual platform dashboards.

---

## Risk isolation (recommended pattern)

Because publish-pricing and Relay availability are not contractually guaranteed, wrap the MCP behind a thin client layer in your project so business code never imports aitoearn directly:

```
your-project/
  libs/aitoearn-mcp-client/   # the only place that knows aitoearn exists
    config: { mode: 'relay' | 'self-oauth' | 'hybrid' }
  social/                     # business code calls libs/, not aitoearn
```

When threats materialize:
- aitoearn adds publish fees → switch `mode: relay` → `mode: self-oauth` for platforms you've separately obtained dev credentials for
- aitoearn relay outage → fallback to direct platform SDK (need your own client_id / secret)
- aitoearn shuts down → swap the whole client to a different provider, business code unchanged

Approximate self-OAuth difficulty: easy (Twitter, Pinterest, LinkedIn) → medium (TikTok, YouTube, Meta) → hard (Bilibili, Kwai) → very hard (Douyin, Xiaohongshu, WeChat Channels — often need company entity).

---

## Self-hosted deployment (Docker)

```bash
mkdir -p ~/infra && cd ~/infra
git clone https://github.com/yikart/AiToEarn.git aitoearn-stack
cd aitoearn-stack
# write docker-compose.override.yml with RELAY_* env vars and your own MongoDB / Redis / JWT secrets
# point OPENAI_BASE_URL / API_KEY at your own LLM gateway to avoid burning aitoearn credits
docker compose up -d
open http://localhost:8080
```

Stack: Nginx :8080 → Web (Next.js) :3000 / Server (Nest) :3002 / AI (Nest) :3010 → MongoDB / Redis / RustFS (S3-compatible). Need ≥4 GB RAM, ≥20 GB disk. Detailed env table in `DOCKER_DEPLOYMENT_CN.md` in the upstream repo.

After self-hosting, set `AITOEARN_MCP_URL=http://localhost:8080/api/unified/mcp` in trove credentials.

---

## Pricing reality check (as of 2026-05)

| Surface | Cost on hosted aitoearn.ai | Cost when self-hosted |
|---|---|---|
| Publish (MCP `publishPostTo*`) | $0 currently — no contract | $0 always (assuming relay borrows official OAuth) |
| Data-cube (REST analytics) | $0 currently | $0 always |
| AI Create (image / video / LLM) | 100 credits = $1, marked up over raw provider rates | Pay your own model provider directly (cheaper) |
| OAuth Relay (borrow their dev creds) | Free with any API key | Still free with Relay env vars |

**Bottom line**: if you only consume publish + data-cube, hosted free tier is fine for MVP; self-host when scale demands. If you ever need their AI Create, self-host immediately to bypass the markup.

---

## Error reference

| symptom | meaning | fix |
|---|---|---|
| `401 Unauthorized` on MCP call | API key / env mismatch | confirm key was created on the same host as `AITOEARN_MCP_URL` (ai vs cn) |
| `Account not found` in publish response | `accountId` doesn't belong to current user | re-list via `getAccountListByGroupId`; accounts may have been deauthorized |
| `Platform XXX restrictions not found` | typo in platform name | platform values are the exact `AccountType` enum: `bilibili, facebook, instagram, threads, pinterest, youtube, tiktok, twitter, kwai, xhs, douyin, wxGzh` |
| Publish stuck in `waiting` for >10 min | platform-side queue or auth invalidated | check account status in web UI; the relay's `credential-invalidation.service.ts` will eventually mark it expired |
| `RelayServerUnavailable` in self-host logs | RELAY_API_KEY wrong or expired | re-create the API key, restart `aitoearn-server` |

---

## Why this module exists in trove

aitoearn replaces what would otherwise be a multi-month integration project per platform (OAuth + media upload + publish API + webhook + token refresh + content review handling, × 14 platforms, many of which require corporate developer accounts you may not be able to get). The trade-off is operational dependency on a single vendor — mitigated by the Risk Isolation pattern above and the option to self-host the entire stack under MIT license.

---

## Source of truth (refresh when these change)

- AiToEarn product site (international) — https://aitoearn.ai
- AiToEarn (China) — https://aitoearn.cn
- Self-host repo — https://github.com/yikart/AiToEarn
- API key console — https://aitoearn.ai/settings/api-key
- MCP endpoint catalogue — https://aitoearn.ai/api/unified/mcp (live MCP server, list tools via the standard MCP `tools/list` introspection)

Last upstream-docs sync: see `lastmod`. Last live-API verification: see `last_verified`.
