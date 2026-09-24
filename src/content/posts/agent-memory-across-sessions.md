---
author: Duang
pubDatetime: 2026-09-23T17:40:00+08:00
title: 跨会话、跨天记忆：Agent 的“记忆”到底是什么？
featured: true
draft: false
tags:
  - thinking
description: 跨会话、跨天的记忆不是模型能力，是可落盘、可查询、可审计的外部状态，外加一个让状态不腐烂的整理机制。
revisions:
  - date: 2026-09-23
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> 一句话判断：跨会话、跨天的记忆，本质上不是模型的能力，而是系统的状态：可落盘、可查询、可审计的外部化状态，加上一个让状态不腐烂的整理机制。

thinking · 2026-09

## 1. 问题：Agent 为什么总是“失忆”

用过 AI Agent 的人都会遇到同一个场景：昨天聊得清清楚楚的需求，今天开个新会话，它全忘了。你重新解释一遍偏好，它重新读一遍代码，然后重复问你昨天已经回答过的问题。

这不是模型的错。LLM 本身是**无状态的**：每一次 API 调用都是独立的，上下文窗口只装着当前会话的东西，会话一结束就归零。任何“看起来记得你”的行为，都是应用层外部基础设施做的。Vectorize 把这层窗户纸捅破了：默认情况下，Agent 不会在会话之间学习。

如果 Agent 只是聊天，这个“失忆”还能忍；但 Agent 要干的是跨天、跨周的长程任务（调研、写方案、提 PR、等 review、跟进 CI），失忆就变成致命伤：状态丢了，活就得重来。

## 2. 上下文窗口不是记忆

先破除一个幻觉：把上下文窗口做大，能不能解决记忆问题？

不能。[Hindsight](https://hindsight.vectorize.io/blog/2026/07/22/context-window-is-not-memory) 团队 2026 年 7 月写了篇文章，标题就叫《你的 1M token 上下文窗口不是记忆》：上下文窗口是 **RAM，不是磁盘**。它有两个致命属性：会话结束就全部遗忘；而且远没装满就开始变笨，给得越多用得越差。

Karpathy 在 2025 年把“上下文工程”正式化，定义是：“把上下文窗口填满‘下一步恰好需要的信息’的艺术和科学”。注意关键词：**下一步**。上下文工程解决的是“这一步给什么”，而不是“我该记住什么”。

社区流传最广的一句话来自开发者 JUMPERZ：“拥有自己知识层的 Agent 不需要无限上下文窗口，它们需要良好的文件组织和读取自己索引的能力，比把所有东西塞进一个巨型 prompt 便宜得多、可扩展得多、可检查得多。”

Karpathy 自己的 LLM Wiki 实验（2026 年初）就是最好的注脚：约 100 篇文章、40 万词，LLM 直接读 Markdown 文件、不用向量库：“知识被编译一次然后持续更新，而不是每次查询都重新推导”，比完整 RAG 管线省约 95% 的 token。

<details class="marginalia" open>
  <summary>掉电</summary>
  <div class="marginalia-body">
    窗口是工作台。关了会话，桌上的东西就没了。
  </div>
</details>

## 3. 行业都在做同一件事：外部化状态 + 整理机制

如果把 2026 年各家的大动作摆在一起，会发现惊人的同构。

**Anthropic**：4 月给 Managed Agents 加了 Memory Store：基于文件系统的持久记忆，带 API 控制和审计日志，早期客户报 97% 首轮错误下降、30% 提速。5 月推出 **Dreaming**：一个在会话之间定时运行的整理进程，读记忆库和最近最多 100 场会话记录，合并重复条目、用最新值替换过期或矛盾的条目、挖掘新洞察，输出全新整理后的记忆库。原始库不动、可人工审批。官方类比是海马体在睡眠时巩固记忆。

**OpenAI**：6 月给 ChatGPT 做了新的记忆系统，后台综合读取全部对话历史、持续更新对用户的认知，取代手动的“记住”清单；9 月的 Agents API 内置上下文自动压缩，让长会话跨多个上下文窗口连续工作。

**Cursor**：9 月发布 Projects：一个协调者 Agent 常驻云端，跨数月的上下文持续维护任务状态，同时派生成千上万的子 Agent。“你睡觉时它还在工作。”

**开源一侧**：Mem0 把记忆做成独立层，写入时合并冲突、按用户/会话/Agent 三级隔离，LongMemEval 94.4；Letta 延续 MemGPT 的记忆块 API；Zep 用时间知识图谱跟踪事实随时间变化；agentmemory 以 MCP 形式给 Claude Code、Cursor 等注入跨会话记忆，LongMemEval-S 召回 95.2%、省 92% 上下文 token。还有一派干脆不要向量库：EIDARA 用编译式记忆，MemMachine 存原始片段、最小化 LLM 抽取，保证“不丢真值”。

**中国厂商也在抢这条线**：阿里千问 9 月发布“企业上下文”，把海量企业数据压缩和结构化、以极低 token 成本维护，并强调“每一次任务执行要有边界、能追溯”。

## 4. 成本经济学：长程任务里，记忆必然胜出

有人会说：记忆层是过渡方案，等上下文窗口大到装下一切，就不需要了。

[arXiv 2603.04814](https://arxiv.org/html/2603.04814) 用实验回答了这个问题：长上下文模型事实召回确实更高，但成本随上下文长度**线性上涨**；当用户交互超过约 10 次，记忆系统的经济性反超，精度仍具竞争力。对跨天任务，10 次交互是最低预期。

所以结论不是“谁取代谁”，而是分工：**上下文是工作台，记忆是仓库**。工作台越大越好，但仓库该存在还是得存在。

## 5. 我的视角：两条路线，和一条被忽略的第三条

现在做记忆的玩家大致分两派：

- **记忆层派**：Mem0、Letta、Zep：把事实抽出来，存进向量库或图库，需要时检索注入。
- **状态派**：Karpathy 的 Markdown Wiki、Cursor 的 Merkle 树代码库索引、Anthropic 的文件系统 Memory Store：记忆就是文件系统里可 diff、可 vim、可 git 的结构化状态。

我在做 LoopX（一个面向长程自主 Agent 的本地控制面），站在状态派这一侧，而且想补充一个被讨论得很少的点：**记忆要解决的不只是“记住”，而是“接续”**。

三个问题：记住什么（What）、从哪继续（Where）、下一步做什么（Next）。多数记忆系统只回答了第一个。它们把记忆做成“能被检索的文本”。但长程 Agent 真正缺的是后两个：任务做到一半断了，新会话从哪里捡起来？哪些依赖已经满足、下一步该做什么？

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：记忆要回答的三件事</p>
  <p class="article-embed-note-lead">多数系统只做 What。长程 Agent 还要 Where 和 Next。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 160" role="img" aria-label="What 记住什么，Where 从哪继续，Next 下一步做什么"><text class="perf-label" x="8" y="40">What</text><rect class="perf-hbar" x="108" y="24" width="500" height="22" rx="3"/><text class="perf-chip-sub" x="120" y="40">记住什么 · Todo 依赖图</text><text class="perf-label" x="8" y="84">Where</text><rect class="perf-hbar" x="108" y="68" width="500" height="22" rx="3"/><text class="perf-chip-sub" x="120" y="84">从哪继续 · resume 条件</text><text class="perf-label is-tail" x="8" y="128">Next</text><rect class="perf-hbar is-tail" x="108" y="112" width="500" height="22" rx="3"/><text class="perf-chip-sub" x="120" y="128">下一步做什么 · successor 链</text></svg>
  </figure>
  <p class="article-embed-note-foot">记忆做成能检索的文本，只覆盖了第一行。</p>
</section>

LoopX 的做法：用 Todo 依赖图记住 What；用机器可读的 resume 条件（`todo_done`、`pr_merged`、`monitor_changed`、`resume_at`）决定 Where；用 successor 链决定 Next。跨会话、跨天的记忆因此变成**执行连续性**。系统知道任务进行到哪、下一步该干什么，而不是把一堆历史事实倒给模型让它自己猜。

另一个被低估的问题是：**记忆会腐烂**。重复、矛盾、过时。Anthropic 的做法是事后整理（Dreaming 离线跑）；LoopX 的做法是写入时纪律：`superseded_by` 关系、版本号、Evidence-first 完成标准，让矛盾在写入那一刻就被显式标记，而不是等腐烂了再清理。一个靠整理，一个靠防腐，方向互补。

<details class="marginalia" open>
  <summary>防腐</summary>
  <div class="marginalia-body">
    一种靠睡觉整理，一种靠写入时不让脏数据进去。
  </div>
</details>

## 6. 结语

跨会话、跨天记忆的终点，不是更大的上下文窗口，也不是更聪明的检索，而是把记忆变成**系统拥有的、结构化的、会整理的、可审计的状态**。

Anthropic 在云端做这件事，Karpathy 在个人知识库做这件事，Cursor 在代码库做这件事。而我关心的是：在 Agent 控制面做这件事：把记忆和执行缝合在一起。模型负责聪明，系统负责记得。让 Agent 不再每次从零开始。

## 参考

- [Anthropic Managed Agents Dreams 官方文档](https://platform.claude.com/docs/en/managed-agents/dreams)
- [Claude 官方博客：New in Claude Managed Agents](https://claude.com/blog/new-in-claude-managed-agents)
- [Anthropic Managed Agents 增加持久记忆](https://opentools.ai/news/anthropic-managed-agents-add-memory-persistent-state-for-ai-that-actually-ships)
- [OpenAI 研究发布页](https://openai.com/zh-Hans-CN/research/index/release/)
- [Hindsight：Your 1M-Token Context Window Is Not Memory](https://hindsight.vectorize.io/blog/2026/07/22/context-window-is-not-memory)
- [Vectorize：Do AI Agents Learn Between Sessions?](https://vectorize.io/articles/do-ai-agents-learn-between-sessions)
- [DEV Community：Why bigger context windows won't kill memory systems](https://dev.to/codecoradev/why-bigger-context-windows-wont-kill-memory-systems-1fmh)
- [Karpathy 的 LLM Wiki（腾讯云解读）](https://developer.cloud.tencent.cn/article/2680461)
- [Mem0：AI Agent Memory 2026 评测报告](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Mem0 vs Letta vs Zep（2026 对比）](https://aiworkflowlab.dev/article/agent-memory-mem0-vs-letta-vs-zep-2026)
- [Cursor Projects：Agents That Work While You Sleep](https://www.joinnextdev.com/blog/cursor-projects-launches-agents-that-work-while-you-sleep)
- [Augmentable：2026 年 AI Agent 记忆全景](https://augmentable.ai/blog/state-of-ai-agent-memory-2026)
- [arXiv：记忆 vs 长上下文的成本-性能分析](https://arxiv.org/html/2603.04814)
- [arXiv：MemMachine，保真记忆系统](https://arxiv.org/html/2604.04853)
- [第一财经：智能体上下文争夺战](http://m.toutiao.com/group/7688653522044994089/)

核验日期：2026-09-23
