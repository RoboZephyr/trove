---
name: lark
version: 0.1.0
category: messaging
description: Lark / 飞书 — OpenAPI for IM, Docs, Bitable, Wiki, Drive, Approval. Tenant-app authentication.
homepage: https://open.larksuite.com/document/home/index
tags: [im, docs, bitable, wiki, mcp, productivity, lark, feishu]
applies_to:
  - sending messages to users / groups / chats (text, post, interactive cards)
  - creating / reading / editing Docs (docx)
  - querying / mutating Bitable (multi-dimensional spreadsheet) records
  - searching Wiki spaces and nodes
  - granting Drive permissions on docs/sheets/files
  - resolving user identities (email / mobile → open_id / user_id)
  - any task using lark-mcp tool calls
trove_spec: "0.1"

credentials:
  LARK_APP_ID:
    type: text
    required: true
    help: "https://open.feishu.cn/app → 你的应用 → 凭证与基础信息 → App ID (cli_xxx 前缀)"
  LARK_APP_SECRET:
    type: password
    required: true
    help: "同页 App Secret，绝不可入前端代码"
  LARK_DOMAIN:
    type: select
    options: [feishu, lark]
    default: feishu
    help: "国内版用 open.feishu.cn (feishu)；国际版用 open.larksuite.com (lark)。和 app 类型必须配套，混用 401"

mcp:
  command: npx
  args: ["-y", "@larksuiteoapi/lark-mcp"]
  env:
    APP_ID: ${credential.LARK_APP_ID}
    APP_SECRET: ${credential.LARK_APP_SECRET}
    DOMAIN: ${credential.LARK_DOMAIN}
---

# Lark / 飞书 OpenAPI 使用指南

## ⚠️ Critical Constraints（先看这一节）

1. **`tenant_access_token` vs `user_access_token` 是两套权限模型，搞混 401 / 99991663**
   - `tenant_access_token`（应用身份）：以「机器人 app」名义调，最常用，所有自动化任务都走这个
   - `user_access_token`（用户身份）：以「真人」名义调，需要 OAuth 授权流程；仅当用户隐私敏感操作（用其个人 Drive 文件）才需要
   - **本 module 默认 tenant_access_token 流程**
2. **Token 有过期时间**：tenant token 约 2h，user token 约 30min。**生产代码必须缓存 + 自动 refresh**（lark-mcp 自动处理，直调 API 要自己管）
3. **Domain 和 App 类型必须配套**：
   - 国内 App + `open.feishu.cn` ✓
   - 国际 App + `open.larksuite.com` ✓
   - 混用 → `99991663 invalid app_id` 或 401
4. **所有 docs/sheets/bitable 操作前必须授权**：app 创建后默认无任何文档权限。要么用 `drive.v1.permissionMember.create` 给 app 加权限，要么用户手动「文档 → 共享 → 添加成员」加 app
5. **`open_id` ≠ `user_id` ≠ `union_id`**：
   - `open_id`：每个 app 一份，**最常用**，跨 app 不能互认
   - `user_id`：企业内的稳定 id（需企业身份卡管理权限才能拿）
   - `union_id`：跨 app（同租户内）稳定 id
   - 当 API 报「user not found」90% 是传错 id 类型
6. **Bitable 三层结构**：`app_token`（一个多维表格文件） → `table_id`（一张表/sheet） → `record_id`（一行）。**API 调用必须三个齐备**，缺一返回 1254301
7. **批量操作建议走 batch endpoint**（`batchCreate` / `batchUpdate`）：单次 ≤ 500 条；循环单个 create 会很快撞 frequency limit

---

## 认证（拿 tenant_access_token）

```typescript
const BASE = process.env.LARK_DOMAIN === 'lark'
  ? 'https://open.larksuite.com'
  : 'https://open.feishu.cn';

const auth = await fetch(`${BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    app_id: process.env.LARK_APP_ID,
    app_secret: process.env.LARK_APP_SECRET,
  }),
}).then(r => r.json());

const TOKEN = auth.tenant_access_token;
// auth.expire 是剩余秒数（一般 7200）；缓存到接近过期再 refresh
```

后续所有调用都 `Authorization: Bearer ${TOKEN}`。

---

## IM：发消息

### 发文本到群（最常用）

```typescript
await fetch(`${BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({
    receive_id: 'oc_xxxxx',              // chat_id; user 则用 open_id + receive_id_type=open_id
    msg_type: 'text',
    content: JSON.stringify({ text: '部署完成 ✅' }),    // ← content 必须是 stringified JSON
  }),
});
```

**坑**：`content` 字段是 **stringified JSON**（一个被 `JSON.stringify` 过的字符串），不是嵌套对象。把对象直接传进去会 1254102。

### 发富文本 / @ 人 / 卡片

```typescript
// 富文本（post）
content: JSON.stringify({
  post: {
    zh_cn: {
      title: '今日报告',
      content: [[
        { tag: 'text', text: 'P0 告警：' },
        { tag: 'a', text: '查看详情', href: 'https://...' },
        { tag: 'at', user_id: 'ou_xxx' },     // @ 用户
      ]],
    },
  },
})

// 交互式卡片（推荐用于带按钮的通知）
msg_type: 'interactive',
content: JSON.stringify({ /* card schema; 用 https://open.feishu.cn/tool/cardbuilder 画 */ })
```

### 列表当前群

```typescript
const chats = await fetch(`${BASE}/open-apis/im/v1/chats?page_size=20`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then(r => r.json());
// chats.data.items: [{ chat_id, name, ... }]
```

---

## Docs (docx)

### 创建一个新文档

```typescript
const doc = await fetch(`${BASE}/open-apis/docx/v1/documents`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ title: '会议纪要 2026-05-11' }),
}).then(r => r.json());
// doc.data.document.document_id
```

### 读取文档内容（Markdown 风）

```typescript
const content = await fetch(
  `${BASE}/open-apis/docx/v1/documents/${docId}/raw_content`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
).then(r => r.json());
// content.data.content: plain text 版（不含格式）
```

### 用 Markdown 导入

```typescript
await fetch(`${BASE}/open-apis/docx/v1/documents/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({
    markdown: '# Title\n\nContent',
    folder_token: 'fldcnxxxxx',          // optional，否则进根目录
    title: 'My Doc',
  }),
});
```

**坑**：导入是异步任务，返回 `ticket`，要再 poll `task/get` 拿真实 doc_id。lark-mcp 的 `docx_builtin_import` 已封装这个流程。

---

## Bitable（多维表格）

```typescript
// 1. List apps（哪些多维表格文件）
await fetch(`${BASE}/open-apis/bitable/v1/apps`, { headers: { Authorization: `Bearer ${TOKEN}` } });

// 2. 在一个 app 里 list tables
await fetch(`${BASE}/open-apis/bitable/v1/apps/${appToken}/tables`, { headers: { Authorization: `Bearer ${TOKEN}` } });

// 3. 在一张表里搜记录（支持复杂 filter / sort）
await fetch(
  `${BASE}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      filter: {
        conjunction: 'and',
        conditions: [
          { field_name: '状态', operator: 'is', value: ['进行中'] },
        ],
      },
      sort: [{ field_name: '创建时间', desc: true }],
      page_size: 50,
    }),
  },
);

// 4. 批量创建记录
await fetch(
  `${BASE}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      records: [{ fields: { '标题': 'foo', '状态': '进行中' } }, /* ...up to 500 */],
    }),
  },
);
```

**Bitable 字段类型陷阱**：
- 多选/单选字段值是**字符串数组**，不是单字符串：`'状态': ['进行中']` ✓
- 链接字段是 record_id 数组：`'关联': ['recXXX']`
- 日期字段是 milliseconds timestamp（不是 ISO 字符串）

---

## Wiki 搜索

```typescript
await fetch(
  `${BASE}/open-apis/wiki/v1/nodes/search?query=部署文档&space_id=xxx`,
  { headers: { Authorization: `Bearer ${TOKEN}` } },
);
// 返回 list of node objects，每个 node 链接到一个 doc/sheet/bitable
```

---

## Drive 权限授权（app 操作文档前必做）

```typescript
// 给 app 自身加文档编辑权限
await fetch(
  `${BASE}/open-apis/drive/v1/permissions/${fileToken}/members?type=docx&need_notification=false`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      member_type: 'openid',
      member_id: 'ou_app_xxx',           // app 的 open_id
      perm: 'edit',                      // view | edit | full_access
    }),
  },
);
```

或直接在飞书 client 文档「共享」面板加 app 名字，更省事一次性。

---

## 用户身份解析

```typescript
// 通过 email 或 mobile 反查 open_id
await fetch(
  `${BASE}/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      emails: ['zhang@example.com'],
      mobiles: ['+86 13800138000'],
    }),
  },
);
```

---

## MCP server（已声明在 frontmatter）

```bash
# Module 已声明 mcp: 字段，AI agent merge 后即用：
# claude code 自动发现工具如：
#   mcp__lark-mcp__im_v1_message_create
#   mcp__lark-mcp__bitable_v1_appTableRecord_search
#   mcp__lark-mcp__docx_builtin_import
#   ... (~20 tools)
```

**优先级**：能用 MCP 就别手写 fetch 调用——MCP 已封装 token refresh、错误码翻译、批量分页。

---

## Pricing pitfalls

- **App 调用有 frequency limit**：默认 ~100 req/min per app，超了 `99991400 too many requests`。批量操作走 batch endpoint，别循环 single create
- **Bitable 单 app 最多 5 万行**——产品里跑数据/分析的，过 1 万行就要考虑迁数据库
- **不收费的限速比限额痛**：自动化跑批量任务务必 throttle + retry-with-backoff
- **企业版 vs 个人版 API 差异**：个人版部分 API（如审批流自动化）不开放

---

## Error reference

| Code | Meaning | Fix |
|---|---|---|
| `99991663` | invalid app_id (或 app_id 不在当前 domain) | 国内国际 domain 是否配套 |
| `99991664` | invalid app_secret | 重置 secret 后必须更新 trove |
| `99991401` | invalid access_token | token 过期，refresh |
| `1254102` | im content 格式错 | `content` 必须是 stringified JSON 不是对象 |
| `1254301` | bitable 参数缺失 | 检查 app_token / table_id 都齐 |
| `1254400` | bitable 字段类型错 | 多选/链接是数组、日期是 ms |
| `99991400` | rate limit | throttle + 看 dashboard 提升 quota |
| `230001` | docx not found / no permission | 给 app 文档权限（drive permissions API） |
