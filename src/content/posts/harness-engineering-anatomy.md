---
author: Duang
pubDatetime: 2026-10-06T13:30:00+08:00
title: "Harness Engineering：一份源码解剖，和一个学科的诞生"
featured: true
draft: false
tags:
  - thinking
description: 2026 年 7 月的一篇源码解剖把 11 个 coding agent 的 harness 拆开。Agent 等于模型加 harness，竞争落在运行时上。
revisions:
  - date: 2026-10-06
    note: 首发。按成稿整理，挂到 thinking。
---

2026-10-06 · thinking

本文挂在 [thinking](/tags/thinking/)。

**背景**：2026 年 10 月初，MercadoLibre 工程师 santi（@santtiagom_，在 X 上有 6.4 万关注者）发了一条帖子，推荐一篇他读过的最好的 Harness Engineering 论文，认为它把什么是 harness、当前 coding agent 怎么构建、Claude Code / Codex / Gemini CLI 之间反复出现的模式、这个类别往哪走、以及如果要自己造一个该怎么做五件事一次讲清了。帖子很快积累了 1472 赞、2179 书签和 7.8 万次浏览。他指的论文，是 2026 年 7 月发表在 arXiv 上的 **《Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents, A Source-Code Study of Eleven Systems》**（Barbaste 等，arXiv:2609.00006）。这不是一篇概念文章，而是一次对 11 个生产级 coding agent 源码的直接解剖：约 400 万行 Python、TypeScript 与 Rust，7 个规范子系统、29 个重复设计模式、13 条横切观察、18 条设计建议，外加一段 90 天的纵向演化对比。

> 帖子原文（节选）：les dejo uno de los mejores papers que leí sobre Harness Engineering. explica muy bien: qué es un harness / cómo están construidos los coding agents actuales / qué patrones se repiten entre Claude Code, Codex, Gemini CLI, etc. / hacia dónde está evolucionando la categoría / qué recomiendan si querés construir uno. todo parte de una definición simple: **Agent = Model + Harness**。

这篇博客沿着论文的骨架展开，但不止于复述：我会把每条观察放回它出现的位置，补上论文之外的前沿讨论（LangChain 的 harness engineering 系列、Thoughtworks 的实践指南、Codex Knowledge Base 的解读），并在关键处给出我自己的判断。

## 什么是 Harness：一个五个月内成型的学科

论文给出的核心定义是一行代数：**Agent = Model + Harness**。模型提供智能；harness 是通过 loop、工具、上下文管理、安全控制、编排与扩展面，把智能变成工作的运行时。Harness engineering 这个说法在 2026 年 2 月进入流通：Mitchell Hashimoto（HashiCorp 创始人）在自己的 AI 实践博客里第一次使用，每当 agent 犯一个错误，我就把修正永久地编进它的环境，随后 LangChain 的 Vivek Trivedy 在 Deep Agents 语境里把它定义并展开，LangChain 官方博客用 traces 定位 agent 失败模式、反过来改进 harness 的做法，把提示工程正式升级成了 harness 工程。

论文特别用四个边界情形清理了这个词的常见混淆，这是我认为全文最有价值的一段：

- **harness ≠ scaffold**：scaffold 是结构性代码（loop、注册表），harness 是把它包进去的成品运行时。Mini-SWE-Agent 的 scaffold 约 100 行 Python，Claude Code 的 harness 是一个带终端 UI、权限系统和插件生态的产品。
- **harness ≠ agentic framework**：framework 是开发者 import 进自己代码的库；harness 是开发者工作在其内部的运行时。这个区别在 2025 年还很清晰，2026 年正在从两个方向溶解。
- **harness ≠ evaluation harness**：SWE-bench 的 harness 把 agent 包起来跑任务；agent harness 把模型包起来让它行动。同一个词，包裹方向相反。
- **harness ≠ orchestrator**：orchestrator（meta-harness）从上方协调多个 harness，自己实现编辑 loop。Omnigent 协调 11 个厂商 harness，不实现任何编辑 loop，它是关于 harness 的证据，而不是其中一个。

这四组区分之所以重要，是因为 harness 一词 2026 年几乎被用滥了，厂商发布会、开源 README、招聘 JD 各说各话。论文把它钉死在模型之外的一切这个操作性定义上（它采纳了 Macedo 的定义核心：包裹语言模型、使其能对仓库采取行动的层），并用七个子系统把概念落地成可检查的清单。

### 七个子系统：一张每个 harness 都必须回答的考卷

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：七个子系统</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>循环</b></p>
      <p>推理和动作怎么交替，什么时候停。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>模型接入</b></p>
      <p>厂商协议、prompt 怎么拼、缓存和路由。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>工具</b></p>
      <p>工具怎么定义，调用怎么执行。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>记忆与上下文</b></p>
      <p>这一轮给模型看什么，什么东西要留下来。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>安全</b></p>
      <p>什么能跑，什么要问，什么禁止。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>编排</b></p>
      <p>子 agent 怎么派出去，怎么收回来。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>扩展</b></p>
      <p>hooks、skills、plugins、MCP 从哪接进来。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">界面和会话贯穿这七项。说不做，也是在表态。</p>
</section>

七个分析维度（D1-D7）覆盖了：Agent loop（推理与动作交替）、LLM integration（厂商协议、prompt 组装、缓存与路由）、Tools & actions（工具定义与执行）、Memory & context（上下文配给与持久化）、Safety & permissions（什么能跑、什么要问、什么禁止）、Orchestration（子 agent 派生与协调）、Extensibility（hooks / skills / plugins / MCP）。两个横切面，interface layer（TUI/IDE/SDK/server）和 session substrate（transcripts、持久化、resume/fork），贯穿其中。

论文最有说服力的地方在于：从 100 行的研究基线到 110 万行 Rust 的生产 CLI，**每个系统都必须在这七个维度上表态，哪怕表态方式是刻意缺席**。Mini-SWE-Agent 用约 100 行实现了全部七个子系统（一个 while、一个模板、一个工具、一个消息列表、两个上限、没有编排、用 Python 结构化类型作为全部扩展故事），并在 SWE-bench Verified 上报出与体量大三个数量级的系统同量级的结果（各系统自报：OpenHands 77.6%、Mini-SWE-Agent 74%+、Claude Code 72.7%、Codex 69.1%，论文强调这些数字不可比，且已在对比表里删除）。这个最小实现存在性证明把整个学科的张力点出来了：**任务完成度不是由 scaffold 复杂度决定的，生产系统多出来的几万行代码花在别处，安全、体验、可扩展性、客户端与传输**。OpenCode 的非测试源码约五分之三是 TUI/web/desktop/SDK 客户端；Codex 的 July 树有六位数的行数花在 app-server 传输、插件和实时语音层上，这些都不在任何 benchmark 里。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-sheet-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">考卷瓶</span>
  </div>
  <p class="duang-whisper-body">七项都要表态。说不做，也是一种表态。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>


### 三种 loop 范式：迭代、反射与协调器-工作者

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：三种 loop</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>迭代</b></p>
      <p>九个系统的主范式。做一步，看结果，再做一步。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>反射</b></p>
      <p>Aider 这一支。循环里多一轮对自己输出的检查。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>协调器与工作者</b></p>
      <p>Claude Code、Codex、Hermes 用配置把门打开。一个协调，几个去干。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">都是 ReAct 的变体。差别在实现，不在名字。</p>
</section>

所有系统都是 ReAct 的变体，但实现差异极大。迭代式 action-observation 是 9 个系统的主范式，各自的实现细节比范式本身更值得读：

- **OpenHands：事件溯源会话引擎**，每个事件写入持久 EventLog（每事件一个文件，flock 锁，SecretRegistry 脱敏），LLM 看到的历史是活动分支的缓存投影。会话状态是一棵可移动头部的树，replay/fork/分支导航是一等公民。一次 step 只做一次 LLM 调用，但一个响应里的所有工具调用作为动作批执行，可经 ParallelToolExecutor 并行，由工具声明资源的锁管理器约束。
- **Claude Code：SSE 流式 + 并发安全分桶**，工具默认 isConcurrencySafe=false（安全默认），读类工具（grep/glob/read）可并行，写类工具（edit/bash）不并行。一次 reduce 把工具调用按并发安全分区。
- **Codex：Tokio 异步状态机**，Session 通过 FuturesOrdered 处理工具调用的有序并行执行。
- **Mistral Vibe：中间件管线**，turn 级策略（turn 上限、价格上限、token 上限、自动压缩、上下文警告、只读模式）全部抽成可组合中间件，7 个 agent profile 只是换中间件组合。
- **Gemini CLI：async 生成器 + 混合 loop 检测**，SHA-256 哈希抓常见失败（5 次相同工具调用或 10 次相同内容块中止），30 轮后启动 LLM 自检；工具按并发安全强制串行，模型甚至有个 wait_for_previous 并发旋钮。
- **Hermes：预算循环 + 停止守卫**，90 次迭代预算；verify-on-stop guard 在模型文本响应未附带新鲜验证证据时否决提前结束（反射被移出循环体、放进停止条件）。
- **OpenCode：log-as-queue**，消息日志就是工作队列，子 agent 派生和压缩都是持久化的消息片段，进程重启即可续跑。

这里我特别想强调一个论文埋下的伏笔：**loop engineering 正在与 harness engineering 分叉**。2026 年 6 月，OpenClaw 原作者 Steinberger 的一句话广泛流传，别再去提示 coding agent，设计 loop 来提示你的 agent，Osmani 随后把 loop 解剖为触发器、拓扑、验证器、停止规则。论文的判断是：harness engineering 造的是内层 action-observation 循环，loop engineering 从外部把该循环组成自我维持的外层循环。二者的接缝已经能在语料里看见，OpenHands 的 /goal 端点在每次运行后用 LLM judge 判定完成与否，Hermes 的 verify-on-stop 否决内循环的退出，这些 harness 特性的唯一目的就是给内循环套一个外循环。

<details class="marginalia" open>
  <summary>内外两层循环</summary>
  <div class="marginalia-body">
    内层循环是 harness。外层循环才是 loop。接缝已经出现在 /goal 和 verify-on-stop 上。
  </div>
</details>


### 模型-代理共同演化：耦合的核心不是能力，是更新回路

第 7 章是全文信息密度最高的章节之一。论文用一个观察 2 概括了厂商绑定问题的真相：**provider 原生优化（缓存边界、extended thinking、reasoning effort、模型专属 prompt）并不被紧耦合所门控，它们被谁付 per-provider 条件代码成本所门控**。紧耦合厂商系统（Claude Code、Codex、Gemini CLI）原生享受全套；但三个多 provider 系统从频谱另一端付了同样的代价：Hermes 手写五条传输（chat-completions、Anthropic Messages、Bedrock Converse、Codex Responses、out-of-process Codex app-server）背后 29 个声明式 provider profile，bit-perfect 前缀归一化连本地 llama.cpp KV cache 都能命中；Pi 手写九个线协议、35 个内置 provider，用约 20 个 per-model 兼容怪癖标志一次性集中付清条件代码成本，甚至用 harness mimicry，拿 Claude Pro/Max OAuth token 时全套伪装 Claude Code 身份（系统提示词开头、beta headers、工具名大小写）去骑消费者订阅；OpenCode 同时发出六个 provider 的缓存方言，把系统提示词压到最多两条消息以匹配缓存槽。

紧耦合唯一买到的独有资产是**服务端协同演化**：Codex 的 scaffold 行为（prompts、reasoning tiers、工具模式、甚至多 agent 工具代）随每个模型版本从 provider 的 catalog 端点重新调优，不发客户端就完成更新。论文的结论一针见血：**厂商耦合已经从能力问题变成谁控制更新回路的问题**。

prompt 内容分析同样值得单独说。论文读了每个系统的规范 prompt，发现六套独立开发的系统在禁止镀金（anti-gold-plating）上措辞惊人地同构（Claude Code: Don't add features, beyond what was asked、OpenCode: NEVER create files unless they're absolutely necessary、OpenHands: NEVER create multiple versions of the same file），LLM 在低约束请求上过度交付是行业级失败模式，大家不约而同地防。2026 年 4 月时禁止自主 commit 还是语料里最一致的修辞收敛，90 天后却三向分裂：Mistral Vibe 删掉了硬规则改为教模型怎么 commit（带强制 Co-Authored-By 签名），Codex 最新代 prompt 完全删掉了 commit 规则和 anti-gold-plating 指令。**行为策略正在从 prompt 散文迁移到配置**，随着模型内化规范，靠提示词说服让位给了靠平台强制。

还有一个论文明确点出、值得所有做 agent 的人注意的空白：11 个 prompt 里没有任何一条包含策略级拒绝语言（如果用户要求 X，拒绝并解释），唯一的拒绝形状是关于操作风险（破坏性 git 操作、secret 卫生、危险 shell 模式）。安全对齐完全委托给模型预训练和 provider 侧策略层。这与 Anthropic 官方工程系列的建议一致：harness 不重复对齐工作。

### 两个贯穿全语料的缺席：没有框架，没有代码 RAG

论文最反直觉的发现是两个零：**横跨约 400 万行代码，没有一条生产 agent 代码路径 import 通用 agentic framework**（LangChain、LangGraph、AutoGen、CrewAI、LlamaIndex、Pydantic AI、Genkit、Semantic Kernel、Google 自家 ADK 全部缺席，Gemini CLI 连 Google 自己的都不用）；**没有一个系统用向量 embedding 检索代码**。所有 loop 都是宿主语言原生异步原语手写的（asyncio、Promise/async-iterator、Tokio），所有工具注册表都是 Pydantic/Zod/TypeBox/Effect Schema/Rust enum 手写的，所有 prompt 模板都是 Markdown/Jinja2/字符串拼接。

这个发现经受住了三倍语料扩展和三个月复审。论文给出的解释值得反复读：

- 框架缺席印证了厂商自己的建议（Schluntz & Zhang 的 Building Effective Agents 警告框架往往制造额外抽象层，遮蔽底层 prompt 与响应，使其更难调试，建议从裸 SDK 调用开始）；生产 SWE agent 与通用 LLM 应用运行在**不同的复杂度预算**上，一旦 agent 在改动真实源码，静默 prompt 损坏、不透明缓存、工具 schema 版本不兼容这类失败模式太贵了，可调试的手写代码胜过可复用的抽象。
- 代码 RAG 缺席则符合 Anthropic 上下文工程指南的 JIT 偏好（grep/tail/file-system 按需检索），且有其领域性原因：代码携带稠密的确定性结构元数据（文件路径、language server、tree-sitter 解析、类型信息），语义相似检索无法复刻；代码每分钟都在变，预索引 embedding 几乎注定过期；每个编码环境本身就带着近似最优的检索系统（ripgrep、find、glob）。CodeRAG-Bench 的发现也支持这一点：检索增益高度任务相关，文档查找和库用法场景显著，模型已有充分参数知识的任务上边际或为零。

我认为这两条是全文对实践者最有指导价值的结论：**当你在自己的 agent 里纠结要不要引入 framework 或 vector store 时，行业里 11 个最认真的实现已经替你做了决定**。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-blank-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">空圈瓶</span>
  </div>
  <p class="duang-whisper-body">四百万行里没有框架，也没有向量检索。先别加。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>
另一个值得注意的对照：语言模型生态里更广的社区同期仍在框架抽象上持续投入，而生产级 coding agent 全部选择了另一条路。这不是巧合，是不同失败成本下的理性选择。

### 记忆：持久化取代压缩成为上下文工程的新前线

压缩策略已经收敛：7/11 用阈值触发的 LLM 摘要（Claude Code 在窗口下方 13K token 缓冲区触发、Gemini CLI 在 50% 触发保留最后 30%、Pi 和 OpenCode 增量合并上一次摘要、Hermes 压缩即会话轮转，不重写 transcript 而是 end 当前 SQLite 会话、rotate 到带 parent_session_id 的子会话）。真正的分化在**持久记忆的写入路径**上，四种治理模型并存：

- **agent 自治维护**（Codex）：后台两阶段管线，per-rollout LLM 提取进 SQLite 状态库（租约任务、重试退避、secret 脱敏），再由一个沙箱内子 agent（无审批、无网络、只写本地）在 git 基线的 ~/.codex/memories/ 根下合并成文件系统产物；记忆注入新会话带引用追踪与用量排序。Codex 是语料中第一个长期记忆由 agent 而非代码维护的系统。
- **人工门控**（Gemini CLI）：save_memory 工具被删掉，改为模型用普通编辑工具直接改 GEMINI.md/MEMORY.md + 一个异步技能提取子 agent 把会话转录挖成补丁文件放进 .inbox/，用户审阅后经 /memory 应用，唯一这种设计的系统。
- **模型直写但有界**（Hermes）：MEMORY.md 2200 字符 + USER.md 1375 字符，作为冻结快照注入，跨轮次写盘不失效 prompt cache；会话回忆是确定性的，SQLite FTS5 BM25 + trigram（CJK），任何地方都没有 LLM 调用。
- **turn 前 agentic recall**（OpenClaw）：Active Memory 插件在每次主回复前运行一个记忆子 agent。

注意一个细节：**没有一个系统把 embedding 检索当作主要记忆底座**，确定性检索的发现从代码延伸到记忆，SQLite 全文搜索（Hermes）就是生产天花板；OpenClaw 是唯一 embedding 默认开启的（混合 sqlite-vec KNN + FTS5/BM25），但只用于聊天回忆、绝不用于读源码树。这与 LoopX 等控制面项目强调状态外置到文件与事件流、确定性 gate 判断完成是同一股潮流的两个侧面：2026 年的共识是把跨会话要保住的东西从聊天记录里抽出来。

### 安全：架构昂贵，且是选择而非规模的后果

Codex 是语料里沙箱投资最重的：Linux 上 vendored Bubblewrap（C FFI 调用，--ro-bind、--unshare-net、--unshare-user、--unshare-pid），macOS 上 Seatbelt profile，Windows 上 restricted-token 进程；.git/.agents/.codex 保护路径即使位于可写根目录内也重新标记只读。上面叠四层：Starlark 执行策略（不是 TOML，规则可带 parse 时验证的内联 match/not_match 示例，策略文件里的可执行测试用例）、生命周期 hooks（事件词表近乎逐字抄 Claude Code）、Guardian（LLM 审批评审员，紧凑 transcript 重建 + 严格 JSON 裁决，超时或畸形输出 fail-closed，带 per-turn 拒绝熔断）、OS 沙箱。Gemini CLI 用同款三平台栈但更轻（复用 OS 二进制而非自己实现 namespace 管道），上面叠 PLAN/DEFAULT/AUTO_EDIT/YOLO 四模式 + per-mode TOML 策略 + 环境变量 scrubbing。

最有启发性的反例是 Hermes 和 OpenCode：两个同样大（约 64 万和约 58 万行）的系统**零 OS 级隔离原语**。Hermes 把安全预算花在内容威胁上，3200 行审批模块（config.yaml IS the security policy）、12 条硬底线（rm -rf /、mkfs、fork bomb、shutdown）连 --yolo 都活着（YOLO 环境变量在模块 import 时冻结，prompt 注入的 skill 无法在运行时翻转它）、47 个危险命令模式做去混淆变体匹配、外部 Rust 内容扫描器 Tirith（cosign 验证安装）、promptware 扫描（上下文文件、记忆写入、MCP 工具描述、skill 安装，带 builtin/trusted/community 信任层级与隔离区）；OpenCode 则投资语法感知命令权限，每个 bash 命令用 web-tree-sitter 解析，grant 按约 130 条 LLM 生成的命令元数词典（git 到 2、npm run 到 3）作用域化，产生 git commit \* 而非全量批准。Pi 把缺席写成安全论证：部分进程内沙箱容易被误解为安全边界，唯一内置 gate 是项目信任，仓库控制的配置只在受信路径加载，上下文文件无论如何都加载（有记录的注入面接受）。

论文据此修正了 April 版的规模到沙箱相关性判断：**OS 级沙箱是语料里最昂贵的代码能力之一，且是选择而非规模的后果**。

<details class="marginalia" open>
  <summary>沙箱是选择</summary>
  <div class="marginalia-body">
    OS 级沙箱很贵。同样大的系统可以一行都没有。花在隔离、内容威胁还是权限粒度，是战略，不是行数。
  </div>
</details>
安全预算花在哪（隔离 vs 内容威胁 vs 权限粒度）是每家系统的战略决策，不是代码行数的函数。

### 编排：六个模式，和一个协议找到的第三角色

多 agent 维度是语料里最分散的维度，论文识别出六种模式：单 agent（Mini-SWE-Agent、Aider、Pi 核心）、顺序委派（Mistral Vibe）、并行子会话（OpenHands、OpenCode）、层级线程树带扇出（Codex）、递归组合（Claude Code）、注册表+协议（Gemini CLI 的 A2A、OpenClaw 的 ACP、Hermes 的 SQLite blackboard swarm）。coordinator-worker 在 7 个系统里独立涌现，是趋同演化的强证据，但论文引了 Anthropic 的提醒：大多数编码任务的真正可并行子任务比研究少，细看发现观察到的 coordinator-worker 多数用在广度优先探索阶段（并行代码库研究）而非并行实现，与 Anthropic 的警告在换了一个分析单位后一致。

更值得注意的进展是 ACP（Agent Client Protocol）的角色扩张。2026 年 4 月它只有两个角色（编辑器↔agent 的 LSP 式外部整合；跨厂商 mesh），7 月变成三个，新增的是**harness hosting**：OpenHands 的 ACPAgent 把 step() 委托给外部 ACP server，claude-agent-acp、codex-acp、gemini --acp 二进制成为 OpenHands 会话里可互换的大脑，竞争对手 harness 变成可换后端；Hermes 消费一个 ACP agent 作为模型传输（GitHub Copilot CLI 作为 chat 后端）。一个为编辑器设计的协议，成了宿主接口。A2A 仍是 Gemini CLI 独有的跨厂商 mesh 赌注。论文的实践建议是：**给你的 harness 建一个 ACP server（它同时买来编辑器、宿主和 meta-orchestrator 三类受众），自己的子 agent 保持在进程内**，8/9 的多 agent 系统协调自己的子 agent 仍用进程内原语或非标准协议（Pi 的 JSONL、Hermes 的 SQLite blackboard）。

### 扩展性：skills 反超 MCP，延迟加载成主流，供给链出现

2026 年 4 月时 skills 与 MCP 是 6/8 平手；7 月语料扩大后分出胜负，**skills 9/11、MCP 8/11**，打破平局的正是 Pi 的 skills yes, MCP no 立场（它的文档直接拒绝 MCP：build CLI tools with READMEs）。SKILL.md 格式（YAML frontmatter + name/description）在 9 个采用者里几乎普遍，.agents/skills/ 发现路径被 6 个系统接受；最尖锐的互操作数据点是 OpenCode 故意搜索竞争对手的家，它的发现列表包含 ~/.claude/skills 和 .claude/，为 Claude Code 装的 skill 在 OpenCode 里原样工作。

三个二阶发展标记这一层的成熟：**延迟加载成为近普遍策略**（8/9 只 eager 载入元数据、按需取 body，Claude Code 的 ToolSearchTool、Codex 的 BM25 索引工具搜索、Hermes 的桥工具、Pi 最简地用普通 read 工具读 XML 索引）；**条件激活把 JIT 上下文工程带进扩展层**（Claude Code 的 paths frontmatter 在模型触碰匹配文件时激活 skill、OpenHands 的 PathTrigger、OpenClaw 的 requires 声明运行时依赖）；**供给链成型**，四个系统有远程注册表（Mistral Vibe 托管目录、OpenCode URL 注册表带版本化 index 缓存、Hermes Skills Hub、OpenHands marketplace API），随之而来的是信任层级、预装静态扫描、隔离区、来源验证（Hermes 和 OpenClaw），以及第一批 agent 作者（Hermes 的后台评审 agent 从完成任务里创建并修补 skill，Gemini CLI 的提取子 agent 把会话挖成 skill 补丁）。

这与用户之前让我调研的 LoopX 等项目状态外置主张同频：capability 打包层正在获得包管理器经济学（注册表、来源、生成包），而 MCP 作为线协议的角色并未消失，它仍是外部进程集成（Slack、数据库、内部 API）的正确层，skills 则承担工作流/领域知识模板。两者的分工而非替代，是 2026 下半年的正确读法。

### 平台转向：从工具到平台，论文的核心论点

论文的收束性论点在 14 章：**2026 上半年，coding-agent harness 完成了从工具到平台的转向**。April 版还只是谨慎的 CLI-as-framework 假设，July 版用源码把它升级为论点。四条信号：

- **Skills 即声明式程序**：SKILL.md 是写给 LLM 运行时而非 CPU 运行时的程序，声明做什么（正文）、何时激活（paths/PathTrigger/requires）、能用什么工具。这是传统框架里 plugin 的结构类比，只是编程语言是英文 + YAML frontmatter。
- **Hooks 与事件总线成为扩展底座**：9/11 有用户生命周期 hooks（April 时还是 Claude Code 独有），Codex 的事件名逐字抄 Claude Code，OpenHands 把 hooks 接进 Agent.step()，Mistral Vibe 加 hooks.toml，Pi 本身就是约 33 个类型化事件的总线。开发者不是在为 agent 编程，而是在它内部编程。
- **工具与工作流边界消失**：CLI 吞噬了构建系统、任务运行器和 IDE 的角色，输入一个任务，agent 派生子 agent、派发工具、管理上下文、产出结果。
- **harness 变成服务面**：OpenCode 内嵌 HTTP server 发布 OpenAPI spec 和生成的 SDK，每个 UI 都是客户端；OpenHands 通过 OpenAI 兼容网关暴露会话，任何能调 chat-completions 端点的工具都能驱动一个 agent：**agent-as-a-model**。一个带客户端、SDK 和托管层的运行时不是带生态的工具，是有分发的平台。

harness-framework 合并双向发生：harness 变成可 import 的 SDK（Claude Agent SDK: Claude Code as a library、openai-codex、OpenHands agent SDK、Pi packages、OpenCode 生成的 @opencode-ai/sdk），framework 厂商反过来发 harness（LangChain 的 Deep Agents 建在 LangGraph 上，却独立采纳了语料里的全部约定：SKILL.md 渐进披露、AGENTS.md 记忆、子 agent 派生、todo 规划；Pydantic AI Harness、Strands harness-sdk）。当 LangChain，那个从每个 harness 运行时缺席的框架，最终造 harness 时，它采纳了语料自己的约定。2025 时代框架的双重缺席因此得到历史解释：**harness 没有采用框架，它们取代了框架，自己变得可 import，把该用哪个 agentic framework 变成你已经在跑哪个 harness**。

平台经济学同样在 90 天窗口里现形：Codex 的插件市场（GitHub/git/URL 源、会话内安装审批）、切换成本工具（Codex 出一等公民 importer 转换 Claude Code 的 ~/.claude/projects session JSONL 和 settings.json，厂商为彼此的会话存储写 importer，是平台竞争进入用户数据即护城河阶段的标志）、企业治理层（Codex 的配置栈延伸到 MDM、host-wide 系统文件和云端下发，约束引擎可以硬性限制用户层能设什么）。以及 meta-harness：Databricks 开源的 Omnigent，四层进程拓扑（server 连 host daemon 连 runner 连 per-conversation harness 子进程），注册表带 23 个规范 harness adapter（Claude Code、Codex、Cursor、OpenCode、Hermes、Pi、Goose、Qwen、Kimi、Kiro、Copilot、Antigravity），五种集成模式（sdk-in-process、cli-subprocess、acp-subprocess、native-tui、native-server），能力对照 conformance bench（探针验证基本 turn、工具调用、流式、中断、模型覆盖、策略拒绝，harness 被像硬件一样测试）。它在上面加四件单个 harness 给不了的事：任意 harness 可作任意其他 harness 的子 agent 会话、跨 harness 三层策略平面（session 到 agent 到 admin，六阶段，CEL/Python/LLM-classifier 评估器，通过各家自己的扩展机制强制，Claude Code hooks、Cursor hooks、Hermes hooks、ACP 权限请求，fail-closed）、统一沙箱与 egress 栈（bubblewrap+seccomp/Seatbelt/Job Objects + L7 MITM egress 代理 + secretless 凭据代理，真实 token 不进沙箱，飞行中换入）、可共享会话（服务端持久 transcript、多设备同步、ACL、评审评论、fork、会话中途换 harness）。它刻意不做 D3/D4 核心（不实现编辑 loop、仓库上下文、编辑应用策略），也不假装 harness 等价（per-harness 能力记录、vendor 专属 webhook、Claude 专属 todos 字段、Codex-only goal-mode 扩展泄漏过公共 API）。它的旗舰例子 Polly 是跨厂商 coordinator-worker：Claude Code 大脑、不写代码、把工作扇出给六个厂商 harness 的 git worktree、强制跨厂商评审（评审者必须是不同于实现者的厂商）。连它的克制都有信息量：沙箱不一致地应用（exec-wrap 自己的 Claude CLI 但委托给 Codex 原生沙箱模式），OS 级隔离抗拒被抽成共享服务。

90 天纵向对比给出最后一块拼图：**趋同变成了模仿**（Codex 逐字抄 Claude Code 的 hook 词表、出会话/设置 importer；OpenHands 读 Claude Code 的 plugin 格式、task-tool 签名、static/dynamic 缓存边界；OpenCode 读 Claude Code 的 skills 目录；Hermes 的源码注释点名致谢 OpenCode/Codex/OpenClaw/Goose）、模式沿语料扩散（延迟工具加载 1 到 3、只读 plan 模式 2 到 4 厂商系统、LLM 审批分类器 1 到 2、turn 级 checkpoint 1 到 3、安全感知调度器分区 1 到 2，竞争性差异的半衰期目前按周计量）、策略迁出散文（Codex 新模型 prompt 删 no-commit 和 anti-gold-plating 换 feature flag；Mistral Vibe 删 Never Commit 硬规则改七级优先级契约）、树以平台速度移动（Codex 621K 到约 1.12M 行 Rust、89 到 126 crates 一个季度；Mistral Vibe 35.6K 到 63K；Aider 进入社区维护 18 commits）。

### 18 条设计建议与 90 行最小 harness

论文收尾给了可执行的东西：18 条建议，每条锚定一个观察 + 一个实现它的系统，外加一个约 90 行的 minimum-viable-harness scaffold。最值得抄的几条：

- **从线性 while loop 开始，出现三个以上正交 turn 策略再升级到中间件管线**（建议 1）。
- **工具数超过约 15 个就做延迟加载**（建议 4）；Claude Code 的 shouldDefer + ToolSearchTool 把初始 prompt 减约 40%。
- **编辑契约匹配模型档位**：前沿模型用精确唯一子串替换，开源/较弱模型用模糊级联（建议 5）；Mistral Vibe 一个季度内删掉 SEARCH/REPLACE 收敛到精确匹配，是更强模型把最优解从工具侧漂移容忍推向严格契约的罕见可观察案例。
- **不要对代码做 RAG**，用 ripgrep、glob、tree-sitter 符号提取和文件系统遍历（建议 8）。
- **按部署语境分层安全**：开发者工具用 PLAN/DEFAULT/YOLO 三模式 + 权限范围模式；企业/共享/自动化语境用 OS 级沙箱 + policy-as-code + per-agent 审计（建议 9-10）；无论层级，把安全规则编成数据或专用策略文件，YOLO 下面留底线（建议 11）。
- **保持单 agent 直到能指出一个具体的广度优先探索阶段**，多 agent 比 chat 基线多耗约 15 倍 token（建议 12）。
- **发一个 ACP server**（建议 13）；不要用 LangChain 系框架做 agent runtime（建议 15）；不要给代码建 vector embedding 检索层（建议 16）；不要给每个 SaaS API 做 1-to-1 工具包装（建议 17）；不要过度工程化 stuck detection，但一定要做便宜的 cap（建议 18）。

90 行 scaffold 实现了其中 10 条：线性 loop、中间件式策略、四个工具（bash/read/write/search_replace）、层级 Markdown 上下文自动发现、阈值压缩，无框架、无 RAG、无 vector store、无多 agent、无沙箱。论文的猜想是：它跑在前沿模型上会匹配 Mini-SWE-Agent 的 SWE-bench 数字，超出这些数字主要是模型能力问题而非 scaffold 问题。这与 Lin 等的 AHE 消融结果一致：结构性 harness 元素携带改进（工具 +3.3pp、中间件 +2.2pp、长期记忆 +5.6pp），纯系统提示词反而回退（-2.3pp）。**结构性 scaffold 比散文级 prompt 策略更可移植**。

### 我的几点判断

读完全文，我留下四个判断，也作为这篇博客的收束：

- **Agent = Model + Harness 不只是一句口号，它重新定义了竞争单位**。当模型能力快速趋同，agent 的差异几乎全部落在 harness 侧，而这正是论文标题的深意：从源码看，厂商的护城河在 hooks、缓存经济学、记忆管线、沙箱、市场分发这些 harness 表面，而非模型。santi 的帖子推荐这篇论文，本质上是在说：如果你想理解 coding agent 的现状与方向，别读厂商发布会，读他们的源码。
- **两个缺席是给实践者的免费答案**。我自己做 agent 时也纠结过要不要上 LangGraph、要不要给代码库建 embedding 索引。这篇论文的 11 系统证据足够让我省下这笔工程投入：先手写 loop + ripgrep + Markdown 上下文文件，等出现具体失败模式再升级。行业最认真的实现的选择，值得作为默认基线。
- **平台转向意味着技能栈的迁移**。如果 harness 就是新框架，那么会写 harness 正在变成会搭 agent 应用的前置技能，理解七个子系统、会配置 AGENTS.md/SKILL.md、懂 prompt 缓存经济学、能选安全架构，这些 2025 年还属于高级用法的东西，2026 年已经是入门门槛。
- **论文自身的诚实值得点赞**。它删掉了不可比的 SWE-bench 分数表、明确标注 Claude Code 分析基于泄露源码快照的局限、把 April 版三条观察因新证据就地修订、把 scaffold-capability frontier 明说成待检验的猜想而非已证性质，这种把 inventory 声明（会过期）与 structural 声明（持久）分开的学术纪律，本身就该是工程写作的范本。

一句话总结：**当 harness 完成从工具到平台的转向，Agent 工程的竞争焦点已经从模型有多强转向运行时多可靠、多可扩展、多可治理**。这份 11 系统的源码解剖，是当前对这门年轻学科最完整的经验基础，santi 的书签数字（2179 次）说明工程师们已经注意到了。

**参考与延伸阅读**

- [Harness Engineering: Anatomy, Architecture, and Evolution of Coding Agents](https://arxiv.org/abs/2609.00006)（Barbaste 等，arXiv:2609.00006）
- [Improving Deep Agents with harness engineering](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering)（LangChain，2026-02）
- [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey)（Mitchell Hashimoto，2026-02）
- [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html)（2026-04）
- Anthropic 工程系列：Building Effective Agents、Effective Context Engineering、Writing Effective Tools、Multi-Agent Research System（2024-12 至 2025-09）
- Codex Knowledge Base：Inside the Harness: What a Source-Code Study of Eleven Coding Agents Reveals About Codex CLI's Architecture（2026-09）
- Rubric Labs：What is an Agent Harness?（2026-08）
- Lin 等：Agentic Harness Engineering（2026）
- [santi 原帖](https://x.com/santtiagom_/status/2107119653117898762)

