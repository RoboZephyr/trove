---
name: stripe
version: 0.1.0
category: payments
description: Stripe — payments, billing, subscriptions. Use restricted keys (rk_*) over full secret keys (sk_*) for any automation
homepage: https://stripe.com/docs/api
tags: [payments, billing, subscriptions, webhooks]
applies_to:
  - one-time payments via Payment Intents API
  - subscription billing via Stripe Billing (Customer, Subscription, Price, Product)
  - invoice generation, refunds, disputes
  - webhook handling (signature verification mandatory)
  - reading existing customers / payments for analytics / reconciliation
trove_spec: "0.1"
last_verified: "2026-05-12 · GET /v1/customers via rk_live_ (API path OK). MCP path (https://mcp.stripe.com hosted HTTP, OAuth) registered in ~/.claude.json. Maintainer downstream uses cover three forms: Payment Links (frontend CTA URLs), SDK in a backend pipeline, and MCP from Claude Code"

credentials:
  STRIPE_SECRET_KEY:
    type: password
    required: true
    help: "Use a restricted key (rk_live_... / rk_test_...) with the narrowest scope your task needs — NOT a full sk_live_... unless absolutely necessary. https://dashboard.stripe.com/apikeys → Restricted keys → Create restricted key."
  STRIPE_WEBHOOK_SECRET:
    type: password
    required: false
    help: "Per-endpoint signing secret from dashboard. Required ONLY for webhook signature verification. Format: whsec_..."
  STRIPE_API_VERSION:
    type: text
    required: false
    default: "2025-09-30.clover"
    help: "Pin API version explicitly to avoid silent breakage when Stripe rolls forward. Find current default at https://stripe.com/docs/api/versioning"
---

# Stripe Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **`rk_live_*` (restricted live) >> `sk_live_*` (full secret live)** — full secret keys can do EVERYTHING including refunds, customer deletes, account changes. Restricted keys are scope-limited. **For any automation, default to restricted keys**. The key prefix is the only signal — `rk_` = restricted, `sk_` = unrestricted
2. **Test mode and live mode are entirely separate universes** — test mode has its own customers, products, subscriptions, webhooks. A `cus_xxx` ID from test mode does NOT exist in live mode. Keys with `_test_` and `_live_` prefixes hit different data. **Never mix in one request**
3. **Amounts are in the smallest currency unit** — USD: cents, JPY: yen (no decimals), KWD: thousandths. `$10` is `1000`, NOT `10` or `10.00`. Multiply by 100 (or use a smallest-unit util). **Triple-check this when integrating; it's the most common 100x-off bug**
4. **Idempotency keys are mandatory for any mutation that could be retried** — `Idempotency-Key: <uuid>`. Without it, a retry on a flaky network can charge the customer twice. Use a stable key for the logical operation (e.g. `order:1234:charge`), not a fresh uuid each retry
5. **Webhook signature verification is NOT optional** — receiving a webhook does not authenticate it. Always verify `Stripe-Signature` header against your `STRIPE_WEBHOOK_SECRET` using the SDK's `constructEvent`. Without verification an attacker can fake any event
6. **Pin `Stripe-Version` header** — Stripe rolls API versions forward; new defaults can subtly change response shape. Pin to a known version in the SDK config and migrate deliberately
7. **`expand: ['customer', 'latest_invoice.payment_intent']`** — Stripe IDs are NOT auto-expanded; you'll see `cus_xxx` strings unless you ask. Saves round-trips when reading

---

## Auth + SDK setup

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',           // pin explicitly
  // optional: per-request idempotency via SDK middleware
});
```

Raw HTTP (no SDK):
```typescript
const res = await fetch('https://api.stripe.com/v1/charges', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'Stripe-Version': '2025-09-30.clover',
    'Idempotency-Key': `order-1234-charge`,
    'Content-Type': 'application/x-www-form-urlencoded',  // Stripe uses form-encoded, not JSON
  },
  body: new URLSearchParams({
    amount: '1000',
    currency: 'usd',
    source: 'tok_visa',
    description: 'Order #1234',
  }),
});
```

**Note**: Stripe API takes `application/x-www-form-urlencoded`, NOT JSON. The SDK handles this; if you call HTTP directly, don't `JSON.stringify`

---

## Payment Intents (modern card payments)

```typescript
const pi = await stripe.paymentIntents.create({
  amount: 2000,                              // $20.00
  currency: 'usd',
  customer: 'cus_xxx',                       // optional but recommended
  payment_method_types: ['card'],
  metadata: { order_id: '1234' },            // attach domain data
}, {
  idempotencyKey: `order-1234-pi`,           // stable key
});

// Client confirms with pi.client_secret on the frontend
// On success, you'll get a webhook payment_intent.succeeded
```

---

## Customers + subscriptions

```typescript
// Create or find a customer
const customer = await stripe.customers.create({
  email: 'user@example.com',
  metadata: { user_id: '1234' },             // your internal id
});

// Subscribe
const sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: 'price_xxx' }],           // Price IDs are created in dashboard
  trial_period_days: 14,
  metadata: { user_id: '1234' },
}, {
  idempotencyKey: `subscription-create-${user_id}`,
});

// Read with expansion to save round-trips
const sub2 = await stripe.subscriptions.retrieve('sub_xxx', {
  expand: ['customer', 'latest_invoice.payment_intent', 'default_payment_method'],
});
```

---

## Webhook handling (mandatory signature verification)

```typescript
import Stripe from 'stripe';

// Express-style handler
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']!;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  // Now safe to act on event
  switch (event.type) {
    case 'payment_intent.succeeded':
      // ...
      break;
    case 'invoice.payment_failed':
      // ...
      break;
  }
  res.json({ received: true });
});
```

**Critical**: use `req.raw` body, NOT a parsed body. JSON.stringify-ing the body before signature check will fail verification because the byte sequence differs (whitespace, key order).

---

## Common patterns

**List with cursor pagination** (Stripe's auto-pagination):
```typescript
for await (const charge of stripe.charges.list({ limit: 100 })) {
  // iterates all pages automatically
}
```

**Search API** (faster than list for filtered queries):
```typescript
const result = await stripe.customers.search({
  query: 'email:"user@example.com" AND -metadata["churned"]:"true"',
});
```

---

## Pricing / fee pitfalls

- **Stripe fees come out of payouts, not API calls** — API access is free; you pay per successful charge (typically 2.9% + 30¢ in the US for cards)
- **Failed charges still hit Radar** (Stripe's fraud system) — repeated failures can flag your account
- **Refunds reverse fees in proportion** — full refund returns full fee; partial refund returns proportional fee
- **Disputes (chargebacks)** cost $15 in fees on top of the refunded amount, win or lose

---

## Error reference

| Status | Stripe `code` | Meaning | Fix |
|---|---|---|---|
| `401` | `api_key_invalid` | wrong key (test vs live mismatch?) | check prefix matches mode (`sk_test_` vs `sk_live_`) |
| `402` | `card_declined` | card issuer declined | not actionable server-side; surface declined reason to user |
| `400` | `parameter_missing` | required field not in body | check API reference for the endpoint |
| `400` | `idempotency_error` | same key, different body | use a fresh idempotency key OR send exact same body |
| `403` | `permission_required` | restricted key lacks scope | broaden the rk_ scope in dashboard, OR use a different key |
| `429` | `rate_limit` | per-account rate hit | exponential backoff; live mode has ~100 read/25 write per second by default |
| `500/503` | infra issue | back off + retry with same idempotency key | safe to retry, idempotency key prevents double-charge |
| webhook `400` | `signature verification failed` | wrong secret OR body was parsed before verifying | use raw body bytes, not parsed JSON |

---

## Test mode workflow

- Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (declined). Any future expiry, any CVC
- Test keys: `sk_test_*` / `rk_test_*` — completely separate dashboard
- Stripe CLI for local webhook forwarding: `stripe listen --forward-to localhost:3000/webhooks/stripe`
- **Never use live keys in dev**. The `_test_` vs `_live_` separation is the most useful safety net Stripe gives you; don't undermine it

---

## When to use this module vs alternatives

- **Stripe** (this) — best-in-class developer API, complex but well-documented. Default choice for SaaS / e-commerce in US/EU/JP
- **paddle** — for SaaS that wants Merchant of Record (handles VAT/sales tax globally). Future Trove module
- **Alipay / WeChat Pay** — required for China-market consumer payments; usually integrate alongside Stripe rather than instead of
- **Apple/Google in-app purchase** — required for mobile app digital goods (Apple takes 15-30%, much higher than Stripe). Out of scope for web/server use
