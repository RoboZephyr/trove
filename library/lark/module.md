---
name: lark
version: 0.2.0
category: messaging
description: Lark / 飞书 — operate IM, Docs, Bitable, Wiki, Drive, Approval via `lark-cli` (NOT MCP). Tenant-app authentication.
homepage: https://github.com/larksuite/cli
tags: [im, docs, bitable, wiki, lark, feishu, cli]
applies_to:
  - sending messages to users / groups (text, post, interactive cards)
  - creating / reading / editing Docs (docx)
  - querying / mutating Bitable (multi-dimensional spreadsheet)
  - searching Wiki spaces and nodes
  - granting Drive permissions on docs/sheets/files
  - resolving user identities (email / mobile → open_id)
  - any task on Lark OpenAPI
trove_spec: "0.1"
last_verified: "2026-05-12 · tenant_access_token issued (7200s lifetime) via Lark Open API"

credentials:
  LARK_APP_ID:
    type: text
    required: true
    help: "https://open.feishu.cn/app → 你的应用 → 凭证与基础信息 → App ID (cli_xxx 前缀)"
  LARK_APP_SECRET:
    type: password
    required: true
    help: "同页 App Secret，绝不入命令行 args（旧 lark-mcp 把它放在 --args 里是反模式）"
  LARK_DOMAIN:
    type: select
    options: [feishu, lark]
    default: feishu
    help: "国内版 feishu / 国际版 lark。和 app 类型必须配套，混用 401"
---

# Lark / 飞书 OpenAPI 使用指南（via lark-cli）

**重要**：本 module **不用 MCP**（不要安装 `@larksuiteoapi/lark-mcp`）。Lark 官方 CLI `@larksuite/cli`（命令名 `lark-cli`）能力更强：通用 `api` 命令 + 高阶子命令 + 自动 pagination + jq 过滤 + dry-run + 多 profile。

## ⚠️ Critical Constraints（先看这一节）

1. **`bot` 身份 vs `user` 身份是两套权限模型**
   - `bot`（=tenant_access_token，应用身份）：默认，所有自动化任务走这个；通过 Step 2 配 app_id/secret 自动激活
   - `user`（=user_access_token，真人身份）：需要 `lark-cli auth login` OAuth 流程；仅当操作需要用户隐私（其私人 Drive 文件）才用
   - `--as bot|user|auto`（默认 `auto`，根据 API 是否要 user-only 自动选）
2. **Domain 必须和 App 类型配套**：国内 App → `feishu` / `open.feishu.cn`；国际 App → `lark` / `open.larksuite.com`。混用 `99991663 invalid app_id`
3. **App 默认无文档权限**：操作 docs/sheets/bitable 前要么在飞书 UI 共享给 app，要么用 `lark-cli drive permissions members add` 自助加
4. **`open_id` ≠ `user_id` ≠ `union_id`**：90% 的「user not found」是 id 类型传错。优先用 `open_id`（每个 app 一份，最常用）
5. **Bitable 三层结构**：`app_token`（一个多维表格文件）→ `table_id`（一张表）→ `record_id`（一行）。缺一返回 1254301
6. **批量操作走 batch endpoint**（≤ 500/req）：循环 `single create` 会快速撞 frequency limit `99991400`

---

## Setup（一次性，把 Trove 凭证桥接到 lark-cli config）

```bash
# 1. 装 lark-cli
npm install -g @larksuite/cli

# 2. 从 Trove 桥接凭证（secret 走 stdin 避免命令历史暴露）
APP_ID=$(jq -r .LARK_APP_ID ~/.trove/lark/credentials.json)
BRAND=$(jq -r .LARK_DOMAIN ~/.trove/lark/credentials.json)
jq -r .LARK_APP_SECRET ~/.trove/lark/credentials.json | \
  lark-cli config init --app-id "$APP_ID" --app-secret-stdin --brand "$BRAND"

# 3. 验证
lark-cli config show         # 应显示 appId + masked secret
lark-cli auth status         # 应显示 identity: bot (tenant_access_token 已可用)

# 4. 健康检查
lark-cli doctor              # 全面体检：config + auth + connectivity
```

**Trove → lark-cli 凭证轮换流程**：换 secret 时，更新 `~/.trove/lark/credentials.json`，再重跑 Step 2 即可——lark-cli 配置会被覆盖。

---

## Quick Wins（lark-cli 高阶命令）

### 发消息

```bash
# 发文本到群（chat-id 用 oc_xxx）
lark-cli im +messages-send --chat-id oc_xxx --text "部署完成 ✅"

# 发到用户（@somebody）
lark-cli im +messages-send --user-id ou_xxx --text "Hi"

# 发 Markdown / 富文本
lark-cli im +messages-send --chat-id oc_xxx --markdown "**告警**: [详情](https://...)"

# 发交互式卡片（用 https://open.feishu.cn/tool/cardbuilder 设计 → 导出 JSON）
lark-cli im +messages-send --chat-id oc_xxx --card-file ./card.json

# 用 idempotency key 防重复（重试场景必用）
lark-cli im +messages-send --chat-id oc_xxx --text "..." --uuid "deploy-2026-05-11-1"
```

### 列群 / 找群

```bash
lark-cli im chats list --params '{"page_size":50}' --page-all --jq '.data.items[] | {id: .chat_id, name}'

# 按名字模糊搜
lark-cli im +chat-search --query "工程团队" --jq '.data.items[] | {id, name}'
```

### 查消息

```bash
lark-cli im +chat-messages-list --chat-id oc_xxx --page-size 30 --jq '.data.items[] | {ts: .create_time, sender: .sender.id, text: .body.content}'
```

### Docs

```bash
# 创建新 doc
lark-cli docs +create-doc --title "会议纪要 2026-05-11" --jq .data.document_id

# 读纯文本
lark-cli docs +get-raw-content --document-id docXXX

# Markdown 导入
lark-cli docs +import-md --file ./report.md --title "Weekly Report"
```

### Bitable

```bash
# 列表格
lark-cli base apps list --jq '.data.items[] | {token: .app_token, name}'

# 列某 app 下的所有 table
lark-cli base apps tables list --app-token bascnXXX --jq '.data.items[] | {id: .table_id, name}'

# 复杂搜索 + 排序 + 分页
lark-cli base +records-search \
  --app-token bascnXXX --table-id tblXXX \
  --params '{"filter":{"conjunction":"and","conditions":[{"field_name":"状态","operator":"is","value":["进行中"]}]},"sort":[{"field_name":"创建时间","desc":true}],"page_size":50}' \
  --page-all --jq '.data.items[] | .fields'

# 批量创建
lark-cli base +records-batch-create --app-token bascnXXX --table-id tblXXX \
  --data '{"records":[{"fields":{"标题":"foo","状态":["进行中"]}},{"fields":{"标题":"bar","状态":["完成"]}}]}'
```

**Bitable 字段类型坑**：多选/单选/链接是数组，日期是 ms timestamp。

### Wiki 搜索

```bash
lark-cli api GET /open-apis/wiki/v1/nodes/search \
  --params '{"query":"部署文档","space_id":"wkXXX"}' \
  --jq '.data.items[] | {token: .obj_token, type: .obj_type, title}'
```

### 给 app 加文档权限

```bash
lark-cli drive permissions members add \
  --file-token docXXX --file-type docx \
  --data '{"member_type":"openid","member_id":"ou_app_xxx","perm":"edit"}'
```

### 用户身份解析

```bash
lark-cli contact +search-user --query "张三" --jq '.data.users[] | {open_id, name, email}'

# 反查（email → open_id）
lark-cli api POST /open-apis/contact/v3/users/batch_get_id \
  --params '{"user_id_type":"open_id"}' \
  --data '{"emails":["zhang@example.com"]}'
```

---

## 通用 API 调用（任何端点都能调）

```bash
# 知道 endpoint 但没高阶子命令时
lark-cli api <METHOD> <path> [--params <json>] [--data <json>] [--jq <expr>]

# 例：调用任意端点
lark-cli api GET  /open-apis/calendar/v4/calendars
lark-cli api POST /open-apis/im/v1/messages --params '{"receive_id_type":"chat_id"}' --data '{...}'
```

---

## Schema 自查（AI 友好）

```bash
# 查任何 method 的入参 / 出参 / 权限要求
lark-cli schema im.chats.list
lark-cli schema base.appTableRecord.search --format pretty
lark-cli schema --format pretty | grep messages    # 模糊找
```

写代码前先 `schema` 一遍，AI 不需要去查 docs 网站。

---

## 输出过滤 / 分页

```bash
# jq 过滤（每次调用都建议加 --jq 让输出可读）
... --jq '.data.items[] | {key fields}'

# 自动翻完所有页
... --page-all --page-limit 0      # 0 = 无限

# 输出格式
--format json | table | csv | ndjson | pretty

# 调试模式（看 request 不发）
--dry-run
```

---

## Pricing pitfalls

- **App frequency limit**：默认 ~100 req/min per app，超 `99991400`。批量操作走 batch、循环单调用要 throttle
- **Bitable 单 app 最多 5 万行**：跑数据/分析超 1 万行考虑迁库
- **企业版 vs 个人版 API 差异**：审批流自动化等部分功能仅企业版

---

## Error reference

| Code | Meaning | Fix |
|---|---|---|
| `99991663` | invalid app_id (或 domain 不配套) | 检查 brand 和 app 国内/国际匹配 |
| `99991664` | invalid app_secret | 重新跑 Setup Step 2 |
| `99991401` | invalid/expired token | `lark-cli auth status` 检查；通常 cli 自动 refresh |
| `1254102` | im content 格式错 | 用 lark-cli 高阶命令（`+messages-send`）避免 |
| `1254301` | bitable 参数缺失 | 检查 app_token / table_id 齐 |
| `1254400` | bitable 字段类型错 | 多选/链接是数组、日期是 ms |
| `99991400` | rate limit | throttle + dashboard 调 quota |
| `230001` | docx no permission | 给 app 文档权限（drive permissions） |
| `not configured` (lark-cli) | config 没初始化 | 跑 Setup Step 2 |

---

## 为什么不用 `@larksuiteoapi/lark-mcp`

- MCP 配置把 `--app-id <id> --app-secret <secret>` 写进 `~/.claude.json` 的 `args` 数组——**明文凭证入 config 文件，违反 Trove「credentials.json 独占 secret」原则**
- lark-cli 的 config init 把 secret 存到独立 config（`~/.lark-cli/config.json` 600 权限），且支持 stdin 输入避免命令历史
- lark-cli 的能力更强：generic api / schema introspection / 多 profile / jq / pagination / dry-run / multi-format output / doctor
- AI 调 CLI 子进程比走 MCP 协议更直观，错误信息直接可读
