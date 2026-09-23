---
author: Duang
pubDatetime: 2026-09-23T16:57:00+08:00
title: 跨会话状态与目标持久化：2026 年 long-horizon Agent 的四条路线
featured: true
draft: false
tags:
  - thinking
description: 上下文窗口留不住跨会话状态。对照 Anthropic、Codex、Salesforce 和 LoopX，看目标与进度被放到了哪里。
revisions:
  - date: 2026-09-23
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> 核心结论：跨会话要保住的目标、进度、证据与完成条件，应当外置到文件、线程对象或平台状态中，而不是依赖聊天记录本身。解法正在从提示工程转向状态与治理工程。

对照 Anthropic、OpenAI、Salesforce 与 LoopX · 2026-09

长期运行（long-running / long-horizon）Agent 在 2025 年底到 2026 年中成为主流工程焦点，各家的出发点高度一致：上下文窗口有限，单会话容易目标漂移或丢失进度，必须把跨会话要保住的状态从聊天记录中抽出来。围绕这一共识，Anthropic、OpenAI、Salesforce 与 LoopX 给出了四条不同的实现路线。本文梳理各方的具体机制与差异，并总结行业层面的共同结论。

## 1. 问题共识：状态必须从聊天记录中剥离

长期 Agent 的核心失效模式有两种：一次想做太多，在半截实现中耗尽上下文，下一轮只能靠猜测恢复；过早宣布完成，看到部分功能就认定项目结束。单纯依赖上下文压缩（compaction）或更高层次的提示并不能解决这两个问题，因为它们把状态留在模型上下文里，而上下文恰恰是每轮会话都不可靠的部分。

由此形成的共同判断是：跨会话要保住的目标、进度、证据与完成条件，应当外置到文件、线程对象或平台状态中，而不是依赖聊天记录本身。解法正在从提示工程转向状态与治理工程。

<details class="marginalia" open>
  <summary>账本</summary>
  <div class="marginalia-body">
    下一轮是冷启动。聊天记录再完整，也只是上一轮的残响；能被打开、被对照的文件才算留下了。
  </div>
</details>

## 2. Anthropic：Initializer 与 Coding Agent 的 Harness 模式

Anthropic 于 2025 年 11 月公开了长程 Agent 的 harness 设计，核心是把一次长期任务拆成两类角色，共用同一套工具与 harness：Initializer agent 只在项目第一次会话运行，负责建立环境、初始化进度文件与完整的功能清单，并做初始提交；Coding agent 在之后的每次会话运行，只做增量工作，读取进度、选择一个未完成项、实现、测试、提交并写回进度。

关键 artifact 有两类。`feature_list.json` 是强约束的结构化清单，每条包含分类、描述、人工可执行的验收步骤与初始为 false 的通过标记，并明确禁止删除或改写测试项；`claude-progress.txt` 是自由文本交接笔记，记录本轮做了什么、发现的缺陷、下一步建议与架构决策，与 git log 一起构成新会话的开机协议。会话启动时按固定顺序执行：读取进度与提交记录，选择最高优先级未完成项，运行环境初始化脚本，并用浏览器自动化做一次基础端到端验证，确认仓库未被破坏后再开始新功能。

后续演进把这一模式固化为可复用的工程原语：Default-FAIL 契约规定测试结果初始全部为 false，且在读取证据文件之前不得将任何项改为通过；Fresh-context evaluator 以独立的只读 subagent 检查 diff 与证据，返回 PASS 或 NEEDS_WORK；Agent-maintained handoff 用 `PROGRESS.md` 与关键提交维护交接状态。Claude Code 产品内置的 `/goal` 命令采用类似的评判循环：用户写一条完成条件，主模型执行，每轮结束后由独立小模型（默认 Haiku）仅根据 transcript 判断条件是否成立，成立则自动结束，否则继续。

## 3. OpenAI Codex：/goal 作为线程级持久目标对象

OpenAI 在 2026 年 4 至 5 月的 Codex CLI（0.128.0 起）中将 `/goal` 提升为一等公民。与 Claude Code 的会话内条件不同，Codex 的目标保存在线程级持久状态中，会话断开、机器重启甚至 token 墙之后仍然存在。目标生命周期分为 pursuing、paused、achieved、unmet 与 budget-limited 五种状态，支持 pause、resume 与 clear 操作。

官方对目标的定位是完成契约（completion contract）而非全局记忆：它绑定到当前线程的上下文（已查看的文件、运行过的命令、产生的 diff），并强调完成判定以证据为准，而不是模型自认为完成。官方还给出了编写有效目标的六要素：结果（Outcome）、验证面（Verification surface）、约束（Constraints）、边界（Boundaries）、迭代策略（Iteration policy）与受阻停止条件（Blocked stop condition）。典型的弱目标只有一句话，强目标则写清可度量的结果、由哪个基准验证、允许改动哪些服务、迭代之间记录什么，以及无法继续时的停止条件。

与 Claude Code 的 `/goal` 相比，差异集中在三处：存储位置（线程级持久状态 vs 会话内条件，后者 resume 时条件保留但轮数与计时重置）、完成判定（主模型结合证据 vs 独立小模型只看 transcript）、生命周期（包含 budget-limited，预算触顶时停止实质性工作并总结进度与阻塞，而非视为达成）。

## 4. Salesforce：Long-horizon Runtime 的企业化落地

Salesforce 于 2026 年 9 月公开 long-horizon runtime，首发 Agent 为 outbound sales 场景的 Hunter（pilot 阶段，GA 计划于同年 11 月）。它面向的不是代码交付，而是跨天跨周的业务流程执行，三项核心能力为：Memory（跨会话保留目标、已完成工作、engagement 信号与待办）、Durable execution（计划可跨天或跨周持续推进，环境变化时支持 resume 或 course-correct）、Dynamic steering（用户以对话方式调整行为配置而不丢失整体目标）。

官方给出的典型场景是 deal-rescue：用户提出重新跟进有流失风险的交易，Hunter 拉取机会与 engagement 信号，将其细化为可度量、有时间边界的目标，生成跨周计划（含任务、时间表与人工审批点）；执行中遇到邮件 bounce 时，系统不会放弃，而是查询内外部数据寻找替代联系人并起草新邮件，但因偏离原批准计划，先请求用户审批，再把这次变化回写进后续计划。这个例子的要点在于：目标与计划存储在平台运行时中，进度可度量，偏离计划的行为需要审批，hiccup 会更新后续计划而不是被忽略。

## 5. LoopX：Provider-neutral 的本地控制面

LoopX 走的是另一条路线：不绑定具体模型或 runtime，而是做成开放的、Provider-neutral 的控制面，直接挂在 Codex、Claude Code、Cursor 等现有 harness 之上。目标、门控、待办、证据、配额与交接全部保存在本地 `.loopx/` 状态核中，harness 只负责单轮有界执行；LoopX 决定每一轮是否运行、运行什么、写回哪些证据，以及配额是否允许进入下一轮。

与 Claude 的适配是 opt-in 的：不使用 Claude 自带的 `/goal`（其基于 transcript 判断完成条件，与 LoopX 的确定性门控存在冲突），而是由 LoopX 的 `should_run`、`claim_task`、`complete_task` 协议做控制，Claude 原生 `/loop` 仅做执行循环。官方在 LHTB 基准（46 个任务，同一模型）上的结果如下：Plain Codex 的 mean reward 为 0.4218，Native Codex Goal 为 0.4475，LoopX 1.0.3 Heartbeat 为 0.4948，相对 Plain Codex 提升 17.3%，相对 Native Codex Goal 提升 10.6%；严格通过率（≥0.95）均为 7/46，通过率（≥0.80）为 15/46 对 12/46 与 14/46。其定位可以用一句话概括：状态与治理外置，harness 只做执行，LoopX 状态才是事实来源。

<details class="marginalia" open>
  <summary>谁说了算</summary>
  <div class="marginalia-body">
    四条路线都把状态搬出窗口了。剩下的分歧是：仓库文件、线程对象、企业运行时，还是本地控制面，谁有权写下一轮能不能跑。
  </div>
</details>

## 6. 横向对照

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：跨会话状态放在哪</p>
  <p class="article-embed-note-lead">同一件事，五处落点。聊天记录都不算数。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 260" role="img" aria-label="Anthropic 在仓库文件，Claude /goal 在会话内，Codex 在线程级状态，Salesforce 在平台运行时，LoopX 在本地控制面"><text class="perf-label" x="8" y="36">Anthropic harness</text><rect class="perf-hbar" x="248" y="20" width="360" height="22" rx="3"/><text class="perf-chip-sub" x="260" y="36">仓库文件 + git</text><text class="perf-label" x="8" y="76">Claude /goal</text><rect class="perf-hbar" x="248" y="60" width="360" height="22" rx="3"/><text class="perf-chip-sub" x="260" y="76">会话内条件</text><text class="perf-label" x="8" y="116">Codex /goal</text><rect class="perf-hbar" x="248" y="100" width="360" height="22" rx="3"/><text class="perf-chip-sub" x="260" y="116">线程级持久状态</text><text class="perf-label" x="8" y="156">Salesforce LHR</text><rect class="perf-hbar" x="248" y="140" width="360" height="22" rx="3"/><text class="perf-chip-sub" x="260" y="156">平台运行时</text><text class="perf-label" x="8" y="196">LoopX</text><rect class="perf-hbar" x="248" y="180" width="360" height="22" rx="3"/><text class="perf-chip-sub" x="260" y="196">本地 .loopx/</text></svg>
  </figure>
  <p class="article-embed-note-foot">控制面管目标、配额与交接；harness 只负责单轮有界执行。</p>
</section>

| 维度 | Anthropic harness | Claude /goal | Codex /goal | Salesforce LHR | LoopX |
|-|-|-|-|-|-|
| 状态位置 | 仓库文件 + git | 会话内条件 + transcript 评判 | 线程级持久状态 | 平台运行时（目标对象 + plan + memory） | 本地控制面 `.loopx/` |
| 完成判定 | feature list + 证据 + 可选独立 evaluator | 独立小模型看 transcript | 主模型 + 证据 | 业务结果 + 人工审批 | 确定性 gate + evidence |
| 跨会话 | progress / feature / git 接力 | 条件可 resume，计时重置 | 目标持久，执行需开会话 | 原生跨天 / 周 | 原生跨 harness、跨天 |
| 绑定 | Claude Agent SDK / Claude Code | Claude Code | Codex | Agentforce | 中立，挂在现有 harness 上 |
| 典型场景 | 多会话写完整应用 | 有明确验收标准的迁移 / 清理任务 | 有 benchmark / 测试的长优化 | 销售 pipeline、现场调度 | 多日工程 / 研究 + 多 Agent 协作 |

## 7. 行业共识

四条路线在机制上不同，但工程结论一致。第一，状态外置已成为默认做法：progress file、feature list、git、结构化 todo、evidence、goal object，替代对上下文窗口或简单摘要的依赖。第二，采用两阶段或分层的 harness：Initializer 或 Planner 负责建立环境与目标分解，执行 Agent 只做增量并留下干净的交接。第三，完成条件靠证据而不是模型自报：Default-FAIL、fresh-context evaluator、可验证的停止条件成为标准部件。第四，控制面与执行面分离：谁管理 Goal、Todo、配额与交接，谁只管单轮工具调用，边界日益清晰。学术侧也开始系统化讨论这一方向，强调 identity、memory 与 body 跨 runtime 的连续性，以及谁能写入、谁能撤销、如何审计的治理问题。

把这几条路线放在一起看，结论是清晰的：跨会话要保住的东西已经从聊天记录中抽离出来，Anthropic 与 OpenAI 倾向于自家 harness 内的 artifact 与目标对象，Salesforce 将其产品化为企业级 durable runtime，LoopX 则提供可挂在任意现有 harness 上的开放控制面。问题已经形成共识，解法正在从提示工程转向状态与治理工程。

---

参考来源：[Anthropic Engineering Blog《Effective Harnesses for Long-Running Agents》](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)（2025-11）｜[anthropics/cwc-long-running-agents](https://github.com/anthropics/cwc-long-running-agents)｜[Claude Code 文档（/goal，2026-05）](https://code.claude.com/docs/en/goal)｜[OpenAI Codex CLI 文档（/goal，2026-04 起）](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)｜[Salesforce long-horizon agents](https://www.salesforce.com/blog/long-horizon-agents/)（2026-09）｜[LoopX 项目 README](https://github.com/huangruiteng/loopx) 与 LHTB 基准｜核验日期：2026-09-23
