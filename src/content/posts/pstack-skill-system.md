---
author: Duang
pubDatetime: 2026-10-07T18:30:00+08:00
title: "拆解 pstack：怎么给 Agent 做一套 skill 体系"
featured: true
draft: false
tags:
  - thinking
description: Lauren Tan 的 pstack 把做事方式拆成入口、环节 skill 和 24 条可点名的原则。本文顺着 lukasen 的拆解，讲这套设计，以及怎么照做一套。
revisions:
  - date: 2026-10-07
    note: 首发。按成稿整理，挂到 thinking。
---

2026-10-07 · thinking

本文挂在 [thinking](/tags/thinking/)。

**缘起**：2026 年 10 月 7 日，lukasen_xyz（@lukasen_xyz，10 年软件工程师，持续写 AI Engineering 长文）发了一篇 X 长文《怎么给自己的项目做一套 skill：拆解 pstack 的入口、技能和 24 条原则》，把 Lauren Tan（@poteto）开源的 pstack 完整拆开。这是系列第四篇，前三篇分别拆了"搞懂再动手""用代码做计划""让 agent 自己证明做对了"三组 skill。本文顺着这条线，把 pstack 的设计讲透，并落到"你怎么照做一套"。

## pstack 是什么：一个人的工程方法论

pstack 是 Lauren Tan 放在 Cursor 插件仓库里的一套 skill，MIT 许可。她的背景很有说服力：Meta、Netflix、Cursor 的多年经验，React 核心团队、参与 React Compiler。

README 第一段就立住了立场：

> there's a growing sense that ai writes too much slop code. i agree. i don't want to ship like a team of twenty slop artists. throughput without quality is not a goal i aspire to. if you want to go fast, go deep first.

中文大意：AI 写太多烂代码，我也这么觉得。我不想像二十个流水线工人那样出货。没有质量的吞吐不是我的目标。**想快，先做深。**

这是一套把"工程师怎么做事的"拆成三层结构：一个入口负责挑流程，一组按环节分好的 skill 负责干活，24 条有名字的原则负责纠偏。外加 /automate-me，从你自己的对话记录里挖出习惯，生成属于你的入口 skill。

<section class="article-embed-note">
  <p class="article-embed-note-title">三层，再加一个生成器</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>入口</b></p>
      <p>poteto-mode 从 23 个 playbook 里挑一条。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>环节 skill</b></p>
      <p>12 个工具按环节干活。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>原则</b></p>
      <p>24 条有名字的规则，用来纠偏。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>automate-me</b></p>
      <p>从你自己的对话记录里生成入口。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">入口挑流程。skill 干活。原则纠偏。</p>
</section>



## 第一层：一个入口，23 个流程

### 入口只做一件事：把目标路由到流程

入口叫 /poteto-mode。你只说目标，它读完请求，从 23 个 playbook（流程手册）里挑最匹配的一个。playbook 就是写好的固定步骤，比如查问题、修 bug、做功能、重构、性能。

挑中之后，它把这个 playbook 的步骤抄进待办清单，按步骤调用其他 skill。多数时候你不用点名"先跑 /how 再跑 /why"，入口替你安排。跳过的步骤也留在清单上，写明跳过的理由。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-gate-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">小门瓶</span>
  </div>
  <p class="duang-whisper-body">你只说目标。挑哪条流程，入口自己定。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>


### 23 个 playbook 都覆盖什么

从 README 的完整列表看，这套 playbook 基本把一名工程师的日常全包了：

| Playbook | 适用场景 |
|-|-|
| investigation | 只读问题：x 怎么运作、y 为什么这么建、我们确定吗 |
| bug fix | 复现缺陷、定位根因、用运行时证据修复 |
| perf / hillclimb | 性能问题：先量基线再优化；hillclimb 是围绕单一指标持续改进 |
| runtime / trace forensics | 线上症状诊断（泄漏、空转）与离线 profile 分析 |
| feature / refactoring / prototype | 新功能（从数据形状出发）、保行为重构、一次性原型验证 |
| authoring a skill / eval | 写 skill；盲测某个 skill 或 prompt 改动对行为的影响 |
| babysit / shipping / autonomous run / orchestrate | 把 PR 推到可合并、独立验证后合入、长任务无人值守、多日多 PR 的协调 |
| session pickup / pause safely | 接手别人跑了一半的工作、干净地暂停可恢复 |
| multi-phase plan / worktree cleanup / opening a pr | 跨阶段计划、清理 worktree 磁盘、收尾开 PR |

注意最右一列几乎没有抽象词。每个 playbook 都对着一类具体失败模式写的。这是整套设计的第一条方法论：**流程按失败场景切，不按任务类型切。**

### 好提示词最多带五样

入口省掉了流程选择，但省不掉你要说清楚的东西。作者在指南里列了一条好提示词最多带的五样：

- **目标**：哪里坏了，或者你想要什么
- **完成标准**：必须能判对错，"改好一点"不算
- **想看的证据**：命令输出、操作录屏、存下来的数据、前后对比的数字
- **已知信息**：症状、复现步骤、日志、链接
- **真实约束**：比如"先复现""先别改代码""改之前先给我看"

原文给了一条五样都带的提示词，译成中文是这样：

> /poteto-mode 昨天上线后，CSV 导出丢了最后一行，失败的任务号是 4812。先复现，再修。6 万行的测试数据每一行都导出来才算完成。给我看修复前后的行数。

作者还建议先别说你对原因的猜测。你一说，agent 就只在你指的地方找。让它先用自己的话复述问题，理解错了在复述里就能看出来。

### 入口怎么路由：非协商项

poteto-mode 不只是挑 playbook。它的 SKILL.md 里写着一组非协商项（Non-negotiables），任何任务进来先过一遍触发规则：

- 代码跨函数边界，先 /architect，并行做设计探索再实现
- 并行扇出用 /swarm（覆盖矩阵、竞速、探索分区）；设计对决用 /arena
- 有争议的设计先 /interrogate，多模型对抗评审
- 任何 prose 面先 /unslop；文档、RFC、README 走 /technical-writing
- 提交前跑 /deslop；评审前跑 /no-comments
- 要报告自己测出的数字，先过 /benchmark-checklist
- PR 状态类请求走 Babysit playbook，不调 Cursor 内置的同名 skill
- 着陆绿色栈走 Shipping playbook，"绿"不等于安全

这些规则的共同点：把"该用什么方法"从你的记忆里拿出来，写进 agent 的启动条件。你只描述问题，方法由入口决定。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    方法写在启动条件里。不用靠你记得先跑哪一个。
  </div>
</details>


### 模型分工：让每个模型做它最擅长的事

pstack 默认是多模型分工：代码委托（feature、refactoring、bug fix、perf、hillclimb）走 Grok，最难的改动、散文和判断走 Opus 5.5，默认面板是 Opus 5.5 / Grok。

/setup-pstack 检测你有哪些模型、问推理预算，然后写一个 pstack-models 规则文件，所有 skill 都读它。预算档位：

- xhigh：默认档，等于 large 预算
- unlimited：每个模型提到最高档（Opus 到 max，Grok 到 xhigh）
- medium / small：降低推理、省 token

省钱的组合：主对话用强模型，代码角色用便宜快模型；panel 列表缩短（每个角色跑一个子代理）；普通小改动不启用 /poteto-mode。

### 一个 playbook 长什么样：bug fix 拆开看

入口匹配到 Bug fix playbook 后，步骤是这样（来自 playbook 原文）：

1. 自己在匹配的表面上复现，不是让用户复现；驱动到它触发为止
2. 二分定位根因：形成候选假设，逐一排除直到剩下一个；用 /how 理解受影响的子系统、/why 查回归历史
3. 计划修复：跨函数边界先 /architect，实现委托给子代理（默认 grok-4.7-xhigh-fast）
4. 在同一表面验证：原来的复现现在通过了；"不确定"或"表面不对"不算过
5. 提交顺序让失败的复现先落地、修复在上，即 failing test first
6. 跑 Opening a PR playbook 收尾

注意第一句："Be scientific. Every shipped line traces to runtime evidence." 每行代码都要追溯到运行时证据。"可能有用"的双保险是假设，不是修复，不进代码。证据推翻假设时，连带着回退它引起的改动。这是整套体系的科学底色。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    构建通过了，还不算做完。
  </div>
</details>


## 第二层：按环节分好的 skill

入口下面是干活的 skill。系列前三篇按环节拆了 12 个工具，分三组。

### 搞懂再动手

- **/how**：代码怎么运作
- **/why**：当初为什么这样写
- **/recall**：开工前接上昨天的进度
- **/teach**：把前两个包起来，讲到你真懂

### 用代码做计划

作者在 Pt.2 里说，计划模式常常把实现细节写得太细，别的又写得太少。所以 pstack 用代码做计划：

- **/arena**：让几个子代理各做一版再合并
- **/architect**：先画类型和签名再填实现
- **原型 playbook**：把几个方案放进一个开关里挑

### 验证和约束

作者把验证放在第一位：agent 能自己验证，才不需要你一直盯着。

- **/create-verification-skill**：生成一个能操作真实应用的验证 skill
- **/maintain-verification-skill**：定期复查它
- **/blast-radius**：查改动会在别处弄坏什么
- **/correct**：让反复犯的错没法再犯

12 个工具有 11 个是独立 skill，原型是 /poteto-mode 里的 playbook。

## 第三层：24 条有名字的原则

### 用名字纠偏，不用段落纠偏

pstack 里还有 24 条原则，每条也是一个 skill。入口在多步任务开始时读一遍原则索引，用到哪条就在回复里点名，并说明这条原则改了哪个决定。

这层最有意思的用法：**你不调用原则，你用原则的名字纠偏。**每个名字背后是一条 agent 已经读过的完整规则，一个短语比一段解释更准。原文举了三个例子：

- agent 准备在三个旧适配器上再加第四个，你说"use subtract before you add"，让它先删掉过时的，再设计剩下的
- agent 说构建通过了就算完成，你说"apply prove it works"，让它跑真实的导入流程，给你看写进去的记录
- 两个并行任务要写同一个分支，你说"separate before serializing shared state"，给每个任务单独的 worktree，不加锁

作者还给了一个检查办法：**agent 点名了原则，却说不出改了哪个决定，就是只报了名字、没真用上。**

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-tag-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">点名瓶</span>
  </div>
  <p class="duang-whisper-body">点了名字，就得说出改了哪个决定。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>


### 原则怎么分组

24 条按五类组织（README 与 guide 原文）：

| 分组 | 代表原则 | 回答的问题 |
|-|-|-|
| 核心（10 条） | laziness protocol、attack the premise、prove it works、build the lever、foundational thinking | 建多少、何时重新思考设计 |
| 架构（6 条） | model the domain、boundary discipline、type system discipline、make operations idempotent | 状态、校验、兼容性放哪里 |
| 验证（5 条） | prove it works、fix root causes、sequence verifiable units、test behavior not implementation、explain the number | 什么才算证明 |
| 委托（2 条） | guard the context window、never block on the human | 并行工作如何保持可控 |
| 元原则（1 条） | encode lessons in structure | 怎么把教训固化进结构 |

对普通项目最有用的是这几条：

- **laziness protocol**：优先删除和最小改动
- **attack the premise**：两次修复都失败，就去质疑它们共同依赖的前提
- **prove it works**：验证真实产物，不验证替代品
- **test behavior, not implementation**：像用户那样调用代码，断言具体的期望值
- **build the lever**：agent 反复手工做同一件事，就让它写一个能重跑的脚本或 skill

作者说了，这张表不用背。先扫一遍，等你发现 agent 犯了某个名字本来能拦住的错，再回来查。

### 24 条原则全名单

上面表格只列了代表。完整 24 条按五类排是这样（每条都是一个独立 skill，名字即触发条件）：

| 分组 | 原则名 | 何时适用（原文提炼） |
|-|-|-|
| 核心 | Laziness Protocol | 重构、评估改动大小、想加抽象层时：偏好删除和最小改动 |
| 核心 | Foundational Thinking | 写逻辑前：先定核心类型与数据结构、并发共享的是什么 |
| 核心 | Redesign from First Principles | 把新需求整合进既有设计：像第一天就在那样重新设计 |
| 核心 | Attack the Premise | 两个以上修复共用一个前提却都失败：先普查，再质疑前提 |
| 核心 | Subtract Before You Add | 安排增补、重构、重写顺序：先删死重，再在更简单的基础上建 |
| 核心 | Minimize Reader Load | 梳理难以追踪的代码：数层级和隐藏状态，折叠单调用包装，缩小可变作用域 |
| 核心 | Outcome-Oriented Execution | 有计划的重写与迁移：收敛到目标架构，不保留过渡兼容态 |
| 核心 | Experience First | 产品、UX、功能范围权衡：用户体验优先于实现便利 |
| 核心 | Exhaust the Design Space | 没有先例的新交互或架构决策：先做两三个竞争原型再定 |
| 核心 | Build the Lever | 任何非平凡工作：先写能证明它的工具或脚本，而不是手工做 |
| 架构 | Model the Domain | 写有状态逻辑或大量分支：用结构（状态机、类型化模型、表）承载领域 |
| 架构 | Boundary Discipline | 接线校验、错误处理、框架适配：守卫在系统边界，信任内部类型 |
| 架构 | Type System Discipline | 设计类型与签名：让非法状态不可表示，品牌化原始类型 |
| 架构 | Make Operations Idempotent | 设计会在崩溃与重试中运行的命令与循环：收敛到同一终态 |
| 架构 | Migrate Callers Then Delete Legacy | 引入新内部 API 而旧调用者存在：一波内迁移并删除 |
| 架构 | Separate Before Serializing Shared State | 并发角色可能写同一文件、分支、键：先消除共享 |
| 验证 | Prove It Works | 任务后宣布完成前：验证真实产物，不是"能编译"或替代品 |
| 验证 | Fix Root Causes | 调试：复现为先，追溯到根因，问 why 直到到达 |
| 验证 | Sequence Work into Verifiable Units | 多步工作：拆成每步以检查收尾的小单元，验证后再下一步 |
| 验证 | Test Behavior, Not Implementation | 写改测试：像用户那样调用，断言字面期望值；处处 undefined 仍会通过的测试要重写或删 |
| 验证 | Explain the Number | 信任、报告或行动于一个测得的数字前：找到限制它的因素，排除测错对象 |
| 委托 | Guard the Context Window | 批量阅读路由给子代理，结论留在主会话 |
| 委托 | Never Block on the Human | 可逆工作直接推进，把结果呈现出来 |
| 元 | Encode Lessons in Structure | 重复两次的建议：写成 lint、检查或脚本；/correct 在整仓库落地它 |

## 元原则：把纠正写进代码库

24 条里有一条元原则叫 encode lessons in structure：**同一个建议说过两次，就写成 lint、检查或脚本。**

/correct 是它的落地版。顺序是：

1. 先用架构让错误写不出来
2. 再用类型或 lint 拦住
3. 然后写测试
4. 最后才写文档或 agent 规则

文档排最后，原文的理由很直接：agent 跳过一条规则时什么也不会失败。人工评审干脆不在清单上。每个 PR 都要评审者抓同一个错，正是 /correct 要解决的问题。

## 无人值守：把信任变成一份合同

这是整套体系的前置兑现：一个能自己验证的 agent，才配得上留它过夜干活。安全的来源不是希望，而是四条检查加一份合同。

### 先挣到信任，再开循环

guide 的 overnight 一页说：你不信任的循环只会更快地产出未检查的工作。开跑前四项都成立才行：

- 这个任务你至少亲手做过一遍（或看过 agent 做），知道"好"长什么样
- agent 有你自己的工具和信号：验证 skill、profiler、日志
- 每个阶段都能证明自己的工作，不合格能停线
- 你读过几份 transcript，把重复失败变成了工具、skill 或检查

### overnight contract：一份能自动读的交接合同

原文给的合同不长，每句买一样东西：

> /poteto-mode im going to bed. migrate every caller to the new parser in a fresh worktree off base. done means zero old callers, all parser fixtures pass, old api deleted. keep a decision log. don't ask me before committing. /loop until done. if you're truly stuck after a few hours, stop and write up why.

- "im going to bed"：会话级覆盖，agent 停止请示、继续干
- "done means..."：把目标变成每轮都能跑的检查
- "fresh worktree off base"：隔离运行，不和你开着的其他东西碰撞
- "don't ask me before committing"：预先回答掉 agent 会卡住的权限问题
- "/loop until done"：Cursor 内置唤醒机制，按事件或心跳复查完成条件
- 逃生口：真到死胡同就停下来写原因，胜过八小时创造性的目标重解释

因为你要走开再回来审核，/poteto-mode 会把这种任务路由到 /figure-it-out，先设计阶段再写代码，并接入决策日志。

### autopilot：一晚上跑完一个队列

一夜的任务常常不是一个，是一串。两个 playbook 把同样的信任放大到队列：

- **Autopilot-full**：独立 PR 队列跑到合并。每个 PR 一个 owner agent 从构建带到合并，没有任何 owner 凭自己的结论合并；每轮由一群全新 verifier 在 owner 的 code-ready head 上开跑，只有干净结论才授权合并
- **Autopilot-stack**：同样循环但不合并，你醒来得到一条线性 base-branch 栈、每个链接都有 verifier 结论，自己审完再落地。改动耦合时选它

### 晨间审计：审决策，不重读整夜

决策日志是 /show-me-your-work：每行记录时间、阶段、决策、理由、证据指针、结果，存成 decisions.tsv。默认本地，工作够重要才提交。

早上你问"catch me up on what you did last night"，skill 先派一个不同模型家族的评审者读日志和 transcript，回复末尾有 Attention 段列出值得你仔细看的东西。先读 Attention，再读它指向的日志行。你是审计决策，不是重读整夜。

### 守护信任的三道闸

- Shown 段之外还要过一遍：verifier 与 owner 必须不同，per-PR 独立裁决，swarm 在每次改动后重新开跑
- 从未有人工评审者的 PR 队列：人工评审不在清单上，是因为每个 PR 都要评审者抓同一个错，正是 /correct 要解决的问题
- 一晚上跑完不等于做对：finish condition 永远不悄悄放宽来宣布胜利，plateau 意味着 pivot 而非 stop

## 做你自己的：/automate-me

前面讲的都是作者的习惯。pstack 指南里专门有一篇《Make it yours》，开头一句是：poteto-mode 是一个人的风格，底下那套流程、路由和模型分工换成你的风格一样能用。

### 六步流程

1. 按你的名字查有没有已有的 -mode skill；有的话先问更新还是重建，选更新就只看它上次修改后的记录
2. 只读当前项目的对话记录，分几段并行派子代理找习惯
3. 用一两轮选择题问你，再问一个开放问题
4. 按回复风格、自主程度、子代理、验证、流程分组
5. 起草 skill，默认只能手动调用，再用 /unslop 删掉废话
6. 在 worktree 里提交，开 PR，不直接推 main

它挖的信号包括：你喜欢多长的回复、什么时候让 agent 自己做、怎样才算"做完"、代码和文字规范、提交和评审流程。

### 护栏比流程更值得抄

- **至少在两段不同时间的记录里都出现过**，才算可信的习惯；只出现一次的，通常直接丢掉
- **只读当前项目的记录**，不跨项目翻别人的对话
- **每条都要能执行**，"沟通要清楚"这种话不算规则

作者在同一篇里还有两个配套：/reflect 在一次任务后让三个审阅者提改进建议，你批准了才改 skill；改完 skill、合入之前先做盲测：同一个任务跑新旧两版，比较结果再决定留不留。guard the context window 的原则也在这里：bulk reading 路由给子代理，结论留在主会话。

## 容易误解的三件事

- **skill 不是装得越多越好**。作者原话："Start smaller than you think." 第一天用不着很多 skill，甚至用不着整个插件。先正常写提示词，看 agent 在哪里失败，同一个失败出现两次再加 skill 或检查。
- **原则表不是用来背的**。原则的价值在于名字短、背后的规则完整，纠偏时一句话就够。
- **pstack 有 Cursor 专用的部分**，Claude Code 里要改写。比如 .cursor/ 路径、Cursor 自带的 create-skill，还有 Opus 5.5 加 Grok 的多模型分工。lukasen 的提示词都按 Claude Code 改过，但他没有逐条实测，用之前先看一遍草稿。

## 我的几点判断

- **pstack 的本质是把"工程师的判断"做成了可路由、可点名的结构**。入口 playbook 是流程知识，12 个 skill 是环节知识，24 条原则是决策知识。三层各司其职，且都能被 agent 显式引用。这比把一大段 AGENTS.md 塞进提示词高一个量级。
- **原则用"名字"承载是整套设计最聪明的一笔**。名字既是人机共同语言（你能说，agent 能认），也是可审计的单位（说了就必须说出改了哪个决定）。它把"纠偏"从模糊对话变成确定性检查。
- **/automate-me 的方向对，但门槛在护栏**。从历史里挖习惯不难，难的是"两段记录交叉验证、只读当前项目、每条可执行"这三条护栏。它们保证了生成的 skill 是复现出来的习惯，不是一次性偶然。
- **验证优先是这套体系最值得抄的部分**。/create-verification-skill 让 agent 自己证明做对了，blast-radius 管改动影响面，correct 管错误不再复发。三件套恰好覆盖"做完、没弄坏、不再犯"。
- **定位要清楚：这是一套方法论，不是一个插件**。对大多数项目，起步建议是：先抄五样提示词规范 + prove it works 一条原则，等失败模式出现两次再慢慢加 skill。

## 参考与延伸阅读

- lukasen_xyz 原帖：https://x.com/lukasen_xyz/status/2107645161794933237
- 系列 1/3 搞懂再动手：https://x.com/lukasen_xyz/status/2107354213777101119
- 系列 2/3 用代码做计划：https://x.com/lukasen_xyz/status/2107392127802225009
- 系列 3/3 让 agent 自己证明做对了：https://x.com/lukasen_xyz/status/2107392698969931902
- Lauren Tan，pstack 仓库（MIT）：https://github.com/cursor/plugins/tree/main/pstack
- pstack 指南：https://github.com/cursor/plugins/tree/main/pstack/docs/guide
- Lauren Tan，The Complete Guide to pstack Pt. 1 / Pt. 2（2026 年 9 月 X 帖子）
