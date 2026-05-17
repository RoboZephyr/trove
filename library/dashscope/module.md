---
name: dashscope
version: 0.1.0
category: media-generation
description: Alibaba Cloud Bailian / DashScope — CosyVoice TTS (150+ Chinese voice presets + free voice cloning), Wanx image generation. WebSocket-based async API, character-billed. Native DashScope endpoint (Qwen LLM is handled separately by the `qwen` module which uses the OpenAI-compatible front)
homepage: https://bailian.console.aliyun.com/
tags: [tts, voice-cloning, image-gen, alibaba, cosyvoice, wanx, websocket-api]
applies_to:
  - "CosyVoice TTS: synthesize speech from text in Mandarin / English / Cantonese / Japanese / Korean — 150+ named voice presets, character-billed (~¥0.06 per 1k chars on v3-flash, ~¥0.2 on v3-plus)"
  - "CosyVoice voice cloning: clone a voice from a short audio sample, then TTS-charge-only for playback (cloning itself is free)"
  - "Wanx image generation: Alibaba's text-to-image model (Stable Diffusion-variant), async task pattern"
  - "Use when you need Chinese-native voice quality (CosyVoice outperforms western TTS on Mandarin) or when you're already on Alibaba Cloud and want one platform key"
trove_spec: "0.1"
lastmod: "2026-05-17"
last_verified: "2026-05-17 · WebSocket connection + task submit + auth + Bearer header contract verified end to end via official Python SDK (dashscope==1.25.18, model=cosyvoice-v3-flash, voice=longxing_v3). task_id issued; runtime then blocked by `Arrearage / Access denied, please make sure your account is in good standing` — billing gate hit before audio bytes returned. Same tier as kling: auth + contract OK, runtime needs account funding"

credentials:
  DASHSCOPE_API_KEY:
    type: password
    required: true
    help: "Get from https://bailian.console.aliyun.com/?apiKey=1 (Bailian 控制台 → 我的 API-KEY → 创建). Format: `sk-...`. Same physical key works for the qwen module (which calls the OpenAI-compatible chat endpoint); SPEC §0's flat-no-inheritance rule means you paste it twice — once as `QWEN_API_KEY`, once as `DASHSCOPE_API_KEY`."
---

# Alibaba DashScope (Bailian) Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Account funding gate** — the first call against a freshly-funded account works; if your account goes to zero balance / arrears, all calls fail with `error_code: "Arrearage"` and message `Access denied, please make sure your account is in good standing`. The auth + contract still validates (you DO get a `task_id`), then the WebSocket closes with the arrearage event. Top up at https://billing-cost.console.aliyun.com/ before integrating.
2. **CosyVoice is WebSocket-only, not a sync REST POST** — text submitted via `wss://dashscope.aliyuncs.com/api-ws/v1/inference`. The SDK abstracts this; **if you're writing raw fetch / curl, you cannot just POST a request and read audio bytes — you must speak the WebSocket protocol** (run-task event → audio-frame events → task-finished event). Older docs that show REST `/services/audio/tts` endpoints refer to **CosyVoice v1 batch**, which is deprecated for v2/v3.
3. **Region split: China vs International keys are not interchangeable** — China keys hit `dashscope.aliyuncs.com`; international keys hit `dashscope-intl.aliyuncs.com`. A China-issued key on the intl endpoint (or vice versa) returns `InvalidApiKey` with a misleading "key not found" message — the key is fine, the endpoint mismatches your account region.
4. **Auth header**: `Authorization: Bearer ${DASHSCOPE_API_KEY}`. Some old samples show `X-DashScope-API-Key:` — that's pre-2024 and no longer accepted on the v3 endpoints.
5. **Voice ID is model-version-locked** — `longxing_v3` only works on `cosyvoice-v3-*`; `longxiaochun` only works on `cosyvoice-v2`. Mixing returns a runtime "voice not supported by this model" error AFTER the task is submitted (not at validation). Always pair the suffix with the model version.
6. **Character billing counts EACH Chinese character as 1, but ALSO charges full-width punctuation** — `今天天气真好。` is 7 billable chars (6 hanzi + 1 fullwidth period). English: roughly 1 char per letter. Mixed CJK+English strings get billed the sum. **Cost meter is in `usage.input_tokens` returned at task-finished** (despite being TTS, the field name is `input_tokens` — Alibaba's naming).
7. **Voice cloning is free up to the per-voice quota; only synthesis charges** — record / submit the source audio once (free), receive a custom `voice_id`, then every TTS call using that voice is charged at the standard per-char rate. The catalogue of your cloned voices lives at https://bailian.console.aliyun.com/?tab=app#/voice-list
8. **`watermark` setting is account-wide, not per-call** — DashScope's audio watermark (silent metadata flag for AIGC compliance) is set in console, not the API. If you need watermark-free output for downstream re-mixing, toggle it off in the console BEFORE running the call.
9. **Wanx image gen is a separate model family with task-poll pattern** — `wanx-v1` etc. submit → task_id → GET `/api/v1/tasks/{task_id}` poll. Same DashScope auth, different endpoint shape. Not WebSocket-based.
10. **No `dashscope` Node SDK exists officially** — Python, Java, Android, iOS are official. For Node/Edge/Deno runtimes, raw WebSocket against `wss://dashscope.aliyuncs.com/api-ws/v1/inference` is the only path. See "Raw WebSocket" section below.

---

## Setup

```bash
# Trove pattern — pull the key on demand
DASHSCOPE_API_KEY=$(jq -r .DASHSCOPE_API_KEY ~/.trove/dashscope/credentials.json)
```

Install the SDK (Python is the smoothest path):

```bash
pip install 'dashscope>=1.25'
```

---

## Quickstart: CosyVoice TTS (Python SDK)

```python
import os
from dashscope.audio.tts_v2 import SpeechSynthesizer

# SDK reads DASHSCOPE_API_KEY from environment by default
synthesizer = SpeechSynthesizer(
    model="cosyvoice-v3-flash",       # or "cosyvoice-v3-plus" for highest quality
    voice="longxing_v3",              # see voice catalogue below
    format="mp3",                     # mp3 (default) / wav / pcm
    sample_rate=22050,                # 8000 / 16000 / 22050 / 24000 / 44100 / 48000
)

audio_bytes = synthesizer.call("欢迎使用 trove，本地优先的 AI agent 凭证管理器。")

with open("out.mp3", "wb") as f:
    f.write(audio_bytes)

# Usage info is on the synthesizer instance after the call
print(f"billed chars: {synthesizer.last_response.usage.input_tokens}")
```

`SpeechSynthesizer.call(text)` is synchronous from the caller's perspective — internally it opens a WebSocket, streams the text, collects audio frames, and returns the joined bytes when the `task-finished` event arrives. Wall-clock for ~50 chars: 1–2 seconds.

**On failure** (e.g. Arrearage), the SDK raises `WebSocketConnectionClosedException` and emits a stderr line like `websocket closed due to TaskFailed: {"header": {"error_code": "Arrearage", "error_message": "..."}}`. Wrap in try/except and parse the error.

---

## CosyVoice voice catalogue

DashScope ships 150+ named voice presets. Pick by **gender × age × style** rather than memorizing IDs. Full list: https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list

Representative IDs (all `cosyvoice-v3-*` compatible):

| voice_id | name | gender | notes |
|---|---|---|---|
| `longxing_v3` | 龙星 | F | warm, neighborly young-woman tone |
| `longanhuan` | 龙安欢 | F | upbeat, energetic young-woman tone |
| `longanzhi_v3` | 龙安智 | M | calm, mature mid-30s male |
| `longanyun_v3` | 龙安昀 | M | warm, gentle mid-30s male |
| `longfeifei_v3` | 龙菲菲 | F | sweet, slightly higher pitch |
| `longanwen_v3` | 龙安温 | F | elegant, mature female |
| `longanya_v3` | 龙安雅 | F | refined, formal female |

For non-Mandarin: append the language tag. Cantonese (`-yue`), English (`-en`), Japanese (`-ja`), Korean (`-ko`) variants exist for popular voices.

---

## Voice cloning

CosyVoice supports custom voice creation from a short audio sample. Upload once → receive a `voice_id` → use that ID in subsequent TTS calls.

```python
from dashscope.audio.tts_v2 import VoiceEnrollmentService

vs = VoiceEnrollmentService()

# Step 1: create a voice from a source audio file (15-60 seconds of clean speech recommended)
voice = vs.create_voice(
    target_model="cosyvoice-v3-flash",
    prefix="my-clone",                # prefix for the auto-generated voice_id
    url="https://your-public-bucket.example.com/source.wav",   # OR pass a local file
)
print(f"created voice_id: {voice.voice_id}")

# Step 2: use it in any subsequent SpeechSynthesizer call
synth = SpeechSynthesizer(model="cosyvoice-v3-flash", voice=voice.voice_id)
audio = synth.call("Now speaking in my cloned voice.")
```

**Cloning is free**; you pay per-char only on the resulting TTS calls. The cloned voice persists across sessions and is tied to your DashScope account.

**Source audio requirements**: 15–60 s of clean speech, single speaker, no background music, recommended 16/22.05/24/44.1 kHz WAV. Public URL (model server pulls) or local file (SDK uploads).

---

## Wanx image generation (task-poll pattern)

```python
from dashscope import ImageSynthesis

response = ImageSynthesis.call(
    model="wanx-v1",
    prompt="a snowy rooftop with a single red origami crane, golden hour, photorealistic",
    n=1,
    size="1024*1024",
)

# Synchronous from the caller's perspective; SDK polls the task internally
for result in response.output.results:
    print(result.url)         # presigned URL, 24h expiry
```

Wanx is **task-polled**, not WebSocket. Same DashScope auth + key.

---

## Raw WebSocket (no Python SDK available, e.g. Node / Deno / Edge)

For Node / Edge runtimes without an official SDK, hand-roll the WebSocket protocol against `wss://dashscope.aliyuncs.com/api-ws/v1/inference`.

The protocol is event-based — client sends a `run-task` event with the synthesizer config, server streams `task-started`, multiple `result-generated` events (each carrying an audio frame), and a final `task-finished` event with usage. On error a `task-failed` event with `error_code` / `error_message` (e.g. `Arrearage`) replaces `task-finished`.

```typescript
// Sketch — see https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api for the full event schema
const ws = new WebSocket("wss://dashscope.aliyuncs.com/api-ws/v1/inference", {
  headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
});

ws.onopen = () => {
  ws.send(JSON.stringify({
    header: { action: "run-task", task_id: crypto.randomUUID(), streaming: "duplex" },
    payload: {
      task_group: "audio", task: "tts", function: "SpeechSynthesizer",
      model: "cosyvoice-v3-flash",
      parameters: { voice: "longxing_v3", format: "mp3", sample_rate: 22050 },
      input: {},
    },
  }));
};

// Then send text via `continue-task` events; collect binary frames from `result-generated`
// until `task-finished` arrives. Errors arrive as `task-failed` with `header.error_code`.
```

Full event schema + a clean reference impl: https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api

---

## Cost estimation

| product | unit | price (approx, RMB) |
|---|---|---|
| CosyVoice v3-flash TTS | per 1k chars | ¥0.06 |
| CosyVoice v3-plus TTS | per 1k chars | ¥0.2 |
| CosyVoice voice cloning | per clone (one-time) | free |
| Wanx-v1 image gen | per 1024×1024 image | ~¥0.16 |

CJK chars count 1 per char (including full-width punctuation). English counts ~1 per letter. Prices accurate as of 2026-05; check https://help.aliyun.com/zh/model-studio/billing-for-model-services for current rates.

---

## Error reference

| symptom | cause | fix |
|---|---|---|
| `task-failed` with `error_code: Arrearage` | account balance ≤ 0 / has unpaid bill | top up at https://billing-cost.console.aliyun.com/ |
| `InvalidApiKey` or "key not found" on first call | China key on intl endpoint (or vice versa), OR key was regenerated and old one is invalidated | confirm key region matches `dashscope.aliyuncs.com` vs `dashscope-intl.aliyuncs.com` |
| `voice not supported by this model` after task submit | voice ID and model version don't match (e.g. `longxiaochun` on `cosyvoice-v3-*`) | use the `_v3` suffix variants for v3 models; check voice catalogue compatibility |
| `WebSocketConnectionClosedException: Connection is already closed` (Python SDK) | underlying task-failed event happened — actual reason is in the stderr `TaskFailed` JSON | parse the JSON to find the real `error_code` |
| Audio plays but with watermark "for AIGC compliance" | account-level watermark enabled in console | toggle off at Bailian 控制台 → 应用 → 输出设置 |
| TTS returns 0 bytes silently | input text is empty / only punctuation / only whitespace | validate text is non-empty before submitting |

---

## When to pick dashscope vs other Trove modules

- **dashscope (this module)** → Chinese-native voice quality is the killer reason. CosyVoice presets + cloning are best-in-class for Mandarin/Cantonese; English voices are good but not better than ElevenLabs.
- **qwen** → for Qwen LLM calls. Same physical DashScope key, different endpoint (OpenAI-compatible front instead of native DashScope), different module.
- **seedance / seedream** → Volcengine-side (different vendor, different platform). Use seedance for video, seedream for image when you want ByteDance's models specifically.
- **minimax / kling / fal-ai** → for video / image gen with non-Alibaba style biases.

Rule of thumb: if you need Mandarin TTS or want to clone a Chinese voice, dashscope is the answer. If you need LLM, use qwen.

---

## Source of truth (refresh when these change)

- Bailian (DashScope) docs index — https://help.aliyun.com/zh/model-studio/
- CosyVoice overview — https://help.aliyun.com/zh/model-studio/cosyvoice-large-model-for-speech-synthesis/
- CosyVoice WebSocket API reference — https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api
- CosyVoice voice catalogue (150+ presets) — https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list
- Wanx image gen — https://help.aliyun.com/zh/model-studio/text-to-image
- Pricing — https://help.aliyun.com/zh/model-studio/billing-for-model-services
- API Key console — https://bailian.console.aliyun.com/?apiKey=1
- Billing top-up — https://billing-cost.console.aliyun.com/
- Cross-references: `library/qwen/module.md` for Qwen LLM via the OpenAI-compat front

Last upstream-docs sync: see `lastmod` in frontmatter. Last live-API verification: see `last_verified`.
