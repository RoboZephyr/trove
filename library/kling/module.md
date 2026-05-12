---
name: kling
version: 0.1.0
category: media-generation
description: Kling AI (Kuaishou) — image generation + text/image-to-video. Region-locked auth, JWT-signed requests
homepage: https://kling.ai/dev
tags: [video-gen, image-gen, async-tasks, jwt-auth]
applies_to:
  - text-to-video / image-to-video generation (5s or 10s clips)
  - text-to-image with strong aesthetic / character consistency
  - video extension / lip-sync / motion-brush effects (advanced features)
  - alternative to minimax-video when you need different style or longer clips
trove_spec: "0.1"
last_verified: "2026-05-12 · auth (JWT-HS256) + endpoint contract OK; account out of credits — no live generation tested"

credentials:
  KLING_BASE_URL:
    type: url
    required: true
    default: "https://api-singapore.klingai.com"
    help: "MUST match your account's region. International accounts: api-singapore.klingai.com. China accounts: api.klingai.com. Mixing produces opaque 401s."
  KLING_ACCESS_KEY:
    type: text
    required: true
    help: "https://kling.ai/dev → API Keys. Pair with secret key to sign JWTs."
  KLING_SECRET_KEY:
    type: password
    required: true
    help: "Used as HMAC secret when signing JWTs (HS256). Never sent over the wire directly."
---

# Kling AI Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Auth is a per-request JWT signed with HS256, NOT a static bearer token** — you take access_key + secret_key, sign a short-lived JWT, send it as `Authorization: Bearer <jwt>`. The signed JWT changes every request. **#1 source of wasted time** when first integrating
2. **Region lock: account region MUST match endpoint** — international account on `api.klingai.com` (China) returns 401, China account on `api-singapore.klingai.com` returns 401. Error message does NOT mention region; you'll think your key is wrong. Use the `KLING_BASE_URL` credential to lock this in
3. **All generation endpoints are async** — `create → poll → fetch`. No sync mode. Image takes ~10-30s, video takes 1-5 min depending on length/model
4. **Video duration is `"5"` or `"10"`** — string, not number. Other values rejected
5. **Model names go stale fast** — `kling-v1`, `kling-v1-6`, `kling-v2-master`, `kling-v2-1`, `kling-v2-6`. Older models may be deprecated. Check console for currently-available models
6. **Output URLs expire** — generated image/video URLs typically valid for ~24h. Download and persist immediately if you need them longer
7. **Quota is task-count based, not token-based** — each video generation consumes 1 task quota regardless of length. Image generation is cheaper

---

## Auth: JWT signing

The non-obvious part. Two recommended paths:

### Option A: `kling-api` npm package (easiest)

```typescript
import { KlingAPI } from 'kling-api';

const client = new KlingAPI({
  baseUrl: process.env.KLING_BASE_URL,
  accessKey: process.env.KLING_ACCESS_KEY,
  secretKey: process.env.KLING_SECRET_KEY,
});
// JWT signing is handled internally per request
```

### Option B: raw HTTP + jsonwebtoken (no dependency on a wrapper)

```typescript
import jwt from 'jsonwebtoken';

function signKlingJWT(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: accessKey,
      exp: now + 1800,    // 30 minutes
      nbf: now - 5,       // 5-second clock skew tolerance
    },
    secretKey,
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } },
  );
}

const token = signKlingJWT(process.env.KLING_ACCESS_KEY!, process.env.KLING_SECRET_KEY!);

const res = await fetch(`${process.env.KLING_BASE_URL}/v1/videos/text2video`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* ... */ }),
});
```

The JWT is per-request — don't cache one across many requests, even though `exp` is 30 minutes. Sign fresh per call; it's microseconds.

---

## Text-to-image (T2I)

```typescript
// Submit
const createRes = await fetch(`${baseUrl}/v1/images/generations`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${signKlingJWT(ak, sk)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model_name: 'kling-v2-1',          // current strongest image model (mid-2026)
    prompt: 'a futuristic city at sunset, cinematic, ultra-detailed',
    negative_prompt: 'blurry, low quality, watermark',
    aspect_ratio: '16:9',              // 1:1 | 3:4 | 4:3 | 9:16 | 16:9
    n: 1,                              // images per call (1-9)
  }),
});
const { data: { task_id } } = await createRes.json();

// Poll
async function poll(taskId: string) {
  while (true) {
    const r = await fetch(`${baseUrl}/v1/images/generations/${taskId}`, {
      headers: { Authorization: `Bearer ${signKlingJWT(ak, sk)}` },
    });
    const j = await r.json();
    if (j.data.task_status === 'succeed') return j.data.task_result.images;
    if (j.data.task_status === 'failed') throw new Error(j.data.task_status_msg);
    await new Promise(r => setTimeout(r, 3000));
  }
}
const images = await poll(task_id);
// images[].url is a presigned URL — download within 24h
```

---

## Text-to-video (T2V)

```typescript
const createRes = await fetch(`${baseUrl}/v1/videos/text2video`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${signKlingJWT(ak, sk)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model_name: 'kling-v1-6',          // also: kling-v1, kling-v2-master, kling-v2-6
    prompt: 'a cat walking on a beach, golden hour light',
    negative_prompt: 'blurry, low quality',
    duration: '5',                     // STRING "5" or "10" — not number
    aspect_ratio: '16:9',
    cfg_scale: 0.5,                    // 0-1, prompt-strength weight
  }),
});
const { data: { task_id } } = await createRes.json();
// Poll /v1/videos/text2video/{task_id}
// Result: data.task_result.videos[0].url
```

---

## Image-to-video (I2V)

```typescript
const createRes = await fetch(`${baseUrl}/v1/videos/image2video`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${signKlingJWT(ak, sk)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model_name: 'kling-v1-6',
    image: 'https://example.com/start-frame.jpg',  // or base64: 'data:image/jpeg;base64,...'
    prompt: 'gentle camera pan to the right',
    duration: '5',
  }),
});
// Poll /v1/videos/image2video/{task_id}
```

---

## Task polling helper

All video and image tasks share the same lifecycle. Generic poller:

```typescript
async function waitForKlingTask(
  endpoint: string,        // e.g. '/v1/videos/text2video'
  taskId: string,
  opts: { timeout?: number; pollInterval?: number } = {},
) {
  const deadline = Date.now() + (opts.timeout ?? 300_000);     // 5 min default
  const interval = opts.pollInterval ?? 3000;
  while (Date.now() < deadline) {
    const r = await fetch(`${baseUrl}${endpoint}/${taskId}`, {
      headers: { Authorization: `Bearer ${signKlingJWT(ak, sk)}` },
    });
    const j = await r.json();
    if (j.data.task_status === 'succeed') return j.data.task_result;
    if (j.data.task_status === 'failed') throw new Error(j.data.task_status_msg ?? 'task failed');
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Kling task ${taskId} timed out`);
}
```

---

## Pricing / quota pitfalls

- **Task-based quota**, not per-token. Image: ~1 unit. Video 5s: ~5-10 units. Video 10s: 2x of 5s
- **`cfg_scale` doesn't affect cost** — same quota regardless
- **Failed tasks usually don't bill** — but a "succeeded but bad output" task does. Use negative_prompt aggressively
- **`n: 9` (max batch) still bills 9 units** — no bulk discount
- **Check dashboard for current rates** — quotas shift; Kling pivots pricing every few months

---

## Error reference

| Status | Meaning | Fix |
|---|---|---|
| `401 invalid signature` | wrong region OR JWT signing failed | check `KLING_BASE_URL` matches account region; verify HS256 + correct secret key |
| `401 token expired` | JWT `exp` in the past | clock drift > 30min, or you cached an old JWT — sign fresh per request |
| `400 invalid model_name` | model deprecated or typo | check dashboard for current models |
| `400 invalid duration` | duration not `"5"` / `"10"` | STRING, not number |
| `429 quota exceeded` | task quota used up | top up in dashboard |
| `task_status: failed` with `safety/content` msg | content moderation tripped | rewrite prompt, watch for trademark / public figures |
| `task_status: failed` with `image_too_small` | I2V input image < 300px on shortest side | upscale before submitting |

---

## When to pick kling vs alternatives in your Trove

- **kling** (this module) → strongest in cinematic / aesthetic video (5-10s). Best when style coherence matters more than physical accuracy
- **minimax** → competing T2V/I2V. Different style bias (more anime / illustrative), different pricing
- **fal-ai** → marketplace of many video models (including open-source ones). Use when you want to A/B different video models without integrating each separately
- **rule of thumb**: known-good production pipeline → kling or minimax (battle-tested). Experimenting with newest models → fal-ai marketplace.
