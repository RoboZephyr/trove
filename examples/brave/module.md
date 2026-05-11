---
name: brave
version: 0.1.0
category: search-api
description: Brave Search API — independent search index (not Google/Bing), privacy-focused, useful as a non-Google perspective or fallback when serper rate-limits
homepage: https://api-dashboard.search.brave.com
tags: [search, independent-index, privacy, web-research]
applies_to:
  - non-Google perspective — when Google SERP is biased / sanitized / missing a niche result
  - fallback when serper hits rate limits or returns empty for a long-tail query
  - privacy-sensitive contexts where you don't want to route queries through Google
  - cross-index diff (run same query on serper + brave, compare gaps)
trove_spec: "0.1"

credentials:
  BRAVE_API_KEY:
    type: password
    required: true
    help: "https://api-dashboard.search.brave.com → create subscription → API Keys. Free tier: 2,000 queries/month at 1 qps."
---

# Brave Search API Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Auth is `X-Subscription-Token` header** — NOT `Authorization: Bearer`, NOT `X-API-KEY`. Each search API in your Trove uses a different header name (serper: `X-API-KEY`, tavily: `Bearer`, brave: `X-Subscription-Token`). #1 source of 401s
2. **GET + query string, NOT POST + JSON** — opposite of serper/tavily. `curl -G 'https://api.search.brave.com/res/v1/web/search' -H "X-Subscription-Token: $KEY" --data-urlencode 'q=...'`
3. **Free tier hard rate cap: 1 qps** — going faster = 429. Add `await sleep(1000)` between calls or upgrade plan
4. **`count` max is 20**, not 100 — much smaller than serper's `num: 100`. For depth, paginate with `offset` (0-9 max, so max 200 results total). Different mental model from serper
5. **Brave's index is independent** — coverage differs from Google. A query returning 10 results on serper may return 3 on brave (or vice versa for non-mainstream queries). **Don't treat as drop-in replacement**, treat as complementary index
6. **Response field is `web.results[]`, NOT top-level `organic[]`** — different shape from serper. Defensive-read both shape variants if you abstract over multiple search APIs
7. **`freshness` syntax is non-obvious** — `pd` (past day), `pw` (past week), `pm` (past month), `py` (past year), or `YYYY-MM-DDtoYYYY-MM-DD` for explicit range. Different from serper's `tbs:qdr:...`

---

## Web search

`GET https://api.search.brave.com/res/v1/web/search`

```typescript
const apiKey = process.env.BRAVE_API_KEY;

const params = new URLSearchParams({
  q: 'site:hn.algolia.com trove resource manager',
  count: '10',                  // 1-20, default 20
  offset: '0',                  // 0-9 max (so up to 200 results total via pagination)
  country: 'us',                // ISO 2-letter
  search_lang: 'en',            // content language filter
  safesearch: 'moderate',       // off | moderate | strict
  freshness: 'pm',              // pd|pw|pm|py or YYYY-MM-DDtoYYYY-MM-DD
  extra_snippets: 'true',       // extra excerpts per result (more text, same cost)
});

const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
  headers: {
    'X-Subscription-Token': apiKey,
    'Accept': 'application/json',
  },
});

const data = await res.json();
// data.web.results[]       main results: { title, url, description, extra_snippets?, age?, language? }
// data.query               echo of query metadata
// data.mixed?              when result types are mixed (web + news + videos)
// data.news?               news cluster (sometimes appears for newsy queries)
// data.discussions?        Reddit/forum results (Brave surfaces these prominently)
// data.faq?                FAQ section if Brave found one
// data.infobox?            knowledge panel (analog of serper's knowledgeGraph)
```

### Common patterns

**Cross-index gap detection** (a Brave-unique use case):
```typescript
const [serperRes, braveRes] = await Promise.all([
  fetch('https://google.serper.dev/search', { /* ... */ }),
  fetch('https://api.search.brave.com/res/v1/web/search?...', { /* ... */ }),
]);
const serperUrls = new Set((await serperRes.json()).organic.map(r => r.link));
const braveUrls = new Set((await braveRes.json()).web.results.map(r => r.url));
const braveOnly = [...braveUrls].filter(u => !serperUrls.has(u));
// braveOnly often contains: forums, indie blogs, non-SEO'd sources
```

**Discussions surface** — Brave indexes Reddit / HN / forums more aggressively than Google. For "what do real users say about X", `data.discussions[]` is often more useful than `data.web.results[]`.

---

## Other endpoints

| Endpoint | Path | Notes |
|---|---|---|
| Image search | `/res/v1/images/search` | similar params, results in `results[]` (no `web.` prefix) |
| Video search | `/res/v1/videos/search` | same shape, video metadata |
| News search | `/res/v1/news/search` | structured news with `age`, `meta_url`, etc. |
| Suggest | `/res/v1/suggest/search` | autocomplete |
| Spellcheck | `/res/v1/spellcheck/search` | did-you-mean |
| Local POI | `/res/v1/local/pois` | requires `id` from a prior /web/search result |

All require the same `X-Subscription-Token` header.

---

## Pricing pitfalls

- **Free tier: 2,000 queries/month at 1 qps** — sufficient for hobby agents, hard cap not soft. 429 if you exceed qps
- **Paid tiers (mid-2026)**: ~$5/CPM for Web Data plan ($0.005/query) to ~$3/CPM at enterprise volume. Pricing tiers shift; check dashboard
- **All endpoints cost the same per call** — image/video/news same price as web
- **No per-result billing** — fetching `count: 20` costs same as `count: 1`. Always max out `count` when you'll use the depth
- **`extra_snippets: true` is free** — always enable for more useful text per result

---

## Error reference

| Status | Meaning | Fix |
|---|---|---|
| `401` | bad / missing `X-Subscription-Token` | header name is THREE words with hyphens, easy to typo |
| `403` | key valid but plan not allowed for this endpoint | check subscription includes the endpoint you're calling |
| `400` | bad query param (e.g. `count: 50`, `offset: 20`) | enforce `count ≤ 20`, `offset ≤ 9` |
| `422` | unsupported param combination (e.g. `freshness` format wrong) | check freshness format `pd`/`pw`/`pm`/`py` |
| `429` | rate limited (1 qps on free, higher on paid) | back off; add `await new Promise(r => setTimeout(r, 1000))` between calls |
| empty `web.results[]` | Brave's index didn't match | likely a query Brave's index doesn't cover well; fall back to serper |

---

## When to pick brave vs alternatives

- **brave** (this module) → independent index, especially good for **forums / Reddit / HN / indie blogs**. Use as fallback or for cross-index gap detection
- **serper** → mainstream Google SERP, cheapest, biggest result counts per call
- **tavily** → "search + extract" combo when you want clean markdown of results in one round-trip
- **rule of thumb**: if your agent is asking "what do real users say about X" or "find me content beyond the SEO frontier" → brave first. If "what's the canonical answer" → serper or tavily.
