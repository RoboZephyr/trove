---
name: google-analytics
version: 0.1.0
category: analytics
description: Google Analytics 4 (GA4) Data API — query pageviews / events / acquisition / retention by dimension. Service-account auth
homepage: https://developers.google.com/analytics/devguides/reporting/data/v1
tags: [analytics, ga4, reporting, service-account-auth]
applies_to:
  - reading GA4 pageviews / events / sessions / users by dimension (page, country, source, device)
  - cohort retention / engagement metrics
  - real-time report (last 30 min of activity)
  - audience export / funnel analysis
  - any "how is the site doing" question for a project that already streams to GA4

credentials:
  GA4_PROPERTY_ID:
    type: text
    required: true
    help: "Numeric GA4 property id (e.g. 287654321). Find at https://analytics.google.com → Admin → Property settings."
  GOOGLE_SERVICE_ACCOUNT_JSON:
    type: multiline
    required: true
    help: "Full JSON of a GCP service-account key with Viewer role on the GA4 property. Paste the entire {type:'service_account',...} blob. Get one from console.cloud.google.com → IAM → Service Accounts → Keys → Add Key (JSON). Then add the service-account email as Viewer in GA4 Admin → Account/Property → User Management."

trove_spec: "0.1"
last_verified: "2026-05-12 · API runReport 200 via RS256 service-account JWT; MCP path (analytics-mcp stdio) registered in ~/.claude.json but not E2E from scaffold session"
---

# GA4 Data API Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **The service account email MUST be added as a user on the GA4 property** — adding the key to GCP IAM is NOT enough. In GA4 admin → Property → User Management → add `<service-account>@<project>.iam.gserviceaccount.com` with at least Viewer role. **#1 silent failure mode**: API returns 403 "property not found" even though the property obviously exists
2. **Property ID is purely numeric, NOT the "G-XXXXXXXX" measurement ID** — measurement ID is for tagging the website, property ID is for the API. They are different numbers; confusing them = 400 Invalid Property
3. **API quota is generous but per-property** — 25,000 tokens/day default. A simple report consumes 1-10 tokens depending on dimensions/metrics complexity. **Cost-control tokens** are a separate quota (10 tokens/hour) — complex reports can hit this first
4. **Dimension and metric names are case-sensitive and NOT what the UI shows** — UI says "Page title", API wants `pageTitle`. UI says "Views", API wants `screenPageViews`. Check the schema reference, don't guess
5. **Date ranges are inclusive** and accept relative strings: `'today'`, `'yesterday'`, `'NdaysAgo'`. UTC by property's reporting timezone, not yours
6. **Top-N results require a `limit`** — default is 10,000 rows max, but realistic queries should cap explicitly to control quota cost
7. **Service-account JSON is stored as a stringified blob in credentials.json** — JSON.parse it at runtime before passing to the SDK. See setup snippet below

---

## SDK setup

```typescript
import { BetaAnalyticsDataClient } from '@google-analytics/data';

// credentials.json field is a JSON-STRING; parse before use
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);

const client = new BetaAnalyticsDataClient({ credentials });
const property = `properties/${process.env.GA4_PROPERTY_ID}`;
```

Reading from `~/.trove/` in a shell pipeline:

```bash
export GA4_PROPERTY_ID=$(jq -r .GA4_PROPERTY_ID ~/.trove/google-analytics/credentials.json)
export GOOGLE_SERVICE_ACCOUNT_JSON=$(jq -r .GOOGLE_SERVICE_ACCOUNT_JSON ~/.trove/google-analytics/credentials.json)
```

---

## Run report (the main workflow)

```typescript
const [response] = await client.runReport({
  property,
  dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
  dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
  metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
  orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
  limit: 50,
});

for (const row of response.rows ?? []) {
  const [title, path] = row.dimensionValues!.map(v => v.value);
  const [views, users] = row.metricValues!.map(v => v.value);
  console.log(`${views} views, ${users} users → ${title} (${path})`);
}
```

### Common report shapes

**Top pages last 7 days**: dims `pageTitle, pagePath`, metric `screenPageViews`.

**Acquisition by source**: dims `sessionSource, sessionMedium`, metric `sessions, totalUsers`.

**Real-time (last 30 minutes)**:
```typescript
const [response] = await client.runRealtimeReport({
  property,
  dimensions: [{ name: 'country' }],
  metrics: [{ name: 'activeUsers' }],
});
```

**Funnel / cohort** — use `runFunnelReport` / `runReport` with cohort spec. Heavier on quota; cap with `limit`.

---

## Dimension / metric reference (mid-2026 most-used)

| Category | API name | UI label |
|---|---|---|
| Page | `pageTitle`, `pagePath`, `pageLocation` | Page title, Page path, Page location |
| Source | `sessionSource`, `sessionMedium`, `sessionCampaign` | Source, Medium, Campaign |
| User | `country`, `region`, `city`, `deviceCategory`, `operatingSystem` | Country, Region, City, Device category, OS |
| Time | `date`, `hour`, `dateHour`, `dayOfWeek` | Date, Hour, Date+Hour, Day of week |
| Engagement | `screenPageViews`, `sessions`, `totalUsers`, `activeUsers`, `engagementRate`, `bounceRate` | Views, Sessions, Total users, Active users, Engagement rate, Bounce rate |
| Events | `eventCount`, `eventCountPerUser`, `conversions` | Event count, Event count per user, Conversions |
| Revenue | `totalRevenue`, `purchaseRevenue`, `transactions` | Total revenue, Purchase revenue, Transactions |

Full reference: https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema

---

## Pricing / quota pitfalls

- **API itself is free** within quota
- **Default quota: 25,000 tokens/day per property** — most reports cost 1-10 tokens
- **Cost-control tokens** are a tighter sub-quota (10 tokens/hour per property) for "complex" reports. Detected by Google's own heuristic; you'll see `RESOURCE_EXHAUSTED` for cost-control before daily quota
- **Same service account on N properties** = N separate quotas
- **Failed reports DO consume tokens** — validate dimensions/metrics names client-side

---

## Error reference

| Status / code | Meaning | Fix |
|---|---|---|
| `403 PERMISSION_DENIED` "property not found" | service account not added as user on GA4 property | add SA email in GA4 Admin → Property → User Management |
| `403 PERMISSION_DENIED` "Google Analytics Data API has not been used" | API not enabled in GCP project | enable at console.cloud.google.com → APIs → Library |
| `400 INVALID_ARGUMENT` "Did you mean ..." | dimension/metric name typo (case-sensitive) | check API schema for exact name |
| `400 INVALID_ARGUMENT` "Property ID invalid" | using G-XXXXXXXX measurement ID instead of numeric property ID | use numeric ID from GA4 Admin → Property settings |
| `429 RESOURCE_EXHAUSTED` cost-control tokens | complex report hit hourly cost limit | simplify dimensions/metrics, narrow date range, wait an hour |
| `429 RESOURCE_EXHAUSTED` daily | hit 25k tokens/day | wait until UTC midnight, or request quota increase |

---

## When to pick this vs alternatives in your Trove

- **google-analytics** (this module) → server-side GA4 queries, dashboards, cohort analysis. Works for any GA4 property where you can add a service account
- **google-search-console** → search-side analytics (queries, CTR, impressions). Different surface, often paired
- **Custom analytics (Plausible / PostHog / etc)** → out of Google ecosystem, but ask if you want GA4 specifically
- **Real-time only** → GA4 Realtime API. For high-volume real-time use Server-Sent Events instead via Measurement Protocol (different beast)
