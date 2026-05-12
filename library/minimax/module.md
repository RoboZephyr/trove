---
name: minimax
version: 0.1.0
category: llm-provider
description: MiniMax API for image / video / music / TTS / LLM chat
homepage: https://platform.minimax.io
tags: [llm, image-gen, video-gen, music-gen, tts]
applies_to:
  - generating images from text or character reference
  - generating videos from text or first frame
  - generating music with lyrics or instrumental
  - text-to-speech / voice cloning / voice mixing
  - LLM chat completion (Chinese-strong)
trove_spec: "0.1"
last_verified: "2026-05-12 · image-01 T2I real image URL returned"

credentials:
  MINIMAX_API_KEY:
    type: password
    required: true
    help: "https://platform.minimax.io/user-center 获取。注意：国内 key 和国际 key 不通用"
  MINIMAX_REGION:
    type: select
    options: [china, global]
    default: china
    help: "决定 base URL：china → api.minimaxi.com，global → api.minimax.io。和 key 必须配套，混用报 Invalid API key"
---

# MiniMax API 使用指南

## ⚠️ 关键约束（先看这一节再写代码）

1. **API key 和端点必须配套**
   - 国内 key → `https://api.minimaxi.com`
   - 国际 key → `https://api.minimax.io`
   - 混用报 `Invalid API key`，错误信息不会告诉你是 region 问题
2. **认证统一**：所有请求 `Authorization: Bearer ${MINIMAX_API_KEY}`
3. **`response_format: 'url'` 返回的链接 24 小时失效**——长期保存的产物必须立刻下载到本地或 S3
4. **video / music 生成是异步任务**：`create → poll → fetch file`，单步同步调用拿不到结果
5. **TTS 单次 ≤ 10000 字符**，超长文本必须分块或用 `stream: true`

---

## 文生图 (T2I)

Endpoint: `POST /v1/image_generation`
Docs: https://platform.minimax.io/docs/api-reference/image-generation-t2i

```typescript
const res = await fetch(`${BASE_URL}/v1/image_generation`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'image-01',
    prompt: '赛博朋克城市夜景，霓虹灯倒映在湿润的街道上',
    aspect_ratio: '16:9',     // 1:1 | 16:9 | 4:3 | 3:2 | 2:3 | 3:4 | 9:16 | 21:9
    n: 1,                     // 1~9 张
    response_format: 'url',   // 'url'(24h 有效) | 'base64'
    prompt_optimizer: true,
  }),
});

const data = await res.json();
const imageUrl = data.data.image_urls[0];
```

### 图生图 / 角色参考 (I2I)
加 `subject_reference: [{ type: 'character', image_file: '<url|base64>' }]`，其他参数同 T2I。

---

## 文生视频 (T2V) / 图生视频 (I2V)

Endpoint: `POST /v1/video_generation` （**异步**：create → poll → fetch）
Docs: https://platform.minimax.io/docs/api-reference/video-generation-t2v

```typescript
// 1. 创建任务
const create = await fetch(`${BASE_URL}/v1/video_generation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'MiniMax-Hailuo-2.3',
    // 可选 model: MiniMax-Hailuo-02 | T2V-01-Director | T2V-01
    // I2V 专用: MiniMax-Hailuo-2.3-Fast | I2V-01-Director | I2V-01-live | I2V-01
    prompt: '一个人捡起一本书 [Pedestal up]，然后开始阅读 [Static shot]',
    // 镜头指令（最多 3 个组合 [Pan left,Pedestal up]）：
    // [Truck left/right] [Pan left/right] [Push in] [Pull out]
    // [Pedestal up/down] [Tilt up/down] [Zoom in/out] [Shake] [Tracking shot] [Static shot]
    duration: 6,             // 6 | 10（10s 仅 768P）
    resolution: '1080P',     // 720P | 768P | 1080P
    prompt_optimizer: true,
    // I2V 加 first_frame_image: '<url|base64>'，<20MB，短边 >300px
  }),
});
const { task_id } = await create.json();

// 2. 轮询（建议 10s 间隔；6s 视频约 4-5 min，10s 约 8-9 min）
let status = '', file_id = '';
while (status !== 'Success' && status !== 'Fail') {
  await new Promise(r => setTimeout(r, 10_000));
  const q = await fetch(`${BASE_URL}/v1/query/video_generation?task_id=${task_id}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json());
  status = q.status;   // Preparing | Queueing | Processing | Success | Fail
  file_id = q.file_id;
}

// 3. 拿下载链接（也是 24h 有效）
const file = await fetch(`${BASE_URL}/v1/files/retrieve?file_id=${file_id}`,
  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json());
const videoUrl = file.file.download_url;
```

---

## 音乐生成

Endpoint: `POST /v1/music_generation`
Docs: https://platform.minimax.io/docs/api-reference/music-generation

```typescript
const res = await fetch(`${BASE_URL}/v1/music_generation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'music-2.6',          // music-2.6 | music-2.6-free
    prompt: '独立民谣, 忧伤, 适合雨夜独处',  // 风格/情绪，≤ 2000 字符
    lyrics: '[verse]\n窗外的雨滴\n敲打着回忆\n[chorus]\n我们走过的路\n再也回不去',
    // 歌词 10~3500 字符，标签：[verse] [chorus] [bridge] [intro] [outro] [interlude]
    output_format: 'url',        // 'url'(24h) | 'hex'
    audio_setting: {
      sample_rate: 44100,        // 16000 | 24000 | 32000 | 44100
      bitrate: 256000,           // 32000 | 64000 | 128000 | 256000
      format: 'mp3',             // mp3 | wav | pcm
    },
  }),
});
// data.data.audio | data.extra_info.music_duration (ms)
```

**变体**：
- 纯音乐：加 `is_instrumental: true`，去掉 lyrics
- 自动写词：加 `lyrics_optimizer: true`，去掉 lyrics
- 翻唱：`model: 'music-cover'`，加 `audio_url: '<6s~6min, <50MB>'`

---

## 语音合成 (TTS)

Endpoint: `POST /v1/t2a_v2`
Docs: https://platform.minimax.io/docs/api-reference/speech-t2a-http

```typescript
const res = await fetch(`${BASE_URL}/v1/t2a_v2`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'speech-2.8-hd',
    // 可选: speech-2.8-turbo | speech-2.6-hd | speech-2.6-turbo
    //       speech-02-hd | speech-02-turbo | speech-01-hd | speech-01-turbo
    text: '你好，欢迎使用 MiniMax 语音合成。',
    // ≤ 10000 字符；停顿标记 <#1.5#> (0.01-99.99 秒)
    // speech-2.8 支持语气词：(laughs) (coughs) (sighs) (gasps) (groans) (sniffs)
    stream: false,           // 长文本（>3000 字）建议 true
    output_format: 'url',
    voice_setting: {
      voice_id: 'Chinese_Female_Narrator',
      // 英文: English_Graceful_Lady | English_Insightful_Speaker | English_Persuasive_Man
      // 日文: Japanese_Whisper_Belle
      // 完整列表见 docs
      speed: 1.0,            // 0.5 ~ 2.0
      vol: 1.0,              // 0 ~ 10
      pitch: 0,              // -12 ~ 12
      emotion: 'calm',       // happy|sad|angry|fearful|disgusted|surprised|calm|fluent|whisper
    },
    audio_setting: {
      format: 'mp3',         // mp3 | pcm | flac | wav(仅非流式)
      sample_rate: 32000,
      bitrate: 128000,       // 仅 mp3
      channel: 1,            // 1 单声道 | 2 立体声
    },
  }),
});
// data.data.audio (hex) | data.extra_info.audio_length (ms) | data.extra_info.usage_characters
```

**进阶**：
- 流式（长文本）：`stream: true`，返回多 JSON，`status=1` 进行中、`status=2` 完成
- 音色混合：用 `timbre_weights: [{ voice_id, weight }, ...]` 替代 `voice_setting`，最多 4 个，weight 总和 100
- 音效：`voice_modify: { pitch, intensity, timbre, sound_effects: 'spacious_echo' | 'auditorium_echo' | 'lofi_telephone' | 'robotic' }`

---

## LLM 对话

Endpoint: `POST /v1/chat/completions`（OpenAI 兼容）

```typescript
const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: 'MiniMax-M2.7-highspeed',
    messages: [{ role: 'user', content: '你好' }],
  }),
});
```

中文场景下比 GPT 更稳，但英文/代码任务建议走其他 provider。

---

## 计费 / 限流陷阱

- **video 任务一旦 create 就计费**，即使后续 fail 也扣额度——`prompt_optimizer: true` 的优化结果不可控，长 prompt 不要直接 retry
- **music url/audio 24h 失效**，长期产物必须立即下载
- **TTS 字符按 `usage_characters` 计费**，包括停顿标签和语气词
- 高并发下大量 video task 会触发并发上限报错，需要客户端排队

---

## Base URL 推导（写脚本时必看）

```typescript
const BASE_URL = process.env.MINIMAX_REGION === 'global'
  ? 'https://api.minimax.io'
  : 'https://api.minimaxi.com';
```
