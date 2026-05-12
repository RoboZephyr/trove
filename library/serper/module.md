---
name: serper
version: 0.1.0
category: search-api
description: Serper — Google search API (organic + news + images + videos + places + scholar + maps + shopping)
homepage: https://serper.dev
tags: [search, google, serp, web-research]
applies_to:
  - any "search the web" / "find current info" / "what does Google return for X" task
  - news / images / videos / places / scholar / shopping vertical queries
  - SERP scraping for SEO / market research
  - giving AI agents fresh web context beyond training cutoff
trove_spec: "0.1"
last_verified: "2026-05-12 · /search returned organic results, 1 credit consumed"

credentials:
  SERPER_API_KEY:
    type: password
    required: true
    help: "https://serper.dev → dashboard. 2500 free credits on signup (no card), credits expire after 6 months of inactivity."
---

# Serper Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Auth is `X-API-KEY` header, NOT `Authorization: Bearer`** — #1 source of 401 errors when porting from OpenAI/Anthropic patterns
2. **POST + JSON body, not GET + query string** — `curl -X POST https://google.serper.dev/search -H "X-API-KEY: $KEY" -H "Content-Type: application/json" -d '{"q": "..."}'`
3. **`gl` (country) defaults to `us`, `hl` (language) defaults to `en`** — non-US queries WILL return US-skewed results unless set explicitly. China: `gl: "cn", hl: "zh-cn"`; Japan: `gl: "jp", hl: "ja"`; UK: `gl: "uk", hl: "en"`
4. **`num` default = 10; max varies per endpoint** — /search up to 100, /news up to 100, /places up to 20. Over-asking silently caps, doesn't error
5. **Each `page` is a separate billable credit** — `page: 5, num: 10` = 5 credits. Prefer `num: 100, page: 1` when you want depth in one call
6. **Top-level response fields are conditional** — `knowledgeGraph`, `peopleAlsoAsk`, `relatedSearches`, `topStories`, `answerBox` only appear when Google returned them. Always defensive-read with `?.` / `??`
7. **Synchronous only** — no streaming, no async polling. Typical latency 1-2 seconds

---

## Search (organic + Knowledge Graph)

Endpoint: `POST https://google.serper.dev/search`

```typescript
const apiKey = process.env.SERPER_API_KEY;

const res = await fetch('https://google.serper.dev/search', {
  method: 'POST',
  headers: {
    'X-API-KEY': apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    q: 'site:openrouter.ai claude haiku pricing',
    gl: 'us',           // country code
    hl: 'en',           // UI language
    num: 10,            // results per page
    page: 1,            // pagination (each page = 1 credit)
    autocorrect: false, // disable spelling correction when querying technical strings
  }),
});

const data = await res.json();
// data.organic[]            main results: { title, link, snippet, position, sitelinks?, date? }
// data.knowledgeGraph?      entity panel — only when Google has one for the query
// data.peopleAlsoAsk?[]     { question, snippet, title, link }
// data.relatedSearches?[]   { query }
// data.topStories?[]        news cluster shown above organic
// data.answerBox?           direct answer (featured snippet)
```

### Common query patterns

**Site-restricted** (best for "what does this vendor say about X"):
```typescript
body: JSON.stringify({ q: 'site:docs.stripe.com idempotency keys' })
```

**Time-bounded** (`tbs` is Google's standard date filter):
```typescript
body: JSON.stringify({
  q: 'claude sonnet release',
  tbs: 'qdr:m',  // qdr:h=hour, d=day, w=week, m=month, y=year
})
```

**Multi-locale comparison** — fire N parallel requests with different `gl`/`hl` and compare result sets.

---

## Other endpoints (same shape, different path)

| Vertical | Path | Result field |
|---|---|---|
| News | `/news` | `news[]` — { title, link, snippet, source, date, imageUrl } |
| Images | `/images` | `images[]` — { title, link, source, imageUrl, imageWidth, imageHeight } |
| Videos | `/videos` | `videos[]` — { title, link, snippet, channel, date, imageUrl } |
| Places | `/places` | `places[]` — { title, address, rating, ratingCount, type, phoneNumber, website, cid } |
| Scholar | `/scholar` | `organic[]` with `publicationInfo`, `citedBy` |
| Maps | `/maps` | needs `ll` param like `ll=@40.7,-74.0,15z`; returns `places[]` |
| Shopping | `/shopping` | `shopping[]` — { title, source, link, price, delivery, rating } |
| Patents | `/patents` | `organic[]` with patent-specific fields |
| Autocomplete | `/autocomplete` | `suggestions[]` |

---

## Pricing pitfalls

- **Credit per request, regardless of query/result length** — no per-character billing surprises
- **Each pagination page is a credit** — see Critical Constraint #5
- **Credits expire after 6 months** of inactivity — irrelevant for active agents, but check periodically for hobby projects
- **Tiers (mid-2026)**: 2,500 free at signup. Paid roughly $0.30-$1.00 per 1k queries depending on volume committed
- **Hard rate cap ≈ 300 qps** — soft, not a 429 wall; just back off if you see them

---

## Error reference

| Status | Meaning | Fix |
|---|---|---|
| `401` | bad / missing `X-API-KEY` header | confirm header name (NOT `Authorization`), check key in dashboard |
| `403` | key valid but blocked / out of credits | check credits balance in dashboard |
| `400` | malformed JSON body or unknown field | server validates strictly; remove unknown keys |
| `429` | rate limit (≈300 qps soft cap) | back off; rare unless high-volume parallel |
| empty `organic[]` | no results OR `gl`/`hl` mismatch with query language | try without `gl`/`hl`, or align them with query language |

---

## When to pick serper vs alternatives in your Trove

- **serper** (this module) → Google's actual SERP. Best for "what does Google show". Cheapest of the three search APIs
- **tavily** → adds clean content extraction (markdown from result URLs in one call). Pay more, save a follow-up scrape step. Better for "give me the answer, not just links"
- **brave** → independent index (not Google), useful as fallback or for "non-Google opinion"
- **WebFetch** (built into your agent) → fetch a known URL. Pair with serper/tavily/brave for "search → read" workflows
