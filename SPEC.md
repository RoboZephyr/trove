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

- **v0.1**：明文 + 文件权限 600 + `.gitignore` 规则 `**/credentials.json`
- **v0.2**：可选 macOS Keychain / Windows Credential Manager backend

---

## 3. AI 怎么用 Trove（runtime 行为）

**没有 inject 步骤、没有自定义语法、没有跨 agent 适配器**。AI 直接 `Read` 文件。

### 项目里引用 module 的两种方式

**方式 A（声明式，Claude Code 原生）**：在 `CLAUDE.md` 里写绝对路径：
```markdown
## Services
@/Users/zephyr/.trove/minimax/module.md
@/Users/zephyr/.trove/cloudflare/module.md
```
Claude Code 启动时自动加载这些文件到 context。Cursor / Codex 同理走它们的 `@-reference` 语法。

**方式 B（约定式）**：CLAUDE.md 只声明依赖：
```markdown
## Services
This project uses Trove modules: minimax, cloudflare
```
AI 看到这段，知道去 `~/.trove/minimax/` 和 `~/.trove/cloudflare/` 主动读。**这种方式更省 token**，因为不会一开始就把全部 skill 灌进 context，AI 按需 Read。

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
   - 左：根据 frontmatter `credentials` 自动生成的表单（编辑凭证值）
   - 右：skill 正文 markdown 编辑器（实时 preview）
   - 底部：「Install MCP」「Test connection」「Add to current project」三个动作按钮
3. **AI Authoring**（核心差异化，§5）

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

## 10. v0.1 实现优先级

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
