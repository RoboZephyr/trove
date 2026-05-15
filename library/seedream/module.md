---
name: seedream
version: 0.1.0
category: media-generation
description: Doubao Seedream 4.0 / 4.5 / 5.0 — Volcengine Ark text-to-image + image-to-image generation. Synchronous (~15-20s per image), token-billed at exactly 1 token per 256 pixels, OpenAI-SDK-compatible
homepage: https://www.volcengine.com/docs/82379
tags: [image-gen, doubao, ark, openai-compatible, t2i, i2i]
applies_to:
  - text-to-image generation at 2K resolution and up (smaller sizes rejected by min-pixel gate)
  - image-to-image rewrites (style transfer, recolor, scene edit, character preservation)
  - chaining with seedance video gen (Seedream 5.0 lite outputs are face-trust whitelisted for downstream Seedance reference, 30-day window)
  - drop-in replacement for OpenAI image-gen in projects that need cheaper / non-OpenAI hosting in cn-beijing
trove_spec: "0.1"
lastmod: "2026-05-15"
last_verified: "2026-05-15 · E2E live — 5 generations across t2i (default 2K, 16:9 at 2560×1440), i2i (both `image` and `image_url` request shapes), response_format `url` and `b64_json`. Endpoint ID resolves to `doubao-seedream-5-0-260128` in response. Token billing formula `tokens = width × height / 256` verified to the byte (2048×2048→16384, 2560×1440→14400). Image URL 24h presigned (`X-Tos-Expires=86400`), JPEG output. Wall-clock 13–21s per image"

credentials:
  ARK_API_KEY:
    type: password
    required: true
    help: "Get from https://console.volcengine.com/ark/region:ark+cn-beijing/apikey. SAME credential as the seedance module — if you've installed both, paste the same value into each."
---

# Doubao Seedream Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Account funding gate: balance ≥ ¥200 OR active resource package** — same gate as Seedance. The first call returns `ModelNotOpen` from Ark, not a billing error. Top up at https://console.volcengine.com/ark before integrating. Activating one Doubao model (or creating an Endpoint ID for it) is a separate console step on top of funding.
2. **Minimum total pixels is 3,686,400** — `size: "1024x1024"` is **rejected** with `image size must be at least 3686400 pixels`. The default `2048×2048` (4,194,304 pixels) just clears the bar. Any custom size works as long as `width × height >= 3686400` — so `2560×1440` (3,686,400 exactly — 16:9), `1920×1920` (3,686,400 — 1:1), `2880×1620` (4,665,600 — 16:9 higher) all valid.
3. **Token billing is exactly `width × height / 256`** — verified to the byte: 2048×2048 → 16384 tokens; 2560×1440 → 14400 tokens. Pay-by-pixel-area at a fixed rate. **Bigger images cost proportionally more** — there is no fixed per-image fee, no "first 1024² is free" discount. Calculate your bill before requesting 4K.
4. **`n` (multi-image per call) is silently ignored — always returns 1** — passing `n: 2` returns the same `{data: [{...}]}` with one image. To get 2 images, make 2 calls (each billed individually). The OpenAI-spec `n` field is accepted by the schema parser but the model only emits one image.
5. **Result image URL expires in 24 hours** — same TOS-signed pattern as Seedance video (`X-Tos-Expires=86400`). If you need durable storage, download immediately. The `b64_json` response format returns inline base64 (no expiry concern) at the cost of a larger response body.
6. **Output is always JPEG, never PNG** — the URL ends in `.jpeg`; `b64_json` content starts with `/9j/` (JPEG magic number). If you need PNG for transparency or lossless, re-encode locally after download — there is no `output_format` parameter.
7. **Sync API, not async** — Seedance returns a task_id and you poll. Seedream returns the image inline in one HTTP response after 13–21s wall-clock. No polling needed. Set your HTTP client's read timeout to **at least 60s** — default 30s timeouts in some HTTP libraries (older Node `fetch`, default `requests`) will cut off mid-generation.
8. **Model ID format**: `doubao-seedream-<major>-<minor>-<YYMMDD>` — e.g. `doubao-seedream-5-0-260128`, `doubao-seedream-4-5-251128`. An Endpoint ID (`ep-xxxx`) also works in the `model` field; the response normalizes back to the underlying model ID.
9. **Active versions as of 2026-05**: `doubao-seedream-3-0-t2i-250415` (Retiring), `doubao-seedream-4-0-250828`, `doubao-seedream-4-5-251128`, `doubao-seedream-5-0-260128` (latest, recommended default). 3.0's `-t2i-` infix was dropped from 4.0 onward (unified t2i + i2i in one model).
10. **OpenAI-SDK compatible — point the OpenAI client at the Ark base URL and the request shape works as-is** — `/api/v3/images/generations` accepts the OpenAI `{model, prompt, size, n, response_format, seed}` body. Volcengine-specific extras: `watermark: bool`, `image`/`image_url` field for i2i.

---

## Auth + endpoint

```bash
# Trove pattern — pull the key on demand, don't pre-export
ARK_API_KEY=$(jq -r .ARK_API_KEY ~/.trove/seedream/credentials.json)
```

```http
POST https://ark.cn-beijing.volces.com/api/v3/images/generations
Authorization: Bearer <ARK_API_KEY>
Content-Type: application/json
```

Single endpoint, no separate sub-paths for variations / edits — i2i is just adding an image field to the same body. cn-beijing is the only region that ships Seedream today.

---

## Quickstart — text-to-image, default 2K

```bash
ARK_API_KEY=$(jq -r .ARK_API_KEY ~/.trove/seedream/credentials.json)

curl -X POST https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "a single red apple on a wooden table, studio lighting, photorealistic"
  }'
```

Response (sync, ~15-20s wall-clock):

```json
{
  "model": "doubao-seedream-5-0-260128",
  "created": 1778823643,
  "data": [
    {
      "url": "https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0/...jpeg?X-Tos-Expires=86400&...",
      "size": "2048x2048"
    }
  ],
  "usage": {
    "generated_images": 1,
    "output_tokens": 16384,
    "total_tokens": 16384
  }
}
```

The `data[0].url` is a TOS-presigned URL valid for 24 hours. Download immediately if you need persistence.

### Node / OpenAI SDK

The Ark surface is OpenAI-SDK compatible — point the OpenAI client at Ark's base URL:

```typescript
import OpenAI from "openai";

const ark = new OpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.ARK_API_KEY,
});

const r = await ark.images.generate({
  model: "doubao-seedream-5-0-260128",
  prompt: "a single red apple on a wooden table",
  // size: "2048x2048",      // optional — default
  // response_format: "url", // default; pass "b64_json" for inline base64
});

console.log(r.data[0].url);
```

(Default Node `fetch` and OpenAI SDK both allow long timeouts, so 60s+ generations are fine without configuration.)

### Python / Ark SDK

```python
import os
from volcenginesdkarkruntime import Ark

client = Ark(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.environ["ARK_API_KEY"],
)

r = client.images.generate(
    model="doubao-seedream-5-0-260128",
    prompt="a single red apple on a wooden table",
)
print(r.data[0].url)
```

---

## Top-level request body fields

| field | values | default | meaning |
|---|---|---|---|
| `model` | model ID or endpoint ID | (required) | `doubao-seedream-5-0-260128` (recommended), or your `ep-xxxx` |
| `prompt` | string | (required) | The image description. Same language support as Seedance (zh/en + jp/id/es/pt on newer models) |
| `size` | `<W>x<H>` string | `"2048x2048"` | Custom dimensions. **Must satisfy `W × H ≥ 3,686,400`**. Common: `2048x2048` (1:1), `2560x1440` (16:9), `1920x1920` (1:1 floor), `2880x1620` (16:9 plus) |
| `response_format` | `"url"` / `"b64_json"` | `"url"` | URL is TOS-presigned 24h; b64_json returns inline base64 JPEG (no expiry, larger response) |
| `seed` | int | random | Reproducibility seed |
| `watermark` | bool | (model default) | When `false`, output has no Doubao watermark. When omitted, model default applies (Doubao mark on lower-right per most plans) |
| `image` OR `image_url` | string URL or `{url: string}` | none | Reference image for i2i. Either shape accepted (string OpenAI-style, or `{url:}` Seedance-style). See "Image-to-image" below |
| `n` | int | 1 | **Ignored** — Seedream always returns 1 image regardless of `n`. Loop your call if you need multiples |

---

## Image-to-image (i2i)

Pass a reference image alongside the prompt. Both shapes work — pick whichever your codebase already uses:

### OpenAI-style (string)

```bash
curl -X POST https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "change the apple to green, keep the wooden table",
    "image": "https://your-bucket.example.com/source.jpeg"
  }'
```

### Seedance-style (object)

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "change the apple to green",
  "image_url": {"url": "https://your-bucket.example.com/source.jpeg"}
}' ...
```

Both must point at a **publicly fetchable** URL — the model server pulls the source. TOS public-read buckets are recommended. Same face-moderation rules as Seedance: no real-person faces in input. Use the `asset://<asset-id>` scheme (from the Ark virtual portrait library / authorized real-person assets) when faces are required, OR use a Seedream-5.0-lite-generated face within 30 days as a whitelisted source.

---

## Picking between 4.0 / 4.5 / 5.0

| use case | pick |
|---|---|
| Default for new projects | `doubao-seedream-5-0-260128` |
| Production with stable cost benchmarks | `doubao-seedream-4-5-251128` (lock to one version) |
| Compatibility with older pipelines | `doubao-seedream-4-0-250828` |
| Cheaper iteration (lite variant) | `doubao-seedream-5-0-lite-*` if listed in `GET /api/v3/models` for your account (controls Seedance face-trust whitelisting too) |

All Seedream 4.0+ models share the same request schema — switching is purely a model-ID swap. 3.0 with the `-t2i-` infix is Retiring; not recommended for new code.

---

## Cost estimation (token-per-pixel formula)

**`output_tokens = width × height ÷ 256`**, verified empirically. So:

| size | total pixels | output tokens | relative cost |
|---|---|---|---|
| 1920×1920 (floor) | 3,686,400 | 14,400 | 0.88x baseline |
| 2048×2048 (default) | 4,194,304 | 16,384 | 1.00x baseline |
| 2560×1440 (16:9) | 3,686,400 | 14,400 | 0.88x baseline |
| 2880×1620 (16:9+) | 4,665,600 | 18,225 | 1.11x baseline |
| 4096×4096 | 16,777,216 | 65,536 | 4.00x baseline |

There is no per-image flat fee and no n-discount. Cost scales linearly with pixel area. Check current per-token pricing at https://www.volcengine.com/docs/82379/1544106.

---

## Trove cross-module pattern: Seedream → Seedance face chaining

Seedance 2.0 rejects real-person faces in reference images, but **whitelists faces generated by Seedream 5.0 lite within the last 30 days, same account, original file**. This lets you keep character continuity across multiple Seedance clips:

1. **Seedream call** — text-to-image of your character at a reference pose, model = `doubao-seedream-5-0-lite-*` (the variant whose outputs are whitelisted; check `/api/v3/models` for the exact ID your account sees)
2. **Persist the original file** to your own TOS bucket or local disk (re-encoding via screen-grab, format conversion, or a re-saved copy from a different tool breaks the trust signal)
3. **Pass that public URL** as a `reference_image` in subsequent Seedance calls

Combined with `return_last_frame: true` on the Seedance side (returns the tail PNG of each generated clip), this gives you "consistent character → multi-clip story" without ever uploading a real person's face.

---

## Common pitfalls

| symptom | cause | fix |
|---|---|---|
| `400 InvalidParameter: image size must be at least 3686400 pixels` | requested size too small | use `2048x2048` (default), or any custom `WxH` with `W×H ≥ 3,686,400` |
| `404 ModelNotOpen` | account hasn't activated this Seedream model | activate at https://console.volcengine.com/ark, or create an Endpoint ID for the model and pass that as `model` |
| 30s request timeout from your HTTP client | Seedream takes 13–21s; default 30s in some Node fetch / requests configs cuts in mid-generation | bump client read timeout to ≥ 60s |
| Got 1 image but asked for `n: 2` | `n` is silently ignored | loop the call N times instead |
| Image URL returns 403 after a few hours | TOS presigned URL expired (24h) | download eagerly, OR use `response_format: "b64_json"` to skip URL entirely |
| Output is JPEG, you need PNG | no `output_format` parameter — output is hard-coded JPEG | re-encode locally after download |
| i2i result looks like text-to-image (input ignored) | source URL not publicly fetchable | confirm URL works in incognito browser; if behind auth, host it on a public TOS / S3 bucket |

---

## Source of truth (refresh when these change)

- Volcengine Ark image generation overview — https://www.volcengine.com/docs/82379 (search "图像生成" / "Seedream")
- Models list (live, account-scoped) — `GET https://ark.cn-beijing.volces.com/api/v3/models` with Bearer auth
- API Key console — https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
- Model activation console — https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement
- Pricing — https://www.volcengine.com/docs/82379/1544106
- Seedance cross-references (i2i face-trust window) — see `library/seedance/module.md`

Last upstream-docs sync: see `lastmod` in frontmatter. Last live-API verification: see `last_verified`.
