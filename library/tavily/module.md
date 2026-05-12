---
name: tavily
version: 0.1.0
category: search-api
description: Tavily — search + content extraction API tuned for LLM/agent consumption (clean markdown, AI-generated answer, source citations)
homepage: https://docs.tavily.com
tags: [search, extraction, llm-friendly, web-research]
applies_to:
  - search-and-read in one call (otherwise you'd serper + WebFetch separately)
  - giving the agent a synthesized answer + cited sources (RAG-style)
  - news / finance vertical search with structured response
  - extracting clean markdown from a known URL (Extract endpoint)
trove_spec: "0.1"

credentials:
  TAVILY_API_KEY:
    type: password
    required: true
    help: "https://app.tavily.com → API Keys. Free tier ≈ 1000 credits/month, no card."
---

# Tavily Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Auth is `Bearer` token (Authorization header), NOT a custom `X-API-KEY`** — unlike serper. Easy mistake when porting code between the two
2. **`search_depth` is the cost lever** — `"basic"`/`"fast"`/`"ultra-fast"` = 1 credit, `"advanced"` = 2 credits. Default is `"basic"`. **Advanced ≠ "more results", it = "deeper crawl + richer per-result content"**
3. **`include_answer: "advanced"` does an extra LLM synthesis call** — adds latency (~2-4s) and may add credits. Don't enable for high-volume agentic loops; do enable when you want a one-shot answer
4. **`auto_parameters: true` overrides `search_depth`** — Tavily picks depth based on query and may bill 2 credits even if you asked for basic. Don't combine the two
5. **`max_results` capped at 20** — over-asking silently caps, doesn't error
6. **`include_raw_content` returns full page text, not just snippets** — huge response size; only enable when you'll actually consume it. `"markdown"` value is cleaner than `"text"` for LLM consumption
7. **Synchronous only**, no streaming. Typical latency: basic ~1s, advanced ~3-5s, advanced+answer up to 10s

---

## Search (the main endpoint)

`POST https://api.tavily.com/search`

```typescript
const apiKey = process.env.TAVILY_API_KEY;

const res = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'Cloudflare Pages custom domain SSL pending fix',
    search_depth: 'basic',          // basic | fast | ultra-fast (1 credit) | advanced (2 credits)
    topic: 'general',               // general | news | finance
    max_results: 5,                 // 1-20
    include_answer: false,          // false | true | "basic" | "advanced"
    include_raw_content: false,     // false | true | "markdown" | "text"
    include_images: false,
    time_range: 'month',            // day | week | month | year (optional)
    country: 'us',                  // optional country boost
    include_domains: [],            // ['docs.cloudflare.com'] — max 300
    exclude_domains: [],            // max 150
  }),
});

const data = await res.json();
// data.query                  echo of the query
// data.answer?                AI-synthesized answer (when include_answer set)
// data.results[]              { title, url, content, score, raw_content?, favicon? }
// data.images[]?              when include_images: true
// data.response_time          float seconds
// data.usage.credits          integer — record this for cost tracking
// data.request_id             for support tickets
```

### One-shot answer pattern (RAG-style)

```typescript
const res = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'how does Stripe idempotency key replay work',
    search_depth: 'advanced',
    include_answer: 'advanced',     // get a synthesized answer with citations
    max_results: 5,
  }),
});
const { answer, results } = await res.json();
// `answer` is ~1-3 paragraph plain text grounded in `results` URLs.
// For agent contexts: feed `answer` to the user, keep `results[].url` as citations.
```

### News / Finance vertical

```typescript
body: JSON.stringify({
  query: 'Anthropic Claude pricing change',
  topic: 'news',                    // also: "finance" for ticker-related queries
  time_range: 'week',
  max_results: 10,
})
// data.results[].published_date populated when topic: 'news'
```

---

## Extract endpoint

`POST https://api.tavily.com/extract` — clean markdown of a known URL (no search step).

```typescript
const res = await fetch('https://api.tavily.com/extract', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    urls: ['https://docs.stripe.com/api/idempotent_requests'],
    extract_depth: 'basic',         // basic = 1 credit, advanced = 2 credits per URL
    format: 'markdown',             // markdown | text
    include_images: false,
  }),
});

const { results, failed_results } = await res.json();
// results[] = { url, raw_content, images? }
// failed_results[] = { url, error }
```

Cheaper than search → WebFetch round-trip when you already know the target URL. Up to ~20 URLs per request.

---

## Pricing pitfalls

- **`auto_parameters` can silently double cost** — Tavily auto-picks "advanced" for ambiguous queries. Set depth explicitly if you care about bill predictability
- **`include_answer: "advanced"` adds a synthesis billable on top of search depth** — check `data.usage.credits` in response to see actual cost
- **`include_raw_content` does NOT change credits but inflates response by ~10x** — bandwidth, not credit cost
- **Free tier**: ~1,000 credits/month, refreshes monthly. Paid: pay-as-you-go from $0.005/credit at low tier, cheaper at volume
- **Watch `data.usage.credits` per call** — Tavily's cost model is opaque enough that you want telemetry

---

## Error reference

| Status | Meaning | Fix |
|---|---|---|
| `401` | bad / missing Bearer token | `Authorization: Bearer <key>` (NOT `X-API-KEY: ...`) |
| `402` | out of credits | top up in dashboard |
| `400` | invalid params (e.g. `max_results: 50`) | check docs for valid ranges |
| `422` | unknown body field | server validates strictly |
| `429` | rate limit (≈100 qps soft cap on free tier, higher on paid) | back off |
| empty `results[]` | no results matched filters | loosen `include_domains` / `time_range` / `country` |

---

## When to pick tavily vs alternatives

- **tavily** (this module) → "search + read in one call". Best when you want a synthesized answer with citations, or LLM-clean markdown of result pages without writing your own scraper. **More expensive per credit but saves the follow-up WebFetch step**
- **serper** → cheap raw Google SERP. Best when you only need links/snippets, or when you'll do your own extraction
- **brave** → independent index, useful as fallback or "non-Google perspective"
- **rule of thumb**: agentic loop doing 1000s of searches → serper. Single high-stakes "give me the answer" → tavily.
