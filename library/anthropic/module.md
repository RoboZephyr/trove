---
name: anthropic
version: 0.1.0
category: llm-provider
description: Anthropic Claude API — chat completion, prompt caching, tool use, batch, files, citations, computer use
homepage: https://docs.anthropic.com/en/api/overview
tags: [llm, claude, prompt-caching, tool-use]
applies_to:
  - chat completion with Claude (Opus / Sonnet / Haiku)
  - prompt caching (long system prompts, doc context, RAG passages)
  - tool use (function calling)
  - extended thinking / reasoning mode
  - vision / multimodal
  - batch requests (50% cost discount, async)
  - citations (auto-citation against documents)
  - computer use (browser/desktop control)
  - default LLM provider for Trove's AI Authoring feature
trove_spec: "0.1"
last_verified: "pending — no API key. Anthropic SDK is structurally similar to verified qwen / openrouter modules; smoke when key available"

credentials:
  ANTHROPIC_API_KEY:
    type: password
    required: true
    help: "https://console.anthropic.com/settings/keys"
  ANTHROPIC_BASE_URL:
    type: url
    required: false
    default: "https://api.anthropic.com"
    help: "Override for Bedrock / Vertex AI proxies. Default is Anthropic direct."
---

# Anthropic Claude API Usage Guide

## ⚠️ Critical Constraints (read first)

1. **Model IDs change**—the most capable model in mid-2026 is `claude-opus-4-7`; balanced is `claude-sonnet-4-6`; cheap+fast is `claude-haiku-4-5-20251001`. Hardcoding any specific id will go stale. Check https://docs.anthropic.com/en/docs/about-claude/models for current list before assuming
2. **Prompt caching is the #1 cost-saving feature**—mark cacheable blocks with `cache_control: {type: 'ephemeral'}`, save 90% on cached tokens. **Most apps that should use it, don't**
3. **TTL is 5 minutes**—cache hit window is short. Apps making sparse calls (>5 min apart) won't benefit; consider 1-hour cache (`cache_control: {type: 'ephemeral', ttl: '1h'}`, costs more upfront)
4. **`max_tokens` is required**—omitting it = 400 error. Set to a generous-but-not-huge ceiling (e.g. 4096); requesting 32000 every call wastes streaming buffer
5. **Tool use response shape**: when model invokes a tool, response has `stop_reason: 'tool_use'` and `content` includes a `tool_use` block. **Easy bug**: assuming `content[0]` is text—it might be tool_use
6. **Streaming uses SSE** with `data: ` prefix and event types `message_start` / `content_block_start` / `content_block_delta` / `content_block_stop` / `message_delta` / `message_stop`. Don't roll your own parser; use the SDK

---

## Setup

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // baseURL: process.env.ANTHROPIC_BASE_URL,  // only if using Bedrock proxy etc.
});
```

---

## Chat completion

```typescript
const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,                  // required
  system: 'You are a helpful assistant.',
  messages: [
    { role: 'user', content: 'Hello' },
  ],
});

// msg.content is an array of blocks
const text = msg.content.find(b => b.type === 'text')?.text ?? '';
console.log(text);
```

### Streaming

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  messages: [{ role: 'user', content: 'Tell me a story' }],
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    process.stdout.write(chunk.delta.text);
  }
}

const final = await stream.finalMessage();
```

---

## Prompt caching (use it!)

```typescript
const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: [
    { type: 'text', text: 'You are a code reviewer.' },
    {
      type: 'text',
      text: LARGE_CODEBASE_CONTEXT,    // e.g. 50k tokens of code
      cache_control: { type: 'ephemeral' },   // ← cache this block
    },
  ],
  messages: [{ role: 'user', content: 'Review the changes.' }],
});

// First call: pays full price for LARGE_CODEBASE_CONTEXT
// Within 5 min: subsequent calls pay 10% for cache hit on that block
```

**1-hour cache** (costs 2x upfront, but better for sparse usage):
```typescript
cache_control: { type: 'ephemeral', ttl: '1h' }
```

Inspect cache hits via `msg.usage.cache_creation_input_tokens` (created) and `msg.usage.cache_read_input_tokens` (hit).

---

## Tool use (function calling)

```typescript
const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  tools: [{
    name: 'get_weather',
    description: 'Get current weather in a location',
    input_schema: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
    },
  }],
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
});

if (msg.stop_reason === 'tool_use') {
  const toolUse = msg.content.find(b => b.type === 'tool_use');
  const result = await runTool(toolUse.name, toolUse.input);

  // Continue conversation with tool result
  const followup = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    tools: [/* same tools */],
    messages: [
      { role: 'user', content: 'What is the weather in SF?' },
      { role: 'assistant', content: msg.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) }] },
    ],
  });
}
```

---

## Extended thinking (reasoning mode, Sonnet 4.6+)

```typescript
const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 16000,
  thinking: { type: 'enabled', budget_tokens: 10000 },   // budget for thinking
  messages: [{ role: 'user', content: 'Hard math problem...' }],
});

// Response includes a 'thinking' block with the reasoning trace
const thinking = msg.content.find(b => b.type === 'thinking');
const answer = msg.content.find(b => b.type === 'text');
```

`budget_tokens` ≤ `max_tokens` and ≥ 1024. Thinking tokens billed at output rate.

---

## Vision

```typescript
await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', source: { type: 'url', url: 'https://example.com/cat.jpg' } },
      // base64 also: source: { type: 'base64', media_type: 'image/jpeg', data: '...' }
    ],
  }],
});
```

Image limits: ≤ 5MB per image, ≤ 100 images per request. Resized server-side; high-res benefit caps around 1568x1568.

---

## Batch (50% off, async)

```typescript
// Submit batch (up to 100k requests)
const batch = await client.messages.batches.create({
  requests: [
    { custom_id: 'req-1', params: { model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [...] } },
    { custom_id: 'req-2', params: { model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [...] } },
  ],
});

// Poll
const status = await client.messages.batches.retrieve(batch.id);
// status.processing_status: 'in_progress' | 'canceling' | 'ended'

// Fetch results when ended
const results = await client.messages.batches.results(batch.id);
for await (const r of results) {
  console.log(r.custom_id, r.result);
}
```

24h SLA but usually <1h. **Use for**: dataset eval, bulk classification, retroactive enrichment. **Don't use for**: latency-sensitive UX.

---

## Files API

Upload once, reference many times:
```typescript
const file = await client.beta.files.upload({
  file: fs.createReadStream('./big-pdf.pdf'),
  purpose: 'user-data',
});

await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'file', file_id: file.id } },
      { type: 'text', text: 'Summarize this PDF.' },
    ],
  }],
});
```

Files persist 30 days, count against storage quota.

---

## Citations (auto-cite against docs)

```typescript
await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'document',
        source: { type: 'text', media_type: 'text/plain', data: REFERENCE_DOC },
        citations: { enabled: true },                  // ← enable citations
      },
      { type: 'text', text: 'What does this doc say about X?' },
    ],
  }],
});

// Response content includes citation blocks pointing to char ranges in the doc
```

---

## Pricing pitfalls

- **Output tokens are 5x input** (typical ratio)—long structured JSON output is costly
- **Cache writes cost 1.25x input rate** (5-min TTL) or **2x** (1h TTL); cache reads 0.1x. Caching only saves money if hit rate > ~25%
- **Thinking tokens billed at output rate** even though they're internal—budget aware
- **Batch 50% discount** doesn't apply to cache writes/reads; mix carefully
- **Vision input tokens calculated by image dimensions**—1280x720 image ≈ 1240 tokens

---

## Error reference

| Status / type | Meaning | Fix |
|---|---|---|
| 400 `invalid_request_error` (max_tokens missing) | required param omitted | always set `max_tokens` |
| 401 `authentication_error` | bad / revoked key | re-issue at console |
| 403 `permission_error` | model not enabled for org | request access in console |
| 429 `rate_limit_error` | TPM / RPM cap hit | back off, raise tier in console |
| 529 `overloaded_error` | API overloaded | retry with backoff (rare, transient) |
| 400 `invalid_request_error` (model not found) | wrong model id | check current model list |
