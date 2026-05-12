---
name: fal-ai
version: 0.1.0
category: llm-provider
description: fal.ai — serverless image / video / audio generation gateway (FLUX, SDXL, Kling, Runway, Pixverse, MiniMax, Stable Audio, etc.)
homepage: https://fal.ai/docs
tags: [image-gen, video-gen, audio, music, tts, lora]
applies_to:
  - text-to-image (FLUX.1, SDXL, Stable Diffusion 3, Imagen)
  - image-to-image / inpainting / upscaling / face restoration
  - text-to-video / image-to-video (Kling, Runway, Pixverse, MiniMax via fal)
  - LoRA training and inference (custom subjects/styles)
  - audio generation (Stable Audio, MusicGen)
  - speech (TTS, voice cloning, ElevenLabs/Cartesia via fal)
trove_spec: "0.1"

credentials:
  FAL_KEY:
    type: password
    required: true
    help: "https://fal.ai/dashboard/keys — formatted as <key_id>:<key_secret>"
---

# fal.ai Usage Guide

## ⚠️ Critical Constraints

1. **`FAL_KEY` format is `<key_id>:<key_secret>`** (colon-joined). The whole string is sent as `Authorization: Key <FAL_KEY>` (literal word "Key", not "Bearer"). Easy to copy just one half and silently fail
2. **Three execution modes — pick deliberately**:
   - **Sync** (`fal.subscribe`): blocks until result. Fine for FLUX-fast (~3s) but will timeout for video (60s+)
   - **Queue** (`fal.queue.submit` + poll): for long-running models. Returns request_id, you poll status
   - **Webhook**: queue mode with callback URL, server pings you when done. Best for video/training
3. **Model namespace structure**: `fal-ai/<model-family>/<variant>` e.g. `fal-ai/flux/dev`, `fal-ai/kling-video/v1.6/standard/text-to-video`. Variant matters: `/schnell` is 4-step fast, `/dev` is 28-step quality, `/pro` requires API tier
4. **Image URL inputs must be publicly accessible** — `localhost`, S3-private, signed URLs that expire fast all fail. Prefer fal's own storage (`fal.storage.upload`) or Cloudflare R2 public bucket
5. **Output URLs are temporary** — fal-served URLs are valid ~1-2 weeks then 404. Long-term storage = download immediately
6. **Per-second pricing for video**, per-image for image, per-step for some models — check model card before generating long content
7. **Queue requests count against concurrent request limit** even when polling — submitting 100 video tasks at once will queue 100 and throttle

---

## Setup

```typescript
import * as fal from '@fal-ai/serverless-client';

fal.config({
  credentials: process.env.FAL_KEY,    // "<id>:<secret>" format
});
```

---

## Image generation (sync mode, fast models)

```typescript
const result = await fal.subscribe('fal-ai/flux/schnell', {
  input: {
    prompt: 'A serene Chinese ink painting of a misty mountain at dawn',
    image_size: 'landscape_16_9',     // or {width, height}
    num_images: 1,
    enable_safety_checker: true,
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === 'IN_PROGRESS') console.log(update.logs.map(l => l.message));
  },
});

console.log(result.images[0].url);    // ← URL valid ~1-2 weeks, download to keep
```

### FLUX variants

| Model | Speed | Cost | Use |
|---|---|---|---|
| `fal-ai/flux/schnell` | ~3s | $ | drafts, prototyping |
| `fal-ai/flux/dev` | ~10s | $$ | balanced |
| `fal-ai/flux-pro/v1.1` | ~15s | $$$ | production |
| `fal-ai/flux-pro/v1.1-ultra` | ~20s | $$$$ | 4MP+ resolution |

---

## Video generation (queue mode)

Video takes 30s-5min — never use sync. Queue + poll or webhook.

```typescript
// Submit
const { request_id } = await fal.queue.submit('fal-ai/kling-video/v1.6/standard/text-to-video', {
  input: {
    prompt: '一个人在樱花树下抬头看落花 [Push in]',
    duration: '5',           // '5' or '10' (seconds, string)
    aspect_ratio: '16:9',
  },
});

// Poll status
let status = 'IN_QUEUE';
while (status !== 'COMPLETED' && status !== 'FAILED') {
  await new Promise(r => setTimeout(r, 5000));
  const s = await fal.queue.status('fal-ai/kling-video/v1.6/standard/text-to-video', {
    requestId: request_id,
    logs: true,
  });
  status = s.status;
}

// Get final result
const result = await fal.queue.result('fal-ai/kling-video/v1.6/standard/text-to-video', {
  requestId: request_id,
});
console.log(result.video.url);
```

### Webhook mode (preferred for production)

```typescript
await fal.queue.submit('fal-ai/kling-video/...', {
  input: {...},
  webhookUrl: 'https://yourapp.com/api/fal-callback',  // POST when done
});
// fal POSTs the result to your webhook with request_id; correlate to user/job
```

---

## Image to image / inpainting / upscaling

```typescript
// I2I
await fal.subscribe('fal-ai/flux/dev/image-to-image', {
  input: {
    image_url: 'https://example.com/source.jpg',
    prompt: 'in the style of cyberpunk',
    strength: 0.7,           // 0-1, higher = more changes
  },
});

// Upscale (4x)
await fal.subscribe('fal-ai/clarity-upscaler', {
  input: { image_url: '...' },
});

// Background removal
await fal.subscribe('fal-ai/imageutils/rembg', {
  input: { image_url: '...' },
});
```

---

## LoRA training (custom subjects/styles)

```typescript
// Training (queue mode, takes 15-30 min)
const { request_id } = await fal.queue.submit('fal-ai/flux-lora-fast-training', {
  input: {
    images_data_url: 'https://your-zip-of-15-images.com/data.zip',  // 5-25 images
    trigger_word: 'JOHN_DOE',                                        // unique token
    steps: 1000,
  },
});
// poll → result.diffusers_lora_file.url

// Inference with trained LoRA
await fal.subscribe('fal-ai/flux-lora', {
  input: {
    prompt: 'a portrait of JOHN_DOE in renaissance style',
    loras: [{ path: '<your trained lora url>', scale: 1.0 }],
  },
});
```

---

## Audio (music + TTS)

```typescript
// Music
await fal.subscribe('fal-ai/stable-audio', {
  input: {
    prompt: 'lofi hiphop beat with rain sounds, 2 min',
    seconds_total: 120,
  },
});

// TTS (ElevenLabs proxy)
await fal.subscribe('fal-ai/elevenlabs/tts', {
  input: {
    text: 'Hello world',
    voice: 'Rachel',
  },
});
```

---

## Storage helpers (avoid the public-URL gotcha)

```typescript
// Upload local file → get public fal URL
const url = await fal.storage.upload(fileBlob);
// Then use this URL as input to image_url / video_url etc.
```

Use this instead of trying to host inputs yourself.

---

## Pricing pitfalls

- **Per-second video pricing** — `5s @ $0.10/s` = $0.50/clip; FAILED jobs sometimes still bill (especially queue timeouts)
- **LoRA training** is one-time but ~$2-5 per training; iterating is expensive
- **Concurrent request limits** by tier (free: 1, paid: 5+) — bursty workloads need queueing on your side
- **Output storage is free** but URLs expire — your S3/R2 cost for keeping is on you
- **Unused credits don't roll over** between months on subscription tiers

---

## Error reference

| Status / message | Meaning | Fix |
|---|---|---|
| `401 Invalid credentials` | wrong KEY format (forgot `:secret` half) or revoked | re-issue at fal.ai/dashboard/keys |
| `402 Payment required` | out of credits | top up |
| `404 Model not found` | wrong model path (variant typo) | check fal.ai/models for exact path |
| `Image URL not accessible` | localhost / private bucket | use `fal.storage.upload` instead |
| `Validation error` | input field mismatch | check model's `Schema` tab on fal.ai docs page |
| Webhook timeout | your endpoint slow | fal retries 3x with backoff; ensure 200 within 30s |
| Queue stuck `IN_QUEUE` for 5min+ | provider capacity issue or wrong region | retry; rare, usually resolves |
