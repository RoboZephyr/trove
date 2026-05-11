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

mcp:                          # 可选
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
- 推荐：`category` / `description` / `applies_to`
- 可选：`homepage` / `tags` / `credentials` / `mcp`

**字段类型**（用在 credentials 里）：`text` / `password` / `url` / `select` / `boolean` / `number` / `multiline`

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

例如 `github-robozephyr` module 的所有 identity 字段都是公开信息且有 default，credentials.json 只需 `{}` 或不存在。

- **v0.1**：明文 + 文件权限 600 + `.gitignore` 规则 `**/credentials.json`
- **v0.2**：可选 macOS Keychain / Windows Credential Manager backend

**录入方式**：
- **首选 Web UI**（`trove ui` → Configure 按钮）—— 字段自动校验、AI 引导式录入、test connection 一键验证。**这是 v0.2 的一等公民流程**，CLI 直接编辑文件是 fallback
- **CLI fallback**（`$EDITOR ~/.trove/<svc>/credentials.json`）—— 急用、无 Web UI 启动时使用。但承担明文暴露在终端历史、截屏、远程协作时同事看到的风险
- **绝不**：在 shell 里 `echo "KEY=xxx" > file`（命令历史里就是明文）

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
@/Users/zephyr/.trove/github-robozephyr/module.md
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

**From .env**：粘贴 .env 内容 → AI 按服务名识别分组（`STRIPE_*` / `OPENAI_*` 各自一个 module）→ 自动尝试拉文档补 skill → 批量生成 module 骨架。**这是从 `.personal-data/` 迁移的真正方式。**

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

详见 `examples/minimax/`：
- `module.md`：5 个子 API（T2I / T2V / music / TTS / LLM）合并到一个 module
- `credentials.example.json`：占位模板

**最小项目接入**（在任意项目的 `CLAUDE.md`）：
```markdown
@/Users/zephyr/.trove/minimax/module.md
```
就这一行。AI 看到 module 的 frontmatter，知道凭证在 `~/.trove/minimax/credentials.json`，需要时自取。

---

## 7. Migration（从 `.personal-data/` 迁移）

**手工方式**（v0.1 启动期）：
1. `mkdir ~/.trove`
2. 按服务建子目录
3. 把 `.personal-data/credentials/idea-business.env` 中各服务的 env 行拆到对应 `<svc>/credentials.json`
4. 把 `.personal-data/credentials/idea-business-api-guide.md` 各 H2 章节抽到对应 `<svc>/module.md`，加 frontmatter
5. 删除（或保留）原 `.personal-data` 文件

**AI 辅助方式**（一旦 §5 Web UI + AI Authoring 跑通）：在 web UI「From .env」里粘 `idea-business.env` 内容 → AI 自动批量生成 modules 骨架 → 用户审稿。**完全没必要写 `migrate-from-personal-data` 命令**，从 web UI 走更顺。

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

- **"Trove module ≠ service-with-API-key" — 装 module 的判据是「你这周内会填凭证去调它」而不是「example 目录有它」**：今晚批量集成尾声把 Tier A 的 anthropic / fal-ai / supabase example 也"顺手装到" `~/.trove/`，credentials.json 空着等用户后填——**这一步是错的**。理由：(1) anthropic：用户用 Claude Code（claude.ai 登录认证，`~/.claude.json` 根本没 api_key 字段），也没在写直连 Anthropic SDK 的项目。module 自己的 description 还写着「default LLM provider for Trove's AI Authoring feature」——AI Authoring 已按 design-v0.2 **dropped** 了。double-stale。(2) fal-ai：`.personal-data/` 完全没 fal key，用户从未 onboard。(3) supabase：用户使用模式是 supabase-mcp（MCP server），example 却是 API-first（要 5 个字段：URL / anon / service_role / project_ref / db_password），shape 错位。**修复**：把这 3 个从 `~/.trove/` 卸载，repo 的 `examples/` 保留（别人可能用 API-direct 方式）。**衍生原则**：Trove module 至少有 5 种形态——纯身份配置（github-*，全 default 无 secret）/ CLI-shape（lark via lark-cli）/ MCP-shape（supabase 未来该这样写：frontmatter 主要描述 MCP server 配置而非 API field）/ API-shape（多数）/ 混合（cloudflare：API token + wrangler CLI）。**install 时机判据**：「你这周内是否会真的填凭证去用」，否则 example 目录就是它的位置。**衍生 SPEC 工作**：supabase / 任何「主要用 MCP 而非直接 API」的服务，需要正式的 MCP-shape module 模板——和 lark 的 CLI-shape 模板平行。
- **9 个新 module 单晚集成 + Trove 首次"大批量 module 制造"压力测试**：今晚从 `.personal-data/` 把 serper / tavily / brave / kling / qwen / stripe / google-analytics / google-search-console / google-ads 这 9 个服务一次性集成进 Trove + 装到 `~/.trove/` + 填真凭证 + 端到端 smoke。**meta-validation**：有了 v0.2 Web UI scaffold + 一个高质量 module（openrouter）作 reference 之后，"加一个 module" 的边际成本几乎完全是 "research 这个 API 的 gotchas + 写 skill"，Trove 自己的机制（frontmatter / credentials.json / install flow）几乎没产生摩擦。**衍生**：批量生产 module 的真瓶颈是 skill 质量（gotchas 是否真的从 dogfood 沉淀而来 vs 从训练数据生成），不是 Trove 的格式开销。9 个里 6 个用真实 API 调用完整端到端验证（serper / tavily / brave / qwen / GA4 / GSC），3 个只验证了凭证抽取 + 不烧 quota 的 auth 校验（kling 用 401 vs 400 判断 JWT 签名有效、stripe 用 GET /customers 验证 rk_live_ 有读权限、Ads 跳过仅靠 skill 派生自用户已生产的 growth 项目代码）。
- **SPEC §1 文件型凭证压力测试 + 临时方案**：google-analytics / google-search-console 共用同一份 Google Cloud service-account JSON（~2.5KB）。**问题**：SPEC §1 严格规定模块目录只能有 `module.md` + `credentials.json` 两个字面量文件，但 service account 凭证天生是文件形态。**临时方案 (v0.1.x)**：把 JSON 用 `JSON.stringify` 内联为 credentials.json 里的 multiline 字段（jq -c 一键产出），skill body 教 AI 怎么 `JSON.parse` 出来再传给 SDK。代价是同份 2.5KB JSON 在两个模块各存一份（轮换时改两处）。**SPEC v0.2 待回答**：是否引入 `type: file`（值是路径）或者跨模块凭证引用（如 `credentials_ref: google-cloud-auth` 表示从另一模块继承）。**先记一笔**，等第 N 次跨模块共享凭证时再决定 SPEC 演化路径。
- **YAML frontmatter 隐藏陷阱：以 `"quoted phrase"` 开头的 list 项后接 `— continuation` 会 parse fail**：写 tavily / brave 的 `applies_to:` 时各自被 `trove validate` 抓到一次。YAML 1.2 规范里，引号闭合后这一行剩余文本必须是空白 / 注释 / EOL，不能再续接 scalar。**修复**：所有 list item 要么完全不引号，要么整行包在引号里；不要"前缀引号 + 后续无引号续接"。**衍生原则**：trove-validate 必须在 module 写入 `~/.trove/` 之前作为强制 gate ——这次连续 2 次救援证明它的存在价值。**写进 §2.1 frontmatter 章节**：list scalar 续接规则的反例。
- **三大搜索 API 的 auth header 都不一样，且都不是 OpenAI 派**：serper = `X-API-KEY`，tavily = `Authorization: Bearer`，brave = `X-Subscription-Token`。**这是 #1 的 401 来源**——任何在 LLM 调用代码上"复制粘贴改改"的人都会踩。三个 module 的 Critical Constraints 各自把这条作为第一条提醒。**意义**：印证 SPEC §2.1 "skill 必须以 gotchas/反例开头" 的约定——同一类别的服务（都是搜索 API）有看起来微妙、实际致命的差异，必须前置消化。
- **Trove 首跑：两个状态显示 bug 被实地用户立刻抓出来**：scaffold 用 Bun + Hono + HTMX + Tailwind CDN，~700 LOC。在已装 6 个 module 的 `~/.trove/` 上跑起来当场暴露两个 UI bug：① **「全 default」module 被误判为 `credentials missing`**——github-a404coder / github-robozephyr 所有字段都有 `default:`，credentials.json 是 `{}`，按 SPEC §2.2 是 valid 状态，UI 却显示红色 missing。**根因**：状态计算函数提前 `if (present.length === 0) return "missing"`，没区分「required 集合为空」和「required 都没填」。**修复**：先 `if (requiredKeys.length === 0) return "complete"`，再做填值对比。② **HTMX 局部 swap 漏掉 header badge**：填完凭证 Save 后表单原地 swap ✓，但页面 header 的红色 `credentials missing` 不变——PATCH 只返回 form 片段，badge 在 swap 范围外，用户的直觉反应是「没保存」。**修复**：HTMX OOB（out-of-band）—— 同一响应附带 `<span id="cred-badge" hx-swap-oob="true">` 片段，HTMX 自动找 id 替换。一处保存、多处同步、零额外 round-trip。**衍生原则**：**HTMX 局部 swap 必须列举所有依赖该状态的 UI 节点**，不在主 target 内的用 OOB 覆盖——这是 HTMX-heavy SSR 架构（v0.2 选型）的最高频陷阱，必须当一等公民习惯而不是 bug 修。**意义**：UI 上线 30 分钟内被真实用户抓到两个状态显示 bug，**正好证明 SPEC §10 的「dogfood-driven 是 SPEC 修订唯一可信来源」原则**——任何 spec/design doc 都预测不到 `present.length === 0` 和 `requiredKeys.length === 0` 的语义重叠盲区。
- **首次「纯 Web UI → 真实 API 调用」端到端跑通（openrouter）**：用户从未编辑过 credentials.json，纯通过 Web UI 表单填 `OPENROUTER_API_KEY` → UI 写盘 `~/.trove/openrouter/credentials.json`（600 权限）→ 按 module skill 推荐方式 `jq -r .OPENROUTER_API_KEY` 抽 key → POST `https://openrouter.ai/api/v1/chat/completions` → `claude-haiku-4-5` 返回 `trove dogfood smoke test ok`，费用 $0.000074。**全程零文件系统操作、零命令行操作、零凭证字面值露出**。配合首次走通的 Install flow（Examples gallery → Install → 拷 `examples/openrouter/module.md` 到 `~/.trove/openrouter/` → 跳转详情页 → 填表 → API 工作），验证了 v0.2 设计文档「四 screen 闭环：Modules grid / Module 详情 / Credentials 表单 / Examples gallery」是完整产品流。**意义**：这是设计文档「Web UI 是凭证录入的一等公民、`$EDITOR` 是 fallback」核心假设的**最强实战证据**——一个曾经的「手工 mkdir + vim credentials.json」流程被压缩成「点 Install、填表、Save」三步。一旦这条路顺滑到可推荐给非开发者，Trove 就不再只是 AI agent 的工具，而是任何「想管 API key 但不想碰文件系统」的人的资源中心。**衍生开放问题**：跨设备同步策略（用户多台机器各自填一遍？还是同步 `~/.trove/`？）——v0.3 之前先继续靠 git remote 手动同步，等真有第二台机器需求再说。

### 2026-05-11

- `trove validate --all` 报 `github-*` module credentials.json「缺字段」，但那些字段在 frontmatter 有 `default:`。**问题**：SPEC 未明确「带 default / 标 required: false 的字段是否必须在 credentials.json 重申」。**修复**：SPEC §2.2 加「哪些字段必须出现」规则；validate 逻辑跳过有 default 的字段。
- `trove validate --examples` 报 `examples/*` 没 credentials.json。**问题**：例子目录用 `credentials.example.json` 占位避免真凭证入库，但 SPEC 没说 validate 在 examples 场景下该接受 `.example.json` 作为 schema 验证源。**修复**：validate 找不到 credentials.json 时回落到 credentials.example.json；SPEC 默认接受这个 fallback。
- **首次「AI is the runtime」实战 validation**：classics-learning 项目里另一个 Claude session 实现 `/api/advise` 顶端 LLM 代理，**自然地**用 `jq -r .MINIMAX_API_KEY ~/.trove/minimax/credentials.json` 抽值塞 `.dev.vars`——没 hallucinate `process.env`，没要求预先 export。**这是产品核心假设的第一次实战证实**。**衍生发现**：边缘运行时（CF Pages / Workers / Vercel / Fly）不能在 request time 读 `~/.trove/`，需要「Trove → 平台 secrets」桥接模式（local 写 `.dev.vars`、prod `jq | wrangler secret put` 管道）。**修复**：cloudflare module 加「Bridging Trove credentials → CF Pages / Workers secrets」专节，把这个 canonical 桥接固化到 skill。
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
- 在 classics-learning + idea-business 真实 dogfood，记录 skill.md 哪里写漏了
- 写 `trove validate` ~30 行，校验 frontmatter 完整性

**第一个月**（核心产品）：
- **Web UI 三视图**（Modules 列表 / 详情编辑器 / AI Authoring）
- **AI Authoring 之 From URL 跑通**——一个真实 url 输入能产出可用的 module 草稿
- 文档站 + 公开开源

**第二/三个月**：
- AI Authoring 三入口 + Refinement loop 全跑通
- Web UI Marketplace（v0.2）
- launch 博客 + awesome-claude-code PR
