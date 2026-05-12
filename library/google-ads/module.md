---
name: google-ads
version: 0.1.0
category: advertising
description: Google Ads API — campaigns, keywords, performance, keyword planner. OAuth refresh-token auth (NOT service account)
homepage: https://developers.google.com/google-ads/api/docs
tags: [advertising, google-ads, keyword-planner, oauth]
applies_to:
  - reading campaign / ad group / keyword performance for owned Google Ads accounts
  - keyword research via the Keyword Planner API (search volume, CPC, competition)
  - creating / pausing / updating campaigns (write operations require approved developer token)
  - reconciliation of ad spend against revenue (paired with google-analytics)
  - audience / conversion / asset management

credentials:
  GOOGLE_ADS_DEVELOPER_TOKEN:
    type: password
    required: true
    help: "Developer token from https://ads.google.com → Tools → API Center. Test-account tokens work immediately; production tokens require Google review (~1-2 weeks). Format: 22-char alphanumeric"
  GOOGLE_ADS_CUSTOMER_ID:
    type: text
    required: true
    help: "10-digit Google Ads customer ID, NO dashes. UI shows as 123-456-7890; API wants 1234567890"
  GOOGLE_ADS_LOGIN_CUSTOMER_ID:
    type: text
    required: false
    help: "Manager (MCC) account ID, 10 digits no dashes. Required ONLY when accessing a client account via an MCC. Leave blank if you query the same account you logged in to authorize."
  GOOGLE_OAUTH_CLIENT_ID:
    type: text
    required: true
    help: "Web/Desktop OAuth client from GCP. Create at console.cloud.google.com → APIs → Credentials → OAuth Client. Format: <project-num>-<random>.apps.googleusercontent.com"
  GOOGLE_OAUTH_CLIENT_SECRET:
    type: password
    required: true
    help: "Paired with OAuth Client ID. Treat as a password despite being called 'client secret'"
  GOOGLE_REFRESH_TOKEN:
    type: password
    required: true
    help: "Long-lived OAuth refresh token for the user who authorized access. Generate once via gcloud ADC flow or the google-ads-api npm wizard; reuse forever (unless revoked)"

trove_spec: "0.1"
last_verified: "pending — refresh token invalid_grant (probably 6-month-idle or rotated); awaiting OAuth re-auth"
---

# Google Ads API Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Ads uses OAuth refresh-token auth, NOT service account** — service accounts CANNOT access most Google Ads endpoints. You authorize once as a human user, capture the refresh token, then reuse the token forever to mint short-lived access tokens. Distinct flow from google-analytics / google-search-console
2. **Developer tokens have two tiers** — test (instant, only test accounts) vs production (Google reviews your app, ~1-2 weeks, allows real customer accounts). **Approval is application-specific**; same Google account can hold both tokens for different apps
3. **Customer ID format**: API wants `1234567890`, UI shows `123-456-7890`. Strip dashes before calling. Frequent 400 source
4. **`login_customer_id` is for manager (MCC) hierarchy** — set to the MCC ID when querying a client account FROM the manager. Leave blank if customer == login user. Mismatching causes opaque "Customer not enabled" errors
5. **API version in the path** — `googleads.googleapis.com/v17/customers/...` (use the latest GA version). New versions deprecate yearly; pin in your client config and migrate deliberately
6. **GAQL (Google Ads Query Language) is required for most reads** — SQL-like, NOT SQL. Field references are dot-paths: `campaign.id`, `metrics.clicks`. Always include `FROM <resource>`
7. **Refresh tokens DO expire if unused for 6 months** OR if the user revokes access OR if more than 50 refresh tokens are issued for the same OAuth client (oldest revoked). Capture once, but monitor — silent expiry = silent outage

---

## SDK setup (`google-ads-api` npm)

```typescript
import { GoogleAdsApi } from 'google-ads-api';

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
  client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

const customer = client.Customer({
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,                  // 10 digits no dashes
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
  login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,       // optional, MCC ID
});
```

Shell-pipeline credential extraction:
```bash
for k in GOOGLE_ADS_DEVELOPER_TOKEN GOOGLE_ADS_CUSTOMER_ID GOOGLE_ADS_LOGIN_CUSTOMER_ID GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_REFRESH_TOKEN; do
  export $k="$(jq -r ".$k" ~/.trove/google-ads/credentials.json)"
done
```

---

## GAQL queries (most reads)

```typescript
// Campaigns + last-7-day metrics
const rows = await customer.query(`
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions
  FROM campaign
  WHERE segments.date DURING LAST_7_DAYS
    AND campaign.status = 'ENABLED'
  ORDER BY metrics.cost_micros DESC
  LIMIT 50
`);

for (const row of rows) {
  const costUsd = (row.metrics?.cost_micros ?? 0) / 1_000_000;       // cost is in micros — divide by 1M for USD
  console.log(`${row.campaign?.name}: $${costUsd.toFixed(2)}, ${row.metrics?.clicks} clicks`);
}
```

### Common queries

**Keyword performance**:
```sql
SELECT ad_group_criterion.keyword.text,
       metrics.impressions, metrics.clicks, metrics.average_cpc, metrics.conversions
FROM keyword_view
WHERE segments.date DURING LAST_30_DAYS
ORDER BY metrics.cost_micros DESC
LIMIT 100
```

**Search terms (what users actually typed)**:
```sql
SELECT search_term_view.search_term, metrics.impressions, metrics.clicks
FROM search_term_view
WHERE segments.date DURING LAST_30_DAYS
ORDER BY metrics.clicks DESC
LIMIT 200
```

---

## Keyword Planner API (research, not reads)

For search volume / suggestions on keywords you don't yet run:

```typescript
const response = await customer.keywordPlanIdeas.generateKeywordIdeas({
  customer_id: customer.credentials.customer_id,
  language: 'languageConstants/1000',          // 1000 = English
  geo_target_constants: ['geoTargetConstants/2840'],  // 2840 = USA
  keyword_seed: { keywords: ['ai coding agent'] },
});
// returns avg_monthly_searches, competition level, top of page bid range
```

Quotas are stricter on Keyword Planner — see error reference.

---

## Pricing / quota pitfalls

- **API is free** within quota; you pay only for actual ad spend
- **Cost is in `micros`** — `cost_micros: 1_500_000` = $1.50. Easy 1M-off bug if you forget to divide
- **Default quota: 15,000 operations/day per developer token** (basic access). Standard access = 1,000 ops/min/token. Beyond that requires approval
- **GAQL query is 1 operation; complex query with many segments is still 1**. Pagination of large results = multiple operations
- **Failed operations consume quota** — validate GAQL before firing in batch jobs

---

## Error reference

| Status / code | Meaning | Fix |
|---|---|---|
| `403 INVALID_DEVELOPER_TOKEN` | dev token rejected or revoked | check token in Ads UI → Tools → API Center; reapply if revoked |
| `403 CUSTOMER_NOT_ENABLED` | customer ID not accessible by this user / token | check if account is suspended, billing set up, and user has permission |
| `403 NOT_ADS_USER` | OAuth user is not an Ads user | OAuth was for the wrong Google account; redo auth flow with correct user |
| `400 customer_id format` | dashes in customer ID | strip dashes |
| `400 login_customer_id required` | querying MCC-managed client without specifying MCC | set login_customer_id to the MCC ID |
| `401 invalid_grant` | refresh token expired / revoked / not issued for this client_id | regenerate refresh token via OAuth flow |
| `RESOURCE_EXHAUSTED` | quota hit | wait or request quota increase; basic access has tight limits |

---

## Capturing a refresh token (one-time setup)

Easiest path: use the `google-ads-api` wizard.

```bash
npx google-ads-api wizard
# Prompts for client_id, client_secret, developer_token
# Opens browser → you sign in with the Google account that has Ads access → consents
# Wizard prints the refresh token; save it as GOOGLE_REFRESH_TOKEN
```

Alternative: `gcloud auth application-default login` then extract from `~/.config/gcloud/application_default_credentials.json`.

---

## When to pair with other modules

- **google-ads + google-analytics** → spend (Ads) vs revenue (GA4 conversions). Reconcile per-campaign ROAS
- **google-ads + google-search-console** → paid (Ads) vs organic (GSC) competition for the same query. Identify queries where you outrank yourself organically and can pause the paid bid
- **google-ads + Keyword Planner** (this module covers both) → research new keywords, then create campaigns targeting them. Full loop without leaving the API
