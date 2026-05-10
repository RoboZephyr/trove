---
name: openrouter
version: 0.1.0
category: llm-provider
description: OpenRouter — unified gateway to 100+ LLMs (Claude, GPT, Gemini, Llama, etc.) via OpenAI-compatible API
homepage: https://openrouter.ai/docs
tags: [llm, gateway, openai-compatible]
applies_to:
  - LLM chat completion when you want flexibility to switch models
  - using newer or proprietary models without separate vendor accounts
  - cost optimization (routing to cheapest available model in a tier)
  - LLM benchmarking / A/B comparison
trove_spec: "0.1"

credentials:
  OPENROUTER_API_KEY:
    type: password
    required: true
    help: "https://openrouter.ai/keys — note: keys are scoped (default model whitelist optional)"
  OPENROUTER_SITE_URL:
    type: url
    required: false
    default: "https://localhost"
    help: "Sent as HTTP-Referer header. OpenRouter shows it in their analytics; helps your app rank in their leaderboard. Optional but recommended."
  OPENROUTER_SITE_NAME:
    type: text
    required: false
    help: "Sent as X-Title header. Appears in OpenRouter dashboard. Optional."
---

# OpenRouter Usage Guide

## ⚠️ Critical Constraints

1. **OpenAI-compatible endpoint** — drop-in replacement for OpenAI client by changing `baseURL`. **Don't** use vendor-native SDKs (`@anthropic-ai/sdk`, `@google/generative-ai`) — OpenRouter only speaks OpenAI dialect
2. **Model name format**: `<vendor>/<model>` e.g. `anthropic/claude-sonnet-4-6`, `openai/gpt-4o`, `google/gemini-2.0-flash-exp`. Common typo: omitting the vendor prefix → 404
3. **Model availability changes weekly** — never hardcode "best available" assumptions. Check https://openrouter.ai/models for current list. Some models are gated (need user approval)
4. **Pricing varies wildly across models in the same tier** — `anthropic/claude-opus-4` ≈ $15/M input vs `anthropic/claude-haiku-4-5` ≈ $0.80/M. Pick deliberately, don't auto-default to most-capable
5. **Streaming is supported** but exact event format matches OpenAI (data: prefix, [DONE] sentinel). Some libraries assume vendor-specific formats and break
6. **No vendor-specific features auto-translate** — Anthropic prompt caching, OpenAI function calling extras, Gemini system instruction nuances may not pass through unchanged. Test each model's quirks
7. **Provider routing** (`provider: { order: [...], allow_fallbacks: true }`) — useful for reliability, but ordering matters: cheapest first if cost-sensitive, fastest first if latency-sensitive

---

## Chat completion

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? '',
    'X-Title': process.env.OPENROUTER_SITE_NAME ?? '',
  },
});

const res = await client.chat.completions.create({
  model: 'anthropic/claude-sonnet-4-6',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' },
  ],
  temperature: 0.7,
  max_tokens: 1000,
});

console.log(res.choices[0].message.content);
```

### Streaming

```typescript
const stream = await client.chat.completions.create({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

### Provider routing

```typescript
// Use only specific providers, in order, with fallback
await client.chat.completions.create({
  model: 'anthropic/claude-sonnet-4-6',
  messages: [...],
  // @ts-expect-error - openrouter extension
  provider: {
    order: ['Anthropic', 'AWS Bedrock'],     // try Anthropic direct first
    allow_fallbacks: true,                   // fall back to other providers if needed
  },
});

// Cost-prefer routing (use cheapest matching the model)
await client.chat.completions.create({
  model: 'anthropic/claude-sonnet-4-6',
  messages: [...],
  // @ts-expect-error
  provider: { sort: 'price' },
});
```

---

## Multimodal (vision)

```typescript
const res = await client.chat.completions.create({
  model: 'openai/gpt-4o',           // or 'anthropic/claude-sonnet-4-6', 'google/gemini-2.0-flash-exp'
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/cat.jpg' } },
      // base64 also works: url: 'data:image/jpeg;base64,...'
    ],
  }],
});
```

Not all models support vision — check model card. Trying vision on text-only model = 400 error.

---

## Tool calling

OpenAI-format tool calls work for compatible models:
```typescript
await client.chat.completions.create({
  model: 'anthropic/claude-sonnet-4-6',
  messages: [...],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      },
    },
  }],
});
```

Some smaller / older models don't support tool calling — check model card.

---

## Model selection cheat sheet (mid-2026)

| Use case | Recommended | Notes |
|---|---|---|
| General reasoning, code | `anthropic/claude-sonnet-4-6` | balanced cost/capability |
| Most capable | `anthropic/claude-opus-4-7` | $$$, use sparingly |
| Cheap + fast | `anthropic/claude-haiku-4-5` or `google/gemini-2.0-flash-exp` | <$1/M input |
| Long context | `google/gemini-2.5-pro` (2M) or `anthropic/claude-sonnet-4-6` (1M) | check actual model card for current cap |
| Open-source | `meta-llama/llama-3.3-70b-instruct` or `qwen/qwen-2.5-72b-instruct` | runs on multiple providers |
| Vision strong | `openai/gpt-4o` or `google/gemini-2.0-flash-exp` | |
| Code-specialized | `anthropic/claude-sonnet-4-6` (top) or `qwen/qwen-2.5-coder-32b-instruct` (cheap) | |

⚠️ **This table goes stale fast — always cross-check https://openrouter.ai/models.**

---

## Pricing pitfalls

- **Each model has separate input/output token rates** — long-context output (e.g. structured JSON extraction) can be 2-3x of input cost
- **Some models charge for thinking tokens** (e.g. reasoning models) separately — see `usage.completion_tokens_details.reasoning_tokens` in response
- **Cache hits / discounts** vary by provider; not all expose caching via OpenRouter
- **Failed requests still count for routing** — check `usage` in response; transient failures may bill you for retried tokens
- Prepaid model: top up credits, no monthly subscription. Set spending limit per key in dashboard

---

## Error reference

| Status / message | Meaning | Fix |
|---|---|---|
| `404 Model not found` | wrong model id (typo, vendor prefix missing) | check `https://openrouter.ai/models` for exact id |
| `402 Payment Required` | out of credits | top up at https://openrouter.ai/credits |
| `429 Rate limit` | per-key or per-IP rate hit | back off, OpenRouter has soft rate limits per tier |
| `503 Provider unavailable` | upstream provider down | enable `allow_fallbacks: true` |
| `Model needs approval` | gated model | request access in dashboard |
