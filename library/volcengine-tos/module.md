---
name: volcengine-tos
version: 0.1.0
category: infra
description: Volcengine TOS (Tencent Object Storage) — S3-compatible object storage on the Volcengine platform. Sub-user AK/SK auth, public-read ACL for AI-gen reference URLs, native + S3 SDK paths. The canonical place to host images / audio / video that Seedance / Seedream / other Volcengine AI services reference
homepage: https://www.volcengine.com/docs/6349
tags: [object-storage, s3-compatible, volcengine, cdn-ready, infra]
applies_to:
  - "hosting reference images / audio / video for Seedance + Seedream API calls (both require publicly fetchable URLs; same Volcengine region = low-latency model server pull)"
  - "general-purpose object storage on Volcengine (static assets, backups, AIGC archive)"
  - "drop-in replacement for AWS S3 / Aliyun OSS when you're already on Volcengine and want one platform key"
  - "browser-direct uploads via signed PUT URLs (with CORS configured)"
trove_spec: "0.1"
lastmod: "2026-05-18"
last_verified: "2026-05-18 · E2E live — sub-user AK/SK auth via official `tos==2.9.0` Python SDK, list_buckets / create_bucket (public-read ACL) / put_object / public-URL GET / delete_object all succeeded. Public URL pattern `https://<bucket>.tos-cn-beijing.volces.com/<key>` returned uploaded bytes via HTTP 200 with correct content-type. Cross-module verified shape: same host pattern Seedance docs explicitly reference for their `image_url` field"

credentials:
  VOLC_ACCESS_KEY_ID:
    type: password
    required: true
    help: "Sub-user access key ID, AKLT... format. Get from https://console.volcengine.com/iam/keymanage. STRONGLY recommend creating a dedicated sub-user (not the root account) with the `TOSFullAccess` policy attached — see Critical Constraint #1."
  VOLC_SECRET_ACCESS_KEY:
    type: password
    required: true
    help: "Sub-user secret access key. Volcengine shows this ONCE at creation; save it then. Lost it? Regenerate the AK/SK pair (old pair will keep working until you explicitly delete it)."
  TOS_REGION:
    type: select
    options: [cn-beijing, cn-shanghai, cn-guangzhou, ap-southeast-1, ap-northeast-1]
    default: cn-beijing
    help: "Region your bucket lives in. Match to the region of the consuming service (e.g. Seedance + Seedream are cn-beijing → keep TOS bucket cn-beijing too for low-latency model server fetch)."
  TOS_BUCKET:
    type: text
    required: false
    help: "Your default bucket name. Globally unique within the region. Lowercase letters / digits / hyphens, 3-63 chars, can't start/end with hyphen. Once created, can't be renamed (only delete + recreate). Leave blank if you create per-task buckets via API."
  TOS_ENDPOINT:
    type: url
    required: false
    default: "tos-cn-beijing.volces.com"
    help: "Region-derived endpoint host (no scheme). Default matches `TOS_REGION: cn-beijing`. For other regions: `tos-<region>.volces.com`. Some setups prefer the public CDN endpoint `*.tos-<region>-cdn.volces.com` after attaching a CDN — see CDN integration section below."
---

# Volcengine TOS Usage Guide

## ⚠️ Critical Constraints (read before writing code)

1. **Use a sub-user, NOT the root account's AK/SK** — root credentials grant access to every Volcengine service (TOS, ARK, DNS, Pages, billing...). For Trove, create a sub-user at https://console.volcengine.com/iam/keymanage with **`TOSFullAccess`** policy attached (or a custom policy scoped to specific buckets for stricter least-privilege). Sub-user compromise = TOS-scoped damage; root compromise = whole-account meltdown.
2. **AK/SK is NOT the same credential as `ARK_API_KEY`** — Volcengine has two parallel auth systems. AI model APIs (ARK / Bailian-equivalent) use `Bearer <ARK_API_KEY>`. Object storage / infra APIs (TOS / VPC / DNS) use signature v4 with AK/SK. Don't try the ARK key against TOS — you'll get `InvalidSignature` with a misleading message.
3. **Bucket names are globally unique within a region and CANNOT be renamed** — choose carefully. Delete + recreate is the only way to "rename", and recreate is blocked for a cooldown window after delete (~12-24h). Naming convention recommendation: `<project>-<env>-<purpose>`, e.g. `myapp-prod-assets`.
4. **Default bucket ACL is private — set `public-read` explicitly if AI services need to pull** — Seedance / Seedream / other model servers cannot reach private objects. Either (a) set bucket ACL to `public-read` at create time, OR (b) set per-object ACL to `public-read` on each upload, OR (c) hand model servers presigned URLs. Per-object ACL is the right choice when most of the bucket is private but some objects need public reach.
5. **Region split matters for cross-service latency + traffic cost** — TOS in `cn-beijing` ↔ Seedance/Seedream in `cn-beijing` = same-region fetch (fast, free intra-region traffic). TOS in `ap-southeast-1` ↔ Seedance in `cn-beijing` = cross-region fetch (slow, billed egress). **Always co-locate TOS bucket with the consuming AI service's region.**
6. **Object key naming: avoid URL-reserved chars** — `?` `#` `%` in keys will URL-encode unpredictably across SDKs. Safe chars: `[a-zA-Z0-9._-/]`. Keys with `/` work as virtual folders (`avatars/user-123.jpg`). Max key length: 1024 chars; max value size per object: 5 GB per PUT (use multipart for >5 GB).
7. **TOS is S3-compatible — `aws-sdk-s3` works pointed at the TOS endpoint** — for codebases that already use `boto3` or `@aws-sdk/client-s3`, just override the endpoint URL. Caveat: signature region must be `cn-beijing` etc. exactly, not `us-east-1` (which some S3 SDKs default to for "S3-compatible" mode).
8. **No official Node SDK exists — use S3 SDK** — `tos-python-sdk` (Python), Java SDK are official. For Node / Edge / Deno / Go, the path is `@aws-sdk/client-s3` with custom endpoint, NOT a custom WebSocket / fetch wrapper. See the Node section below.
9. **CORS is per-bucket, not per-object** — if you plan to PUT from a browser via presigned URL, configure the bucket's CORS rule first. Without CORS, browser blocks the upload (CORS preflight fails); but server-side uploads (Python / Node SDK from your backend) never hit CORS.
10. **Public-read does NOT mean public-list** — `public-read` ACL lets anyone GET an object if they know the key. It does NOT let them list the bucket's contents (LIST is a separate `public-read-write` or explicit policy). Don't rely on key obscurity for security; if an object is sensitive, keep it private and use short-TTL presigned GET URLs.

---

## Setup

```bash
# Trove pattern — pull keys on demand
VOLC_ACCESS_KEY_ID=$(jq -r .VOLC_ACCESS_KEY_ID ~/.trove/volcengine-tos/credentials.json)
VOLC_SECRET_ACCESS_KEY=$(jq -r .VOLC_SECRET_ACCESS_KEY ~/.trove/volcengine-tos/credentials.json)
```

Install the official Python SDK (smoothest path):

```bash
pip install 'tos>=2.9'
```

---

## Quickstart: list / create / upload / get-url / delete (Python)

```python
import os, tos

client = tos.TosClientV2(
    ak=os.environ["VOLC_ACCESS_KEY_ID"],
    sk=os.environ["VOLC_SECRET_ACCESS_KEY"],
    endpoint="tos-cn-beijing.volces.com",
    region="cn-beijing",
)

# 1. List your buckets
buckets = client.list_buckets()
print(f"have {len(buckets.buckets)} buckets")

# 2. Create a new bucket with public-read ACL (so AI model servers can fetch)
client.create_bucket(bucket="myapp-assets", acl=tos.ACLType.ACL_Public_Read)

# 3. Upload an object (also public-read so individual URLs work)
content = b"hello trove"
client.put_object(
    bucket="myapp-assets",
    key="demo/hello.txt",
    content=content,
    acl=tos.ACLType.ACL_Public_Read,
)

# 4. Construct the public URL
url = f"https://myapp-assets.tos-cn-beijing.volces.com/demo/hello.txt"
# anyone can `curl $url` and get back the content

# 5. Delete the object when done (control storage cost)
client.delete_object(bucket="myapp-assets", key="demo/hello.txt")
```

**Public URL pattern**: `https://<bucket>.tos-<region>.volces.com/<key>`. No signed token needed when bucket / object ACL is `public-read`. Same host pattern Seedance / Seedream docs reference for their `image_url` / `video_url` / `audio_url` fields.

---

## Cross-module recipe — TOS as the bridge for Seedance / Seedream references

Both Seedance and Seedream require reference images / videos / audios at **publicly fetchable URLs** (model server pulls). TOS is the canonical place to host them. Full chain:

```python
# 1. Generate an image with Seedream (or pre-render a frame from elsewhere)
import os
from openai import OpenAI

ark = OpenAI(base_url="https://ark.cn-beijing.volces.com/api/v3",
             api_key=os.environ["ARK_API_KEY"])
r = ark.images.generate(
    model="doubao-seedream-5-0-260128",
    prompt="a red origami crane on a wooden desk, studio lighting",
    size="2K",
    response_format="b64_json",   # inline so we can upload immediately
    extra_body={"watermark": False},
)
import base64
image_bytes = base64.b64decode(r.data[0].b64_json)

# 2. Upload to TOS with public-read ACL
import tos
tos_client = tos.TosClientV2(
    ak=os.environ["VOLC_ACCESS_KEY_ID"],
    sk=os.environ["VOLC_SECRET_ACCESS_KEY"],
    endpoint="tos-cn-beijing.volces.com",
    region="cn-beijing",
)
key = "seedance-refs/crane-2026-05-18.jpeg"
tos_client.put_object(
    bucket="myapp-assets",
    key=key,
    content=image_bytes,
    acl=tos.ACLType.ACL_Public_Read,
    content_type="image/jpeg",
)
public_url = f"https://myapp-assets.tos-cn-beijing.volces.com/{key}"

# 3. Reference that public URL in a Seedance video gen call
import requests
seedance_resp = requests.post(
    "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    headers={"Authorization": f"Bearer {os.environ['ARK_API_KEY']}", "Content-Type": "application/json"},
    json={
        "model": "doubao-seedance-2-0-260128",
        "content": [
            {"type": "text", "text": "Camera slowly orbits around the crane, golden hour lighting"},
            {"type": "image_url", "image_url": {"url": public_url}, "role": "first_frame"},
        ],
        "ratio": "16:9",
        "duration": 5,
    },
)
task_id = seedance_resp.json()["id"]
# … then poll task_id per the seedance module
```

The killer property: **all three steps run on cn-beijing** → TOS upload + Seedance model server fetch is same-region, zero egress cost. Cross-region would be slower and metered.

---

## S3 SDK path (Node / Edge / Deno / Go / anywhere without an official tos SDK)

TOS implements the S3 API. Point the AWS S3 client at the TOS endpoint:

```typescript
import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "cn-beijing",                          // must match TOS region exactly
  endpoint: "https://tos-cn-beijing.volces.com", // include https://
  credentials: {
    accessKeyId: process.env.VOLC_ACCESS_KEY_ID!,
    secretAccessKey: process.env.VOLC_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,                         // TOS uses virtual-host style: <bucket>.tos-<region>.volces.com
});

await s3.send(new PutObjectCommand({
  Bucket: "myapp-assets",
  Key: "demo/hello.txt",
  Body: "hello trove",
  ContentType: "text/plain",
  ACL: "public-read",
}));

const publicUrl = `https://myapp-assets.tos-cn-beijing.volces.com/demo/hello.txt`;
```

Same shape works in Go (`aws-sdk-go-v2`), Rust (`aws-sdk-s3`), Java (`software.amazon.awssdk`).

---

## Presigned URLs (when you want time-limited access without making the object public)

```python
# Presigned GET — anyone with the URL can read for the next 3600 seconds, then 403
url = tos_client.pre_signed_url(
    http_method=tos.HttpMethodType.Http_Method_Get,
    bucket="myapp-assets",
    key="private/sensitive.pdf",
    expires=3600,
)

# Presigned PUT — same idea for upload from a browser
upload_url = tos_client.pre_signed_url(
    http_method=tos.HttpMethodType.Http_Method_Put,
    bucket="myapp-assets",
    key="user-uploads/avatar.jpg",
    expires=600,
)
# Hand `upload_url` to the browser; browser does fetch(uploadUrl, { method: 'PUT', body: file })
# Needs CORS configured on the bucket to allow browser-origin
```

Use presigned URLs when objects are sensitive but need short-lived sharing. For long-lived AI gen references that don't churn, `public-read` ACL is simpler.

---

## CORS (only needed for browser-direct uploads / downloads)

If your frontend will PUT directly to TOS (e.g. user avatar upload bypassing your backend), configure CORS:

```python
client.put_bucket_cors(
    bucket="myapp-assets",
    cors_rules=[tos.CORSRule(
        allowed_origins=["https://yourapp.example.com"],
        allowed_methods=["PUT", "GET", "POST"],
        allowed_headers=["*"],
        expose_headers=["ETag"],
        max_age_seconds=3000,
    )],
)
```

For server-side uploads (Python / Node from your backend), CORS is irrelevant — only browser-origin requests trigger preflight.

---

## CDN integration (optional, for high-traffic public assets)

Default `tos-<region>.volces.com` is the origin endpoint. For high-traffic public assets, attach a Volcengine CDN in front:

1. Console: TOS bucket → 域名管理 → 绑定 CDN
2. CDN returns a `*.volccdn.com` (or your custom domain) — point your CNAME there
3. The CDN endpoint then handles cache + edge distribution

For low-traffic dev / internal use, direct TOS endpoint works fine — no CDN needed.

---

## Cost (approximate, RMB, 2026-05)

| line item | unit | cn-beijing price |
|---|---|---|
| Storage | per GB-month | ¥0.12 |
| Outbound traffic (egress) | per GB | ¥0.50 |
| PUT/POST/DELETE requests | per 10k requests | ¥0.01 |
| GET/HEAD requests | per 10k requests | ¥0.01 |
| Intra-region traffic (TOS → Seedance same region) | free | — |

For AI gen workflows: image refs are tiny (~500 KB), even 1000 references = 500 MB ≈ ¥0.06/month storage. The big variable is egress IF you serve the public URLs externally. **Same-region serving (Seedance pulling) is free.**

Free tier: Volcengine TOS includes 50 GB storage + 10 GB egress per month for new accounts (check current at https://www.volcengine.com/pricing).

---

## Error reference

| symptom | cause | fix |
|---|---|---|
| `SignatureDoesNotMatch` | AK/SK wrong, OR region mismatch in signature, OR clock skew > 15min | confirm region in signature == TOS endpoint region; sync system clock |
| `NoSuchBucket` | bucket doesn't exist OR exists in a different region | check `client.list_buckets()`; confirm region matches |
| `BucketAlreadyExists` | bucket name globally taken in that region | pick a different name (try adding a unique suffix) |
| `AccessDenied` on PUT after bucket create | sub-user's policy doesn't grant PutObject | attach `TOSFullAccess` policy, or add `tos:PutObject` to a custom policy |
| `AccessDenied` on GET via public URL | bucket/object ACL is `private` | set ACL to `public-read` (per-object or per-bucket) |
| Browser PUT fails with CORS error | bucket has no CORS rule | `put_bucket_cors` with your origin in `allowed_origins` |
| Slow upload from outside China | China region with non-China client | use the `ap-southeast-1` region for international uploads, or attach CDN |
| Object served as `application/octet-stream` instead of expected type | no `content_type` passed at PUT | pass `content_type="image/jpeg"` (or appropriate) on the PUT call |

---

## When to pick TOS vs other Trove storage modules

- **volcengine-tos (this module)** → mandatory when serving references to Seedance / Seedream (same-region free egress). Good general choice for Volcengine-anchored stacks.
- Cloudflare R2 / AWS S3 — better when your stack is already on Cloudflare / AWS. AI services on Volcengine fetching from R2 / S3 = cross-cloud egress, billed and slow.
- Aliyun OSS — same logic as TOS but for DashScope-anchored stacks (Qwen / Wanx).

Rule of thumb: **host assets in the same cloud as the consuming service**. TOS for Volcengine AI services; OSS for Alibaba; R2 for Cloudflare Workers; S3 for AWS Lambda.

---

## Source of truth (refresh when these change)

- Volcengine TOS overview — https://www.volcengine.com/docs/6349
- TOS Python SDK — https://www.volcengine.com/docs/6349/92786
- TOS S3-compatibility notes — https://www.volcengine.com/docs/6349/79895
- IAM sub-user + AK/SK management — https://console.volcengine.com/iam/keymanage
- TOS console (bucket create / ACL / CORS) — https://console.volcengine.com/tos
- Pricing — https://www.volcengine.com/pricing?product=TOS
- Cross-module: `library/seedance/module.md` + `library/seedream/module.md` — both reference the `tos-<region>.volces.com` host pattern in their docs

Last upstream-docs sync: see `lastmod` in frontmatter. Last live-API verification: see `last_verified`.
