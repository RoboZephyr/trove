---
name: google-search-console
version: 0.1.0
category: analytics
description: Google Search Console — query / page / country / device performance from Google search results. Service-account auth, shares JSON with google-analytics
homepage: https://developers.google.com/webmaster-tools/search-console-api-original
tags: [seo, search-console, gsc, service-account-auth]
applies_to:
  - what queries surface a site in Google results (queries, CTR, impressions, position)
  - which pages are gaining/losing visibility week-over-week
  - country / device breakdown of organic search performance
  - URL inspection (is this page indexed? what's the canonical?)
  - submitting a sitemap or requesting indexing for a URL

credentials:
  GSC_SITE_URL:
    type: text
    required: true
    help: "Property URL exactly as registered. Two formats: 'https://example.com/' (URL-prefix property) OR 'sc-domain:example.com' (domain property). Different formats — use the one shown in GSC dashboard for that property"
  GOOGLE_SERVICE_ACCOUNT_JSON:
    type: multiline
    required: true
    help: "Same service-account JSON as google-analytics. Service account email must be added as user on the GSC property at https://search.google.com/search-console/users (Owners → Add user)"

trove_spec: "0.1"
last_verified: "2026-05-12 · sites.list returned configured site with SA auth"
---

# Google Search Console API Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Service account email MUST be added as user on the GSC property** — same pattern as GA4 but in GSC's own user-management UI (Search Console → Settings → Users and permissions). Until added, every API call returns 403. **Same gotcha as google-analytics**, separate user list per property
2. **Two property formats exist and they are NOT interchangeable** — `https://example.com/` (URL-prefix property) is one. `sc-domain:example.com` (domain property) is another. The latter covers all subdomains + http/https. **Use the EXACT string from your GSC dashboard**, including trailing slash for URL-prefix
3. **Data lags 2-3 days** — query "last 7 days" today, expect data through ~3 days ago. **The most recent day always shows lower numbers** because data isn't complete. Don't trust today's or yesterday's numbers
4. **Default API row limit: 1,000 rows per request**, max 25,000. Use `startRow` for pagination; data is ordered by clicks desc by default
5. **Discrepancies between API and GSC UI are real** — UI does additional deduplication; API returns raw aggregations. Don't expect pixel-perfect match
6. **Maximum 16 months of historical data** — older data is auto-purged. Plan to mirror to your own warehouse if you need long-term trends
7. **Service-account JSON is stored as a stringified blob in credentials.json** — same as google-analytics, JSON.parse before passing to SDK

---

## SDK setup

```typescript
import { google } from 'googleapis';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

const webmasters = google.webmasters({ version: 'v3', auth });
const siteUrl = process.env.GSC_SITE_URL!;
```

Shell-pipeline credential extraction:
```bash
export GSC_SITE_URL=$(jq -r .GSC_SITE_URL ~/.trove/google-search-console/credentials.json)
export GOOGLE_SERVICE_ACCOUNT_JSON=$(jq -r .GOOGLE_SERVICE_ACCOUNT_JSON ~/.trove/google-search-console/credentials.json)
```

---

## Search analytics — the main report

```typescript
const res = await webmasters.searchanalytics.query({
  siteUrl,
  requestBody: {
    startDate: '2026-05-01',           // YYYY-MM-DD, inclusive
    endDate: '2026-05-08',             // remember 2-3 day lag for recent dates
    dimensions: ['query', 'page'],     // can include: query, page, country, device, searchAppearance, date
    rowLimit: 1000,                    // max 25000
    startRow: 0,                       // for pagination
    dimensionFilterGroups: [{
      filters: [{ dimension: 'country', operator: 'equals', expression: 'usa' }],
    }],
  },
});

for (const row of res.data.rows ?? []) {
  const [query, page] = row.keys!;
  const { clicks, impressions, ctr, position } = row;
  console.log(`${query.padEnd(40)} ${clicks.toString().padStart(5)} clicks  CTR=${(ctr * 100).toFixed(2)}%  pos=${position.toFixed(1)}`);
}
```

### Common report shapes

**Top queries last 28 days**: `dimensions: ['query']`, sort default (clicks desc).

**Page-level CTR**: `dimensions: ['page']`, sort by CTR desc (`orderBy: [{ dimension: 'ctr', sort: 'desc' }]` — note: orderBy support varies by API version).

**Mobile vs desktop**: `dimensions: ['device']`, single row per device category.

**Country breakdown**: `dimensions: ['country']` — ISO 3166-1 alpha-3 codes (`'usa'`, `'jpn'`, `'chn'`).

---

## Other endpoints

| Endpoint | What it does | Notes |
|---|---|---|
| `sites.list` | list all GSC properties the SA has access to | useful for "discover what properties this SA can read" |
| `sitemaps.list` / `submit` | manage submitted sitemaps | submit returns 204, async indexing |
| `urlInspection.index.inspect` | inspect a single URL — is it indexed? canonical? coverage state? | great for "why is page X not ranking" debugging |
| `searchanalytics.query` | the main report (above) | |

```typescript
// Inspect a URL
const inspect = await google.searchconsole({ version: 'v1', auth }).urlInspection.index.inspect({
  requestBody: { inspectionUrl: 'https://example.com/page', siteUrl },
});
console.log(inspect.data.inspectionResult.indexStatusResult.coverageState);
// "Submitted and indexed" | "Crawled - currently not indexed" | etc.
```

---

## Pricing / quota pitfalls

- **API is free** within quota
- **Quota: 1,200 queries/min per project, 30,000/day per project, 200 search-analytics queries/day per site** — site-level limit is the tightest
- **`urlInspection` has stricter limits** — 2,000 queries/day per site, 600/minute. Don't batch inspect a thousand URLs naively
- **`sitemaps.submit` is rate-limited but free** — won't speed up indexing; Google still decides

---

## Error reference

| Status | Meaning | Fix |
|---|---|---|
| `403 User does not have sufficient permissions` | SA not added on GSC property | add at GSC → Settings → Users → Add user (Full or Restricted permission) |
| `403 Search Console API has not been used` | API not enabled in GCP project | enable at console.cloud.google.com → APIs |
| `404 Site not found` | wrong property URL format (slash? sc-domain:?) | match dashboard's exact string |
| `400 Invalid dimension` | typo in dimensions array | valid: query, page, country, device, searchAppearance, date |
| `400 startDate before earliest available data` | requested > 16 months ago | data is auto-purged; only last 16 months |
| `429 quota exceeded` | hit per-site or per-project limit | back off; check Cloud Console quota page |

---

## Pairing with google-analytics

GSC tells you "what people searched to find your site". GA4 tells you "what people did once on your site". Common combined query:

> "Pages with high GSC impressions but low GA4 conversion rate"

Workflow:
1. GSC `searchanalytics.query` with `dimensions: ['page']`, filter `impressions > 1000`
2. For each `page`, query GA4 `runReport` with `dimensions: ['pagePath']`, filter to that page, metrics `conversions, sessions`
3. Join in memory by URL

This pattern is why both modules are usually installed together. They share the same service-account JSON deliberately.
