---
name: cloudflare
version: 0.1.0
category: infra
description: Cloudflare API & Wrangler for Pages deploy, Workers/R2/KV, DNS, cache purge
homepage: https://developers.cloudflare.com/api/
tags: [hosting, cdn, dns, workers, pages, r2, kv]
applies_to:
  - deploying static sites to Cloudflare Pages
  - managing Workers / R2 buckets / KV namespaces
  - DNS record CRUD via API
  - cache purge after deploy
  - any task using `wrangler` CLI
trove_spec: "0.1"

credentials:
  CLOUDFLARE_API_TOKEN:
    type: password
    required: true
    help: "https://dash.cloudflare.com/profile/api-tokens 创建。Pages 部署需要 'Edit Cloudflare Workers' + 'Account Settings: Read'"
  CLOUDFLARE_ACCOUNT_ID:
    type: text
    required: false
    help: "几乎所有 API call 都要这个。dash 右侧 sidebar 复制；wrangler 不强制（会自动 list 让你选），但 API 调用必填"
  CLOUDFLARE_ZONE_ID:
    type: text
    required: false
    help: "DNS / cache purge 才需要。在 dash 域名概览页右侧复制"
---

# Cloudflare API & Wrangler 使用指南

## ⚠️ 关键约束（先看这一节再写代码）

1. **`CLOUDFLARE_API_TOKEN` ≠ 老式 Global API Key**——所有新代码都用 token。Token 是 scoped 的（带固定权限），换 endpoint 失败时第一反应是「token 有这权限吗」
2. **几乎所有 REST API 路径都带 `/accounts/{account_id}/...`**——单独有 token 不够，必须配套 `CLOUDFLARE_ACCOUNT_ID`
3. **DNS / cache purge 还要 `CLOUDFLARE_ZONE_ID`**（per-domain）
4. **wrangler 优先读 env**：`CLOUDFLARE_API_TOKEN` 在 env 里 → 直接用，无需 `wrangler login`
5. **API 返回结构**：成功 = `{ success: true, result: ... }`；错误 = `{ success: false, errors: [{ code, message }] }`。**永远先查 `success` 再用 `result`**
6. **Pages 部署最快路径**：`wrangler pages deploy <build-dir> --project-name <name>` 一行命令；不需要先 `pages project create` 也能 deploy（wrangler 会自动建）

---

## Pages 部署（静态站最常用）

```bash
# Wrangler CLI（推荐用法，自动读 CLOUDFLARE_API_TOKEN env）
npx wrangler pages deploy ./dist \
  --project-name my-site \
  --branch main \
  --commit-dirty=true

# 输出示例：
# ✨ Successfully published to https://abc123.my-site.pages.dev
```

**常见坑**：
- 第一次 deploy 会自动建 project，但默认绑定 `main` 分支——如果你本地不在 main，加 `--branch <name>` 显式指定
- Pages 单文件 ≤ 25 MB，单 deploy 总文件数 ≤ 20000；超了静默失败，没有提前校验
- Pages 自动启用 HTTPS，但自定义域名要去 dash 加（API 路径：`/accounts/{aid}/pages/projects/{name}/domains`）

### 直接 API（CI 场景，不用 wrangler）

```typescript
// 1. 上传构建产物到 Direct Upload session
const session = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    body: formData, // multipart with manifest + files
  }
).then(r => r.json());

if (!session.success) throw new Error(session.errors[0].message);
const deployment = session.result;
```

---

## DNS 记录 CRUD

```typescript
const ZONE = process.env.CLOUDFLARE_ZONE_ID;

// 列出所有记录
const list = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`,
  { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } },
).then(r => r.json());

// 创建 CNAME
const create = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_API_TOKEN}` },
    body: JSON.stringify({
      type: 'CNAME',
      name: 'classics',           // 子域名
      content: 'my-site.pages.dev',
      proxied: true,              // 走 CF 代理（橙云）
      ttl: 1,                     // 1 = auto
    }),
  },
).then(r => r.json());
```

**坑**：`name` 写「子域名」就行，CF 会自动拼 zone 域名。写完整域名也可以，重复不报错但容易调试糊涂。

---

## Cache Purge

```typescript
// 全域缓存清空（慎用，几分钟后才完全生效）
await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_API_TOKEN}` },
    body: JSON.stringify({ purge_everything: true }),
  },
);

// 按 URL 精准清（推荐，速度快、不抖）
await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_API_TOKEN}` },
    body: JSON.stringify({
      files: ['https://classics.example.com/styles.css', 'https://classics.example.com/index.html'],
    }),
  },
);
```

---

## R2（S3 兼容对象存储）

```bash
# Wrangler 创建 bucket
npx wrangler r2 bucket create my-audio-cache

# 上传文件
npx wrangler r2 object put my-audio-cache/audio/1.mp3 --file ./output.mp3

# 公开访问需在 dash 开 Public Bucket（API 也能开，路径 /accounts/{aid}/r2/buckets/{name}/usage）
```

R2 的 S3 兼容 endpoint：`https://{account_id}.r2.cloudflarestorage.com`，可用 AWS SDK 直连（需另建 R2-specific access key，跟 API token 不通用）。

---

## Workers KV（小键值缓存）

```bash
npx wrangler kv namespace create MY_KV
# 输出 namespace_id，写到 wrangler.toml 的 kv_namespaces
```

代码里：`env.MY_KV.put("key", "value")` / `env.MY_KV.get("key")`。**不适合大对象（>25MB）也不适合高写**——读优化场景。

---

## 错误调试速查

| 错误码 | 含义 | 解决 |
|---|---|---|
| 10000 | Authentication error | token 无效或没对应权限 scope |
| 9109 | Unauthorized to access requested resource | account_id 错了 / token 没这 account 的权限 |
| 7000 | No route for requested host | 路径里 zone_id 错了 |
| 81044 | Record name conflict | DNS 同名同类型记录已存在 |
| 7003 | Could not route to /xxx | API 路径打错（少 /accounts 段最常见）|

**Debug 第一步永远是**：把 response body 完整 print，CF 错误信息很详细。
