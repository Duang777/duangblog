---
author: Duang
pubDatetime: 2026-09-23T15:50:00+08:00
title: 《Jev 工程学》解读：KV cache 的暴政，与 coding agent 的下一种架构
featured: true
draft: false
tags:
  - thinking
description: KV cache 让 agent 只会往对话后面追加。按 TypeSafe 的 Jev 笔记，把上下文改成每轮组装的状态。
revisions:
  - date: 2026-09-23
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> 核心结论：今天 agent 的种种别扭，很多不是模型的问题，而是“上下文只追加、不组装”这个经济约束的副产物；把上下文当成可寻址、可打分、可重组的资产，是下一轮 agent 架构的杠杆点。

Diogo Almeida 设计笔记 · yibie 中文翻译 · 2026-09

## 1. 从一份 12 页的笔记说起

TypeSafe 创始人 Diogo Almeida 有一份 12 页的设计笔记《Jev 工程学：为 coding agent 而作》，讲的是围绕 Jev 构建 coding agent 的思路。yibie 已把它全文翻译成中文并开源在 GitHub（[yibie/jev-engineering-zh](https://github.com/yibie/jev-engineering-zh)），保留原章节结构和全部 7 张插图。

翻译仓库里其实有两份文档：根目录是第三方汇编整理的工作笔记（结构正式、六个症状已表格化），source-notes 目录是作者的原始设计笔记（保留口语化表达和随手链接）。对照读，能看到一份设计想法从笔记到成文的加工过程。

## 2. 一个挑衅性的问题：没有 KV cache 的 coding agent

笔记从一个提问开始：**如果语言模型没有 KV cache，你会怎么设计一个 coding agent？**

这个问题有杀伤力，因为 KV cache 是今天所有 agent 被建成“只追加对话记录”的根本原因——复用缓存前缀很便宜，但改动早期上下文会让缓存失效，迫使模型重新处理改动之后的一切。这个单一的经济事实塑造了当前 agent 几乎每一个设计决策，却通常没人把它说出来。

把缓存拿掉，会暴露两件事：它允许一种状态显式的架构——**上下文是被组装的，而不是被累积的**；同时揭示为什么“把简单活路由给便宜模型”这种直觉上正确的想法在实践中会失败。笔记管这叫 **KV cache 的暴政**。

## 3. KV cache 的六个症状

笔记认为，当前 agent 不加审视就继承了六个设计选择：

| 症状 | 为什么存在 | 代价 |
|-|-|-|
| **路由失效** | 交还给大模型时需要重新处理上下文 | 混合路由比纯前沿更贵 |
| **工具挤占上下文** | schema 必须待在系统消息里 | token 花在无关工具上，选择质量下降 |
| **Compaction** | 假设所有未来轮次共享同一份状态 | 查询无关的压缩丢掉了后面需要的东西 |
| **子 agent 稀少** | 决定传什么上下文进去、什么合并回来很难 | 几乎没有自动并行 |
| **重启** | 有状态的对话记录会随时间腐坏 | 相关的旧状态跟着坏状态一起被丢弃 |
| **电池之争** | 每个内置能力都永久消耗上下文 | 在易用与强大之间被迫二选一 |

一个例子最能说明问题：路由。直觉方案是让前沿模型规划、把执行交给便宜模型、再让前沿模型回来审查。但按 Opus（$5/$25）和 Sonnet（$3/$15）标价，代入一个合理会话形态（X=0.65、Y=0.12、Z=0.23），纯 Opus 是 4.15，而那条本该省钱的路由路径是 6.19——**留在前沿模型上的成本，大约是那条路径的三分之二**。教训不是路由错了，而是按 token 定价、不按上下文重建定价的路由错了。

<details class="marginalia" open>
  <summary>路由账</summary>
  <div class="marginalia-body">
    这笔账的关键不是 Opus 贵，是前缀作废之后，便宜模型也要重读整段上下文。路由如果保不住 KV cache，就是在买两次入场券。
  </div>
</details>

## 4. token 到底花在哪

重新设计 harness 之前，先搞清楚一次会话里预算被谁吃掉。下表估算典型 CLI coding agent 会话中各子任务占总处理 token 的份额（输入密集视角，重复读取每次计数）：

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：典型 CLI coding agent 会话的 token 份额</p>
  <p class="article-embed-note-lead">估算区间，输入密集视角，重复读取每次计数。单位：%</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 340" role="img" aria-label="读文件 30-40%，搜索加命令输出约三分之一，写代码仅 4-10%"><text class="perf-label" x="8" y="46">读文件内容</text><rect class="perf-hbar" x="467" y="30" width="89" height="22" rx="3"/><text class="perf-chip-sub" x="476" y="46">30-40</text><text class="perf-label" x="8" y="86">命令输出</text><rect class="perf-hbar" x="289" y="70" width="89" height="22" rx="3"/><text class="perf-chip-sub" x="298" y="86">10-20</text><text class="perf-label" x="8" y="126">搜索代码库</text><rect class="perf-hbar" x="289" y="110" width="71" height="22" rx="3"/><text class="perf-chip-sub" x="298" y="126">10-18</text><text class="perf-label" x="8" y="166">推理与规划</text><rect class="perf-hbar" x="244" y="150" width="89" height="22" rx="3"/><text class="perf-chip-sub" x="253" y="166">5-15</text><text class="perf-label" x="8" y="206">系统提示 / schema</text><rect class="perf-hbar" x="244" y="190" width="62" height="22" rx="3"/><text class="perf-chip-sub" x="253" y="206">5-12</text><text class="perf-label is-tail" x="8" y="246">写和编辑代码</text><rect class="perf-hbar is-tail" x="236" y="230" width="53" height="22" rx="3"/><text class="perf-chip-sub" x="245" y="246">4-10</text><text class="perf-label" x="8" y="286">向用户解释</text><rect class="perf-hbar" x="218" y="270" width="27" height="22" rx="3"/><text class="perf-chip-sub" x="250" y="286">2-5</text><line class="perf-axis" x1="210" y1="304" x2="610" y2="304"/><text class="perf-caption" x="210" y="326">0%</text><text class="perf-caption" x="343" y="326">15%</text><text class="perf-caption" x="477" y="326">30%</text><text class="perf-caption" x="610" y="326" text-anchor="end">45%</text></svg>
  </figure>
  <p class="article-embed-note-foot">写代码——coding agent 存在的理由——是最小的开支项之一；读取与搜索合计接近三分之二。</p>
</section>

最触目惊心的是：**写代码——coding agent 存在的理由——是其中最小的开支项之一（4-10%）；读取和搜索占了近三分之二。**独立的分析指向同一方向：微软 fastcontext 项目报告，在 GPT-5.4 的轨迹里，读取和搜索占所有工具调用轮次的 56.2%、占主 agent 总 token 的 46.5%。

如果这能推广，coding agent 里最大的效率收益不是更好的模型或更好的 diff 格式，而是**更聪明的检索**。

<details class="marginalia" open>
  <summary>账单</summary>
  <div class="marginalia-body">
    CLI agent 的账单长得像搜索引擎，不像代码生成器。这和产品页上的演示正好反着来。
  </div>
</details>

## 5. 替代架构：显式状态与 Jev 决策层

笔记提出的替代架构，围绕一个带类型的显式状态 harness 构建，Jev 在每一轮做决策。几个核心主张：

- **Jev 不是写代码的模型，而是旁边那层决策层。** harness 把当前状态和预定义问题交给 Jev，Jev 返回 choice、score、noul 这类类型化答案，再由前沿模型、子 agent 和工具去执行实际工作。
- **元注意力：把上下文本身当成决策。** 对每个查询，Jev 先判断现有上下文有多好（复用缓存还是重建），再决定如何构造新上下文；上下文块按查询逐个打分，同一个 grep 结果对一个问题可能是相关命中、对下一个问题完全不可见——这就是查询感知的压缩，compaction 所缺的属性。
- **三级披露：模型先看一张廉价的全局地图，只为选中的东西付细节的钱。** 短片段描述可用动作，schema 在需要时动态加载，用完即丢——电池之争因此消解。
- **条件化指令：AGENTS.md 按条件加载。** 指令附着到条件上而不是会话上，并且免疫于压缩（条件成立时重新加载）。
- **安全感知的路由：路由的第三个轴是信任。** 按子任务可能触碰的文件类型（公开文档、应用代码、密钥、专有研究代码）决定可用模型。
- **后台处理与极端并行。** 只读的后台任务共享一次检索；显式区分读写让并发可处理，只读任务永不争锁。

## 6. 这份笔记怎么读

如果你只想要结论：**今天 agent 的种种别扭，很多不是模型的问题，而是“上下文只追加、不组装”这个经济约束的副产物；把上下文当成可寻址、可打分、可重组的资产，是下一轮 agent 架构的杠杆点。**

想深入读，建议按这个顺序：先读 yibie 的[中文翻译](https://github.com/yibie/jev-engineering-zh)（或[原帖](https://x.com/yibie/status/2102260699133059554)）把握整体，再对照 source-notes 看作者的原始推理过程，最后回到官方文档 [docs.typesafe.ai](https://docs.typesafe.ai) 看 Jev 的实际用法（三种提问原语、分层阈值、system-one）。

这不是一篇“看完就会用”的工具文，而是一份“重新想清楚 agent 为什么长这样”的设计课。对正在做 AI 应用、Agent 架构或上下文工程的人来说，值得放进收藏夹反复读。

---

资料来源：X 原帖（[@yibie](https://x.com/yibie)）｜GitHub 仓库：[yibie/jev-engineering-zh](https://github.com/yibie/jev-engineering-zh)（Jev 工程学中文翻译与汇编）｜核验日期：2026-09-23
