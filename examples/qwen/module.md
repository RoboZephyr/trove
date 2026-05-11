---
name: qwen
version: 0.1.0
category: llm-provider
description: Qwen / Tongyi Qianwen (Alibaba DashScope) — OpenAI-compatible LLM API. Strong Chinese, cheap, China-region availability
homepage: https://dashscope.console.aliyun.com
tags: [llm, chinese, openai-compatible, alibaba]
applies_to:
  - Chinese-language LLM tasks where Qwen outperforms western models (Chinese understanding, classical Chinese, code in Chinese context)
  - cheap drop-in OpenAI-compatible model for high-volume work (~10-20x cheaper than GPT-4o on equivalent tier)
  - China-region edge / compliance scenarios where you want to keep traffic inside Aliyun
  - JSON-mode structured extraction (response_format supported on qwen-plus / qwen-turbo)
trove_spec: "0.1"

credentials:
  QWEN_API_KEY:
    type: password
    required: true
    help: "https://dashscope.console.aliyun.com/apiKey — get a sk-... key. Note: international DashScope vs China DashScope are different consoles."
---

# Qwen / Tongyi Qianwen Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Use the OpenAI-compatible endpoint, NOT the native DashScope endpoint** — `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` is drop-in OpenAI shape. The native `/api/v1/services/aigc/text-generation/generation` has its own request format (parameters, input) and isn't worth the integration cost unless you need DashScope-only features
2. **Two consoles, two key spaces** — Alibaba operates a China console (dashscope.console.aliyun.com) AND an international one (dashscope-intl.aliyuncs.com). **Keys don't cross**. Check which one your key was created from
3. **Model name format**: `qwen-turbo`, `qwen-plus`, `qwen-max`, `qwen-long`, `qwen2.5-72b-instruct`, `qwen2.5-coder-32b-instruct`, etc. **NO vendor prefix** (unlike OpenRouter where it'd be `qwen/qwen2.5-72b`)
4. **`response_format: { type: "json_object" }` works on `qwen-plus` / `qwen-turbo`**, **NOT on `qwen-max`** in some versions. Test before relying. Always pair with "respond in JSON" in the system prompt to be safe
5. **Streaming uses OpenAI dialect** (`stream: true`, `data: ...` lines, `[DONE]` sentinel). Compatible with the OpenAI npm client
6. **Long-context model is `qwen-long`** (1M tokens). Other models cap at 32k-128k. Don't accidentally route 500k token jobs to `qwen-plus`
7. **Rate limit hits faster than OpenAI** — default tier is ~60 RPM on most models. Batch jobs need backoff; or apply for higher tier

---

## Chat completion (OpenAI-compatible)

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

const res = await client.chat.completions.create({
  model: 'qwen-plus',                  // see model selection below
  messages: [
    { role: 'system', content: '你是一个高级中文编辑。' },
    { role: 'user', content: '把这段英文翻译成简体中文：The quick brown fox...' },
  ],
  temperature: 0.3,
  max_tokens: 1000,
});

console.log(res.choices[0].message.content);
```

### Streaming

```typescript
const stream = await client.chat.completions.create({
  model: 'qwen-turbo',
  messages: [{ role: 'user', content: '讲一个故事' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

### JSON-mode structured extraction

```typescript
const res = await client.chat.completions.create({
  model: 'qwen-plus',                  // qwen-turbo also works; qwen-max may not in older releases
  messages: [
    { role: 'system', content: 'Translate JSON values to Simplified Chinese. Respond ONLY with valid JSON, matching the input schema.' },
    { role: 'user', content: JSON.stringify({ title: 'Hello', body: 'World' }, null, 2) },
  ],
  response_format: { type: 'json_object' },
  temperature: 0.1,
});
const parsed = JSON.parse(res.choices[0].message.content);
```

---

## Model selection cheat sheet (mid-2026)

| Use case | Recommended | Notes |
|---|---|---|
| General balanced (cost / quality) | `qwen-plus` | ~10x cheaper than GPT-4o, ~70% quality on most tasks |
| Cheapest / highest volume | `qwen-turbo` | Sub-cent per call typical |
| Most capable | `qwen-max` | Closer to GPT-4o quality; pricier |
| Long context (1M tokens) | `qwen-long` | For RAG over big docs |
| Code-specialized | `qwen2.5-coder-32b-instruct` | Strong on code completion |
| Open-source equivalent | `qwen2.5-72b-instruct` | Same model as on OpenRouter / fal.ai; price varies |

⚠️ Model availability shifts; check console for current list.

---

## Pricing pitfalls

- **Per-token pricing** (split input / output). Mid-2026 ballpark for `qwen-plus`:
  - Input ~¥0.004/1k tokens (~$0.0006/1k)
  - Output ~¥0.012/1k tokens (~$0.0017/1k)
  - **~10-20x cheaper than GPT-4o** on similar tier
- **`qwen-long` is more expensive per token** but cheaper than alternatives at 1M-token jobs. Math out the breakeven before choosing
- **JSON mode does NOT add cost** — just output length matters
- **Failed requests still consume RPM quota** even if not billed for tokens — back off cleanly on 429
- **Prepaid credits expire** if you don't use them. Set a reminder

---

## Qwen vs OpenRouter routing the same model

`openrouter` already has `qwen/qwen2.5-72b-instruct` and friends. Why a direct module?

- **Cost**: Direct Aliyun is ~30-50% cheaper than OpenRouter's qwen routes for the same model
- **Latency in China**: Direct = local edge, OpenRouter routes through Singapore / SF first — adds 100-300ms
- **JSON mode reliability**: Direct `response_format` more consistent than via OpenRouter passthrough
- **Use OpenRouter when**: comparing qwen against non-Qwen models in the same flow / want unified billing
- **Use this module when**: production qwen workload, or any China-region traffic

---

## Error reference

| Status | Meaning | Fix |
|---|---|---|
| `401 Invalid API Key` | wrong console (china vs intl) or expired key | check which console issued the key |
| `404 Model not found` | typo or deprecated model | use `qwen-plus` / `qwen-turbo` as safe defaults; check console |
| `400 input format error` | message missing role or content | match OpenAI message schema exactly |
| `429 rate limit` | default 60 RPM tier | back off; or request quota increase in console |
| `Output token limit` | hit max_tokens | raise `max_tokens` or split work |
| `Content moderation triggered` | mainland-content rules | rewrite prompt; some words trip silent filters on China console |
