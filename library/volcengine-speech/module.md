---
name: volcengine-speech
version: 0.1.0
category: speech
description: Volcengine / ByteDance Seed-ASR 2.0 Standard — batch audio transcription with utterance and word-level timestamps. The diagnostic / QA companion to Seedance generated videos (verify the produced audio actually matches your target script) and to TTS pipelines (validate intelligibility before shipping)
homepage: https://www.volcengine.com/docs/6561/1631584
tags: [asr, speech-to-text, volcengine, seed-asr, subtitles, timestamps, qa]
applies_to:
  - "batch transcribing produced video / podcast / dialogue audio at utterance and word-level timestamp granularity"
  - "QA loop: ASR the produced audio, diff against your target script — catches Seedance / TTS pipelines that pronounced different words than the prompt"
  - "subtitle timing: get utterance timestamps for SRT generation; render with your target subtitle text (not the ASR transcription) if dialogue intent matters more than literal audio match"
  - "speaker turn segmentation via `enable_speaker_info`"
trove_spec: "0.1"
lastmod: "2026-05-25"
last_verified: "2026-05-22 · live submit + query cycle succeeded against `volc.seedasr.auc` resource on Seed-ASR 2.0 Standard endpoint, returned 4-utterance transcription with timestamps. Same account hit `45000030 requested resource not granted` for the legacy `volc.bigasr.auc` resource ID — dogfood-confirmed the resource-ID migration"

credentials:
  VOLC_SPEECH_APP_KEY:
    type: password
    required: true
    help: "App Key from https://console.volcengine.com/speech/app. Sent as `X-Api-App-Key` header. Independent of the AK/SK used by TOS — Speech console has its own credential namespace."
  VOLC_SPEECH_ACCESS_KEY:
    type: password
    required: true
    help: "Access Token from the same Speech console. Sent as `X-Api-Access-Key` header."
  VOLC_SPEECH_SECRET_KEY:
    type: password
    required: false
    help: "Optional Secret Key. Stored here for completeness; the header-auth Standard endpoint path does NOT use it. Required only for the signature-auth WebSocket realtime path (not covered by this module)."
  VOLC_SPEECH_RESOURCE_ID:
    type: text
    required: false
    default: "volc.seedasr.auc"
    help: "Seed-ASR 2.0 Standard resource ID. Older docs / examples reference `volc.bigasr.auc` — that resource returns `45000030 not granted` for accounts onboarded in 2026-05+ (dogfood-verified). Stick with the default."
---

# Volcengine Speech / Seed-ASR 2.0 Standard

## ⚠️ Critical Constraints (read before writing code)

1. **Use `volc.seedasr.auc` for Seed-ASR 2.0 Standard. NOT `volc.bigasr.auc`** — the legacy resource ID returns `45000030 requested resource not granted` on accounts onboarded in 2026-05 or later, while `volc.seedasr.auc` succeeds with the same App Key on the same endpoint. Dogfood-verified 2026-05-22. Old AI-generated code and stale tutorials still suggest the `bigasr` form; ignore them.
2. **Header auth is separate from ARK / TOS credentials** — Speech console has its own App Key + Access Token namespace. **Do not reuse `~/.trove/seedance` (ARK_API_KEY) or `~/.trove/volcengine-tos` (AK/SK)** — they will not authenticate against the speech endpoint. Create dedicated App Key + Access Token at https://console.volcengine.com/speech/app.
3. **ASR is diagnostic, not authoritative** — when ASR output differs from your target subtitle text, that means **the audio diverged from your script**, NOT that ASR was wrong. Common causes: (a) Seedance pronounced different words than the prompt, (b) the audio file is partial/old / re-generated content, (c) TTS substituted a homophone. **Never silently overwrite target subtitles with ASR text** — surface the mismatch for review.
4. **Audio URL must be publicly fetchable** — the model server pulls the audio from the URL you submit. Same constraint family as Seedance reference images. The canonical Trove pattern: upload mp3 / wav to TOS public-read (`library/volcengine-tos/module.md`), then submit the resulting `https://<bucket>.tos-<region>.volces.com/<key>` URL.
5. **Two-step async pattern**: `POST /submit` returns a request ID instantly → `POST /query` polls until the task is done. Both calls use the SAME `X-Api-Request-Id` header to correlate. Typical wall-clock: 5–30 seconds depending on audio length.
6. **Audio limits** — supported formats: mp3 / wav / m4a / ogg / flac / pcm / opus. Max duration: 8 hours per file (Standard tier). Sample rate auto-detected. Mono recommended; stereo is auto-mixed-down before ASR.
7. **`show_utterances: true` is what unlocks timestamps** — without it, you only get a flat transcription string with no timing info. For subtitle production or QA-vs-target-text diffing, set this to `true`. Costs no extra credits.
8. **Speaker info is approximate** — `enable_speaker_info: true` returns `speaker_id` per utterance based on voice fingerprinting. Reliable for distinct voices (m/f / age gap); flaky for similar voices speaking quickly back-and-forth. Don't rely on it for legally-binding speaker attribution.
9. **Pricing is per audio minute, not per request** — Standard tier is priced at the per-minute audio rate (current rates at https://www.volcengine.com/pricing). A 5-second audio costs ~5/60 minute units. Multiple submissions of the same audio bill multiple times — cache results in your DB.
10. **`enable_itn: true` normalizes numbers and dates** — without ITN ("Inverse Text Normalization"), the transcription stays verbatim with spelled-out digits ("两千零二十六年"); with ITN you get `2026年`. For subtitle rendering you usually want ITN on; for raw QA-against-prompt you might want it off (to match the prompt's actual phrasing).

---

## Setup

```bash
# Trove pattern — pull credentials on demand
VOLC_SPEECH_APP_KEY=$(jq -r .VOLC_SPEECH_APP_KEY ~/.trove/volcengine-speech/credentials.json)
VOLC_SPEECH_ACCESS_KEY=$(jq -r .VOLC_SPEECH_ACCESS_KEY ~/.trove/volcengine-speech/credentials.json)
```

No SDK required — direct REST is the cleanest path (only 2 endpoints, no streaming).

---

## API surface

| operation | method | path |
|---|---|---|
| Submit transcription task | `POST` | `https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit` |
| Query task result | `POST` | `https://openspeech.bytedance.com/api/v3/auc/bigmodel/query` |

Both endpoints take the same auth headers:

```http
X-Api-App-Key: <VOLC_SPEECH_APP_KEY>
X-Api-Access-Key: <VOLC_SPEECH_ACCESS_KEY>
X-Api-Resource-Id: volc.seedasr.auc
X-Api-Request-Id: <uuid>            # SAME id for the submit/query pair
Content-Type: application/json
```

---

## Quickstart: submit + poll (Python, no SDK)

```python
import os, time, uuid, requests

APP_KEY = os.environ["VOLC_SPEECH_APP_KEY"]
ACCESS_KEY = os.environ["VOLC_SPEECH_ACCESS_KEY"]
RESOURCE_ID = "volc.seedasr.auc"

def headers(request_id: str) -> dict:
    return {
        "X-Api-App-Key": APP_KEY,
        "X-Api-Access-Key": ACCESS_KEY,
        "X-Api-Resource-Id": RESOURCE_ID,
        "X-Api-Request-Id": request_id,
        "Content-Type": "application/json",
    }

def transcribe(audio_url: str, audio_format: str = "mp3") -> dict:
    request_id = str(uuid.uuid4())

    # 1. Submit
    submit_body = {
        "user": {"uid": "trove-user"},
        "audio": {"format": audio_format, "url": audio_url},
        "request": {
            "model_name": "bigmodel",
            "model_version": "400",
            "enable_itn": True,
            "enable_punc": True,
            "show_utterances": True,
            "enable_speaker_info": True,
        },
    }
    r = requests.post(
        "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit",
        headers=headers(request_id),
        json=submit_body,
        timeout=10,
    )
    r.raise_for_status()

    # 2. Poll
    while True:
        q = requests.post(
            "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query",
            headers=headers(request_id),     # SAME request_id
            json={},
            timeout=10,
        )
        q.raise_for_status()
        body = q.json()
        status_code = body.get("status_code")
        if status_code == 20000000:           # complete
            return body
        if status_code in (20000001, 20000002):  # still running / queued
            time.sleep(2)
            continue
        raise RuntimeError(f"ASR failed: {status_code} {body.get('message')}")

# Use it
result = transcribe("https://yourbucket.tos-cn-beijing.volces.com/audio.mp3")
print(result["result"]["text"])              # full transcription
for utt in result["result"]["utterances"]:
    print(f"[{utt['start_time']}-{utt['end_time']}ms] (speaker {utt.get('speaker_id', '?')}) {utt['text']}")
```

---

## Cross-module recipe: ASR-verify a Seedance / CosyVoice produced clip

The canonical Trove pipeline — generate a video with Seedance (with synced audio per Critical Constraint #9 of seedance module) OR a voice clip with CosyVoice (dashscope module), upload to TOS public-read, then ASR-verify the audio matches the target script:

```python
# 1. Generate the audio (Seedance with audio-on, OR CosyVoice TTS direct)
#    ... (see library/seedance/module.md or library/dashscope/module.md)
#    → final mp3/wav bytes in `audio_bytes`

# 2. Upload to TOS public-read (see library/volcengine-tos/module.md)
import tos
tos_client = tos.TosClientV2(
    ak=os.environ["VOLC_ACCESS_KEY_ID"],
    sk=os.environ["VOLC_SECRET_ACCESS_KEY"],
    endpoint="tos-cn-beijing.volces.com",
    region="cn-beijing",
)
key = f"asr-input/{uuid.uuid4()}.mp3"
tos_client.put_object(
    bucket="yourbucket",
    key=key,
    content=audio_bytes,
    acl=tos.ACLType.ACL_Public_Read,
    content_type="audio/mpeg",
)
audio_url = f"https://yourbucket.tos-cn-beijing.volces.com/{key}"

# 3. ASR + diff against target text
asr_result = transcribe(audio_url, "mp3")
asr_text = asr_result["result"]["text"]

if asr_text.replace(" ", "") != target_subtitle_text.replace(" ", ""):
    # Don't silently overwrite — surface for review (Critical Constraint #3)
    print("WARN: ASR text differs from target subtitle.")
    print(f"  ASR:    {asr_text}")
    print(f"  TARGET: {target_subtitle_text}")
    # Decide downstream: trust ASR (literal audio) OR trust target (script intent)
```

For subtitle rendering, use **ASR utterance timestamps + target subtitle text** unless your editorial process explicitly accepts whatever the audio actually said.

---

## Recommended status labels for QA workflows

When wiring this into a content pipeline, capture the ASR outcome as one of these states (the labels themselves are content-team convention, but the underlying signals are robust):

| label | meaning |
|---|---|
| `asr_ok_text_match` | ASR succeeded; transcription matches target subtitle within tolerance |
| `asr_ok_text_mismatch` | ASR succeeded; spoken words diverge from target subtitle text — needs editorial review |
| `video_incomplete_for_subtitle_check` | source audio/video is partial / old / re-rendered — full-script match rate is not meaningful |
| `asr_unreliable` | audio exists and should match, but ASR output is obviously garbled or missing likely speech (e.g. clear human speech transcribed as 3 random characters) |
| `asr_no_speech` | ASR succeeded but returned empty / very short — input audio is silent / music-only / non-speech |

---

## Error reference

| status_code / symptom | meaning | fix |
|---|---|---|
| `45000030` "requested resource not granted" | using `volc.bigasr.auc` on a 2026-05+ account | switch `X-Api-Resource-Id` to `volc.seedasr.auc` |
| `45000001` "invalid access key" | wrong App Key / Access Token, OR mixed up the two | reverify at https://console.volcengine.com/speech/app — App Key goes in `X-Api-App-Key`, Access Token in `X-Api-Access-Key` |
| `45000003` "audio url unreachable" | URL needs auth, OR returns non-2xx, OR has CORS / GET method block | curl it from outside your network; the TOS public-read URL pattern is the canonical fix |
| `45000010` "audio format unsupported" | uncommon container (e.g. webm-audio, .amr) | re-encode to mp3 / wav via ffmpeg before upload |
| `45000020` "audio too long" | > 8 hours total | split into segments and submit each |
| Long delay (>2 min) with status_code `20000002` | task queued behind others | normal under load; keep polling. If >5min, consider re-submitting with a fresh request_id |
| ASR returns 0 utterances on speech-containing audio | wrong sample rate / corrupted audio / language mismatch | confirm with `ffprobe`; Seed-ASR works best on Mandarin and English; for other languages check supported list at https://www.volcengine.com/docs/6561 |

---

## When to pick volcengine-speech vs alternatives

- **volcengine-speech (this module)** → Mandarin / Chinese-accent English. Strong on timestamps + speaker info. Best when you're already on Volcengine (same-region TOS pull = fast + free).
- **OpenAI Whisper API** — strong all-language coverage, well-known. Slower, no native speaker-info, USD-billed.
- **Deepgram / AssemblyAI** — English-first, real-time streaming surface, premium pricing.
- **Local Whisper (`whisper.cpp` / faster-whisper)** — free, offline, no API. Use when audio is sensitive or batch is huge.

Rule of thumb: Chinese audio + already on Volcengine → this module. English-only batch in a non-Volc stack → Whisper API or local.

---

## Source of truth (refresh when these change)

- Seed-ASR 2.0 Standard docs — https://www.volcengine.com/docs/6561/1631584
- Speech console (App Key + Access Token management) — https://console.volcengine.com/speech/app
- Resource ID catalogue — https://www.volcengine.com/docs/6561
- Pricing — https://www.volcengine.com/pricing
- Cross-modules: `library/volcengine-tos/module.md` for hosting audio, `library/seedance/module.md` for the video producer this ASR-verifies, `library/dashscope/module.md` for CosyVoice TTS

Last upstream-docs sync: see `lastmod`. Last live-API verification: see `last_verified`.
