---
author: Duang
pubDatetime: 2026-09-29T15:00:00+08:00
title: AGENTS.md 与 Vibe Coding 调研报告
featured: true
draft: false
tags:
  - thinking
description: AGENTS.md 要短、要人工写、只放 agent 猜不到的东西。从零做项目先写 spec，每次一小步，每步可测再 commit。
revisions:
  - date: 2026-09-29
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> 核心结论：AGENTS.md 要短、要人工写、只放 agent 自己猜不到的东西（命令、坑、边界），以后按 agent 犯的错逐步补充；从零做项目时先写 spec 再出计划，每次只让 agent 做一小步，每一步都要有它能自己跑的测试，然后 git commit。

2026-09 · 深度调研

## AGENTS.md 编写 & 从零开始的 Vibe/Agentic Coding：前沿实践摘要

> 调研日期：2026-09-29。所有结论都附有来源链接（见文末来源列表）。标注为“个人建议”的内容是综合后的判断，没有单一来源。

## 一句话结论

**AGENTS.md 要短、要人工写、只放 agent 自己猜不到的东西（命令、坑、边界），以后按 agent 犯的错逐步补充；从零做项目时先写 spec 再出计划，每次只让 agent 做一小步，每一步都要有它能自己跑的测试，然后 git commit。**

上下文窗口是最稀缺的资源，所有技巧基本都是在管理它。([Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices)、[ETH 研究](https://arxiv.org/abs/2602.11988))

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：短文件，小步，可验证</p>
  <p class="article-embed-note-lead">只写 agent 猜不到的。从零先 spec，再计划，每次一小步，每步能自己跑测试，然后 commit。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 220" role="img" aria-label="AGENTS.md 短文件，spec 计划 小步 测试 commit"><text class="perf-label" x="8" y="36">写什么</text><rect class="perf-hbar" x="148" y="20" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="36">命令、坑、边界；agent 猜不到的</text><text class="perf-label" x="8" y="76">不写</text><rect class="perf-hbar" x="148" y="60" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="76">读代码就知道的、空话、整本风格指南</text><text class="perf-label" x="8" y="116">演进</text><rect class="perf-hbar" x="148" y="100" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="116">重复犯错才加；必须执行的改 hook</text><text class="perf-label" x="8" y="156">从零</text><rect class="perf-hbar" x="148" y="140" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="156">spec，计划，一小步，可测，commit</text><text class="perf-label is-tail" x="8" y="196">稀缺</text><rect class="perf-hbar is-tail" x="148" y="180" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="196">上下文窗口；所有技巧都在管理它</text></svg>
  </figure>
  <p class="article-embed-note-foot">上下文窗口是最稀缺的资源。</p>
</section>

<details class="marginalia" open>
  <summary>上下文</summary>
  <div class="marginalia-body">
    上下文窗口是最稀缺的资源，所有技巧基本都是在管理它。
  </div>
</details>

---

## 一、AGENTS.md（及 CLAUDE.md / .cursor/rules / copilot-instructions）

### 1. 这些文件是什么、谁会读

- AGENTS.md 是“写给 agent 的 README”，就是普通 Markdown，没有必填字段；目前由 Linux Foundation 旗下的 Agentic AI Foundation 维护，Codex、Cursor、Jules、Gemini CLI、Aider 等工具都支持。([agents.md](https://agents.md/))
- **离当前文件最近的 AGENTS.md 优先；用户在聊天里的明确指令优先级最高。** 大型 monorepo 可以在子目录里嵌套 AGENTS.md（OpenAI 主仓库里有 88 个）。([agents.md](https://agents.md/))
- Codex 会从 git 根目录一直拼接到当前目录，默认合并后上限 32 KiB，超出就截断；还支持 `~/.codex/AGENTS.md` 全局配置和 `AGENTS.override.md`。([Codex AGENTS.md 指南](https://developers.openai.com/codex/guides/agents-md))
- Copilot 支持三种文件：`.github/copilot-instructions.md`、`.github/instructions/*.instructions.md`（通过 `applyTo` glob 限定路径）、AGENTS.md（也可以用根目录下的单个 CLAUDE.md/GEMINI.md）。([GitHub Docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions))
- Cursor 的 `.cursor/rules/*.mdc` 通过 frontmatter（`alwaysApply` / `globs` / `description`）决定何时加载；另外也支持根目录和嵌套的 AGENTS.md。([Cursor Rules 文档](https://cursor.com/docs/context/rules))
- CLAUDE.md 每次会话都会加载，可以用 `@path` 引入其他文件。([Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices))
- 个人建议：以 AGENTS.md 作为唯一的“真相源”，其他工具的文件用软链接或一行引用指向它，避免多份内容不一致。agents.md 官网在迁移场景下也演示了用软链接的做法。([agents.md](https://agents.md/))

### 2. 应该写什么（检查清单）

- [ ] 命令放在最前面：安装、dev、build、test、lint、typecheck，带上具体参数，最好注明怎么“跑单个测试”。(GitHub Blog、Claude Code)

- [ ] 技术栈写清版本：比如写“React 18 + TypeScript + Vite + Tailwind”，不要只写“React 项目”。(GitHub Blog)

- [ ] 项目地图 + WHY/WHAT/HOW：说明各目录/包分别是做什么的、项目的目的、agent 怎样验证自己的改动。(HumanLayer、Codex 最佳实践)

- [ ] “完成”的定义：交付前必须通过哪些检查。(Codex 最佳实践)

- [ ] 三级边界：✅ 可以直接做 / ⚠️ 先问（schema、新依赖、CI）/ 🚫 禁止（提交密钥、改 vendor 或生产配置）。“永远不要提交密钥”是最常见也最有用的约束。(GitHub Blog)

- [ ] git/PR 规范，以及非显而易见的坑（必需的环境变量、奇怪的构建步骤）。(Claude Code)

- [ ] 与默认习惯不同的风格规则，用指向规范示例文件的引用代替粘贴代码。(Cursor Rules、HumanLayer)

### 3. 不要写什么

- agent 读代码就能知道的东西、语言通用规范、逐文件的说明、经常变化的信息、长篇教程、“写干净的代码”这类空话。([Claude Code](https://code.claude.com/docs/en/best-practices))
- 整本风格指南：交给 linter/formatter，或用 hook 强制执行。“不要让 LLM 干 linter 的活”。([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)、[Cursor Rules](https://cursor.com/docs/context/rules))
- 很少用到的边缘情况：这类只在部分任务里需要的知识放到 Skills（`SKILL.md`）或 `agent_docs/*.md`，在主文件里列个索引，需要时再加载（渐进式披露）。([Claude Code](https://code.claude.com/docs/en/best-practices)、[HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))

### 4. 长度

各来源没有统一数字，但方向一致，都要求越短越好：HumanLayer 建议少于 300 行，他们自己的根文件不到 60 行 ([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md))；Cursor 规定单条规则少于 500 行 ([Cursor Rules](https://cursor.com/docs/context/rules))；Copilot 官方的生成提示词要求“不超过 2 页”([GitHub Docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions))。Claude 给的判断标准是：**逐行问自己“删掉这行 Claude 会不会犯错？”，不会就删**；文件太长时规则会被淹没、被忽略。([Claude Code](https://code.claude.com/docs/en/best-practices))

### 5. 如何演进

- 先从最小版本开始，**只有看到 agent 重复犯同一个错时才加规则**。([Cursor Blog](https://cursor.com/blog/agent-best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))
- Codex 连续两次犯同样的错时，让它做一次复盘，再更新 AGENTS.md。([Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))
- 像对待代码一样对待它：提交到 git、定期精简、通过观察 agent 行为有没有变化来测试效果；某条规则总被忽略时，只给这一条加“IMPORTANT”。([Claude Code](https://code.claude.com/docs/en/best-practices))
- 必须 100% 执行的事改用 hook（确定性），不要只写在文件里（建议性）。([Claude Code](https://code.claude.com/docs/en/best-practices))

<details class="marginalia" open>
  <summary>规则</summary>
  <div class="marginalia-body">
    只有看到 agent 重复犯同一个错时才加规则。必须 100% 执行的事改用 hook。
  </div>
</details>

### 6. 示例模板（约 40 行）

```Markdown
# AGENTS.md

## 项目
个人记账 Web 应用。前端 `apps/web`（Next.js 15 + TS + Tailwind），
后端 `apps/api`（FastAPI + Python 3.12 + PostgreSQL 16）。需求见 `docs/spec.md`。

## 命令（改完代码必须跑）
- 安装：`pnpm install && uv sync --project apps/api`
- 前端：`pnpm --filter web dev` / `pnpm --filter web test -- <file>`
- 后端：`uv run --project apps/api pytest -x tests/<file>.py`
- 检查：`pnpm lint && pnpm typecheck && uv run ruff check apps/api`

## 完成的定义
- 相关测试 + lint + typecheck 全部通过，并在回复里贴出命令输出
- 新功能附带测试；不允许删除或跳过失败的测试

## 约定（只写与默认不同的）
- API 响应统一用 `apps/api/app/schemas.py` 中的 Pydantic 模型
- 新组件参照 `apps/web/components/TransactionList.tsx` 的结构
- 数据库变更只通过 Alembic 迁移

## Git
- 小步提交；消息格式 `feat(web): ...` / `fix(api): ...`
- 在 feature 分支上工作，不直接改 main

## 边界
- ✅ 可直接做：修改 `apps/**`、`tests/**`，运行上述命令
- ⚠️ 先问：新增生产依赖、修改 DB schema、修改 CI、`.env.example`
- 🚫 禁止：提交密钥或 `.env`、修改 `vendor/` 和生成文件

## 更多文档（按需阅读）
- `docs/architecture.md`：模块关系与数据流
- `docs/testing.md`：测试数据与 fixture 说明
```

---

## 二、从零开始的 vibe/agentic coding 工作流

1. **先定目标：玩具项目还是要维护的项目。** 纯靠提示词、不看代码的“vibe coding”适合低风险的小工具；要长期维护的项目应该做“vibe engineering / agentic engineering”，由人对质量负责。([Simon Willison](https://simonwillison.net/2025/Oct/7/vibe-engineering/))
2. **让 AI 反过来问你，产出 `spec.md`。** Harper Reed 的提示词是“一次只问一个问题”，逐步收敛成开发者可以直接使用的规格（需求、架构、数据、错误处理、测试计划）([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/))；Claude Code 建议用 AskUserQuestion 做访谈后写 SPEC.md，好的 spec 要写明涉及的文件和接口、不做什么、端到端的验证步骤。([Claude Code](https://code.claude.com/docs/en/best-practices)) Addy Osmani 把这一步称为“15 分钟的瀑布”。([Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))
3. **把 spec 拆成计划和 todo。** 用推理模型把计划拆成“小到足以安全实现、又大到能推进项目”的步骤，每一步都要接回已有代码，不留孤立代码；保存为 `prompt_plan.md` + `todo.md`，用来跨会话保存状态。([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/)) 也可以用工具自带的 Plan Mode（Shift+Tab）：让它提问，出计划，你修改后再执行；Cursor 可以把计划存到 `.cursor/plans/`。([Cursor Blog](https://cursor.com/blog/agent-best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))
4. **脚手架由你掌控。** 语言、框架、工具链自己先搭好（`uv init`、`cargo init` 等），否则模型容易默认输出它最常见的技术栈。([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/)) 同一时间 `git init`，配好 lint/format/typecheck/测试/CI，再写第一版 AGENTS.md（只写命令和边界）。([Simon Willison](https://simonwillison.net/2025/Oct/7/vibe-engineering/)、[Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))
5. **一次一步，每一步都要可验证。** 每条提示词包含：目标、上下文、约束、完成标准。([Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices)) 给 agent 一个能返回通过/失败的检查（测试、构建、截图对比），让它自己循环修到通过，并贴出证据。([Claude Code](https://code.claude.com/docs/en/best-practices)) TDD 很适合 agent：先写测试，确认它失败，提交；再实现，并要求 agent 不许改测试。([Cursor Blog](https://cursor.com/blog/agent-best-practices))
6. **每步完成后跑测试、看 diff，然后 commit。** 把 commit 当作游戏存档，出问题就回滚。**不要提交自己解释不了的代码。** ([Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/)) Claude 的 checkpoint 不能替代 git。([Claude Code](https://code.claude.com/docs/en/best-practices))
7. **主动管理上下文。** 一个会话对应一个连贯的工作单元，换任务就 `/clear` 或开新对话；同一问题纠正两次还不对，就清空上下文，用更好的提示词重来。([Claude Code](https://code.claude.com/docs/en/best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices)) 做出来的东西不符合预期时，回滚代码、改计划、重新执行，通常比在原会话里修补更快。([Cursor Blog](https://cursor.com/blog/agent-best-practices)) 大范围的代码调研交给 subagent，免得污染主上下文。([Claude Code](https://code.claude.com/docs/en/best-practices))
8. **审查：让新会话或其他模型来 review。** Writer/Reviewer 双会话或 subagent 对照 PLAN.md 审 diff，但只追与正确性相关的问题，避免过度工程。([Claude Code](https://code.claude.com/docs/en/best-practices)、[Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))
9. **熟练后再并行。** 用 git worktree 隔离多个 agent，或让多个模型同时做同一题、择优选用。([Cursor Blog](https://cursor.com/blog/agent-best-practices)、[Claude Code](https://code.claude.com/docs/en/best-practices))
10. **把重复的流程固化。** 同一提示词反复使用就做成 skill 或 slash command；流程稳定后再考虑定时任务。([Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices)、[Cursor Blog](https://cursor.com/blog/agent-best-practices)) AGENTS.md 同步按第一部分第 5 节的方式演进。

---

## 三、怎么和 coding agent 对话：可直接复制的提示词

> 标注说明：**【引用】** 表示来源原文（英文原样保留，附中文意译）；**【改编】** 是我根据来源整理的中文模板，不是原文。`<...>` 表示需要替换的内容。命令名以 Claude Code / Codex / Cursor 为例，其他工具有对应功能即可。

### 3.1 让 agent 自己写和维护 AGENTS.md

**① 先用 `/init` 生成，马上精简**（新仓库第一次接入 agent 时用）【改编】  
依据：Claude 和 Codex 都建议先 `/init` 再人工修改 ([Claude Code](https://code.claude.com/docs/en/best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))；判断标准是“删掉会不会犯错”([Claude Code](https://code.claude.com/docs/en/best-practices))；Copilot 官方的生成提示词要求把每条命令实际跑一遍 ([GitHub Docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions))；ETH 研究发现 LLM 生成的文件会拉低效果 ([ETH](https://arxiv.org/abs/2602.11988))。

```Plaintext
/init
（生成后接着发：）
逐行审查刚生成的 AGENTS.md。对每一行问自己：“删掉它，你在这个仓库里会不会犯错？”
删掉：读代码/README/配置就能知道的内容、通用语言规范、逐文件的说明、经常变化的信息、空泛原则。
保留：你猜不到的命令（带完整参数）、“完成”的定义、边界（可以做/先问/禁止）、不明显的坑。
把保留的每条命令都实际运行一遍，跑不通的标出来。目标是 60 行以内。先给我看 diff，我确认后再写入。
```

**② 让 agent 采访你，补上读代码得不到的信息**（仓库里有很多口头约定时用）【改编】  
依据：Claude 的“采访我”模式 ([Claude Code](https://code.claude.com/docs/en/best-practices))、Harper Reed 的“一次只问一个问题”([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/))。

```Plaintext
我要完善这个仓库的 AGENTS.md。请先自己读仓库，然后采访我，一次只问一个问题，
只问读代码回答不了的：哪些目录/文件不能碰、哪些操作必须先问我、部署和密钥怎么管理、
团队的 git/PR 习惯、曾经踩过的坑。问完后把答案整理成简短的条目合并进 AGENTS.md，并给我看 diff。
```

**③ 同一个错误出现两次后，补一条规则**【改编】  
依据：Codex 文档写的是“When Codex makes the same mistake twice, ask it for a retrospective and update AGENTS.md.”([Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))；Cursor 也建议只在重复犯错时才加规则 ([Cursor Blog](https://cursor.com/blog/agent-best-practices))。

```Plaintext
你已经第二次 <具体错误，例如：用 npm 而不是 pnpm 安装依赖>。先做一次简短复盘：为什么会这样？
缺了什么信息？然后在 AGENTS.md 最合适的位置加一条可执行的规则（一行，写清正确做法）。
如果这件事可以用 lint/hook/脚本强制执行，就建议那种做法，不要只加文字。
```

**④ 定期精简**（每隔几周或 AGENTS.md 变长时用）【改编】  
依据：“If Claude already does something correctly without the instruction, delete it or convert it to a hook.”([Claude Code](https://code.claude.com/docs/en/best-practices))；Claude Code 也可以用 `/doctor` 让它提议删减 ([Claude Code](https://code.claude.com/docs/en/best-practices))。

```Plaintext
审查 AGENTS.md。对每条规则判断：a) 没有它你也会做对 → 删除；b) 必须 100% 遵守 → 建议改成 hook/lint/CI；
c) 只在少数任务里用到 → 移到 docs/ 或 skill 里，主文件只留一行指针；d) 与代码现状冲突或已过时 → 更新。
以表格列出建议，不要直接修改。
```

### 3.2 从零开始的项目：完整交互循环

**⑤ spec 访谈**（一个想法刚冒出来时用，可以在普通聊天模型里做）  
【引用】Harper Reed 原文 ([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/))：

```Plaintext
Ask me one question at a time so we can develop a thorough, step-by-step spec for this idea. Each question should build on my previous answers, and our end goal is to have a detailed specification I can hand off to a developer. Let's do this iteratively and dig into every relevant detail. Remember, only one question at a time.

Here's the idea:

<IDEA>
```

【改编·中文版】

```Plaintext
一次只问我一个问题，帮我把下面的想法逐步完善成一份详细的规格说明。每个问题都要建立在我之前的回答上，
最终目标是一份可以直接交给开发者的 spec。深挖每一个相关细节，记住：一次只问一个问题。
想法：<IDEA>
```

访谈结束后【改编自 Harper Reed 的收尾提示词】：

```Plaintext
头脑风暴结束了。把我们的讨论整理成一份开发者可以直接使用的 spec.md：需求、架构选择、数据处理、
错误处理策略、测试计划；另外写明“不做什么”，以及一个能证明功能可用的端到端验证步骤。
```

（最后两项来自 Claude 对好 spec 的要求 ([Claude Code](https://code.claude.com/docs/en/best-practices))。）Claude 的版本【引用】：“I want to build [brief description]. Interview me in detail using the AskUserQuestion tool. … Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.”写完 spec 后**开一个新会话去实现** ([Claude Code](https://code.claude.com/docs/en/best-practices))。

**⑥ spec、计划、todo**（有了 spec.md 以后用）【改编自 Harper Reed 的规划提示词】([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/))

```Plaintext
阅读 @spec.md。先起草一份详细的分步蓝图，再拆成相互衔接的小块；然后再拆一轮，
让每一步小到可以配合完善的测试安全实现，同时大到能推进项目。每一步都要接回已有代码，不留孤立代码。
输出 plan.md（每一步写成一段可以直接交给 coding agent 的提示词，按测试驱动写），
再输出一份详尽的 todo.md 清单。先不要写任何实现代码。
```

进阶做法【改编】：Anthropic 在长任务实验中让 agent 把需求写成 JSON 功能清单，每项初始为 `"passes": false`，只允许修改这个字段，原因是模型比较不容易乱改 JSON ([Anthropic 长任务](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))。

**⑦ Plan Mode：先探索再动手**（涉及多个文件、方案不确定、代码不熟时用；能用一句话描述 diff 的小改动就跳过）([Claude Code](https://code.claude.com/docs/en/best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))  
先按 Shift+Tab（Codex 里也可以用 `/plan`）进入计划模式，再发送：  
【改编】

```Plaintext
先只读不改：阅读 <目录/文件>，弄清 <相关机制> 现在是怎么实现的。
然后针对 plan.md 的第 N 步给出实现计划：要改哪些文件、数据流怎么走、有哪些风险，
以及你用什么命令验证。有不清楚的地方先问我。
```

计划可以直接编辑（Claude 按 Ctrl+G；Cursor 可以把计划存到 `.cursor/plans/`）([Claude Code](https://code.claude.com/docs/en/best-practices)、[Cursor Blog](https://cursor.com/blog/agent-best-practices))。

**⑧ 单步实现：目标 / 上下文 / 约束 / 完成标准**（每一步都用）  
依据：Codex 建议提示词包含 Goal、Context、Constraints、Done when ([Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))；Claude 的示例【引用】：“implement the OAuth flow from your plan. write tests for the callback handler, run the test suite and fix any failures.”([Claude Code](https://code.claude.com/docs/en/best-practices))  
【改编】

```Plaintext
目标：实现 plan.md 第 N 步 —— <一句话>。
上下文：@<相关文件>；参照 @<现有同类实现> 的写法。
约束：只改与本步相关的文件；不新增依赖（需要的话先问我）；遵守 AGENTS.md。
完成标准：<具体行为>；为它写测试，运行 <测试命令> + lint + typecheck 直到全部通过，
在回复里贴出命令和输出作为证据；然后在 todo.md 里勾掉这一项。
```

**⑨ 要求验证和测试（TDD 版）**（逻辑明确、能写出输入/输出的功能适合用）  
依据：Cursor 的 TDD 流程（先写测试、确认失败、提交测试，再实现且不许改测试）([Cursor Blog](https://cursor.com/blog/agent-best-practices))；Claude 建议给出具体的测试用例，并要求“address the root cause, don't suppress the error”([Claude Code](https://code.claude.com/docs/en/best-practices))；Anthropic 实验中 agent 常在没有端到端测试的情况下就宣布完成，明确要求用浏览器像真实用户一样测试后效果显著改善 ([Anthropic 长任务](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))。  
【改编】

```Plaintext
我们用 TDD。第一步：只根据这些输入/输出写测试 —— <用例1>、<用例2>、<边界情况>。
不要写实现，也不要写 mock 实现。运行测试，确认它们失败，然后停下来等我确认。
（确认并提交后：）现在写实现让测试通过。不许修改测试。持续迭代直到全部通过；
如果遇到报错，修根因，不要压制错误。如果是 UI 功能，再用浏览器像真实用户一样走一遍并截图给我。
```

**⑩ 审查：用新的上下文**（每完成一个功能或提交 PR 前用）  
【引用】Claude ([Claude Code](https://code.claude.com/docs/en/best-practices))：

```Plaintext
Use a subagent to review the rate limiter diff against PLAN.md. Check that every requirement is implemented, the listed edge cases have tests, and nothing outside the task's scope changed. Report gaps, not style preferences.
```

【改编·中文版】

```Plaintext
用一个 subagent（或新会话）对照 plan.md 审查当前 diff：每条需求是否都已实现、列出的边界情况是否都有测试、
有没有超出本步范围的改动。只报告影响正确性或需求的问题，不报告风格偏好。
```

注意：审查者被要求找问题时，即使代码没问题也会报出一些，全部照改会导致过度工程 ([Claude Code](https://code.claude.com/docs/en/best-practices))。也可以换一个模型来审 ([Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))。

**⑪ 纠偏和重来**（发现方向不对时立即用）  
依据：随时按 Esc 打断，也可以说“Undo that”或用 `/rewind` 回退；**同一问题纠正两次还不对：`/clear`，用一个包含已学到信息的更好提示词重来** ([Claude Code](https://code.claude.com/docs/en/best-practices))；结果不符合预期时，回滚代码、改计划、重新执行，往往比继续修补更快 ([Cursor Blog](https://cursor.com/blog/agent-best-practices))；Simon Willison 认为差的初稿只是起点，可以直接说“Break that repetitive code out into a function”([Simon Willison 2025-03](https://simonwillison.net/2025/Mar/11/using-llms-for-code/))。  
【改编】

```Plaintext
停。方向不对：<具体哪里不对>。撤销刚才的改动（git checkout / 回到上一个 commit）。
正确的方向是 <…>，不要 <…>。先用三句话复述你的新方案，我确认后再动手。
```

**⑫ 清空上下文前的交接，和重启提示词**（切换任务、上下文快满或 agent 变笨时用）  
依据：换任务就 `/clear`，也可以用 `/compact Focus on the API changes` 按重点压缩，或在 CLAUDE.md 里写“When compacting, always preserve the full list of modified files and any test commands”([Claude Code](https://code.claude.com/docs/en/best-practices))；Anthropic 的长任务 agent 靠进度文件和 git 记录交接，每个会话开始先运行 `pwd`、读进度文件和 git log、选最高优先级的未完成项，并先跑一次基本测试 ([Anthropic 长任务](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))；新对话可以用 `@Chats` 引用旧对话，不必复制粘贴 ([Cursor Blog](https://cursor.com/blog/agent-best-practices))。  
收尾【改编】：

```Plaintext
准备结束本会话。请：1) 确认测试通过，环境没有留下半成品；2) 用描述清楚的提交信息 commit；
3) 更新 progress.md：本次完成了什么、改了哪些文件、有哪些已知问题、下一步做什么、验证用的命令。
```

重启【改编】：

```Plaintext
新会话。先了解现状再动手：运行 pwd；阅读 progress.md、todo.md 和 `git log --oneline -20`；
按 AGENTS.md 启动项目并跑一次冒烟测试，如果有东西坏了先修。
然后从 todo.md 里选优先级最高的未完成项，告诉我你打算怎么做，等我确认。
```

**⑬ 让 agent 解释（学习用）**（看不懂代码，或要合并自己解释不了的代码之前用）  
依据：像问资深工程师一样提问 ([Claude Code](https://code.claude.com/docs/en/best-practices))；不要提交自己解释不了的代码，看不懂就让它加注释或改写得更简单 ([Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))；做方案调研时可以让它列出选项，例如【引用】“what are options for HTTP libraries in Rust? Include usage examples”([Simon Willison 2025-03](https://simonwillison.net/2025/Mar/11/using-llms-for-code/))；Addy 的防幻觉句子【引用】：“If you are unsure about something or the codebase context is missing, ask for clarification rather than making up an answer.”([Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))  
【改编】

```Plaintext
先别写代码。解释你刚才的改动：数据从哪里来、经过哪些函数、为什么这样设计而不用 <替代方案>、
有哪些边界情况。用我这个 <全栈初学者> 能理解的方式讲，引用具体的 文件:行号。
不确定的地方直接说不确定，不要编造。
```

### 3.3 常见的提示词反模式

| 反模式 | 为什么不好 / 怎么改 | 来源 |
|-|-|-|
| 模糊指令，如“fix the login bug”“add tests for foo.py” | 写清现象、位置、“修好”的标准，并指向参照代码 | [Claude Code](https://code.claude.com/docs/en/best-practices)、[Cursor Blog](https://cursor.com/blog/agent-best-practices) |
| 厨房水槽会话：一个对话做多件事，甚至整个项目 | 一个会话只做一个连贯的工作单元，换任务就 `/clear` | [Claude Code](https://code.claude.com/docs/en/best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices) |
| 同一问题反复纠正 | 两次不行就清空上下文，用更好的提示词重来 | [Claude Code](https://code.claude.com/docs/en/best-practices) |
| 要求一次性写完整个应用 | 会在实现到一半时耗尽上下文，一次只做一个功能 | [Anthropic 长任务](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)、[Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/) |
| 不给验证手段，“看起来对”就接受 | 必须有测试/构建/截图，并要求贴出证据；自己没见过它运行就不算可用 | [Claude Code](https://code.claude.com/docs/en/best-practices)、[Simon Willison 2025-03](https://simonwillison.net/2025/Mar/11/using-llms-for-code/) |
| agent 过早宣布完成 | 用功能清单逐项验证；只有端到端测试通过才能标记为通过 | [Anthropic 长任务](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| 不限范围的“调研一下” | 缩小范围，或交给 subagent，避免塞满主上下文 | [Claude Code](https://code.claude.com/docs/en/best-practices) |
| 每次都在提示词里重复长期规则 | 写进 AGENTS.md 或 skill | [Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices) |
| review 意见全部照改 | 只追与正确性相关的问题，否则会过度工程 | [Claude Code](https://code.claude.com/docs/en/best-practices) |
| 到处写 IMPORTANT | 强调多了就等于没有强调，只给最关键的一条加 | [Claude Code](https://code.claude.com/docs/en/best-practices) |
| 一开始就给全权限，或多个 agent 同时改同一批文件 | 先用默认权限；并行时用 git worktree 隔离 | [Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices) |
| 在不熟悉的领域放手不看 | 在自己不熟的地方要盯紧每一步，并准备好亲自接手 | [Simon Willison 2025-03](https://simonwillison.net/2025/Mar/11/using-llms-for-code/) |

---

## 四、分歧与尚无定论的地方

- **要不要用 `/init` 自动生成 AGENTS.md？** Claude Code 和 Codex 官方都建议先用 `/init` 生成再手动修改 ([Claude Code](https://code.claude.com/docs/en/best-practices)、[Codex 最佳实践](https://developers.openai.com/codex/learn/best-practices))；HumanLayer 明确反对自动生成 ([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md))。ETH Zurich 的研究（ICLR 2026 workshop）发现：LLM 生成的上下文文件平均略微降低任务成功率，推理成本增加 20% 以上；开发者手写的文件只有小幅提升，作者建议只写最小必要的要求。([ETH 论文](https://arxiv.org/abs/2602.11988)) **折中做法：可以生成草稿，但要删掉所有 agent 能自己发现的内容。**
- **放代码示例还是放文件引用？** GitHub 分析 2500 个仓库后认为“一段真实代码胜过三段描述”([GitHub Blog](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/))；HumanLayer 和 Cursor 更倾向用 `file:line` 或规范文件引用，理由是粘贴的代码很快会过时。([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)、[Cursor Rules](https://cursor.com/docs/context/rules))
- **风格规则写不写？** GitHub 模板里有命名规范 ([GitHub Blog](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/))；HumanLayer 认为这应该交给 linter，写进去只会挤占 agent 的指令预算。([HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md))
- **要不要写角色设定（persona）？** GitHub 的自定义 agent 强调写明“你是 XX 工程师”([GitHub Blog](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/))，但这主要针对 `.github/agents/` 里的专职 agent；仓库级的 AGENTS.md 在其他来源里几乎不写 persona。
- **长度上限**：少于 60 行、少于 300 行、少于 500 行、不超过 2 页、32 KiB，各来源说法不同，都是经验值，没有定论。
- **何时需要规划？** Claude 认为“如果能用一句话描述 diff，就跳过计划”([Claude Code](https://code.claude.com/docs/en/best-practices))；Harper Reed 和 Addy Osmani 在新项目上坚持先写完整的 spec 和计划。([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/)、[Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/))
- **并行 agent**：Cursor/Claude 积极推荐 ([Cursor Blog](https://cursor.com/blog/agent-best-practices)、[Claude Code](https://code.claude.com/docs/en/best-practices))；Simon Willison 和 Addy Osmani 认为有效但“精神上很累”，Addy 多数时候只用一个主 agent 加一个 review agent。([Simon Willison](https://simonwillison.net/2025/Oct/7/vibe-engineering/)、[Addy Osmani](https://addyosmani.com/blog/ai-coding-workflow/)) 初学者建议先把单 agent 流程练熟。
- **时效性**：Harper Reed 自己说这套流程“两周后可能就不管用了”([Harper Reed](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/))；工具命令（如 `/goal`、`/doctor`、auto mode）迭代很快，以官方文档为准。

---

## 参考

- [AGENTS.md（Agentic AI Foundation / Linux Foundation）](https://agents.md/)
- [OpenAI Codex《Custom instructions with AGENTS.md》](https://developers.openai.com/codex/guides/agents-md)
- [OpenAI《Codex Best practices》](https://developers.openai.com/codex/learn/best-practices)
- [Anthropic《Best practices for Claude Code》](https://code.claude.com/docs/en/best-practices)
- [Lee Robinson / Cursor《Best practices for coding with agents》（2026-01-09）](https://cursor.com/blog/agent-best-practices)
- [Cursor《Rules》](https://cursor.com/docs/context/rules)
- [GitHub Docs《Adding repository custom instructions for GitHub Copilot》](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- [Matt Nigh / GitHub Blog《How to write a great agents.md: Lessons from over 2,500 repositories》（2025-11-19，2025-11-25 更新）](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)
- [Kyle / HumanLayer《Writing a good CLAUDE.md》（2025-11-25）](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- [Gloaguen 等 / ETH Zurich SRI Lab《Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?》（arXiv 2602.11988；ICLR 2026 MemAgents workshop）](https://arxiv.org/abs/2602.11988)
- [ETH Zurich SRI Lab 论文页](https://www.sri.inf.ethz.ch/publications/gloaguen2026agentsmd)
- [Harper Reed《My LLM codegen workflow atm》（2025-02-16）](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/)
- [Addy Osmani《My LLM coding workflow going into 2026》（2026-01-04）](https://addyosmani.com/blog/ai-coding-workflow/)
- [Simon Willison《Vibe engineering》（2025-10-07，2026-02-23 更新）](https://simonwillison.net/2025/Oct/7/vibe-engineering/)
- [Justin Young / Anthropic Engineering《Effective harnesses for long-running agents》（2025-11-26）](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Simon Willison《Here's how I use LLMs to help me write code》（2025-03-11）](https://simonwillison.net/2025/Mar/11/using-llms-for-code/)

核验日期：2026-09-29。
