---
name: resend
version: 0.1.0
category: messaging
description: Resend — modern transactional email API (developer-first, simple REST + React Email + webhooks)
homepage: https://resend.com/docs
tags: [email, transactional, smtp-alternative, react-email]
applies_to:
  - sending transactional emails (password reset, magic link, receipts, notifications)
  - testing Email Routing / MX / DKIM config by sending probe emails
  - sending batches of personalized emails (up to 100 per call)
  - newsletter / contact-form forwarding
  - webhook handling for delivered / bounced / complained events
trove_spec: "0.1"

credentials:
  RESEND_API_KEY:
    type: password
    required: true
    help: "Sending-only key for production sends. https://resend.com/api-keys → permission: Sending access"
  RESEND_ADMIN_KEY:
    type: password
    required: false
    help: "Full access key for one-time admin ops (create/verify domains, manage audiences, etc.). Create as a separate key; revoke or keep on file per your security policy."
  RESEND_FROM_EMAIL:
    type: text
    required: false
    help: "Default `From:` address (must be at a verified domain). Use `onboarding@resend.dev` until your own domain is verified."

mcp:
  command: npx
  args: ["-y", "@resend/mcp-send-email"]
  env:
    RESEND_API_KEY: ${credential.RESEND_API_KEY}
---

# Resend Usage Guide

## ⚠️ Critical Constraints

1. **TWO INDEPENDENT GATES — FROM check + TO check**, both must pass. Easy to confuse because they have separate sandboxes.

   **Gate A · FROM domain check**
   - Default: `from:` must be at a domain you've verified in Resend (DKIM/SPF/DMARC green)
   - **Bypass**: use `from: onboarding@resend.dev` (Resend's shared sandbox FROM-domain). Always-allowed for testing
   - Unverified custom from → `422 The 'from' domain is not verified`

   **Gate B · TO recipient check (free tier only)**
   - Default on free tier: `to:` must be one of: (a) your Resend account login email, (b) Resend test addresses (`delivered@resend.dev` etc.)
   - **Bypass**: verify ANY ONE of your domains in Resend → unlocks sending to anyone
   - Wrong recipient on free tier → `422 You can only send testing emails to your own email address (xxx@gmail.com), or our test addresses`

   **`onboarding@resend.dev` only bypasses Gate A, not Gate B** ← the most common confusion. To test sending to arbitrary external addresses (e.g. validating Email Routing on another domain), you must verify a sending domain first.

2. **Verify a sending subdomain, not the root domain** — if your root domain `example.com` is already on Google Workspace / Microsoft 365 with its own SPF/DKIM/DMARC, **don't add Resend's records to root**. Instead create a subdomain like `send.example.com` and verify that. Resend's TXT records won't conflict with Workspace email routing for the same domain. Same UX; cleaner separation.

3. **DKIM propagation takes 5min–24h** after adding the TXT records. Adding records → "verified" in Resend dashboard isn't instant. First send after verification occasionally fails if Resend's checker ran during a propagation gap; retry in a few minutes.

4. **`react` and `html` are mutually exclusive** in send payload — pass one, not both. `text` can coexist with either as a plain-text fallback (recommended for spam scoring).

5. **Reply-To and From are different concepts** — `from` is the visible sender (must pass Gate A); `reply_to` is where replies go (no domain gate). Most setups: `from: hello@brand.com` + `reply_to: real-person@brand.com`.

6. **Test addresses bypass real delivery** — `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev` simulate the corresponding webhook events but **never deliver an actual email anywhere**. Useful for testing your handler logic, useless for verifying inbox routing.

7. **Idempotency keys** are supported (`Idempotency-Key` header) — use them for retries to avoid double-sending after timeouts.

---

## Setup

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
```

---

## Send a simple email

```typescript
const { data, error } = await resend.emails.send({
  from: 'Trove Bot <hello@trovekit.dev>',   // or use default onboarding@resend.dev for first test
  to: ['user@example.com'],                  // array OR string; up to 50 recipients
  subject: 'Hello from Trove',
  html: '<p>It works!</p>',
  text: 'It works!',                         // plain-text fallback (recommended for spam scoring)
});

if (error) {
  console.error(error);  // { statusCode, message, name }
} else {
  console.log('Sent:', data.id);  // resend message id, e.g. '4ef9a4d4-...'
}
```

### With React Email templates

```typescript
import { render } from '@react-email/render';
import { MyTemplate } from './emails/MyTemplate';

await resend.emails.send({
  from: 'hello@trovekit.dev',
  to: 'user@example.com',
  subject: 'Welcome',
  react: <MyTemplate name="Zephyr" />,        // ← React component
});
```

React Email handles MJML-style cross-client compatibility. The send call serializes to inline-style HTML automatically.

---

## Send with `cc`, `bcc`, `reply_to`, attachments

```typescript
await resend.emails.send({
  from: 'hello@trovekit.dev',
  to: ['recipient@example.com'],
  cc: ['team@example.com'],
  bcc: ['archive@example.com'],
  reply_to: ['support@example.com'],          // array preferred
  subject: '...',
  html: '...',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: Buffer.from('...'),            // Buffer or base64 string
      // or remote: path: 'https://example.com/file.pdf'
    },
  ],
  headers: {
    'X-Custom-Header': 'value',
  },
  tags: [                                     // for analytics filtering
    { name: 'category', value: 'invoice' },
  ],
});
```

---

## Batch send (up to 100 at once)

```typescript
const { data, error } = await resend.batch.send([
  {
    from: 'hello@trovekit.dev',
    to: 'a@example.com',
    subject: 'Hi A',
    html: '<p>Personalized for A</p>',
  },
  {
    from: 'hello@trovekit.dev',
    to: 'b@example.com',
    subject: 'Hi B',
    html: '<p>Personalized for B</p>',
  },
  // ...up to 100
]);
// data.data: array of { id } per email
```

Use this instead of looping `send()`—batch is faster, cheaper (against rate limit), and atomic-ish.

---

## Email Routing / MX smoke test (the screenshot use case)

Sending probe emails to a domain's various aliases to verify Email Routing config:

```typescript
const aliases = ['hello', 'security', 'careers', 'partners'];
const domain = 'momentstream.ai';

await resend.batch.send(
  aliases.map((alias) => ({
    from: 'Trove Probe <onboarding@resend.dev>',  // use Resend sandbox if YOUR domain isn't yet verified
    to: `${alias}@${domain}`,
    subject: `test-${alias}`,
    text: `Test probe for ${alias}@${domain} at ${new Date().toISOString()}`,
  })),
);

// Then check the destination inbox manually to see which arrived where.
```

**Why this is non-trivial**: probe `from:` must be a verified domain on Resend (otherwise rejected). Easiest path: send `from: onboarding@resend.dev` (Resend's own sandbox, always works).

---

## Domains

```typescript
// Add a sending subdomain (recommended over root if you already use Workspace/M365 on root)
const { data } = await resend.domains.create({ name: 'send.example.com' });

// data.records actual shape (verified 2026-05-11 on send.roboz.dev):
// [
//   { record: "DKIM", name: "resend._domainkey.send", type: "TXT", value: "p=MIGfMA0..." },
//   { record: "SPF",  name: "send.send",              type: "MX",  value: "feedback-smtp.us-east-1.amazonses.com", priority: 10 },
//   { record: "SPF",  name: "send.send",              type: "TXT", value: "v=spf1 include:amazonses.com ~all" }
// ]

// Verify (call after DNS records propagate, typically 30-90s on CF, up to 24h elsewhere)
await resend.domains.verify({ id: data.id });

// List + check status
const { data: all } = await resend.domains.list();
// each has status: 'verified' | 'pending' | 'failed' | 'temporary_failure'
```

**⚠️ Naming convention surprise** (saved many minutes of confused debugging on first try):
- For a registered domain `send.example.com`, **Resend's record `name` values are relative to the PARENT zone** (`example.com`), not relative to the registered subdomain
- That's why DKIM appears as `resend._domainkey.send` (so the final FQDN is `resend._domainkey.send.example.com`)
- The SPF MX/TXT come back as **`send.send`** (not just `send`) — this is INTENTIONAL: Resend uses `send.<your-subdomain>` as a separate sub-subdomain for SPF isolation (same pattern SendGrid uses with `em<id>.<domain>`). Don't "fix" this; the records are correct as-returned.

### Canonical "verify a sending domain via Cloudflare" workflow (Trove cross-module)

This is THE end-to-end automation Trove enables — once a sending subdomain is verified, both Gate A (FROM) and Gate B (TO arbitrary recipients on free tier) are unlocked.

```typescript
// 0. Pick a sending subdomain that won't conflict with your existing email setup
//    Good: send.example.com, mail.example.com, notifications.example.com
//    Bad:  example.com itself if it's on Google Workspace / M365

// 1. Tell Resend about it, get DNS records to add
const { data: domain } = await resend.domains.create({ name: 'send.example.com' });

// 2. Use cloudflare module's DNS API to write each record into CF
const CF_TOKEN = jq('.CLOUDFLARE_API_TOKEN', '~/.trove/cloudflare/credentials.json');
const ZONE = jq('.CLOUDFLARE_ZONE_ID', '~/.trove/cloudflare/credentials.json');
for (const r of domain.records) {
  await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_TOKEN}` },
    body: JSON.stringify({ type: r.type, name: r.name, content: r.value, ttl: 1 }),
  });
}

// 3. Wait for propagation (TXT typically 5-15 min on CF; up to 24h elsewhere)
//    Then trigger Resend re-check
await new Promise(r => setTimeout(r, 5 * 60_000));
await resend.domains.verify({ id: domain.id });

// 4. Confirm
const updated = await resend.domains.get({ id: domain.id });
console.log(updated.status);    // hopefully 'verified'

// 5. Now from: 'hello@send.example.com' to: anywhere is allowed
```

**This is exactly the kind of multi-step task Trove eliminates from "human clicks through 3 dashboards" to "AI does it given the modules"**.

---

## Webhooks (delivered / bounced / complained)

```typescript
// In Resend dashboard: add webhook URL pointing to your endpoint
// Example endpoint payload signature verification:

import { Webhook } from 'svix';

const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET);
const event = wh.verify(rawBody, headers);  // throws if invalid

switch (event.type) {
  case 'email.delivered':    /* mark sent */ break;
  case 'email.bounced':      /* mark bad address, suppress */ break;
  case 'email.complained':   /* user marked spam, hard suppress */ break;
  case 'email.opened':       /* tracking pixel hit (opt-in feature) */ break;
  case 'email.clicked':      /* link tracking (opt-in feature) */ break;
}
```

---

## Audiences & broadcasts (newsletter functionality)

```typescript
// Create audience
const { data: audience } = await resend.audiences.create({ name: 'Trove subscribers' });

// Add contacts (with double opt-in elsewhere, this is just storage)
await resend.contacts.create({
  email: 'fan@example.com',
  audienceId: audience.id,
  firstName: 'Fan',
  unsubscribed: false,
});

// Create + send broadcast
const { data: bc } = await resend.broadcasts.create({
  audienceId: audience.id,
  from: 'Trove <hello@trovekit.dev>',
  subject: 'v0.2 is out!',
  html: '<p>...</p>',
});

await resend.broadcasts.send({ id: bc.id });
```

---

## Pricing pitfalls

- **Free tier**: 100/day + 3000/month, only to your own verified email until you verify a domain. Verifying a domain unlocks sending to anyone within the same limits
- **Paid plans bill per email after free tier** — $20/mo for 50k emails (Pro)
- **Webhooks don't count against send quota** — process them aggressively
- **Tracked opens/clicks add minor latency** (and a tracking pixel + URL rewriting). Disable per-send if not needed: `tracking: { opens: false, click: false }`
- **Bounces don't refund** — verify-before-send if list quality is uncertain (use a service like ZeroBounce for cold lists)

---

## MCP server

Resend ships an official MCP: `@resend/mcp-send-email`. Trove module declares it in `mcp:` frontmatter, so when AI sees this module + user says "send an email", AI can either:
- Use the MCP tool directly (`mcp__resend__send_email(...)`) — cleanest
- Or fall back to direct API call via fetch + RESEND_API_KEY from credentials.json

---

## Error reference

| Status / Code | Meaning | Fix |
|---|---|---|
| `422 'from' domain not verified` | trying to send from an unverified domain | use `onboarding@resend.dev` for tests, or verify your domain |
| `422 invalid 'to' field` | email format wrong / unsupported chars | sanitize input |
| `403 not allowed to send to this address` | free tier sending to non-self before domain verify | verify a domain first |
| `429 daily limit reached` / `monthly limit reached` | hit tier quota | wait / upgrade |
| `400 idempotency key already used` | retried with same key, original still processing | reuse same key, fetch result instead of resending |
| Webhook signature mismatch | wrong webhook secret in env | re-copy from Resend dashboard → webhook settings |
