---
name: seedream
version: 0.2.0
category: media-generation
description: Doubao Seedream 4.0 / 4.5 / 5.0 (incl. 5.0 lite) — Volcengine Ark image generation. Text-to-image, image-to-image, multi-image fusion (up to 14 refs), group output, streaming, web-search-augmented. Sync API, token-billed at exactly 1 token per 256 pixels, OpenAI-SDK-compatible
homepage: https://www.volcengine.com/docs/82379/1366799
tags: [image-gen, doubao, ark, openai-compatible, t2i, i2i, multi-image, group-gen, streaming]
applies_to:
  - "text-to-image generation at 2K / 3K / 4K resolution (or custom pixel sizes within per-model bounds)"
  - "single-image i2i: edit / restyle / recolor / change material / change subject of one reference image"
  - "multi-image fusion (up to 14 reference images): combine subject from image 1 with style from image 2, outfit swap, character + scene compositing"
  - "group image generation: generate 2 to N coordinated images in one call (comic panels, brand-system mocks, multi-scene storyboards)"
  - "streaming: receive each completed image immediately during group gen instead of waiting for the full batch"
  - "web-search-augmented generation (Seedream 5.0 lite only): the model can query the web before generating"
  - "building consistent-character pipelines that feed into Seedance video gen (Seedream-5.0-lite outputs are face-trust whitelisted for 30 days)"
trove_spec: "0.1"
lastmod: "2026-05-15"
last_verified: "2026-05-15 · E2E live across 7 calls — basic t2i (default 2K), 16:9 (2560×1440), i2i with `image:string`, i2i with `image:[urls]` multi-image array, `size:\"2K\"` shorthand, `output_format:\"png\"` (URL .png suffix confirmed), `sequential_image_generation:\"auto\"+max_images:2`, `response_format:\"b64_json\"`. Endpoint ID resolves to `doubao-seedream-5-0-260128` in response. Token formula `output_tokens = width × height / 256` verified to the byte. Wall-clock 13–34s per response"

credentials:
  ARK_API_KEY:
    type: password
    required: true
    help: "Get from https://console.volcengine.com/ark/region:ark+cn-beijing/apikey. SAME credential as the seedance module — if you've installed both, paste the same value into each."
---

# Doubao Seedream Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Account funding gate: balance ≥ ¥200 OR active resource package** — same gate as Seedance. First call returns `ModelNotOpen` from Ark, not a billing error. Top up at https://console.volcengine.com/ark, then activate the specific Seedream model (or create an Endpoint ID for it).
2. **Minimum total pixels depends on the model** — Seedream 5.0 lite / 4.5: `2560×1440 = 3,686,400` minimum. Seedream 4.0: `1280×720 = 921,600` minimum (much lower, useful for cheap iteration). All models cap at `4096×4096 = 16,777,216`. The error string `image size must be at least <N> pixels` returns the exact threshold for your model. **Width/height each must be > 14 px**; aspect ratio in `[1/16, 16]`.
3. **Token billing is exactly `width × height / 256`** — verified to the byte. 2048×2048 → 16,384 tokens; 2560×1440 → 14,400 tokens. **There is no per-image flat fee and no batch discount.** Bigger images cost proportionally more.
4. **Result image URL expires in 24 hours** — same TOS-presigned pattern (`X-Tos-Expires=86400`). Use `response_format: "b64_json"` to skip URL handling, or download eagerly and persist to your own storage.
5. **Output format varies by model**:
   - Seedream 5.0 lite: `output_format: "png"` OR `"jpeg"` (default `jpeg`)
   - Seedream 4.5 / 4.0: **jpeg only** — `output_format: "png"` is ignored or errors
6. **There is NO `n` parameter — use `sequential_image_generation` for multiple images** — the OpenAI-spec `n` field is silently accepted but always returns 1. To get N images in one call, pass `sequential_image_generation: "auto"` + `sequential_image_generation_options: {max_images: N}`. The model then decides how many to emit (up to `max_images`) — **`max_images` is an UPPER BOUND, not a guaranteed count**. Make the prompt explicit ("generate 4 panels of ...") to push toward N.
7. **Reference-image quota: input + output ≤ 15** — if you pass 14 reference images, you can ask for ≤ 1 output. The 14-ref cap is a hard input limit; the 15-total includes outputs.
8. **Sync API (with optional streaming)** — Seedream returns inline after 13–34s wall-clock; no polling. For group gen with `max_images > 1`, the response can take 60–120s — **set your HTTP client read timeout to ≥ 120s**. Or use `stream: true` to receive each image as it completes.
9. **Active models as of 2026-05** — `doubao-seedream-5-0-260128` (latest; also acts as `doubao-seedream-5-0-lite-260128` per the docs note "同时支持"), `doubao-seedream-4-5-251128`, `doubao-seedream-4-0-250828`, `doubao-seedream-3-0-t2i-250415` (Retiring). 3.0 had a `-t2i-` infix that 4.0+ dropped — newer models unified t2i + i2i + multi-image in one model.
10. **Rate limit: 500 images-per-minute per model** — generous for humans, tight for batch scripts. If you parallelize, back off on 429.
11. **OpenAI-SDK compatible — but with Volcengine extras** — point the OpenAI client at Ark's base URL. `model / prompt / size / response_format / seed` work as-is. Volcengine-specific fields (`watermark`, `image` for i2i, `sequential_image_generation*`, `stream`, `tools`, `output_format`, `optimize_prompt_options`) go in `extra_body={...}` when using the OpenAI SDK; the native Ark SDK accepts them as top-level params.
12. **`image` field accepts BOTH a string and an array** — single i2i: `"image": "https://..."`. Multi-image fusion (up to 14): `"image": ["url1", "url2", ...]`. The undocumented `image_url: {url:...}` shape (Seedance-style) is also accepted by Ark in our probe, but `image` is the official documented path — prefer it.
13. **Reference image upload limits** — formats: jpeg / png / webp / bmp / tiff / gif / heic / heif. Aspect `[1/16, 16]`. Each side > 14 px. Single file ≤ 30 MB. Total pixels per image ≤ `6000×6000 = 36 M`. Up to 14 reference images per call. URLs must be **publicly fetchable** (TOS public-read buckets recommended); base64 inline supported but kills request bandwidth.

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

Single endpoint serves text-to-image, i2i, multi-image fusion, group gen, streaming. cn-beijing is the only Ark region that ships Seedream today.

---

## Quickstart — text-to-image

```bash
curl -X POST https://ark.cn-beijing.volces.com/api/v3/images/generations \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "a single red apple on a wooden table, studio lighting, photorealistic",
    "size": "2K",
    "output_format": "png",
    "watermark": false
  }'
```

Response (sync, ~15–20s):

```json
{
  "model": "doubao-seedream-5-0-260128",
  "created": 1778823643,
  "data": [
    {"url": "https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/...png?X-Tos-Expires=86400&...", "size": "2048x2048"}
  ],
  "usage": {"generated_images": 1, "output_tokens": 16384, "total_tokens": 16384}
}
```

### Python / Ark SDK

```python
import os
from volcenginesdkarkruntime import Ark

client = Ark(base_url="https://ark.cn-beijing.volces.com/api/v3",
             api_key=os.environ["ARK_API_KEY"])

r = client.images.generate(
    model="doubao-seedream-5-0-260128",
    prompt="a single red apple on a wooden table",
    size="2K",                       # or e.g. "2048x2048"
    output_format="png",
    response_format="url",
    watermark=False,
)
print(r.data[0].url)
```

### Node / OpenAI SDK

```typescript
import OpenAI from "openai";
const ark = new OpenAI({
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: process.env.ARK_API_KEY,
});

// OpenAI-spec fields native; Volcengine extras via extra_body
const r = await ark.images.generate({
  model: "doubao-seedream-5-0-260128",
  prompt: "a single red apple on a wooden table",
  size: "2K",
  output_format: "png",
  response_format: "url",
  // @ts-ignore — extra_body is a Volcengine extension
  extra_body: { watermark: false },
});
console.log(r.data[0].url);
```

---

## Top-level request body fields

| field | values | applies to | meaning |
|---|---|---|---|
| `model` | model ID / endpoint ID | all | `doubao-seedream-5-0-260128` (recommended), or `ep-xxxx` |
| `prompt` | string ≤ 300 zh chars / 600 en words | all | Image description. Excess length scatters attention |
| `size` | `"1K"`/`"2K"`/`"3K"`/`"4K"` OR `"<W>x<H>"` | all | Shorthand = model picks pixel value; `WxH` = explicit. Must clear per-model min and stay ≤ 4096² |
| `response_format` | `"url"` / `"b64_json"` | all | URL is 24h TOS-presigned; b64_json returns inline base64 |
| `output_format` | `"png"` / `"jpeg"` | **5.0 lite only** | Defaults to `jpeg`. 4.5 / 4.0 are jpeg-only and ignore this |
| `seed` | int | all | Reproducibility seed (same prompt + same seed → similar, not identical) |
| `watermark` | bool | all | `false` to suppress the "AI 生成" mark; default in API is `false` per docs |
| `image` | string URL **OR** array `[url, ...]` | all | i2i input. String = single ref. Array = multi-image fusion (≤ 14). Public URL or base64 data URI |
| `sequential_image_generation` | `"auto"` / `"disabled"` | all | `"auto"` enables group output; default disabled |
| `sequential_image_generation_options.max_images` | int 1–15 | when `auto` | Upper bound (NOT guaranteed count). Subject to `input_images + max_images ≤ 15` |
| `stream` | bool | all | `true` streams events as each image completes — useful for group gen UX. Default `false` (one inline response) |
| `tools` | `[{"type": "web_search"}]` | **5.0 lite only** | Lets the model query the web before generating. Search count in `usage.tool_usage.web_search` |
| `optimize_prompt_options.mode` | `"standard"` / `"fast"` | **4.0 only** | Faster but lower-quality. 4.5 / 5.0 lite are standard-only |
| `n` | — | none | **Not supported.** Use `sequential_image_generation` for multiple |

---

## Use case recipes

### 1. Single-image i2i

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "change the apple to green, keep the wooden table and lighting unchanged",
  "image": "https://your-bucket.example.com/source.jpeg",
  "size": "2K",
  "output_format": "png",
  "watermark": false
}' ...
```

### 2. Multi-image fusion (clothing swap, character + scene, style transfer from N refs)

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "put the outfit from 图2 on the model from 图1",
  "image": [
    "https://your-bucket.example.com/model.jpeg",
    "https://your-bucket.example.com/outfit.jpeg"
  ],
  "size": "2K",
  "output_format": "png",
  "sequential_image_generation": "disabled",
  "watermark": false
}' ...
```

In the prompt, **reference images by "图N" position** (the doc convention) — `图1`, `图2`, etc. Numbering follows the order they appear in the `image` array. Don't use URLs or names in the prompt.

### 3. Group image generation — 文生组图 (text-only → N coordinated images)

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "generate 4 cinematic sci-fi storyboard panels: panel 1 astronaut repairing a ship outside a space station ...; panel 2 sudden meteor strike ...; panel 3 astronaut dodging ...; panel 4 wounded retreat to the ship",
  "size": "2K",
  "sequential_image_generation": "auto",
  "sequential_image_generation_options": {"max_images": 4},
  "output_format": "png",
  "watermark": false
}' ...
```

**Tip**: be explicit in the prompt about how many panels and what each contains. `max_images: 4` is a cap — if the prompt only describes 2 panels, you'll get 2 images.

### 4. Group image generation — 图生组图 (1 ref + text → N coordinated images)

Pair the same `sequential_image_generation` block with a single `image`:

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "using this logo as the brand mark, design 4 brand-system mocks: tote bag, cap, business card, lanyard. Green primary palette, playful flat style",
  "image": "https://your-bucket.example.com/logo.png",
  "size": "2K",
  "sequential_image_generation": "auto",
  "sequential_image_generation_options": {"max_images": 4},
  "output_format": "png",
  "watermark": false
}' ...
```

### 5. Group image generation — multi-ref → N coordinated images

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "generate 3 images of the girl from 图1 with the cow plush from 图2 riding a roller coaster, morning / noon / evening lighting",
  "image": [
    "https://your-bucket.example.com/girl.png",
    "https://your-bucket.example.com/plush.png"
  ],
  "size": "2K",
  "sequential_image_generation": "auto",
  "sequential_image_generation_options": {"max_images": 3},
  "output_format": "png",
  "watermark": false
}' ...
```

### 6. Streaming — receive each image as it completes

```python
stream = client.images.generate(
    model="doubao-seedream-5-0-260128",
    prompt="参考图1，生成 4 张人物分别戴墨镜 / 骑摩托 / 戴帽子 / 拿棒棒糖的图片",
    image="https://your-bucket.example.com/ref.png",
    size="2K",
    sequential_image_generation="auto",
    sequential_image_generation_options=SequentialImageGenerationOptions(max_images=4),
    output_format="png",
    response_format="url",
    stream=True,
    watermark=False,
)

for event in stream:
    if event is None: continue
    if event.type == "image_generation.partial_succeeded":
        print(f"got image: size={event.size}, url={event.url}")
    elif event.type == "image_generation.partial_failed":
        print(f"error: {event.error}")
    elif event.type == "image_generation.completed":
        print(f"all done: usage={event.usage}")
    elif event.type == "image_generation.partial_image":
        # streaming b64 partial frame
        pass
```

Event types: `image_generation.partial_succeeded` (one image done), `image_generation.partial_failed` (one image errored), `image_generation.completed` (whole stream finished — usage totals here), `image_generation.partial_image` (b64 partial when response_format=b64_json).

### 7. Web-search-augmented (5.0 lite only)

```bash
curl -d '{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "make a 5-day weather forecast infographic for Shanghai, flat illustrated style",
  "size": "2048x2048",
  "tools": [{"type": "web_search"}],
  "output_format": "png",
  "watermark": false
}' ...
```

Search count returns in `usage.tool_usage.web_search` (0 = model decided no search was needed). Increases latency; only available on Seedream 5.0 lite as of 2026-05.

### 8. Prompt optimization mode (4.0 only — fast vs standard)

```json
{
  "model": "doubao-seedream-4-0-250828",
  "prompt": "...",
  "optimize_prompt_options": {"mode": "fast"},
  ...
}
```

Faster generation at lower quality. Useful for iteration loops. Seedream 4.5 / 5.0 lite are standard-only — passing `mode: "fast"` to them either errors or is ignored.

---

## Recommended pixel values per model × ratio (from official tables)

| AR | 1K (4.0 only) | 2K | 3K (5.0 lite only) | 4K |
|---|---|---|---|---|
| 1:1 | 1024×1024 | 2048×2048 | 3072×3072 | 4096×4096 |
| 3:4 | 864×1152 | 1728×2304 | 2592×3456 | 3520×4704 |
| 4:3 | 1152×864 | 2304×1728 | 3456×2592 | 4704×3520 |
| 16:9 | 1312×736 | 2848×1600 | 4096×2304 | 5504×3040 |
| 9:16 | 736×1312 | 1600×2848 | 2304×4096 | 3040×5504 |
| 21:9 | 1568×672 | 3136×1344 | 4704×2016 | 6240×2656 |

Pass `size: "2K"` etc. and the model picks the ratio from prompt context, OR pass the exact `WxH` string from this table for full control. Both styles work; **don't mix** (one or the other per request).

---

## Picking between 5.0 (latest) / 4.5 / 4.0

| use case | pick |
|---|---|
| Default for new projects | `doubao-seedream-5-0-260128` |
| Need PNG output | `doubao-seedream-5-0-260128` (4.5 / 4.0 are jpeg-only) |
| Need web search | `doubao-seedream-5-0-260128` (5.0 lite exclusive) |
| Need 3K intermediate resolution | `doubao-seedream-5-0-260128` (4.5 / 4.0 skip 3K) |
| Cheap iteration with small images | `doubao-seedream-4-0-250828` (1K supported; min pixels 921,600) |
| Need fast mode (faster, lower quality) | `doubao-seedream-4-0-250828` (only model with `optimize_prompt_options.mode: "fast"`) |
| Stable production version pinning | `doubao-seedream-4-5-251128` (mid-tier, well-balanced) |
| Building Seedance face-trust chains | `doubao-seedream-5-0-260128` as `5-0-lite` — Seedance accepts its outputs as references for 30 days |

All 4.0+ models share the same core request schema — switching is mostly a model-ID swap with optional capability differences (PNG, web search, optimize mode).

---

## Cost estimation (token-per-pixel)

**`output_tokens = width × height / 256`**, verified empirically. **Per output image** — group gen with `max_images: 4` returns up to 4 images and bills each.

| size | total pixels | output tokens | relative |
|---|---|---|---|
| 1280×720 (4.0 min) | 921,600 | 3,600 | 0.22x |
| 1920×1920 (5.0 floor) | 3,686,400 | 14,400 | 0.88x |
| 2048×2048 (2K default) | 4,194,304 | 16,384 | 1.00x |
| 2560×1440 (2K 16:9) | 3,686,400 | 14,400 | 0.88x |
| 3072×3072 (3K 1:1) | 9,437,184 | 36,864 | 2.25x |
| 4096×4096 (4K 1:1) | 16,777,216 | 65,536 | 4.00x |

Group gen multiplies: `max_images: 4` at 2K each = up to 65,536 tokens. Check current per-token pricing at https://www.volcengine.com/docs/82379/1544106.

---

## Trove cross-module: Seedream → Seedance face chaining

Seedance 2.0 rejects real-person faces in reference images, but **whitelists faces generated by Seedream 5.0 lite within the last 30 days, same account, original file**. Pipeline:

1. **Seedream** generates the reference face (text-only is fine — describe the character)
2. **Persist the original file** to your own TOS bucket or local disk — do NOT re-encode, screen-grab, or convert through another tool (breaks the trust signal)
3. **Pass that public URL** as a `reference_image` in subsequent Seedance video calls
4. Combined with Seedance's `return_last_frame: true` you get character continuity across multi-clip Seedance pipelines without ever uploading a real-person photo

---

## Composite recipe: story book / comic generator

The Volcengine console ships a "story book" feature that combines Doubao text + Seedream image in two stages. To replicate locally:

1. **Stage 1 — text model**: call `doubao-seed-1.6` (chat completions API) with a system prompt that returns JSON of the form:
   ```json
   {
     "title": "...",
     "summary": "...",
     "scenes": ["scene 1 narration", "scene 2 narration", ...],
     "scenes_detail": ["图片1: composition + lighting + subject ...", "图片2: ...", ...]
   }
   ```
   Cap scenes at 5–10. See the official tutorial's system prompt (link in "Source of truth" below) for the full prompt template.

2. **Stage 2 — image model**: join `scenes_detail` array into one prompt string, append "create a cover image too; remove text from images", prepend any user-supplied style direction, then call Seedream with `sequential_image_generation: "auto"` and `max_images = len(scenes_detail) + 1`.

3. **Stage 3 — assembly**: pair each returned image with its scene narration text — that's your story book.

---

## Common pitfalls

| symptom | cause | fix |
|---|---|---|
| `400 InvalidParameter: image size must be at least <N> pixels` | requested size below per-model min | use `2K` shorthand, or any explicit `WxH` clearing the min for your model (3.7M for 5.0/4.5, 921,600 for 4.0) |
| `404 ModelNotOpen` | account hasn't activated this Seedream model | activate at https://console.volcengine.com/ark, or create an Endpoint ID |
| Asked `max_images: 4`, got 1 | prompt didn't explicitly request multiple panels | rewrite prompt with explicit "generate 4 ..." count + per-scene descriptions |
| 30s HTTP client timeout fires mid-gen | client default too short for group gen | bump read timeout to ≥ 120s, or use `stream: true` |
| `output_format: "png"` ignored on 4.5 / 4.0 | only 5.0 lite supports PNG output | switch to `doubao-seedream-5-0-260128` if PNG required |
| `n: 2` returns 1 image | `n` is not a Seedream field | use `sequential_image_generation: "auto"` + `max_images` |
| Image URL returns 403 after a few hours | TOS presigned URL expired (24h) | download eagerly, OR use `response_format: "b64_json"` |
| i2i result ignores input | source URL not publicly fetchable | confirm URL serves without auth (curl in a fresh shell, no cookies) |
| `tools: [{"type":"web_search"}]` errors on 4.5 / 4.0 | only 5.0 lite supports web search | switch to `doubao-seedream-5-0-260128` |
| `429` | hit 500 IPM rate limit | back off; parallel jobs need a rate limiter |
| Group gen returns 14 images max | `input_images + outputs ≤ 15` (the quota cap) | reduce input refs or reduce `max_images` |

---

## SDK upgrade reminder

If you're using the Ark Python SDK (`volcengine-python-sdk[ark]`) or Go SDK and seeing missing fields (`sequential_image_generation`, `optimize_prompt_options`, etc.), upgrade to the latest version. Volcengine adds new params to the API faster than SDKs catch up — pinning an old SDK locks you out of new features. The raw HTTP / OpenAI-SDK paths always work since they don't model the params.

---

## Source of truth (refresh when these change)

- Volcengine Ark Seedream tutorial (workflow + examples) — https://www.volcengine.com/docs/82379/1366799
- Image generation API reference — https://www.volcengine.com/docs/82379/1541523
- Live model list (account-scoped) — `GET https://ark.cn-beijing.volces.com/api/v3/models` with Bearer auth
- Volcengine Ark experience center (try the UI first) — https://www.volcengine.com/experience/ark?mode=vision
- API Key console — https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
- Model activation console — https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement
- Pricing — https://www.volcengine.com/docs/82379/1544106
- Prompt guide — https://www.volcengine.com/docs/82379/1829186
- Cross-references for Seedance face whitelisting — see `library/seedance/module.md`

Last upstream-docs sync: see `lastmod` in frontmatter. Last live-API verification: see `last_verified`.
