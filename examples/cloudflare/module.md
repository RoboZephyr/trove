---
name: cloudflare
version: 0.1.0
category: infra
description: Cloudflare API & Wrangler for Pages deploy, Workers/R2/KV, DNS, cache purge
homepage: https://developers.cloudflare.com/api/
tags: [hosting, cdn, dns, workers, pages, r2, kv]
applies_to:
  - deploying static sites to Cloudflare Pages
  - managing Workers / R2 buckets / KV namespaces
  - DNS record CRUD via API
  - cache purge after deploy
  - any task using `wrangler` CLI
trove_spec: "0.1"

credentials:
  CLOUDFLARE_API_TOKEN:
    type: password
    required: true
    help: "https://dash.cloudflare.com/profile/api-tokens 创建。Pages 部署需要 'Edit Cloudflare Workers' + 'Account Settings: Read'"
  CLOUDFLARE_ACCOUNT_ID:
    type: text
    required: false
    help: "几乎所有 API call 都要这个。dash 右侧 sidebar 复制；wrangler 不强制（会自动 list 让你选），但 API 调用必填"
  CLOUDFLARE_ZONE_ID:
    type: text
    required: false
    help: "DNS / cache purge 才需要。在 dash 域名概览页右侧复制"
---

# Cloudflare API & Wrangler 使用指南

## ⚠️ 关键约束（先看这一节再写代码）

1. **`CLOUDFLARE_API_TOKEN` ≠ 老式 Global API Key**——所有新代码都用 token。Token 是 scoped 的（带固定权限），换 endpoint 失败时第一反应是「token 有这权限吗」
2. **几乎所有 REST API 路径都带 `/accounts/{account_id}/...`**——单独有 token 不够，必须配套 `CLOUDFLARE_ACCOUNT_ID`
3. **DNS / cache purge 还要 `CLOUDFLARE_ZONE_ID`**（per-domain）
4. **wrangler 优先读 env**：`CLOUDFLARE_API_TOKEN` 在 env 里 → 直接用，无需 `wrangler login`
5. **API 返回结构**：成功 = `{ success: true, result: ... }`；错误 = `{ success: false, errors: [{ code, message }] }`。**永远先查 `success` 再用 `result`**
6. **Pages 部署最快路径**：`wrangler pages deploy <build-dir> --project-name <name>` 一行命令；不需要先 `pages project create` 也能 deploy（wrangler 会自动建）

---

## Pages 部署（静态站最常用）

**⚠️ Pages 项目第一次部署的坑**：wrangler **不会自动创建** Pages project。直接 `wrangler pages deploy --project-name <new>` 会报 `Project not found (code 8000007)`。**必须先显式 API 建 project**：

```bash
# Step 0 (first time only): create the project via API
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-site","production_branch":"main"}'
```

之后才能 deploy：

```bash
# Wrangler CLI（推荐用法，自动读 CLOUDFLARE_API_TOKEN env）
npx wrangler pages deploy ./dist \
  --project-name my-site \
  --branch main \
  --commit-dirty=true

# 输出示例：
# ✨ Successfully published to https://abc123.my-site.pages.dev
```

**常见坑**：
- 第一次 deploy 会自动建 project，但默认绑定 `main` 分支——如果你本地不在 main，加 `--branch <name>` 显式指定
- Pages 单文件 ≤ 25 MB，单 deploy 总文件数 ≤ 20000；超了静默失败，没有提前校验
- Pages 自动启用 HTTPS，但自定义域名要去 dash 加（API 路径：`/accounts/{aid}/pages/projects/{name}/domains`）

### 直接 API（CI 场景，不用 wrangler）

```typescript
// 1. 上传构建产物到 Direct Upload session
const session = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    body: formData, // multipart with manifest + files
  }
).then(r => r.json());

if (!session.success) throw new Error(session.errors[0].message);
const deployment = session.result;
```

---

## DNS 记录 CRUD

```typescript
const ZONE = process.env.CLOUDFLARE_ZONE_ID;

// 列出所有记录
const list = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`,
  { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } },
).then(r => r.json());

// 创建 CNAME
const create = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_API_TOKEN}` },
    body: JSON.stringify({
      type: 'CNAME',
      name: 'classics',           // 子域名
      content: 'my-site.pages.dev',
      proxied: true,              // 走 CF 代理（橙云）
      ttl: 1,                     // 1 = auto
    }),
  },
).then(r => r.json());
```

**坑**：`name` 写「子域名」就行，CF 会自动拼 zone 域名。写完整域名也可以，重复不报错但容易调试糊涂。

---

## Cache Purge

```typescript
// 全域缓存清空（慎用，几分钟后才完全生效）
await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_API_TOKEN}` },
    body: JSON.stringify({ purge_everything: true }),
  },
);

// 按 URL 精准清（推荐，速度快、不抖）
await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_API_TOKEN}` },
    body: JSON.stringify({
      files: ['https://classics.example.com/styles.css', 'https://classics.example.com/index.html'],
    }),
  },
);
```

---

## R2（S3 兼容对象存储）

```bash
# Wrangler 创建 bucket
npx wrangler r2 bucket create my-audio-cache

# 上传文件
npx wrangler r2 object put my-audio-cache/audio/1.mp3 --file ./output.mp3

# 公开访问需在 dash 开 Public Bucket（API 也能开，路径 /accounts/{aid}/r2/buckets/{name}/usage）
```

R2 的 S3 兼容 endpoint：`https://{account_id}.r2.cloudflarestorage.com`，可用 AWS SDK 直连（需另建 R2-specific access key，跟 API token 不通用）。

---

## AI-driven domain workflow (search → buy → bind → email routing)

**This is the canonical Trove use case**: human says "buy `mycoolproject.dev` and point it at my Pages site"; AI does everything except confirming payment.

### Prerequisites (one-time per CF account)

- `CLOUDFLARE_ACCOUNT_ID` filled in `~/.trove/cloudflare/credentials.json`
- `CLOUDFLARE_API_TOKEN` has scope `Account.Domain:Edit` (check at https://dash.cloudflare.com/profile/api-tokens)
- Payment method on file in CF dashboard (Stripe-backed; CF Registrar charges immediately on register)
- Default contact info set in `Account → Configurations → Contact Information` (used for WHOIS by default)

If the token doesn't have `Domain:Edit`, all writes return `403 Authentication error (10000)`. Re-issue the token with the right scope.

### Step 0 · Availability check (DNS NS lookup, NOT whois)

**⚠️ Critical anti-pattern**: don't use `whois <domain> | grep "creation date"` to check availability. Google's TLDs (`.dev` / `.app` / `.page`) and many others **don't expose `creation date` in whois output** by privacy policy — so the grep returns empty and your script wrongly thinks the domain is available. This wastes time and credibility (almost happened during the trove.dev attempt — see Trove SPEC §10 entry 2026-05-11 #5).

**Correct check** (single source of truth):
```sh
dig +short NS trove.dev
# Empty output → unregistered (likely available)
# Returns nameservers (e.g. ns1.park.do) → registered, taken
```

Cross-verify with CF's own Registrar API once your token has scope:
```sh
curl -H "Authorization: Bearer $TOKEN" \
  https://api.cloudflare.com/client/v4/accounts/$AID/registrar/domains/$domain | jq .result.available
```

### Step 1 · Check availability + price

```typescript
const AID = process.env.CLOUDFLARE_ACCOUNT_ID;
const auth = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
const BASE = 'https://api.cloudflare.com/client/v4';

// Single-domain check
const check = await fetch(
  `${BASE}/accounts/${AID}/registrar/domains/${domain}`,
  { headers: auth },
).then(r => r.json());
// check.result.available: boolean
// check.result.supported_tld: boolean (CF Registrar supports this TLD?)
// check.result.transferable: boolean (already registered elsewhere, can transfer in)

// Bulk pricing for a TLD (e.g. .dev)
const price = await fetch(
  `${BASE}/accounts/${AID}/registrar/contacts`,    // also gets default contact
  { headers: auth },
).then(r => r.json());
```

Use `available && supported_tld` as the green light. If `available && !supported_tld`, route user to porkbun/namecheap.

### Step 2 · Register

```typescript
const reg = await fetch(
  `${BASE}/accounts/${AID}/registrar/domains/${domain}`,
  {
    method: 'PUT',                          // ← PUT, not POST
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      auto_renew: true,
      privacy: true,                        // free WHOIS privacy on CF
      locked: true,                         // anti-transfer protection
      // name_servers: defaults to CF (don't override unless you know why)
      // contacts: defaults to account contact (Step 0 prereq)
      period: 1,                            // years; CF Registrar usually 1y minimum
    }),
  },
).then(r => r.json());

if (!reg.success) throw new Error(reg.errors[0].message);
// reg.result.name: 'mycoolproject.dev'
// reg.result.expires_at: '2027-05-11T...'
```

**This call charges the card immediately.** Always confirm with user before invoking.

### Step 3 · Bind to a CF Pages project

```typescript
// Add custom domain to Pages project
await fetch(
  `${BASE}/accounts/${AID}/pages/projects/${projectName}/domains`,
  {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: domain }),
  },
);
```

**Magic**: because the domain is registered through CF AND CF DNS controls it, the CNAME / SSL provisioning happens automatically. No DNS records to add. ~5-10 min for SSL cert.

For `subdomain.example.com` instead of root, same call with the subdomain — CF creates the CNAME record automatically.

### Step 4 · (optional) Email Routing — `hello@mycoolproject.dev` → your gmail

```typescript
// Need ZONE_ID — fetch it after registration
const zones = await fetch(
  `${BASE}/zones?name=${domain}`,
  { headers: auth },
).then(r => r.json());
const ZONE = zones.result[0].id;

// Enable Email Routing on the zone (auto-creates MX/SPF/DKIM records)
await fetch(
  `${BASE}/zones/${ZONE}/email/routing/enable`,
  { method: 'POST', headers: auth },
);

// Add a destination address (your real gmail) — requires verification email click
await fetch(
  `${BASE}/accounts/${AID}/email/routing/addresses`,
  {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'you@gmail.com' }),
  },
);

// Add a routing rule (e.g. catch-all)
await fetch(
  `${BASE}/zones/${ZONE}/email/routing/rules/catch_all`,
  {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: true,
      matchers: [{ type: 'all' }],
      actions: [{ type: 'forward', value: ['you@gmail.com'] }],
    }),
  },
);
```

Free, no SMTP-out (receive only). For sending email use Resend / Postmark separately.

### What humans must still do

| Action | Why human |
|---|---|
| Confirm purchase price before Step 2 | Real money, irreversible |
| Click the verification email for Email Routing destination | CF requires confirmed ownership of the gmail |
| Add payment method to CF account first time | Out of API scope |

Everything else (availability check, register, DNS setup, Pages bind, Email Routing rule, SSL provisioning) the AI does autonomously.

### Common error → fix

| Code | Meaning | Fix |
|---|---|---|
| `1003` | TLD not supported by CF Registrar (.io / .ai / .so) | use porkbun/namecheap externally, then transfer to CF later |
| `10000` (registrar context) | token missing `Domain:Edit` | re-issue token with scope |
| `7003 Could not route` | wrong account_id or wrong path | double-check `/accounts/{aid}/registrar/domains/{domain}` |
| `Domain unavailable` after just-checked-as-available | someone else just bought it (race) | search alternative |

---

## Bridging Trove credentials → CF Pages / Workers secrets

Pages Functions and Workers run on Cloudflare's edge — they **cannot** read your local `~/.trove/<svc>/credentials.json` at request time. You need to bridge Trove values into CF's own secret store at deploy time.

### Local development (`.dev.vars` file)

```sh
# wrangler pages dev / wrangler dev reads .dev.vars in project root
echo "MINIMAX_API_KEY=\"$(jq -r .MINIMAX_API_KEY ~/.trove/minimax/credentials.json)\"" > .dev.vars
echo "MINIMAX_REGION=\"$(jq -r .MINIMAX_REGION ~/.trove/minimax/credentials.json)\"" >> .dev.vars
# .dev.vars MUST be in .gitignore
```

### Production secrets (one-time per project)

```sh
# Pipe value from Trove directly to wrangler — avoids interactive paste / shell history
jq -r .MINIMAX_API_KEY ~/.trove/minimax/credentials.json | \
  npx wrangler pages secret put MINIMAX_API_KEY --project-name <your-project>

# Or for Workers (not Pages):
jq -r .MINIMAX_API_KEY ~/.trove/minimax/credentials.json | \
  npx wrangler secret put MINIMAX_API_KEY
```

### When credentials rotate

Re-run the prod secret-put command for each affected key. Pages secrets don't auto-redeploy — push a no-op commit to trigger.

**This bridge is the canonical pattern for Trove ↔ edge-runtime platforms** (CF Pages/Workers, Vercel, Fly.io, etc.). Don't store secrets twice (in Trove AND in `.env`) — Trove is the source, platform secrets are the deploy artifact.

---

## Workers KV（小键值缓存）

```bash
npx wrangler kv namespace create MY_KV
# 输出 namespace_id，写到 wrangler.toml 的 kv_namespaces
```

代码里：`env.MY_KV.put("key", "value")` / `env.MY_KV.get("key")`。**不适合大对象（>25MB）也不适合高写**——读优化场景。

---

## 错误调试速查

| 错误码 | 含义 | 解决 |
|---|---|---|
| 10000 | Authentication error | token 无效或没对应权限 scope |
| 9109 | Unauthorized to access requested resource | account_id 错了 / token 没这 account 的权限 |
| 7000 | No route for requested host | 路径里 zone_id 错了 |
| 81044 | Record name conflict | DNS 同名同类型记录已存在 |
| 7003 | Could not route to /xxx | API 路径打错（少 /accounts 段最常见）|

**Debug 第一步永远是**：把 response body 完整 print，CF 错误信息很详细。
