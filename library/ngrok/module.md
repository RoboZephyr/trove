---
name: ngrok
version: 0.1.0
category: dev-tooling
description: ngrok — secure public tunnels into local ports. Webhook testing, ephemeral demo URLs, OAuth-callback dev loops, mobile-device → laptop. CLI agent + REST management API
homepage: https://ngrok.com/docs
tags: [tunneling, webhook-dev, oauth-callback, https, dev-tooling]
applies_to:
  - exposing a local HTTP server to receive webhooks during dev (Stripe, GitHub, Slack, etc.)
  - sharing a demo URL with someone outside your network for 5 minutes
  - testing OAuth redirect / callback flows that demand a public HTTPS URL
  - hooking a mobile device to a laptop dev server without LAN configuration
  - serving a TCP service (SSH / RDP / Postgres / game server) via ngrok edge
trove_spec: "0.1"
lastmod: "2026-05-14"
last_verified: "2026-05-15 · E2E live tunnel — `ngrok http :9876` against local python3 -m http.server, public URL `https://<adj>-<adj>-<noun>.ngrok-free.dev` served local content byte-for-byte. Management API smoke: `GET /credentials` returned account inventory (HTTP 200, `ngrok-version: 2` header confirmed mandatory). `GET /reserved_domains` confirmed the free-tier account is auto-provisioned with 1 stable subdomain at signup (description: 'Your dev domain') — restart-stable, not random. ngrok CLI v3.36.1. Subdomain TLD is `.ngrok-free.dev` (NOT `.ngrok-free.app` of older docs)"

credentials:
  NGROK_AUTHTOKEN:
    type: password
    required: true
    help: "Authtoken for the ngrok CLI agent. Get from https://dashboard.ngrok.com/get-started/your-authtoken. Use this to start tunnels. NOT the same as NGROK_API_KEY (#1 source of confusion)."
  NGROK_API_KEY:
    type: password
    required: false
    help: "Optional. API key for the ngrok management REST API (https://api.ngrok.com — reserved domains, abuse reports, traffic policy, etc.). Get from https://dashboard.ngrok.com/api. Most users do not need this — only required if you script reserved-domain creation, OAuth provider config, or other dashboard-side resources."
---

# ngrok Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **There are TWO credentials and they are not the same** — `NGROK_AUTHTOKEN` is for the **agent** (the `ngrok` CLI binary that opens tunnels). `NGROK_API_KEY` is for the **management API** (https://api.ngrok.com — for scripting reserved domains, listing abuse reports, etc.). They come from two different dashboard pages, use two different setup commands, and authenticate two different services. **#1 reason a new integration fails with 401.**
2. **Free tier gives you ONE stable reserved domain per account, then random URLs beyond that** — every new ngrok account is auto-provisioned with one reserved subdomain like `<adj>-<adj>-<noun>.ngrok-free.dev` (description: "Your dev domain", visible at https://dashboard.ngrok.com/domains and via `GET /reserved_domains` on the management API). Your **first** `ngrok http` on the free plan picks up this stable subdomain — so the URL DOES survive restarts as long as no other tunnel is using it. Random `*.ngrok-free.dev` URLs only kick in for **additional concurrent tunnels** beyond the first, OR if you've already started one and try a second without specifying `--url`. For webhook configs (Stripe / GitHub), drop this stable domain into the provider once and you're done — no re-paste loop. (Older docs / tutorials describe "every restart is random" — that was the pre-2025 behavior.)
3. **`ngrok tcp` requires a payment method on file** — even on the free plan, TCP tunnels are gated behind "valid payment method." HTTP / HTTPS tunnels work without one.
4. **v3 deprecated `--basic-auth` / `--oauth` / `--cidr-allow` / `--ip-restriction` flags** — use a traffic policy file instead: `--traffic-policy-file tp.yml` or `--traffic-policy-url`. The old flags still work but emit deprecation warnings and won't be in v4.
5. **v3 deprecated `--domain` / `--hostname` / `--subdomain`** — use `--url=` instead: `ngrok http 8080 --url=https://x.ngrok.dev`. Old flags still parsed for now; new docs only show `--url`.
6. **Management API requires BOTH headers** — `Authorization: Bearer <NGROK_API_KEY>` AND `ngrok-version: 2`. Forgetting `ngrok-version` returns a confusing 404 instead of 400, easy to misdiagnose as wrong URL.
7. **Management API rate limit: 120 req / 60s rolling** — exceeding returns `429 ERR_NGROK_226`. Generous for human work, tight for batch scripts — backoff in any automation loop.
8. **Session disconnect on free tier** — long-lived tunnels on the free plan can disconnect after a few hours of idle. The agent auto-reconnects but the URL changes (it's a fresh random subdomain), so dependent webhooks break silently. Use a paid reserved domain for anything > ~1h.
9. **The `ngrok` binary must be installed separately** — trove only manages credentials and skill. Install via `brew install ngrok/ngrok/ngrok` (macOS), `snap install ngrok` (Ubuntu), or download from https://ngrok.com/download. Run `ngrok version` to confirm.
10. **Inspect interface lives on `http://localhost:4040`** — every running ngrok agent serves a request/response inspector on this port. Super useful for debugging webhook handlers ("what did Stripe actually send me?") but it conflicts with anything else on 4040. Override with `--web-addr 127.0.0.1:4041`.
11. **Free-tier URLs are `*.ngrok-free.dev`, NOT `*.ngrok-free.app`** — older docs and Stack Overflow answers reference `.ngrok-free.app`; current ngrok issues `.ngrok-free.dev`. Verified live 2026-05-15. If you grep your code or copy-paste from an old tutorial, update the TLD.

---

## Setup

### Install the CLI agent

```bash
# macOS
brew install ngrok/ngrok/ngrok

# Linux (snap)
sudo snap install ngrok

# Direct download (any platform)
curl -L https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-amd64.zip -o ngrok.zip && unzip ngrok.zip
```

Confirm:

```bash
ngrok version
# should report ngrok version 3.x.x
```

### Wire the authtoken (one-time per machine)

```bash
# Pull from Trove on demand — do not echo the value into shell history
ngrok config add-authtoken "$(jq -r .NGROK_AUTHTOKEN ~/.trove/ngrok/credentials.json)"
```

This writes the token into `~/.config/ngrok/ngrok.yml` (Linux) or `~/Library/Application Support/ngrok/ngrok.yml` (macOS). Verify:

```bash
ngrok config check
# → "Valid configuration file at /path/to/ngrok.yml"
```

### Wire the API key (only if using the management API)

```bash
ngrok config add-api-key "$(jq -r .NGROK_API_KEY ~/.trove/ngrok/credentials.json)"
```

The `ngrok api ...` subcommands now work without further auth.

---

## Common patterns

### HTTP tunnel — uses your account's stable free-tier subdomain

```bash
ngrok http 8080
# → Forwarding https://<your-adj-adj-noun>.ngrok-free.dev -> http://localhost:8080
```

On the free plan, your first concurrent tunnel auto-binds to the account's one reserved `*.ngrok-free.dev` subdomain (provisioned at signup). Restart-stable — drop the URL into a webhook config once.

Find your account's reserved domain at https://dashboard.ngrok.com/domains, or via:

```bash
curl https://api.ngrok.com/reserved_domains \
  -H "Authorization: Bearer $NGROK_API_KEY" \
  -H "ngrok-version: 2" | jq -r '.reserved_domains[].domain'
```

### HTTP tunnel — random URL (when you need an extra concurrent tunnel)

```bash
ngrok http 8080 --url=https://random-extra.ngrok-free.dev
```

If you need a second tunnel while the first is using your reserved subdomain, ngrok will issue a random `*.ngrok-free.dev` URL for the additional one. That URL is per-session and changes on restart.

### HTTP tunnel — custom reserved domain (paid plan)

```bash
ngrok http 8080 --url=https://api.yourdomain.com
```

Custom domains (your own DNS, CNAME'd to ngrok edges) require a paid plan. Reserve via the dashboard or the management API.

### TCP tunnel — SSH, Postgres, game servers

```bash
ngrok tcp 22
# → Forwarding tcp://4.tcp.ngrok.io:14821 -> localhost:22
```

The host:port pair changes every restart unless you reserve an address. Free plan needs a payment method on file.

### TLS tunnel — terminate TLS yourself

```bash
ngrok tls 8443 --url=https://yourname.ngrok.dev
```

Use when your local server speaks TLS directly (your own cert) instead of letting ngrok do TLS termination.

### Multi-tunnel — config file

For more than one tunnel at a time, define them in the config file:

```yaml
# ~/.config/ngrok/ngrok.yml  (or ~/Library/Application Support/ngrok/ngrok.yml on macOS)
version: "3"
agent:
  authtoken: <set via `ngrok config add-authtoken` — do not paste here>
endpoints:
  - name: api
    url: https://api-dev.yourname.ngrok.dev
    upstream:
      url: http://localhost:3001
  - name: webhook
    url: https://webhook-dev.yourname.ngrok.dev
    upstream:
      url: http://localhost:4242
```

Then:

```bash
ngrok start api webhook
# or all defined endpoints
ngrok start --all
```

---

## Traffic policy (replaces deprecated v3 flags)

v3 moved access controls — basic auth, OAuth, IP allowlists, CIDR restrictions, header injection — into a single declarative traffic-policy YAML file. Old flags (`--basic-auth user:pass`, `--cidr-allow`, `--oauth google`) still parse but warn.

Example `tp.yml`:

```yaml
on_http_request:
  # Require Basic Auth on every inbound request
  - actions:
      - type: basic-auth
        config:
          credentials:
            - user: alice
              password: <secret>
  # IP allowlist
  - expressions:
      - "!conn.client_ip.in_cidr_list(['203.0.113.0/24'])"
    actions:
      - type: deny
        config:
          status_code: 403
```

Run with:

```bash
ngrok http 8080 --url=https://yourname.ngrok.dev --traffic-policy-file tp.yml
```

Full rule reference: https://ngrok.com/docs/traffic-policy/

---

## Inspect interface (localhost:4040)

Every running ngrok agent serves a request/response inspector at `http://localhost:4040`. Open it after `ngrok http`:

- **Status** — current tunnels, URL, connections opened, latency
- **Inspect** — every HTTP request that came through, full headers + body, replay button
- **Replay** — re-fire the same request to your local server (great for "Stripe sent a webhook 3 hours ago and I want to test my fix")

If 4040 conflicts with something else:

```bash
ngrok http 8080 --web-addr=127.0.0.1:4041
```

---

## Webhook handler dev loop (Stripe / GitHub / Slack)

The canonical reason to use ngrok during dev:

```bash
# 1. Start local handler
node webhook-handler.js   # listens on :4242

# 2. Open ngrok tunnel
ngrok http 4242
# → forwarding https://b3a7-203-0-113-42.ngrok-free.dev -> http://localhost:4242

# 3. Paste that URL into the provider's webhook config:
#    Stripe: dashboard.stripe.com/test/webhooks → Add endpoint → URL = https://b3a7-....ngrok-free.dev/webhooks
#    GitHub: repo Settings → Webhooks → Payload URL = same
#    Slack: api.slack.com/apps → Event Subscriptions → Request URL = same

# 4. Fire a test event from the provider — it lands at your local server
#    Replay via http://localhost:4040
```

**Signature verification still applies** — ngrok does not strip or alter the signing headers (`Stripe-Signature`, `X-Hub-Signature-256`, etc.). Verify them on the local server side exactly as in production.

**For repeated dev sessions** — use the Stripe CLI's local listener instead (`stripe listen --forward-to localhost:4242/webhooks`), which bypasses ngrok entirely for Stripe-specific webhook dev. ngrok wins when the provider doesn't ship a CLI listener.

---

## Management API (with NGROK_API_KEY)

When you script reserved-domain creation, audit ngrok usage across an org, etc.

```bash
NGROK_API_KEY=$(jq -r .NGROK_API_KEY ~/.trove/ngrok/credentials.json)

# Smoke — also useful as a "is my key working" probe (zero side effects)
curl https://api.ngrok.com \
  -H "Authorization: Bearer $NGROK_API_KEY" \
  -H "ngrok-version: 2"
```

Common endpoints (all under `https://api.ngrok.com`, all need both headers):

| operation | method | path |
|---|---|---|
| API root / liveness | `GET` | `/` |
| List API keys | `GET` | `/api_keys` |
| List authtokens (credentials) | `GET` | `/credentials` |
| List reserved domains | `GET` | `/reserved_domains` |
| Create reserved domain | `POST` | `/reserved_domains` |
| List active tunnel sessions | `GET` | `/tunnel_sessions` |
| Stop a tunnel session | `POST` | `/tunnel_sessions/{id}/stop` |
| List endpoints | `GET` | `/endpoints` |
| Abuse reports | `POST` | `/abuse_reports` |

**Reservation example** — create a reserved domain via API:

```bash
curl -X POST https://api.ngrok.com/reserved_domains \
  -H "Authorization: Bearer $NGROK_API_KEY" \
  -H "ngrok-version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "yourname.ngrok.dev",
    "description": "dev tunnel for webhook handler"
  }'
```

**Rate limit**: 120 requests / 60s rolling. Exceeding returns `429 ERR_NGROK_226`.

Full endpoint reference (LLM-friendly): https://ngrok.com/docs/llms.txt — feed this into your agent for autocomplete-style API knowledge.

---

## Trove-side helpers

Pull authtoken + API key on demand, never pre-export:

```bash
# Just the authtoken for one-shot CLI usage
NGROK_AUTHTOKEN=$(jq -r .NGROK_AUTHTOKEN ~/.trove/ngrok/credentials.json) ngrok http 8080
```

Or wire the CLI once (recommended) so future invocations don't need the env var:

```bash
ngrok config add-authtoken "$(jq -r .NGROK_AUTHTOKEN ~/.trove/ngrok/credentials.json)"
ngrok config add-api-key   "$(jq -r .NGROK_API_KEY   ~/.trove/ngrok/credentials.json)"
```

---

## Common pitfalls

| symptom | cause | fix |
|---|---|---|
| `ERR_NGROK_105 / 401 invalid authtoken` | authtoken wrong / from different account | re-copy from https://dashboard.ngrok.com/get-started/your-authtoken |
| `ERR_NGROK_113 / 401` on `api.ngrok.com` calls | API key wrong, OR missing `ngrok-version: 2` header | add the header; if still 401, verify the key at https://dashboard.ngrok.com/api |
| `ERR_NGROK_3200 / "TCP requires payment method"` | free plan, TCP tunnel | add a payment method (no charge for free-tier TCP, just gating) |
| `ERR_NGROK_8012 / "Domain already in use"` | reserved domain bound to another tunnel session | stop the other session (dashboard or `ngrok api tunnel_sessions stop <id>`) before starting a new one |
| Webhook works once then 404s | restarted ngrok on free plan → new random URL | re-paste URL into webhook provider, OR upgrade for a reserved domain |
| Webhook provider says "signature mismatch" | clock drift on the local server, OR you accidentally ngrok-proxied the signing-secret header off | confirm clock sync; ngrok does not strip signing headers — check your own server's middleware order |
| Inspect UI at `localhost:4040` 404s | another process holds 4040 | `--web-addr 127.0.0.1:4041` |
| 429 `ERR_NGROK_226` from API | hit 120 req / 60s rate limit | exponential backoff in your script |

---

## Source of truth (refresh when these change)

- ngrok CLI reference — https://ngrok.com/docs/agent/cli
- Config file v3 schema — https://ngrok.com/docs/agent/config
- Traffic policy reference — https://ngrok.com/docs/traffic-policy/
- Management API overview — https://ngrok.com/docs/api
- Full API endpoint list (LLM-friendly) — https://ngrok.com/docs/llms.txt
- Authtoken page — https://dashboard.ngrok.com/get-started/your-authtoken
- API key page — https://dashboard.ngrok.com/api
- Reserved domains — https://dashboard.ngrok.com/cloud-edge/domains
- Pricing — https://ngrok.com/pricing

Last upstream-docs sync: see `lastmod` in frontmatter. Last live-API verification: see `last_verified`.
