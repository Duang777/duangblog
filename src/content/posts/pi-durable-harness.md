---
author: Duang
pubDatetime: 2026-10-02T13:10:00+08:00
title: "Pi Durable：把 Agent 变成杀不死的进程，长时运行 Agent 的持久化 harness 调研"
featured: true
draft: false
tags:
  - 最新速递
description: 2026-10-01，Pi 1.0 同日公开了实验包 Pi Durable。持久化写进 harness 的存储层，用来接住跨天、跨会话还在跑的 Agent。
revisions:
  - date: 2026-10-02
    note: 首发。按成稿整理，挂到最新速递。
---

2026-10-02 · 最新速递

本文挂在 [最新速递](/tags/最新速递/)。

## 01 · 引言：Pi 1.0 与一个实验性包的同日发布

2026 年 10 月 1 日，Earendil 团队发布 Pi 1.0，并在同一时刻公开了一个实验性包 Pi Durable。Pi 1.0 是公开消息：每周有数十万用户使用 Pi（官方口径），1.0 版本带来 Codemode、扩展支持虚拟模型、deferred tool loading、cache warming 等特性。Pi Durable 则明显更克制。它不与 Pi 编码 agent 竞争，而是换了个位置：作为构建 agentic 应用的框架，把持久化写进 harness 的地基。

这篇博客想回答三个问题：Pi Durable 解决的是什么问题；它用什么机制解决；把它的设计放进 2025 年底到 2026 年中的行业语境里，处在什么位置。

## 02 · 先定义 harness：Agent 不是模型，是模型加运行环境

Pi Durable 的自我介绍只有一句话：一个为能在任何地方长期运行的 Agent 打造的持久化 harness。要理解它，先要理解 Earendil 在《What is a Harness》里给 harness 下的定义：harness 是给模型提供运行环境的软件，Agent 等于模型加 harness。harness 具体做四件事：提供系统提示、暴露工具、跑 agentic loop（模型调用、工具调用、结果观察的循环）、把模型输出翻译成可执行动作。

这个定义的现实含义是：Claude Code 是第一个流行的 harness，但它既不中立也不可移植；OpenClaw、OpenCode、Hermes、Pi 这类开源 harness 才把杠杆从 AI 实验室交还给终端用户。用户已经在 Pi 上共享了超过 5000 个扩展（官方口径）。Pi Durable 是这个判断的延伸。如果 harness 是 Agent 的运行时，那这个运行时本身也应该是可持久化的。

## 03 · 问题定义：长时运行 Agent 为什么做不成

主流 Agent 产品形态是一次性执行循环：开一个会话，模型在上下文窗口里工作，会话结束，状态随进程消失。跨天、跨会话、跨 Agent 的任务因此长期做不成，原因可以归结为三类。

- **上下文是短命的**：上下文窗口有上限，超长对话靠压缩保底，压缩本身会丢细节。
- **目标会漂移**：会话一断，模型下次醒来只剩用户的一句话，之前的目标、进展、决策理由全部丢失，容易从头再来或跑偏。
- **恢复没有契约**：进程崩溃或机器重启后，谁也不知道执行到哪一步，哪些副作用已经发生，哪些可以安全重试。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：长任务断掉时缺的三件事</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>上下文</b></p>
      <p>窗口有上限。压缩能续上，细节会掉。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>目标</b></p>
      <p>会话一断，下次只剩用户的一句话。进展和决策理由不在了。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>恢复</b></p>
      <p>崩溃以后不知道走到哪一步，哪些副作用已经发生。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">这三件不落账，跨天的任务就还是一次会话。</p>
</section>

<details class="marginalia" open>
  <summary>先问副作用</summary>
  <div class="marginalia-body">
    会话断了还想接着干，先问副作用有没有落账。没有契约的重试，会把同一件事做第二遍。
  </div>
</details>

行业里解决这个问题的路线已经很多：Anthropic 把进度外置到文件和 git，LangGraph 做图状态 checkpoint，Temporal 用事件日志做 durable execution，Cloudflare 用 Durable Objects 让每个 Agent 有一个休眠零成本的家。Pi Durable 选择的是另一条：把持久化做进 harness 的存储层，让存储加会话本身就是运行机制。

## 04 · Pi Durable 的定位：不是产品，是框架

Pi Durable 明确声明不与 Pi 编码 agent 竞争。Pi 是一个产品化的编码 harness，Pi Durable 是一个构建 harness 的框架。两者是不同抽象层次的东西。它的设计目标可以从代码规模读出：全部源码约 15,000 行（无测试，作者自报口径，约 150k GPT token / 250k Claude token），其中存储后端约 3,000 行。这个体量意味着它不是玩具，但也刻意保持小：存储接口只做四件事，任何后端（KV store、Postgres）都能实现。

它的使用形态是：写代码时 import Pi 的 harness 库，调 Harness.open(storage) 打开一个持久化会话，之后所有对话、任务、文档自动落到存储里。Agent 跑在本地、Bun、Cloudflare Durable Object 等任何 JS runtime 上，能在任何地方长期运行。

## 05 · 核心机制拆解

### 05.1 · 存储是状态的家：memory / SQLite / JSONL

Pi Durable 提供三个存储后端：memory（进程内存，适合测试）、SQLite（工作集放内存，其余落盘）、JSONL（纯追加日志）。三后端通过 conformance suite 保证行为一致，并配了 benchmarks。作者强调存储接口小是刻意的：因为 harness 的可靠性不依赖某个特定数据库，任何能实现该接口的存储（KV store、Postgres）都能接入。

### 05.2 · 崩溃恢复：每步 checkpoint，exactly-once 提交

这是 Pi Durable 最硬核的设计。每个 task（模型请求、工具调用、compaction 都是 task）在每步执行前先存 checkpoint，再继续。崩溃恢复有三条规则：被截断的模型请求重新发送，部分完成的回答标为 aborted；工具调用只有声明 `replay: "safe"` 时才重跑，否则告诉模型这个工具中断了，看 evidence 决定怎么办；requestId 保证提交 exactly-once，不会重复执行副作用。subagent 本质上也是对话，因此同样可恢复、可续跑。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-revive-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">存活瓶</span>
  </div>
  <p class="duang-whisper-body">崩溃以后再醒来，得知道哪一步已经做完。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

### 05.3 · 会话是一等公民：并发、fork、每会话独立配置

一个 harness 可以并发运行任意多会话，彼此独立。会话可随时 fork。官方例子是 Slack 频道开线程：fork 出的会话看得到父会话的历史，但不复制它，改动不影响父会话。每个会话有独立的 agent 配置：模型、思考档位、扩展与工具选择、额外指令、工作目录。崩溃后重新 open 同一个存储，root 会话还是原来那个，不会变成新会话。

### 05.4 · 扩展：提示片段、工具、hooks、tasks 的命名包

extension 是一个命名 bundle，可包含系统提示片段、工具、hooks、自定义任务。设计上照顾了 prompt cache：系统提示每次请求前重建，但记录变更位置，运行中改动只发增量，让 Anthropic 等提供方的缓存保持有效。工具可同名替换、可 wrap 装饰（官方例子：给 bash 工具包一层超时）。hooks 是链式的：beforeTool 可改写或阻断调用，onYield 多个 handler 只有第一个生效，observers 全部运行。hook 的决策存在 memo 里（first write wins），进程重启后不需要重新问模型。

### 05.5 · 任务系统：ownership tree 与级联 abort

自定义任务与内置任务（模型请求、工具调用、compaction）走同一套机制：每步 checkpoint、定时器跨重启存活、支持等待。任务按 ownership tree 组织，abort 自底向上级联。任务分 foreground（当前工作，Esc 中止）和 background（非当前工作，普通 abort 不管）。官方用支付拆分/退款例子说明幂等：`payment-${task.id}` 作为 key，保证同一任务不会重复扣款。

### 05.6 · Compaction 与 handoff：把交接做成机制

compaction（压缩）是后台任务，与当前工作并行。reserveTokens 默认 16384、backgroundTokens 默认 32768（作者自报口径），快到窗口才等摘要；provider 拒绝过长 compact 就重试一次。reset() 从一个 handoff note 开新上下文，旧消息仍可通过 search_history 检索。也就是说，忘了不是删除，而是降级为可查询。

### 05.7 · 应用状态：documents 与 transcript 同原子提交

Agent 自己的应用状态（todo list、订单、配置）作为 typed JSON documents 存储，与 transcript 同一次原子提交。这意味着应用状态永远不会与对话历史不一致。对话说做了 X，documents 里就真的有 X。documents 支持历史回卷（fork asOf）和订阅（harness.documentState）。

### 05.8 · Malleable 与 Multiplayer：运行时可改、可多人接入

registry 支持热替换：运行中的会话用旧代码完成当前调用，下次调用自动用新代码。会话只存扩展名不存代码，重启后自然升级。Multiplayer 指 committed state 模型：任何客户端可以 attach 一个正在运行的会话、join 或 steer。view.subscribe 拿全量快照，thread.watch() 拿精确操作流，watchEvents() 拿传统事件。官方 demo（vacation planner）约 1,300 行 TypeScript，大部分是 TUI，演示了并行子 agent 搜索、崩溃后 safe 重跑、中途切换 steer。

![图 1 Pi Durable 持久化 harness](/images/pi-durable-fig-harness.jpg)

**图 1｜** 存储在上，会话和任务并排，扩展接在下面。崩溃后重新打开同一份存储，从最后的 checkpoint 继续。

## 06 · 行业对照：大家都在把状态从聊天记录里抽出来

Pi Durable 不是孤例。2025 年底到 2026 年中，长时运行 Agent 的状态持久化已经成为主流工程焦点，几方思路可以横向排开。

| 维度 | Anthropic harness | LangGraph | Cloudflare Think | Temporal | Pi Durable |
|-|-|-|-|-|-|
| **状态放哪** | 文件系统 + git | 图状态 checkpoint（checkpointer） | Durable Object 内嵌 SQLite | Event History 事件日志 | 存储层（SQLite/JSONL 可换） |
| **恢复粒度** | 会话间 handoff（人工 + 进度文件） | 每步 checkpoint，可暂停/恢复/分支 | runFiber 持久执行，自动恢复 | 日志重放，跨 worker 换机恢复 | 每步 checkpoint + exactly-once |
| **幂等保证** | 靠代码习惯 | 框架层支持 | 平台层支持 | Activity 重试契约 | requestId + replay safe 声明 |
| **扩展机制** | 提示工程 + 脚本 | 节点/边编程 | Think base class + sub-agents | Workflow/Activity 编程模型 | extension 命名包 + hooks |
| **运行位置** | Claude 产品内 | 任意 Python/JS 进程 | Cloudflare 平台 | 自有集群/云 | 任意 JS runtime（本地/Bun/DO） |

LangChain 的 Delta Channels 博客（2026-05）提供了一个量化视角：naive 全量 checkpoint 是 O(N²) 存储，200 轮 coding agent 会话累积 5.3GB；DeltaChannel 只存 diff 加周期全量快照，降到 129MB（官方自报 41 倍缩减）。LangGraph 的 checkpointer/store 分工也说明同一趋势：checkpointer 管短期线程记忆与恢复，store 管长期跨线程记忆。

Cloudflare Project Think（2026-04）是最接近 Agent 原生运行时的方案：每个 Agent 一个 Durable Object，内嵌 SQLite，休眠零成本、醒来自动恢复；runFiber() 崩溃恢复自动 stash checkpoint；sub-agents（Facets）隔离 SQLite 加 typed RPC；Session API 提供树形消息、forking、非破坏 compaction 和 FTS5 全文检索；Dynamic Workers 从无权限起步、按需授权。官方给过一个规模口径：10,000 个 Agent 各活跃 1%，约 100 个并发活跃。这些数字都标注为厂商自报口径。

Temporal（2026-08）代表把 durable execution 作为独立引擎的路线：Workflow 每步 journaled 到 Event History，worker 死了换机器重放恢复；模型/工具调用跑在 Activity 里；ADK 与 LangGraph 双框架交叉编排。它的核心观点是：agent 系统本质是分布式系统，human-in-the-loop 只是机器在等待。

Pydantic + DBOS（2026-02）代表库组合路线：DBOSAgent 一行 wrapper 把 agent.run() 变成 durable workflow，checkpoint 进 Postgres，模型调用和 MCP 通信自动持久化；子 Agent 自动成为 child workflow；Logfire 提供 OTel 端到端可观测。没有引入外部 workflow engine，也没有引入新平台。

![图 2 同一个问题，六种解法](/images/pi-durable-fig-routes.jpg)

**图 2｜** 六条路线把跨会话要保住的状态，从聊天记录和进程内存里抽出来。

## 07 · 我的点评：持久化是 harness 的下一个主战场

把这几条路线放在一起，可以看到一个分水岭：状态放哪、恢复粒度如何、扩展机制是什么、谁来运行。Anthropic 走文件与 git，LangGraph 走图状态，Think 走 actor 平台，Temporal 走事件日志引擎，DBOS 走数据库内库，Pi Durable 走存储原生 harness。共同点是同一个：把跨会话要保住的状态从聊天记录和进程内存里抽出来，变成可查询、可恢复、可审计的持久对象。

Pi Durable 的独特性在于两点。第一是抽象位置：别人把持久化做成平台特性或框架补丁，它把持久化做进 harness 的定义本身。harness 等于存储加会话机制，存储是地基不是附件。第二是开放度：不绑定模型、不绑定 runtime、不绑定数据库，存储接口小到 KV store 都能实现，这让它理论上可以成为连接现有 harness（Codex、Claude Code、Cursor）和持久化后端的中间层，类似控制面与执行面的分离。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-slab-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">地基瓶</span>
  </div>
  <p class="duang-whisper-body">持久化要是补丁，重启的时候它会先掉。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

它的实验性也明显：15,000 行代码没有测试（作者自报口径）、API 随时可能变、存储接口小意味着能力边界小（全文检索、并发控制都留给后端）。作为产品它还不成熟，作为设计文档它很有价值。如果要做长时运行 Agent，Pi Durable 的 requestId exactly-once、replay safe 工具声明、ownership tree abort、documents 与 transcript 同原子提交、compaction 与 handoff 分离，这五个机制值得逐个抄进自己的设计里。

<details class="marginalia" open>
  <summary>先抄契约</summary>
  <div class="marginalia-body">
    先抄 requestId 和 replay safe。数据库可以后加。
  </div>
</details>

对 Go 技术栈尤其如此：Pi Durable 的核心抽象（存储接口、task checkpoint、exactly-once 提交、hook 链）与语言无关，SQLite/Postgres 后端在 Go 生态里都是成熟组件。抄的路径很清楚：先定存储接口，再做 task 执行器与 checkpoint，最后加扩展与 hooks。

## 08 · 参考来源

- [Pi Durable · Earendil（2026-10-01）](https://earendil.com/posts/pi-durable/)
- [Pi 1.0 · Earendil（2026-10-01）](https://earendil.com/posts/pi-1-0/)
- [What is a Harness · Earendil（2026-08-20）](https://earendil.com/posts/what-is-a-harness/)
- [Effective Harnesses for Long-Running Agents · Anthropic（2025-11）](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Delta Channels：Evolving Agent Runtime · LangChain（2026-05）](https://www.langchain.com/blog/delta-channels-evolving-agent-runtime/)
- [Project Think · Cloudflare（2026-04）](https://blog.cloudflare.com/project-think/)
- [Durable, Flexible Multi-Agent Systems · Temporal（2026-08）](https://temporal.io/blog/durable-flexible-multi-agent-systems)
- [Pydantic AI + DBOS · Pydantic（2026-02）](https://pydantic.dev/articles/pydantic-ai-dbos)
- [LangGraph Persistence · LangChain Docs](https://docs.langchain.com/oss/javascript/langgraph/persistence)
