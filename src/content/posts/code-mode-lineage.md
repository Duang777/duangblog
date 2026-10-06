---
author: Duang
pubDatetime: 2026-10-07T00:40:00+08:00
title: "Code Mode 突然又火了？它其实是 Cloudflare 一年前提出的设计"
featured: true
draft: false
tags:
  - thinking
description: 2025 年 9 月 Cloudflare 提出 Code Mode。工具转成 TypeScript API，模型写代码在沙箱里调用。2026 年 9 月 Pi 和 OpenCode 把它做成了产品。
revisions:
  - date: 2026-10-07
    note: 首发。按成稿整理，挂到 thinking。
---

2026-10-07 · thinking

本文挂在 [thinking](/tags/thinking/)。

**缘起**：2026 年 10 月初，美团营销 Agent 研发 LanLance（@LanLance24）在 X 上发了一条观察：最近 Pi 和 OpenCode 都在写 Code Mode 相关的博客，但大部分内容去年 Cloudflare 文章里就有。他给出结论，想补习最早的 Code Mode 设计，直接看 Cloudflare 的两篇博客。

> “最近 Pi 和 OpenCode 都在写 Codemode 相关的博客，大部分内容其实去年 Cloudflare 文章中就有提到了。这段时间 Codemode 突然又大火，大家可以看看 Cloudflare 的两篇博客补习下最早的 Codemode 设计。” LanLance

这个观察基本准确。Code Mode 不是一个新概念，它有一套清晰的思想源头：Cloudflare 2025 年 9 月的《Code Mode: the better way to use MCP》定义模式，2026 年 2 月的《Code Mode: give agents an entire API in 1,000 tokens》给出规模化落地。中间 Anthropic 独立走通了同样的思路。2026 年 9-10 月 Pi 与 OpenCode 的集中发布，只是把这条线推到了主流。本文把这条演进线完整拆开。

## Code Mode 是什么：一句话版

传统的 MCP 用法是把工具 schema 直接暴露给 LLM，让模型“调用”工具。Code Mode 反过来：**把 MCP 工具转成 TypeScript API，让模型“写代码”调用这些 API**，代码在一个隔离沙箱里执行。

一句话：**LLM 更擅长写代码去调用 MCP，而不是直接调用 MCP**。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-scroll-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">卷脚本瓶</span>
  </div>
  <p class="duang-whisper-body">循环留在沙箱里。模型只看最后一行。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 为什么“直接调用工具”是错的

Cloudflare 给出了两个根本原因，都指向 token 与能力的错配：

- **工具数量会撑爆上下文**：每个工具 schema 都占上下文。接上千个工具时，模型在读到用户请求之前就要消化几十万 token 的定义。
- **中间结果反复过模型**：传统模式下，一次调用的输出必须流回模型，再被模型复制成下一次调用的输入。大文档会两次通过上下文；复杂的循环、条件、过滤全部发生在模型上下文里，又慢又贵。

而模型写代码恰好相反：代码里有循环和分支，执行环境可以做过滤、聚合、链式调用，只有最终结果回流模型。Anthropic 文章里的例子很有说服力：把 Google Drive 的会议纪要传给 Salesforce，传统方式纪要全文两次穿过上下文；写代码的方式在沙箱里直接完成，模型只看到结果。

### 为什么模型写代码更强

Cloudflare 给了一个直觉性很强的解释：

“让 LLM 用工具调用完成任务，就像让莎士比亚学一个月普通话再让他写剧本，那不是他的最佳水平。”

- LLM 在训练中见过海量真实世界的代码（数百万开源项目），对 TypeScript 的掌握极其深厚。
- 但工具调用是一种模型极少见过的合成格式，训练数据有限，模型并不擅长。
- 结论：把工具变成代码接口，是在利用模型最熟练的能力。

## 核心机制：三个环节

### 1. MCP schema 到 TypeScript API

agent 连上 MCP server 后，拉取工具 schema，自动生成一份带 doc comment 的 TypeScript 类型定义。每个工具变成一个异步函数，参数和返回值都有类型。

```typescript
interface SearchAgentsCodeInput {
  /** The search query to find relevant code files */
  query: string;
  /** Page number to retrieve (starting from 1) */
  page?: number;
}
declare const codemode: {
  search_agents_code: (input: SearchAgentsCodeInput) => Promise<SearchAgentsCodeOutput>;
  // ...其他工具
};
```

### 2. 沙箱执行

模型写好的代码在隔离沙箱里运行。沙箱与互联网完全隔离，唯一出口是代表 MCP server 的 TypeScript API。代码通过 console.log 把结果返回给 agent。

### 3. bindings 而非网络访问

这是 Cloudflare 设计里最值得称道的一处：沙箱不是“有网络 + 靠过滤限制”，而是**默认无网络，通过 binding 直接获得已授权对象**。

- 沙箱的 fetch()/connect() 直接抛错。
- MCP server 以 binding 形式注入，调用走 RPC 回到 agent loop。
- API key 留在 agent 侧，模型写的代码永远接触不到密钥。

<details class="marginalia" open>
  <summary>默认无网络</summary>
  <div class="marginalia-body">
    不是先给网再过滤。fetch 直接抛错。密钥留在 agent 侧，代码只摸得到函数。
  </div>
</details>

## 规模化的证据：1,000 token 覆盖整个 API

2026 年 2 月，Cloudflare 用 Code Mode 重做了自己的 MCP server，把整个 Cloudflare API（2500+ 端点）收敛成两个工具：search() 和 execute()。上下文占用从 117 万 token 降到约 1,000 token。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：四种接法的上下文</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>Raw OpenAPI</b></p>
      <p>约 200 万 token。窗口装不下。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>完整 schema</b></p>
      <p>2,594 个工具，117 万 token。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>只留必需参数</b></p>
      <p>还是 2,594 个工具，24 万 token。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>Code Mode</b></p>
      <p>两个工具，1,069 token。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">数字来自原文的 tiktoken 计量。后面的表是同一组数。</p>
</section>

这张对比表（原文用 tiktoken 计量）是整个论证最硬的数据：

| 接入方式 | 工具数 | Token 成本 | 200K 上下文占用 |
|-|-|-|-|
| Raw OpenAPI Spec 注入 | - | 约 2,000,000 | 977% |
| Native MCP（完整 schema） | 2,594 | 1,170,523 | 585% |
| Native MCP（仅必需参数） | 2,594 | 244,047 | 122% |
| **Code Mode** | **2** | **1,069** | **0.5%** |

完整 schema 的 native MCP 比整个上下文窗口还大 5 倍，根本没法用。Code Mode 用 2 个工具 + 渐进式探索解决了同一问题。整个 API 的 OpenAPI spec 永不进入上下文，模型通过 search() 写代码筛选出自己需要的端点，再通过 execute() 执行。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：直调与写代码</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>直调</b></p>
      <p>工具定义先占满上下文。每次结果回到模型，再抄进下一次调用。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>写代码</b></p>
      <p>工具变成 TypeScript API。循环和过滤在沙箱里做完，模型只看见结果。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">密钥不进沙箱。出口只有这些函数。</p>
</section>

## Anthropic 的独立收敛：Code Execution with MCP

2025 年 11 月，Anthropic 发表《Code execution with MCP》，走通了同一方向，并且提供了额外视角。

### 文件树渐进披露

Anthropic 的版本把工具做成文件系统树：每个工具一个 .ts 文件，模型按需浏览目录、读需要的文件，而不是全量加载。搜索工具支持 detail level 参数（只看名字 / 名字+描述 / 完整 schema）。

### 额外收益

- **隐私保护**：中间结果默认留在沙箱，敏感数据（PII）可自动 tokenize，真实数据流经工作流但从不进入模型上下文。
- **状态持久化**：代码可以把中间结果写到文件，跨多次执行续跑。
- **沉淀为 Skills**：跑通的代码能存成可复用函数，配一个 SKILL.md 就成为结构化技能。

Anthropic 的量化：同样场景下 token 从 150,000 降到 2,000，省 98.7%。两篇文章互相引用，Cloudflare 称 Anthropic 独立探索了同一模式，Anthropic 称 Cloudflare 发表了类似发现并命名为 Code Mode。

## 2026 年 9-10 月为什么又火了：Pi 与 OpenCode 的落地

LanLance 说的“突然大火”，对应的正是这两个事件：

### Pi 0.99.0：把 Code Mode 做成内置扩展

2026 年 9 月 29 日，Pi 发布 0.99.0，把 codemode 作为内置扩展推出：

- 模型写的 JavaScript 在 QuickJS 沙箱里运行，可并行调用 Pi 的工具。
- 新增 tool_search：模型可以搜索未声明的工具并临时声明，配合 codemode 做渐进披露。
- MCP 成为一等公民：stdio / streamable HTTP / OAuth 全支持。
- 支持用 Jev classifier 模型在 codemode 脚本内做分类。

### OpenCode 2 / OpenChamber 2.0：Code Mode 成为主力交互

2026 年 9 月 23 日，OpenChamber 2.0（基于 OpenCode 2）上线，把 Code Mode 描述为“最喜欢的部分”：

- agent 只拿到一个“运行短脚本”的工具，MCP 工具和插件工具在脚本里都是普通函数。
- “遍历我所有打开的 issue，找出跟 sidebar 有关的，给我标题”，变成一段模型写一次的循环，脚本内完成所有调用，只有最终答案回到对话。
- 更少 token、更少往返。脚本在 OpenCode 自己的小解释器里跑，只能碰授予的工具，无网络、无文件、无进程。
- 小模型写脚本能力差，可以按 MCP server 单独关掉 Code Mode。

这两家的做法与 Cloudflare 一年前的设计同构：工具变函数、沙箱执行、渐进披露。区别在实现载体，Pi 用 QuickJS 沙箱，OpenCode 用自己的小解释器，Cloudflare 用 V8 isolate。

## 其他竞争者与边界

Code Mode 不是唯一的上下文压缩方案，2026 年的格局大致是：

| 方案 | 做法 | 代表 |
|-|-|-|
| **Code Mode** | 工具转 TS API，写代码在沙箱执行 | Cloudflare、Anthropic、Pi、OpenCode |
| **CLI 化** | MCP server 转成 CLI，靠 help 渐进披露 | OpenClaw、Moltworker（MCPorter） |
| **动态工具搜索** | 先搜后加载，只暴露相关工具 | Claude Code（ToolSearchTool） |

CLI 方案的问题是需要 shell 环境、攻击面更大；动态搜索仍要维护一个搜索函数，且每个命中工具仍占 token。Code Mode 的取舍也很清楚：**必须有一个可信的沙箱**，这恰恰是它一年后才普及的原因之一：运行 agent 生成代码需要安全执行环境与资源限制，这是直调工具不需要的运维成本。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-crate-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">沙箱瓶</span>
  </div>
  <p class="duang-whisper-body">没有沙箱，就只能一个一个调。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 我的几点判断

- **Code Mode 的本质是上下文工程的一次范式转移**：从“给模型更多工具”转向“给模型一个能写代码的 API + 沙箱”。它和 harness engineering 里的 JIT 检索、延迟工具加载是同一股潮流，不再把整个世界塞进上下文，而是让模型按需获取。
- **沙箱是真正的门槛**。Cloudflare 有 V8 isolate、Pi 有 QuickJS、OpenCode 有自己的解释器，没有轻量可信沙箱的 agent 只能做直调。这也是为什么 2025 年概念提出后，直到各家补上沙箱才大面积落地。
- **“写过代码就能跑”是对小模型不友好的**。OpenChamber 明确说小模型写脚本更差，需要按 server 关闭。Code Mode 的收益曲线跟模型代码能力强绑定，这是它的适用边界。
- **LanLance 的观察值得肯定**：这类“突然大火”的技术，多数时候源头并不神秘。把 Cloudflare 两篇原文读一遍，比追 10 篇二手解读有用得多。这也是本文写作的初衷。

<details class="marginalia" open>
  <summary>年份别写丢</summary>
  <div class="marginalia-body">
    模式是 2025 年 9 月定的。2026 年秋天的产品发布，是把同一件事做成默认路径。
  </div>
</details>

## 参考与延伸阅读

- [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/)（Cloudflare，2025-09-26）
- [Code Mode: give agents an entire API in 1,000 tokens](https://blog.cloudflare.com/code-mode-mcp/)（Cloudflare，2026-02-20）
- [Code execution with MCP: building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp)（Anthropic，2025-11-04）
- [Pi 0.99.0](https://pi.dev/changelog/releases/0.99.0)（2026-09-29）
- [OpenChamber 2.0: it's getting hot reload in here](https://openchamber.dev/blog/opencode-v2/)（2026-09-23）
- [LanLance 原帖](https://x.com/LanLance24/status/2107480347667796253)
