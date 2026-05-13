# Trove v0.1 Spec

**Status**: Draft (revised 2026-05-11, AI-native pivot)
**Goal**: 一个**只是格式规范 + Web UI**的本地资源中心。**AI 是 runtime**——读取、决策、配置都由 AI 完成，Trove 不做编译/注入/解析。

---

## 0. 核心原则

1. **AI 是 runtime**：所有资源的「使用」由 AI 在对话中决定。Trove 不写 inject/init 之类编译工具——AI 自己读 `~/.trove/`、自己拼 header、自己改 CLAUDE.md。
2. **格式规范 + Web UI = 全部**：除此之外都是 over-engineering。
3. **手工友好**：纯文本（YAML + Markdown + JSON），无任何工具也能编辑/读懂。
4. **零依赖启动**：v0.1 阶段不写 CLI 也能用——AI 直接读约定好的目录就行。
5. **AI 自助**：用 AI 帮 AI 准备资源——降低创建/维护 module 的门槛。
6. **渐进加密**：v0.1 凭证明文 + 600 权限，v0.2 接入 Keychain。

---

## 1. 目录结构

**只有一个层级：设备级 `~/.trove/`，所有项目共享。**

```
~/.trove/
├── config.json              # Trove 全局设置（Web UI 端口、AI Authoring 用哪个 LLM 等）
├── minimax/                 # 一个 module = 一个目录
│   ├── module.md            # 模板 + skill 内容（可 git）
│   └── credentials.json     # 凭证值（gitignored，v0.2 Keychain backend）
├── cloudflare/
│   ├── module.md
│   └── credentials.json
└── ...
```

**约定**：
- 目录名 = module 名（小写、连字符）
- 目录内**只有两个文件**：`module.md`（必需）+ `credentials.json`（如有凭证）
- 文件名是固定字面量
- 项目通过 CLAUDE.md / AGENTS.md 直接引用全局路径，**不**在项目里建 `.trove/` 子目录

**为什么没有项目级目录**：Trove 的核心价值是跨项目共享（一份 minimax key、N 个项目用）。引入项目级 override 反而稀释了这个价值，且增加心智负担。

### 多账号 / 多环境怎么办

**答：建多个独立命名的 module，不做 override 系统。**

举例：你有两个 Cloudflare 账号（个人 + 公司），就建：
```
~/.trove/cloudflare-personal/
~/.trove/cloudflare-business/
```
项目 A 的 CLAUDE.md 引用 `cloudflare-personal`，项目 B 引用 `cloudflare-business`。**显式、扁平、零歧义**——比 override 系统简单 10 倍，且 AI 看到名字就知道选哪个。

---

## 2. Module 文件格式

### 2.1 `module.md`

YAML frontmatter 定义元数据 + schema + 配置；正文是 skill。

```markdown
---
name: minimax
version: 0.1.0
category: llm-provider
description: MiniMax API for image/video/audio/T2A generation
homepage: https://platform.minimax.io
tags: [llm, image-gen, tts, video-gen]
applies_to: [image generation, video generation, TTS, voice cloning]
trove_spec: "0.1"

credentials:
  MINIMAX_API_KEY:
    type: password
    required: true
    help: "https://platform.minimax.io/user-center 获取"
  MINIMAX_REGION:
    type: select
    options: [china, global]
    default: china
    help: "国内 key 用 api.minimaxi.com，国际 key 用 api.minimax.io，混用报错"

mcp:                          # 可选；详见下文「mcp: 字段（两种 sub-schema）」
  type: stdio
  command: npx
  args: ["-y", "@minimax/mcp-server"]
  env:
    MINIMAX_API_KEY: ${credential.MINIMAX_API_KEY}
---

# MiniMax API 使用指南

## 关键约束（先看反例）
...

## 文生图
...

## 计费陷阱
...
```

**frontmatter 字段**：
- 必需：`name` / `version` / `trove_spec`
- 推荐：`category` / `description` / `applies_to` / `last_verified`
- 可选：`homepage` / `tags` / `credentials` / `mcp`

**字段类型**（用在 credentials 里）：`text` / `password` / `url` / `select` / `boolean` / `number` / `multiline`

**`last_verified` 字段**（release-quality gate）：

格式：`"YYYY-MM-DD · <method summary>"`，自由文本一行。**该字段就是 module 的发布质量门**——repo 的 `library/` 里出现的 module 必须在 README/Web UI 里被外人看见时是"维护者亲自跑通过"的，否则就是误导。

样例：
- `last_verified: "2026-05-12 · flux/schnell real image generated via fal-ai"`
- `last_verified: "2026-05-12 · JWT signed + contract OK; account out of credits — no live gen"`
- `last_verified: "pending — refresh token expired, awaiting OAuth re-auth"`
- `last_verified: "production · used daily by maintainer's downstream project"`

写法约定：
1. 凡是经过真实 API/MCP 调用并拿到合理响应 → 写日期 + 一行 method（"image gen E2E"、"oauth + GAQL read"）
2. 凡是因 billing/quota/scope 阻断但 auth+contract 已验证 → 写日期 + "contract OK / runtime blocked"
3. 凡是 credential 当前坏 / 没 key → 写 `pending — <reason>`
4. 凡是有持续生产证据但本会话未 smoke → 写 `production · <evidence>`

**字段不强制**（SPEC §2.1 `last_verified` 是推荐字段不是必需）；但 `trove validate` 会对缺失字段 emit warning，UI 在卡片上会显示「unverified」灰章。

---

**`mcp:` 字段（两种 sub-schema）**

实战形态有两种 MCP transport，`mcp.type` 必须显式声明其一。两种 schema 互斥——同一 module 一次只声一种 transport（多数 server 也只支持一种）。

**`type: stdio`** — 本地子进程，agent 通过 stdin/stdout 通信。npm / pypi 发布的 MCP server 多用此形态。

```yaml
mcp:
  type: stdio
  command: npx                  # 或 pipx / uvx / deno / node / 自定义二进制
  args: ["-y", "@resend/mcp-send-email"]
  env:                          # 可选；只列 server 实际读的 env keys
    RESEND_API_KEY: ${credential.RESEND_API_KEY}
```

**`type: http`** — 远端托管 server，无需本地安装。鉴权常走 OAuth-on-first-use 由 agent 自己完成（不写在 module）。

```yaml
mcp:
  type: http
  url: https://mcp.stripe.com
```

**字段语义**：

| field | applies to | meaning |
|---|---|---|
| `type` | stdio / http | **必需**（v0.1 spec 内为新增，可缺省，但 `trove validate` 会 warn 让迁移） |
| `command` | stdio | 启动命令（`npx` / `pipx` / `uvx` / `deno` / abs path） |
| `args` | stdio | 命令行参数数组，**绝不在此放 secret**（见反模式 #1） |
| `env` | stdio | server 进程的环境变量，**secret 必须 `${credential.X}` 引用**而不是字面值 |
| `url` | http | MCP server 的 HTTP endpoint |

**substitution 语法**：`${credential.KEY_NAME}` 在 `env:` / `args:` / `url:` 里都合法，install 时由 agent / Web UI 替换。**语义按字段类型分发**：

- string 系（`text` / `password` / `url` / `multiline` 等）→ 替换为 `credentials.json` 里的字面值
- file 系（`type: file`）→ 替换为该字段对应文件的**绝对路径**（见 §2.3）

字面字符串无需替换。注意 `url:` 里多用于 query string（如 `?project_ref=${credential.PROJECT_REF}`）而非 host——host 应该是稳定的官方 endpoint。

**当 server 同时支持两种 transport** → 优先 `type: http`（零安装、不锁本机环境）。如对方还提供 stdio，可在 skill body 注明备用方式，但 frontmatter 只声 http。

**反模式**（来自 SPEC §10 dogfood 沉淀）：

1. ❌ **secret 进 `args:` 字面值**（如 lark-mcp 老版的 `["--app-secret", "sk_..."]`）—— secret 必须存在 `credentials.json` 并通过 `${credential.X}` 在 `env:` 里引用。若 server 设计上只接受 secret 当 CLI 参数,要么换 CLI/SDK 形态、要么用 stdin-based flag。
2. ❌ **`env:` 里写硬编码绝对路径**（`GOOGLE_APPLICATION_CREDENTIALS: /Users/zephyr/.../foo.json`）—— 跨机器迁移即坏。文件型凭证的正式机制是 `type: file`（见 §2.3）：声明字段类型为 file，substitution `${credential.X}` 返回 trove 维护的稳定文件路径。
3. ❌ **`mcp:` 块缺 `type:`**（legacy 形态）—— 解释为 `type: stdio` 但 validate warn。每次写新 module 必须显式写 `type:`。

**何处真正安装**：见 §3「MCP 配置」—— AI 把这个 block merge 到 agent 的 MCP config（`~/.claude.json` 的 `mcpServers`、`~/.cursor/mcp.json` 等）。Trove 不主动安装，只提供声明。

---

**skill 正文写作要点**（产品成败命门）：
1. **以反例/易错点开头**而不是 happy path
2. 真实代码片段，不要伪代码
3. 计费/限流/错误码单独章节

### 2.2 `credentials.json`

只存 frontmatter `credentials` 里声明字段的实际值：

```json
{
  "MINIMAX_API_KEY": "sk-cp-yP-...",
  "MINIMAX_REGION": "china"
}
```

**哪些字段必须出现在 credentials.json**：
- 字段在 frontmatter 既无 `default:` 又非 `required: false` → **必须**列出
- 字段有 `default:` → **可选**（缺省时 default 生效）
- 字段标 `required: false` → **可选**
- 整个 module 所有字段都有 default → credentials.json 文件本身可省略

例如 `github-account` 类 module（多账号场景下用 `github-personal` / `github-work` 别名）所有 identity 字段都是公开信息且有 default，credentials.json 只需 `{}` 或不存在。

- **v0.1**：明文 + 文件权限 600 + `.gitignore` 规则 `**/credentials.json`
- **v0.2**：可选 macOS Keychain / Windows Credential Manager backend

**录入方式**：
- **首选 Web UI**（`trove ui` → Configure 按钮）—— 字段自动校验、AI 引导式录入、test connection 一键验证。**这是 v0.2 的一等公民流程**，CLI 直接编辑文件是 fallback
- **CLI fallback**（`$EDITOR ~/.trove/<svc>/credentials.json`）—— 急用、无 Web UI 启动时使用。但承担明文暴露在终端历史、截屏、远程协作时同事看到的风险
- **绝不**：在 shell 里 `echo "KEY=xxx" > file`（命令历史里就是明文）

---

### 2.3 文件型凭证（`type: file`）

某些服务的凭证天生是**文件**，不是字符串 —— 把它们硬塞 `credentials.json` 的 string 字段意味着用转义把多行 JSON / PEM block / SSH key 压成一行，违反 §0「手工友好」原则，也无法满足 SDK / MCP server 要求"给我一个文件路径"的接口。`type: file` 是这个张力的一等公民答案。

**适用场景**（什么时候用 file，什么时候用 string）：
- 用 `type: file`：GCP service account JSON、SSH private key、x509 cert/key、kubeconfig、`~/.aws/credentials` 这类文件、GPG keyring、p12 签名包
- 用 string 系：API token / bearer / webhook secret / API base URL / 用户名 等单值

**判定原则**：如果服务的 SDK / CLI / MCP server 接口接收**文件路径**（`GOOGLE_APPLICATION_CREDENTIALS=/path/...`、`ssh -i <path>`、`--cert <path>`）→ file；如果接收**值本身**（`Authorization: Bearer <value>`、`-H "X-API-Key: <value>"`）→ string。

#### 2.3.1 Schema

frontmatter 中声明：

```yaml
credentials:
  GOOGLE_SA_JSON:
    type: file
    file_format: json          # 可选；UI 据此校验格式 + 选 syntax highlight
    file_mode: "0600"          # 可选；默认 "0600"，要更严的用 "0400"
    required: true
    help: "console.cloud.google.com → IAM → Service Accounts → Keys → Add Key (JSON)"
```

支持的 `file_format` 值（v0.1）：`json` / `yaml` / `ini` / `pem` / `ssh-private-key` / `x509` / `raw`（默认）。仅作校验和扩展名线索，不改变存储方式 —— 文件内容按原始字节落盘。

#### 2.3.2 存储约定

文件型凭证**不出现在 `credentials.json`**。它们以真文件形式存放在模块目录下的 `files/` 子目录：

```
~/.trove/google-analytics/
├── module.md
├── credentials.json              # 只装 string-typed 字段（如 GA4_PROPERTY_ID）
└── files/
    └── GOOGLE_SA_JSON.json       # 文件名 = 凭证 key + .<file_format>
```

- **文件名约定**：`<KEY><.file_format?>`。若 `file_format` 是 `raw` 或缺省 → 不带后缀；否则用 format 名作为扩展（`.json` / `.yaml` / `.ini` / `.pem` 等）。代码里始终**正向生成**（key + format → filename），无需反向解析
- **`files/` 目录权限 `0700`**（仅当前用户可进入）
- **每文件权限 `file_mode`**（默认 `0600`，目录内 `umask 077` 创建）
- `.gitignore` 规则：`**/credentials.json` + `**/files/`（v0.1 同时维护两条）

#### 2.3.3 `${credential.X}` 替换语义

substitution 行为**按字段类型分发**：

| 字段 `type` | `${credential.X}` 替换为 |
|---|---|
| `text` / `password` / `url` / `select` / `boolean` / `number` / `multiline` | `credentials.json` 里该字段的字面值 |
| `file` | `~/.trove/<module>/files/<X>` 的**绝对路径**字符串（不是文件内容） |

显式访问器（避免歧义场景使用）：
- `${credential.X.path}` —— 同 `${credential.X}` 对 file 类型，强调返回路径
- `${credential.X.contents}` —— 返回文件原始内容（escape hatch；MCP `env:` 几乎不该用，少数 SDK 接受 inline blob 时可用）

**典型用法**（google-analytics 的 `mcp:` 段）：

```yaml
mcp:
  type: stdio
  command: pipx
  args: ["run", "google-analytics-mcp"]
  env:
    GOOGLE_APPLICATION_CREDENTIALS: ${credential.GOOGLE_SA_JSON}    # → 路径，正是 SDK 想要的
    GA4_PROPERTY_ID: ${credential.GA4_PROPERTY_ID}                  # → 字面值
```

#### 2.3.4 校验（`trove validate` 行为）

对每个 `type: file` 字段：
1. 检查 `~/.trove/<module>/files/<KEY>.<file_format?>` 存在（按 schema 约定的路径计算）
2. 检查文件大小 > 0
3. 检查文件 mode 等于 `file_mode`（默认 `0600`）—— 不等则 warn 且建议 `chmod`
4. 若声明了 `file_format`：粗校验内容（json → `JSON.parse`、pem → 含 `-----BEGIN ` 头、yaml → YAML.parse）—— 失败仅 warn，不 error
5. 检查 `credentials.json` 里**没有**重复出现该 key（迁移残留检测；旧 `multiline` 字符串没清掉）

对 string 字段：保持现有逻辑。

#### 2.3.5 Web UI 表单

`type: file` 字段在 form 里有两种输入方式：

1. **粘贴**（默认）—— 文本域，接住 `cmd-V` 多行内容。提交时写盘
2. **上传**（可选）—— `<input type="file">`，仅本地浏览器读取（不经服务器中转），同样写盘

GET 时**永不返回文件内容**。返回元信息：

```json
{
  "GOOGLE_SA_JSON": {
    "$file": true,
    "exists": true,
    "size": 2347,
    "mode": "0600",
    "modified": "2026-05-13T14:22:00Z"
  }
}
```

PATCH 提交语义：**file 字段未出现在 PATCH payload 中 = 不动**。要修改才在 payload 里带值。删除走显式 `__delete: <KEY>` flag。比起 string 字段那种"`••••••••` 哨兵字符串等于不改"的 in-band 约定更干净（file 没有等价的视觉占位）。

**SPEC 不规定 reveal/隐藏 UI 控件形态** —— 但**`GET API 永不返内容`是硬约束**（防 SSRF / 日志泄漏 / 截屏意外）。是否提供 password 眼睛 toggle、file 的 "Show contents" 折叠块，由 UI 实现决定。

#### 2.3.6 从 `type: multiline` 迁移

存量模块（如旧版 `google-analytics` 把 SA JSON 塞 `multiline` 字符串）的迁移：

1. 模块 frontmatter 改 `type: multiline` → `type: file` + `file_format: json`
2. 用户跑 `trove migrate <module>`（独立子命令，与只读的 `trove validate` 分开 —— validate 必须保持 read-only）：
   - 读 `credentials.json` 里该 key 的字符串值
   - 写到 `files/<KEY>.<format>`，mode `0600`
   - 从 `credentials.json` 删除该 key
   - 打印迁移摘要
3. 验证：再跑 `trove validate <module>`，应当 0 error 0 warn

`trove migrate` 是幂等的：已迁移过的字段会跳过（credentials.json 里没 key 且 files/ 里有文件 → 状态正确）。

---

## 3. AI 怎么用 Trove（runtime 行为）

**没有 inject 步骤、没有自定义语法、没有跨 agent 适配器**。AI 直接 `Read` 文件。

### 项目里引用 module 的推荐方式：独立 `trove.md` 文件

**不要把 trove 引用混进 CLAUDE.md**——CLAUDE.md 应该只放项目本身的 context（架构、约定、术语），trove 模块声明独立成 `trove.md` 文件，仿 `package.json` / `.env` 的「单文件单职责」原则。

**项目根目录布局**：
```
my-project/
├── CLAUDE.md          # 项目本身的描述 + 一行 @trove.md 引用
├── trove.md           # 仅列 trove 模块引用，无叙述
└── ... (project files)
```

**`CLAUDE.md`** 长这样：
```markdown
# My Project
（项目介绍、架构、约定、术语……）

@trove.md
```

**`trove.md`** 长这样（只有引用，无注释、无 narrative）：
```markdown
@/Users/you/.trove/github-personal/module.md
@/Users/zephyr/.trove/minimax/module.md
@/Users/zephyr/.trove/cloudflare/module.md
```

**这种分离的好处**：
- CLAUDE.md 干净——重读时只看项目本身
- trove.md 是唯一 trove 真相源——加/删 module 不动 CLAUDE.md
- AI 一眼看出项目用哪些 trove 资源
- 多项目对比：`diff project-a/trove.md project-b/trove.md` 直观看出资源差异
- module 的「使用约定 / applies_to」由 module.md frontmatter 自带，不需要在项目里复述

### 是否 git 跟踪 `trove.md`

- **单用户项目**（个人 / 小团队同账户）→ tracked，作为项目依赖记录
- **多用户 / OSS 项目** → trove.md gitignored（含个人绝对路径），同时维护 `trove.example.md` tracked（仅列 module 名作 manifest，新协作者照抄即可）

### 备选方式（不推荐做主入口，但可补充）

若需要按需 lazy load 而非启动即载，CLAUDE.md 直接写一段约定式描述也行：
```markdown
This project uses Trove modules: minimax, cloudflare. Read ~/.trove/<name>/module.md when you need them.
```
AI 用时再 Read，省 token，但失去 Claude Code 自动加载。**适合**：模块用得少 / 启动 context 紧张。

### 凭证使用约定

**AI 自取，不预先 export 到 env**：
- HTTP 调用：`Authorization: Bearer $(jq -r .XXX_KEY ~/.trove/<svc>/credentials.json)`
- shell 工具（如 `wrangler` 必须读 env）：临时 `export $(jq ... ~/.trove/<svc>/credentials.json | xargs)` 再调
- AI 决定哪种方式

**为什么 AI 自取**：上下文不污染、token 不浪费、blast radius 最小、AI 知道自己用哪种方式调最合适。

### MCP 配置（唯一需要「安装」的）

MCP server 是独立进程，必须先注册到 agent：
- AI 看到 module.md 里有 `mcp:` 字段
- AI 用 Edit / Bash 工具把它 merge 到 `~/.claude.json` 或 `~/.cursor/mcp.json`
- 或 Web UI 提供「Install MCP for this module」按钮一键 merge

**这件事不需要单独的 inject 工具**——AI 完全能做。

### 让 AI 帮你配项目

最简单的用法是直接对话：

> "在这个项目用 minimax 和 cloudflare"

AI 会：
1. `ls ~/.trove/` 确认两个 module 存在
2. 读它们的 frontmatter（看 applies_to / credentials 字段）
3. 写 / 更新当前项目的 CLAUDE.md
4. 提示缺失字段（如 `CLOUDFLARE_ACCOUNT_ID` 没填）

---

## 4. Web UI（核心产品）

**`trove ui` 启动本地 web server**，浏览器打开 `http://localhost:7821`。**这是 Trove 的主入口**——比 CLI 更适合管理结构化资源。

**为什么是 web 不是桌面 app**：
- 安装零摩擦（一行命令）
- 跨平台同一份代码
- OSS 先例：Jupyter / Storybook / Prisma Studio / Drizzle Studio
- 数据从不离开你电脑

**界面（v0.1 三视图）**：

1. **Modules 列表**——按 category 分组的卡片视图，开关启用 / 编辑 / 删除 / 「在哪些项目用了」反查
2. **Module 详情 / 编辑器**
   - 左：根据 frontmatter `credentials` 自动生成的表单（编辑凭证值）—— password 字段遮蔽、URL 字段格式校验、help 文本带「去哪获取」链接
   - 右：skill 正文 markdown 编辑器（实时 preview）
   - 底部：「Install MCP」「Test connection」「Add to current project」三个动作按钮
3. **AI Authoring**（创建新 module，§6）

**关于「AI-Assisted Credential Entry」**：v0.1 经反思后认定**不该是 Web UI 独有的特性**。任何 AI agent（Claude Code、Cursor、Codex）在对话里都能完成「引导用户拿 key → 校验格式 → test → 写盘」全流程——chat 本身就是 entry interface。Web UI 只是这个流程的**可视化外壳**，不是必要载体。详见 §10 第 4 条。

**v0.2 加**：Marketplace（社区 modules 浏览/安装）。

**技术栈倾向**：Bun + Hono（与可选 CLI 共享）+ React 前端，单二进制部署。

---

## 5. AI-Assisted Module Authoring

第 2.1 节命门：「让 AI 真用对」靠 skill 质量。手写 5 个还行，写 50+ 个崩。**用 AI 帮 AI 准备资源**——元层面的解决方案。

### 5.1 三个核心入口

**From URL**：粘贴文档 URL → AI 抓 + 解析 → 提取 endpoint/auth/必填参数/计费/坑 → 生成 `module.md` 草稿。用户在 web UI 审稿调整。

**From .env**：粘贴 .env 内容 → AI 按服务名识别分组（`STRIPE_*` / `OPENAI_*` 各自一个 module）→ 自动尝试拉文档补 skill → 批量生成 module 骨架。**这是从 `legacy env stash/` 迁移的真正方式。**

**From Description**：自然语言描述（"我用 Lark OpenAPI 创建文档"）→ Web search 找文档 → 同 From URL 流程。适合冷门服务、内部 API。

### 5.2 Refinement loop（产品长期价值引擎）

- 触发：用户标记某个 skill 章节"AI 用错了" + 粘贴失败 case
- AI：读 `module.md` + case → 提议在哪段加反例 → 给出 markdown diff
- 用户：accept / reject

**使用越多，skill 越精炼。**

### 5.3 LLM 选择（用户自带 key）

- 默认：用 Trove 自己装的 anthropic / openai 模块的 credentials
- 配置：`~/.trove/config.json` 的 `ai_authoring.provider`
- **不 host LLM**——违背 local-first

---

## 6. Worked Example: minimax module

详见 `library/minimax/`：
- `module.md`：5 个子 API（T2I / T2V / music / TTS / LLM）合并到一个 module
- `credentials.example.json`：占位模板

**最小项目接入**（在任意项目的 `CLAUDE.md`）：
```markdown
@/Users/zephyr/.trove/minimax/module.md
```
就这一行。AI 看到 module 的 frontmatter，知道凭证在 `~/.trove/minimax/credentials.json`，需要时自取。

---

## 7. Migration（从 `legacy env stash/` 迁移）

**手工方式**（v0.1 启动期）：
1. `mkdir ~/.trove`
2. 按服务建子目录
3. 把 `legacy env stash/credentials/<env-file>.env` 中各服务的 env 行拆到对应 `<svc>/credentials.json`
4. 把 `legacy env stash/credentials/<api-guide>.md` 各 H2 章节抽到对应 `<svc>/module.md`，加 frontmatter
5. 删除（或保留）原 legacy env stash 文件

**AI 辅助方式**（一旦 §5 Web UI + AI Authoring 跑通）：在 web UI「From .env」里粘 `.env` 文件内容 → AI 自动批量生成 modules 骨架 → 用户审稿。**完全没必要写 `migrate-from-personal-data` 命令**，从 web UI 走更顺。

---

## 8. CLI 命令面（极简）

```
trove ui                         # 启动本地 web dashboard（主入口）
trove ai new <url|.env|"desc">   # AI 生成新 module（也可以从 web UI 走）
trove validate <module>          # 校验 module 格式
trove list                       # ls 已装 modules（debug 辅助）
```

**不做**：
- ~~`trove init`~~ —— AI 在用户对话里直接更新 CLAUDE.md
- ~~`trove inject`~~ —— 不存在编译步骤
- ~~`trove install <module>`~~ —— v0.2 marketplace 时再说，v0.1 就是 `git clone <url> ~/.trove/<name>`
- ~~`trove migrate-from-personal-data`~~ —— 走 Web UI 的 From .env

---

## 9. Open Questions

- **加密时机**：v0.1 明文 + 600，v0.2 Keychain backend。是否需要中间档（age 加密文件）？
- **Web UI 端口冲突**：默认 7821 被占了自动 +1 还是报错？
- **AI Authoring 鸡生蛋**：用户没装 anthropic 也想用 AI Authoring——首次启动是否强制配一个 LLM？
- **AI 生成内容可信度**：文档过时 / 计费规则变化。frontmatter 加 `last_verified: "2026-05-11"` + 定期 re-verify 命令？
- **Module 分发**：v0.1 不做 registry，从 `git clone` 安装；v0.2 看是否要 marketplace
- **Web UI 跨设备同步**：用户多台机器怎么同步 `~/.trove/`？git remote? rsync? iCloud Drive？倾向不做，让用户自选 sync 方式（git 或同步盘）

---

## 10. Convention Adherence Log

dogfood 时发现的「AI 没按约定走」/「SPEC 没说清」案例都记在这。**这是 SPEC 的活体证据**——既驱动 SPEC 修订，也告诉外部用户产品在严肃迭代。

格式：`日期 · 触发场景 · 问题 · 修复（commit hash）`

### 2026-05-12

- **`mcp:` 字段对 `type: http`+OAuth 形态价值薄 — Trove 的护城河在 skill body + credentials，不在 mcp 字段本身**：今天给 supabase / stripe 加 `mcp:` 块时，写到 `type: http url: https://mcp.supabase.com/mcp` 这种纯 URL declaration 时被用户连环追问：「不需要存任何 secret、OAuth 也是 agent 自己管的话，那这跟链一段 Claude MCP docs 有啥区别？」**结构化拆**：(a) `type: stdio` + env-secret（resend / analytics-mcp）的 `mcp:` 块**有真状态** —— `command`/`args`/`env`-到-`${credential.X}` 的桥就是 Trove 的存档点，删了就要每个用户重写、还容易把 secret 写进 args（反模式）；(b) `type: http` + OAuth（supabase / stripe / figma）的 `mcp:` 块**几乎无状态** —— 就一个 URL + transport 字面值，没 secret 也没 env 桥。**那为什么还留**：machine-parseable signal（Web UI 一键 install 按钮、AI 看到 `type: http` 知道选 `--transport http` 而不是 stdio）+ 上下文 co-location（跟 skill body 的 `read_only` / `project_ref` / 哪些 tool 别用、credentials 的 API 面 SDK keys 同住一个 module 目录）。**但坦白说**：删掉对 hosted HTTP MCP 几乎不掉价 —— 因为 Trove 真正的护城河是 **skill body**（read_only 默认 / project_ref 安全 profile / Payment Links 第三形态 / Edge Functions URL shape / Auth header 三大搜索差异 / 各家 API 计费陷阱）+ **credentials.json**（API/SDK 路径的 keys），这两部分没人能替代。Anthropic 的 MCP registry 给得了 URL，给不了 gotchas。**衍生战略洞见**：行业 MCP 形态正在向 hosted+OAuth 演化（stripe / supabase / figma 都选了这条），未来 `mcp:` frontmatter 对越来越多服务来说就是 thin pointer。**这反而健康** —— 它把 Trove 的产品重心从「MCP 配置管家」更彻底地推向「服务 skill 知识库 + API 凭证库」，后者是更难、更高价值的问题面。**SPEC 不动**（`mcp:` 两种 sub-schema 保留），**README 和 positioning 文案应该调整** —— 别再把「MCP 配置」当一等卖点，把「skill body 是亲身踩坑沉淀，不是 LLM 训练数据复读」立成首要差异。
- **拿维护者自有生产项目作 verify context：发现 3 个模块的真实使用形态和最初的模型不同**：用一个下游 web app（维护者自己的项目）作为 stripe / GA / supabase 的真实验证 context。摸完发现：(1) **stripe**：该项目前端**只用 Stripe Payment Links**（`buy.stripe.com/...` URLs 作 CTA），**完全不调 Stripe API**——下游项目不能验 stripe 模块的 API 路径。stripe API 实际被另一项目的 SDK pipeline 验证，stripe MCP 被 Claude Code 用。**Payment Links 是 stripe 模块的第 6 种使用形态**——没 API、没 MCP、纯前端 URL，但模块 skill body 完全没覆盖。SPEC 工作：stripe module 加 Payment Links 章节。(2) **GA**：下游项目前端 `gtag.js` 用 measurement id **写**事件给 GA4 property，Trove google-analytics 模块用 property id **读**这些事件——**前者写后者读，是同一个 GA4 property 的两半**。验证：Data API runReport 拉 28 天真实生产数据，千级 users / 万级 page_views / 完整漏斗事件全部可读。**这是 Trove 第一次拿到的"真生产数据 E2E"凭证**，比合成 smoke 强一个数量级。(3) **supabase**：下游项目代码 `grep supabase` **零命中**——维护者之前提到该项目用 supabase 是记错了，supabase 在 Trove 库里没有任何 production verify context。模块继续 pending 等真 onboard。**衍生原则**：(a) 模块的「verify context」不能假设，必须实际 grep 项目代码确认；(b) 同一服务可能有 N 种使用形态（API / MCP / CLI / Payment Links / 前端 SDK / ...），skill body 需要覆盖每一种或显式声明范围；(c) 维护者自己的生产项目是 Trove 模块最强的真实验证场——比注册 sandbox 账号 + 烧 smoke quota 高一个数量级的可信度。
- **Release-quality gate: `last_verified` 字段 + "未验证不能挂成品"原则**：用户在批量集成 9 个新 module 后划了一条线："未验证就不能当作 successful 产物发布啊"。这条原则升级 Trove 从"我们有 18 个 module 模板"到"我们有 18 个**亲身验证过**的 module 模板"——一个公开 OSS 项目的品牌底线。**修复**：SPEC §2.1 加 `last_verified` 推荐字段（自由文本，`"YYYY-MM-DD · <method>"` 格式），覆盖 4 种状态：(a) 真实 E2E 跑通；(b) auth + contract 通过但 runtime 阻断（计费/quota 等）；(c) pending（缺 key / credential 失效）；(d) production（持续生产证据）。**18 个 module 一次性补完字段**：14 个 ✅ verified，2 个 pending（anthropic 无 key、supabase 待 MCP-shape 重写），2 个特殊状态（kling 账号没钱、google-ads refresh token 失效）。`trove validate` 后续会对缺字段 warn。**衍生原则**：library/ 是 release 面，repo `git clone` 即可见，每个 module 都要带 verification 时间戳。
- **"漏看 ~/.claude.json 这一层" — 凭证只看 `legacy env stash/` 等于只看了一半**：批量集成时只扫了 `legacy env stash/credentials/*.env`，错过了 `~/.claude.json` 里**实际在用的 MCP 服务**配置。结果：(1) stripe 写成纯 API-shape，**漏掉 `https://mcp.stripe.com` 这个用户每天用的 hosted HTTP MCP**；(2) google-analytics 写成纯 API-shape，**漏掉 `analytics-mcp`（pipx run, 本地 stdio）这个已注册的 MCP server**；(3) 用户主动指出"supabase 是 mcp" / "stripe 也是 mcp" 才意识到问题面。**根因**：`legacy env stash/` 是「人类放凭证的地方」，`~/.claude.json` 是「AI agent 实际消费凭证的地方」——两层完全不同的 audit surface，集成新 module 必须**同时扫两层**。**修复**：(a) Trove 模块迁移 checklist 加一步「先 `jq '.mcpServers // .projects' ~/.claude.json` 列已注册 MCP，逐项映射到 module」；(b) `mcp:` frontmatter 字段需要正式支持两种 sub-schema：`type: stdio` (command/args/env) 和 `type: http` (url) — SPEC v0.2 待写。**衍生原则**：「凭证迁移完整性」必须从**两个 source of truth** 交叉验证：人类的 env 文件 + AI agent 的实际配置。
- **Verify gate 第一次抓 bug：OAuth refresh token `invalid_grant`**：对一个 Google API 模块跑 OAuth refresh 时返回 `{"error": "invalid_grant", "error_description": "Bad Request"}`——legacy env stash 里的 refresh token **当前就是坏的**。但维护者的下游项目最近还在用该 API，意味着真的工作 token 已经轮转过、新值没回写到 stash。**根因（猜测）**：(a) Google OAuth refresh token 在 6 个月闲置后被回收；(b) 同一 OAuth client 累计签发 >50 次后最老 token 失效；(c) 维护者从某个工具链（gcloud / wrangler-like）拿了新 token 但没同步回 stash。**修复**：(a) 该 module 标 `last_verified: "pending — refresh token invalid_grant"`；(b) module skill body 已经有"refresh token 静默过期"警告，这次成为活体证据；(c) 维护者后续需要重跑 OAuth wizard，新 token 直接写进 Trove 的 credentials.json（不再回写 legacy stash，让 Trove 成为 single source of truth）。**意义**：`last_verified` 字段 + 真实 smoke 在第一次跑就抓到了 production credential 失效——证明 verify gate 不是 ceremony，是真的能挡 release 翻车。
- **"Trove module ≠ service-with-API-key" — 装 module 的判据是「你这周内会填凭证去调它」而不是「example 目录有它」**：今晚批量集成尾声把 Tier A 的 anthropic / fal-ai / supabase example 也"顺手装到" `~/.trove/`，credentials.json 空着等用户后填——**这一步是错的**。理由：(1) anthropic：用户用 Claude Code（claude.ai 登录认证，`~/.claude.json` 根本没 api_key 字段），也没在写直连 Anthropic SDK 的项目。module 自己的 description 还写着「default LLM provider for Trove's AI Authoring feature」——AI Authoring 已按 design-v0.2 **dropped** 了。double-stale。(2) fal-ai：`legacy env stash/` 完全没 fal key，用户从未 onboard。(3) supabase：用户使用模式是 supabase-mcp（MCP server），example 却是 API-first（要 5 个字段：URL / anon / service_role / project_ref / db_password），shape 错位。**修复**：把这 3 个从 `~/.trove/` 卸载，repo 的 `examples/` 保留（别人可能用 API-direct 方式）。**衍生原则**：Trove module 至少有 5 种形态——纯身份配置（github-*，全 default 无 secret）/ CLI-shape（lark via lark-cli）/ MCP-shape（supabase 未来该这样写：frontmatter 主要描述 MCP server 配置而非 API field）/ API-shape（多数）/ 混合（cloudflare：API token + wrangler CLI）。**install 时机判据**：「你这周内是否会真的填凭证去用」，否则 example 目录就是它的位置。**衍生 SPEC 工作**：supabase / 任何「主要用 MCP 而非直接 API」的服务，需要正式的 MCP-shape module 模板——和 lark 的 CLI-shape 模板平行。
- **9 个新 module 单晚集成 + Trove 首次"大批量 module 制造"压力测试**：今晚从 `legacy env stash/` 把 serper / tavily / brave / kling / qwen / stripe / google-analytics / google-search-console / google-ads 这 9 个服务一次性集成进 Trove + 装到 `~/.trove/` + 填真凭证 + 端到端 smoke。**meta-validation**：有了 v0.2 Web UI scaffold + 一个高质量 module（openrouter）作 reference 之后，"加一个 module" 的边际成本几乎完全是 "research 这个 API 的 gotchas + 写 skill"，Trove 自己的机制（frontmatter / credentials.json / install flow）几乎没产生摩擦。**衍生**：批量生产 module 的真瓶颈是 skill 质量（gotchas 是否真的从 dogfood 沉淀而来 vs 从训练数据生成），不是 Trove 的格式开销。9 个里 6 个用真实 API 调用完整端到端验证（serper / tavily / brave / qwen / GA4 / GSC），3 个只验证了凭证抽取 + 不烧 quota 的 auth 校验（kling 用 401 vs 400 判断 JWT 签名有效、stripe 用 GET /customers 验证 rk_live_ 有读权限、Ads 跳过仅靠 skill 派生自维护者已生产的下游项目代码）。
- **SPEC §1 文件型凭证压力测试 + 临时方案**：google-analytics / google-search-console 共用同一份 Google Cloud service-account JSON（~2.5KB）。**问题**：SPEC §1 严格规定模块目录只能有 `module.md` + `credentials.json` 两个字面量文件，但 service account 凭证天生是文件形态。**临时方案 (v0.1.x)**：把 JSON 用 `JSON.stringify` 内联为 credentials.json 里的 multiline 字段（jq -c 一键产出），skill body 教 AI 怎么 `JSON.parse` 出来再传给 SDK。代价是同份 2.5KB JSON 在两个模块各存一份（轮换时改两处）。**SPEC v0.2 待回答**：是否引入 `type: file`（值是路径）或者跨模块凭证引用（如 `credentials_ref: google-cloud-auth` 表示从另一模块继承）。**先记一笔**，等第 N 次跨模块共享凭证时再决定 SPEC 演化路径。
- **YAML frontmatter 隐藏陷阱：以 `"quoted phrase"` 开头的 list 项后接 `— continuation` 会 parse fail**：写 tavily / brave 的 `applies_to:` 时各自被 `trove validate` 抓到一次。YAML 1.2 规范里，引号闭合后这一行剩余文本必须是空白 / 注释 / EOL，不能再续接 scalar。**修复**：所有 list item 要么完全不引号，要么整行包在引号里；不要"前缀引号 + 后续无引号续接"。**衍生原则**：trove-validate 必须在 module 写入 `~/.trove/` 之前作为强制 gate ——这次连续 2 次救援证明它的存在价值。**写进 §2.1 frontmatter 章节**：list scalar 续接规则的反例。
- **三大搜索 API 的 auth header 都不一样，且都不是 OpenAI 派**：serper = `X-API-KEY`，tavily = `Authorization: Bearer`，brave = `X-Subscription-Token`。**这是 #1 的 401 来源**——任何在 LLM 调用代码上"复制粘贴改改"的人都会踩。三个 module 的 Critical Constraints 各自把这条作为第一条提醒。**意义**：印证 SPEC §2.1 "skill 必须以 gotchas/反例开头" 的约定——同一类别的服务（都是搜索 API）有看起来微妙、实际致命的差异，必须前置消化。
- **Trove 首跑：两个状态显示 bug 被实地用户立刻抓出来**：scaffold 用 Bun + Hono + HTMX + Tailwind CDN，~700 LOC。在已装 6 个 module 的 `~/.trove/` 上跑起来当场暴露两个 UI bug：① **「全 default」module 被误判为 `credentials missing`**——两个 github-account 变体（如 `github-personal` / `github-work`）所有字段都有 `default:`，credentials.json 是 `{}`，按 SPEC §2.2 是 valid 状态，UI 却显示红色 missing。**根因**：状态计算函数提前 `if (present.length === 0) return "missing"`，没区分「required 集合为空」和「required 都没填」。**修复**：先 `if (requiredKeys.length === 0) return "complete"`，再做填值对比。② **HTMX 局部 swap 漏掉 header badge**：填完凭证 Save 后表单原地 swap ✓，但页面 header 的红色 `credentials missing` 不变——PATCH 只返回 form 片段，badge 在 swap 范围外，用户的直觉反应是「没保存」。**修复**：HTMX OOB（out-of-band）—— 同一响应附带 `<span id="cred-badge" hx-swap-oob="true">` 片段，HTMX 自动找 id 替换。一处保存、多处同步、零额外 round-trip。**衍生原则**：**HTMX 局部 swap 必须列举所有依赖该状态的 UI 节点**，不在主 target 内的用 OOB 覆盖——这是 HTMX-heavy SSR 架构（v0.2 选型）的最高频陷阱，必须当一等公民习惯而不是 bug 修。**意义**：UI 上线 30 分钟内被真实用户抓到两个状态显示 bug，**正好证明 SPEC §10 的「dogfood-driven 是 SPEC 修订唯一可信来源」原则**——任何 spec/design doc 都预测不到 `present.length === 0` 和 `requiredKeys.length === 0` 的语义重叠盲区。
- **首次「纯 Web UI → 真实 API 调用」端到端跑通（openrouter）**：用户从未编辑过 credentials.json，纯通过 Web UI 表单填 `OPENROUTER_API_KEY` → UI 写盘 `~/.trove/openrouter/credentials.json`（600 权限）→ 按 module skill 推荐方式 `jq -r .OPENROUTER_API_KEY` 抽 key → POST `https://openrouter.ai/api/v1/chat/completions` → `claude-haiku-4-5` 返回 `trove dogfood smoke test ok`，费用 $0.000074。**全程零文件系统操作、零命令行操作、零凭证字面值露出**。配合首次走通的 Install flow（Examples gallery → Install → 拷 `examples/openrouter/module.md` 到 `~/.trove/openrouter/` → 跳转详情页 → 填表 → API 工作），验证了 v0.2 设计文档「四 screen 闭环：Modules grid / Module 详情 / Credentials 表单 / Examples gallery」是完整产品流。**意义**：这是设计文档「Web UI 是凭证录入的一等公民、`$EDITOR` 是 fallback」核心假设的**最强实战证据**——一个曾经的「手工 mkdir + vim credentials.json」流程被压缩成「点 Install、填表、Save」三步。一旦这条路顺滑到可推荐给非开发者，Trove 就不再只是 AI agent 的工具，而是任何「想管 API key 但不想碰文件系统」的人的资源中心。**衍生开放问题**：跨设备同步策略（用户多台机器各自填一遍？还是同步 `~/.trove/`？）——v0.3 之前先继续靠 git remote 手动同步，等真有第二台机器需求再说。

### 2026-05-11

- `trove validate --all` 报 `github-*` module credentials.json「缺字段」，但那些字段在 frontmatter 有 `default:`。**问题**：SPEC 未明确「带 default / 标 required: false 的字段是否必须在 credentials.json 重申」。**修复**：SPEC §2.2 加「哪些字段必须出现」规则；validate 逻辑跳过有 default 的字段。
- `trove validate --examples` 报 `examples/*` 没 credentials.json。**问题**：例子目录用 `credentials.example.json` 占位避免真凭证入库，但 SPEC 没说 validate 在 examples 场景下该接受 `.example.json` 作为 schema 验证源。**修复**：validate 找不到 credentials.json 时回落到 credentials.example.json；SPEC 默认接受这个 fallback。
- **首次「AI is the runtime」实战 validation**：一个下游项目里另一个 Claude session 实现 `/api/advise` 顶端 LLM 代理，**自然地**用 `jq -r .MINIMAX_API_KEY ~/.trove/minimax/credentials.json` 抽值塞 `.dev.vars`——没 hallucinate `process.env`，没要求预先 export。**这是产品核心假设的第一次实战证实**。**衍生发现**：边缘运行时（CF Pages / Workers / Vercel / Fly）不能在 request time 读 `~/.trove/`，需要「Trove → 平台 secrets」桥接模式（local 写 `.dev.vars`、prod `jq | wrangler secret put` 管道）。**修复**：cloudflare module 加「Bridging Trove credentials → CF Pages / Workers secrets」专节，把这个 canonical 桥接固化到 skill。
- **Web UI 定位重新校准**：之前把「AI-Assisted Credential Entry」当 Web UI 独有的 killer feature。**反思后这是错的**——chat 本身就是 entry interface，任何 AI agent 都能完成「引导拿 key → 校验 → test → 写盘」。Web UI 真正独有的价值是**可视化 / browse / 反查「哪些项目用了这个 module」/ marketplace**，不是 credential entry。**修复**：§5 删除「AI-Assisted Credential Entry」作为 Web UI 一级视图的描述，改为「chat 是 entry，Web UI 是 visualization」。ROADMAP v0.2 中该项依然保留但定位为「Web UI 上的可视化版本」，不是必经入口。
- **域名管理是 Trove 的核心 use case**：跨项目复用（一个 CF 账号 → N 个项目的域名）+ 价值密度高（每次买域名都是仪式感任务）+ 步骤多（search → buy → DNS → Pages 绑 → SSL → Email Routing）。**修复**：cloudflare module 加「AI-driven domain workflow」整节，给出完整 API 调用序列 + 三件人必须做的事（确认价格 / 点击 email 验证 / 首次填支付方式）+ 错误码表。AI 看到 module 后即可端到端执行，**人类只需说「买 trove.dev」**。这是 Trove 「让 AI 替你管账户」愿景的第一个完整实例。
- **whois 检查方法在 `.dev` / `.app` 上失效（重要教训）**：用 `whois <domain> | grep "creation date"` 判断域名可用性在 `.dev` / `.app` / `.page` 这些 Google 注册的 TLD 上**100% 假阳性**——这些 TLD 出于隐私不公开 creation date 字段。trove.dev / trove.app 因此被误判为 available，直到 CF dashboard 才显示「is not available」。**正确方法**：用 `dig +short NS <domain>`——返回 nameserver 即已注册，空即可用。已用此法重扫，发现 trove.dev / trove.app 实际都早被 park。**修复**：cloudflare module「AI-driven domain workflow」加 §0 「Availability check — use DNS NS lookup, not whois」警告 + 一行 bash 标准做法。**教训**：任何「靠脚本判断 OSS 资源是否存在」的逻辑都要交叉验证多源——单一信号源在隐私敏感 TLD / 注册局上靠不住。
- **MCP-with-secret-in-args 是反模式**：检查 `~/.claude.json` 发现旧 lark-mcp 配置把 `--app-id <id> --app-secret <secret>` 直接塞进 `args` 数组——**secret 明文入 config 文件**，违反 Trove「credentials.json 独占 secret」原则。任何 MCP server 用此模式都该警惕。**修复**：把凭证迁到 `~/.trove/lark/credentials.json`，删除 `~/.claude.json` 里的 lark-mcp 项（备份保留），改用 `lark-cli`（官方 CLI，能力更强：generic api / schema introspection / 多 profile / jq / pagination / doctor），用 `--app-secret-stdin` 避免命令历史暴露。lark module 改为 v0.2，删 `mcp:` 字段，加 Setup 章节做 Trove → lark-cli 配置桥接。**衍生原则**：评估任何 MCP server 时先 grep 它 README / 安装示例里有没有把 secret 写进 args；有就用 CLI / SDK 替代。
- **Resend「双轴沙盒」陷阱（另一 Claude session 在 momentstream.ai 项目里发现）**：Resend free tier 的发送限制不是单一闸门，是**两个独立 gate**——FROM 域名 verified（gate A，可用 `onboarding@resend.dev` 沙盒绕过）+ TO 必须是账户登录邮箱或 Resend 测试地址（gate B，**只有 verify 任意一个 sending domain 才能解锁**）。`onboarding@resend.dev` 只过 gate A 不过 gate B，导致「沙盒能发到自己 gmail，但发不到任何外部域名」的反直觉行为。**修复**：resend module Critical Constraints #1 重写，把双轴 + 各自 bypass 路径讲死；并加最佳实践「verify `send.<your-domain>` 子域而非 root 域，避免和 Workspace/M365 现有 SPF/DKIM 体系冲突」。**衍生**：补完整的「Trove 跨 module 自动化：CF DNS API 写 TXT 记录 → Resend verify」端到端示例代码——这就是 Trove 价值最浓缩的展示：人类一句话「verify send.example.com 当 sending domain」，AI 端到端跑完三个模块。**学习**：另一 Claude session 在不同项目独立踩到同一坑并把它分析得更透彻——**这正是 Trove §10 该捕获的「分布式 AI 智慧汇聚到同一 commit 历史」流程**。
- **Trove 自己第一次上线 `trove.roboz.dev`（首次「人一句话 → AI 跨 module 端到端跑通」demo）**：人类一句「把 Trove 挂上 trove.roboz.dev」，AI 用 cloudflare module 知识端到端：(1) 写 `site/index.html` 极简 landing；(2) `wrangler pages deploy` 推到 CF Pages；(3) **首次 deploy wrangler 不会自动建 project，要先 `POST /accounts/{aid}/pages/projects` 显式创建**——这是 cloudflare module 之前没写明的小坑；(4) `POST /accounts/{aid}/pages/projects/trove/domains` 加 custom domain；(5) `POST /zones/{zid}/dns_records` 写 CNAME `trove → trove.pages.dev`；(6) 5 个步骤里**人类零点击**，全程 API 自动化（trove-7vp.pages.dev 立刻 200 OK，trove.roboz.dev 等 SSL provision ~10min）。**修复**：cloudflare module「AI-driven Pages 部署」加 §0「需要先显式 `pages/projects` POST 建 project，wrangler 不自动建」。**意义**：这是 Trove 第一次「**用自己沉淀的 skill 把自己上线**」——meta-validation 不靠任何 marketing 套话。
- **trove.roboz.dev SSL provisioning 卡住 + 修复（CF Pages custom domain CNAME 必须指 `<project>-<random>.pages.dev`）**：绑 custom domain 后 `verification_data.status: pending`，错误信息 `"CNAME record not set"`，但 dig 显示 record 存在。**根因**：CNAME content 写的是通用 `trove.pages.dev`，CF 对 `*.pages.dev` 这类「通用入口」域可能强制 proxy 并不让 Pages 的 SSL 验证逻辑识别。**修复**：把 CNAME content 改为 deploy 命令输出里的 project-specific subdomain `trove-7vp.pages.dev`（每个 project 自动分配一个 `<name>-<random>`），重新加 domain → SSL 立即变 active。**沉淀**：cloudflare module Pages 章节加「坑 2」专节，强调 custom domain 必须用 project-specific subdomain 而非通用 `.pages.dev`。**意义**：这是 Trove 上线过程里最隐蔽的一个坑——错误信息「CNAME record not set」明显误导（真问题是「指向的 target 不对」）。固化进 skill 后，下个 AI 部署 Pages 自定义域 5 秒内绕过。
- **send.roboz.dev verified（Trove 跨 module 第二次实战 + 首次 cross-vendor 协作）**：人类一句「ok 了」（贴 Resend admin key），AI 端到端 90 秒打通 Resend 域名验证：(1) `pbpaste` 入 admin key 到 credentials.json（与 sending key 共存）→ (2) verify admin key 可调 `GET /domains` → (3) `POST /domains {name: send.roboz.dev}` → (4) 拿 3 条 DNS records → (5) 用 cloudflare module 凭证 `POST /zones/{zid}/dns_records` 写入（DKIM TXT + SPF MX + SPF TXT 三条）→ (6) 等 90s propagation → (7) `POST /domains/{id}/verify` → (8) 状态 verified ✓ → (9) 改默认 `RESEND_FROM_EMAIL = hello@send.roboz.dev` → (10) 测试 send 到 mzcaogo@gmail.com 验证全链。**意外发现**：Resend 返回的 SPF 记录 `name: "send.send"`（看着像有 bug 的双 prefix），实际是设计——Resend 用 `send.<subdomain>` 作 SPF sub-subdomain 隔离（与 SendGrid `em<id>.<domain>` 同套路）。**别"修"**，按原样写入即可 verify。**修复**：resend module 加「Naming convention surprise」专节固化这个反直觉点；frontmatter credentials 加 `RESEND_ADMIN_KEY` 可选字段；Domains 章节贴出真实 verified record shape 当 reference。**意义**：跨 Resend + Cloudflare 双供应商、admin 与 sending 双 key 分层、5 个 API 自动协作 ——**这是 Trove「人一句话调度多服务」愿景最完整的现实证据**。

（后续 dogfood 发现的案例追加在此节，按倒序）

---

## 11. v0.1 实现优先级

**今天就能用**（已经做完）：
- `~/.trove/` 目录约定
- 5 个 module 格式（已有 minimax、cloudflare）
- 任意项目 CLAUDE.md 加 `@绝对路径` 引用即用
- AI 自取凭证、自更新 CLAUDE.md

**第一周**：
- 再补 3 个 module（anthropic / openai / supabase）凑齐 v0.1 高频包
- 在多个下游项目真实 dogfood，记录 skill.md 哪里写漏了
- 写 `trove validate` ~30 行，校验 frontmatter 完整性

**第一个月**（核心产品）：
- **Web UI 三视图**（Modules 列表 / 详情编辑器 / AI Authoring）
- **AI Authoring 之 From URL 跑通**——一个真实 url 输入能产出可用的 module 草稿
- 文档站 + 公开开源

**第二/三个月**：
- AI Authoring 三入口 + Refinement loop 全跑通
- Web UI Marketplace（v0.2）
- launch 博客 + awesome-claude-code PR
