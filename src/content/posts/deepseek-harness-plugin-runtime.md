---
author: Duang
pubDatetime: 2026-08-20T17:20:00+08:00
title: DeepSeek Harness 深度解析：一切皆插件的 Agent 运行时
featured: false
draft: false
tags:
  - 最新速递
  - Agent
  - 拆解
description: DeepSeek 开源的 dsh：Model + Harness = Agent。Cordis 驱动，一切皆插件；对照官方架构与源码，从介绍、内核、范式、生态到上手。
revisions:
  - date: 2026-08-20
    note: 首发。飞书论述按原稿对齐；边注、动态图解与词卡另加，不改论述。
---

**速递说明**｜DeepSeek 于 2026-08-13 开源 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（命令行 `dsh`）。本篇是长拆解，挂在 [最新速递](/posts/latest-digest/)；若你先想摸协议归一那一层，可并行看 [Pi 深度解析（二）](/posts/pi-ai-protocol-normalize/)。

DeepSeek 在 2026 年 8 月 13 日开源了 DeepSeek Harness（命令行名 dsh），一个以 MIT 许可证发布的 agent harness（智能体运行框架）。它和 Claude Code、Codex CLI 站在同一赛道，但走了一条更极端的路：把模型、工具、会话、沙箱、UI、甚至 agent loop 本身都做成可替换的插件，底层由 Cordis 元框架驱动。本文从介绍、深度解析、范式、相关项目、使用五个角度把它拆开讲透，所有技术细节都对照官方架构文档与源码整理，不凭印象。



## 一、介绍：DeepSeek Harness 到底是什么

### 1.1 一个公式：Model + Harness = Agent

DeepSeek 给这个项目定了一句核心口号：Model + Harness = Agent。把这句话拆开看，它其实在重新划分"智能体"的边界。

模型（Model）只负责一件事：思考与推理。它接收一段上下文，吐出下一轮文本或工具调用意图。但一个只会聊天的模型没法真正干活，它读不到你的文件、敲不了命令、调不了接口。把模型接进真实环境、组织上下文、调度工具、控制循环的那一层，就是 Harness。公式里这个加号，是 DeepSeek 认为最值得被单独做出来、并且应该开源的那一层。

所以 DeepSeek Harness 不是一个新的基础模型，也不是一个 API 客户端。它是"模型之外"的执行层：负责把模型接到文件系统、终端、网页、代码工具和其他 agent 上，并把上下文、工具调用、任务执行组织成一套可运行、可记录、可复用的流程。


<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    Harness 不是模型，也不是 SDK。它是模型之外那层执行胶水。
  </div>
</details>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="dsh"
      src="/images/childlike-sketch-dsh-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">插件瓶</span>
  </div>
  <p class="duang-whisper-body">一切皆插件，不是口号。连 agent loop 都能卸下来换。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：Model + Harness = Agent</p>
  <p class="article-embed-note-lead">模型只负责推理。Harness 负责把模型接到真实环境、工具和循环上。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 200" role="img" aria-label="Model 加 Harness 等于 Agent">
        <rect class="mixup-panel" x="40" y="60" width="160" height="70" rx="10"/>
        <text class="mixup-title" x="120" y="102" text-anchor="middle">Model</text>
        <text class="mixup-caption" x="120" y="155" text-anchor="middle">思考与推理</text>
        <text class="mixup-sub" x="230" y="102" text-anchor="middle">+</text>
        <rect class="mixup-panel is-accent" x="260" y="50" width="180" height="90" rx="10"/>
        <text class="mixup-title" x="350" y="95" text-anchor="middle">Harness</text>
        <text class="mixup-caption" x="350" y="120" text-anchor="middle">工具 · 会话 · 循环</text>
        <text class="mixup-sub" x="470" y="102" text-anchor="middle">=</text>
        <rect class="mixup-panel is-soft" x="500" y="60" width="110" height="70" rx="10"/>
        <text class="mixup-title" x="555" y="102" text-anchor="middle">Agent</text>
        <circle class="mixup-dot is-live" cx="350" cy="40" r="5"/>
      </svg>
    </div>
  </figure>
  <p class="article-embed-note-foot">加号这一层，才是 dsh 要单独做出来并开源的东西。</p>
</section>

### 1.2 发布背景与定位

dsh 的 v0.1 开发者预览版在 2026 年 8 月 13 日公开，巧合同一天 DeepSeek 旗舰推理模型 V4 Pro 结束预览、正式开放。官方明确说这是 developer preview，正在快速迭代，未来会出现破坏兼容性的变更。换句话说，它现在是可以上手玩、可以拿来做内部工具的地基，但不是一个承诺稳定接口的生产依赖。

它的直接对标物是 Anthropic 的 Claude Code 和 OpenAI 的 Codex CLI，都是"智能体编码工作台"。但 dsh 的差异点很锋利：Claude Code 是闭源、绑定 Anthropic 自家模型和计费；dsh 是 MIT 开源，而且从设计上就 model-agnostic（模型无关）。你完全可以用 dsh 的框架去跑 Anthropic、OpenAI，乃至任何 OpenAI 兼容端点的模型，而不被锁死在 DeepSeek 自家的牌桌上。

一个容易混淆的点：GitHub 上还有一个同样叫 deepseek-harness 的第三方仓库（作者 HenryZ，做 DeepSeek V4 协议契约的 Python 包装库），和 DeepSeek 官方这个 dsh 不是一回事。本文只讲官方 deepseek-ai/deepseek-harness。



### 1.3 它现在已经能干什么

按官方当前形态，dsh 已经具备一套完整的本地智能体工作台能力，和主流编码 agent 的核心工作流是对齐的：

- 巡视和理解代码库，跨多文件推理改动；
- 编辑文件、执行 shell 命令，而不是等你手敲每一步；
- 检索本地文件和网页；
- 维护多步计划（plans）、目标（goals），把子任务委派给子 agent（subagents）；
- 调用预置技能（skills），并按策略在敏感动作前要求审批；
- 通过仅追加（append-only）的会话日志，记录模型看到的全部内容与每次工具调用，支持任务的恢复、分叉、检索与回放。

### 1.4 它不是什么

把边界说清楚，能少踩很多坑：

- 不是新模型。V4 Pro / V4 Flash 是模型，dsh 是跑模型的框架，两者独立发布、独立升级。
- 不是 API 客户端。它不是 deepseek 官方 Python/TS SDK 的替代品，而是站在 SDK 之上、把"多轮工具循环 + 环境交互 + 记录"封装好的运行时。
- 不是开箱即用的成品 Agent 产品。它是一个供你组装自己 Agent 的套件（kit），官方反复强调现在仍有破坏性变更，别当成稳定依赖直接进生产。

### 1.5 插件到底是什么，又是怎么插进 dsh 的

前面反复出现一个词："一切皆插件"。这里把它说透，否则后面讲架构时它永远是黑话。

在 dsh 里，模型适配器、工具注册表、会话日志、agent loop，甚至连 Web UI 本身，全都是 Cordis 插件。所谓插件，不是一个"钉在固定内核上的外挂"，而是一段向共享上下文（context，简称 ctx）贡献能力的模块：它认领或消费一个稳定的服务键（比如 ctx.tools、ctx.llm、ctx.sessions），登记类型化事件，并通过 ctx.effect() / ctx.on() 安装"可逆的副作用"（提示词片段、工具 schema、监听器、适配器）。没有需要打补丁的特权内核，你想扩展 dsh，就把插件挂载到其它插件旁边，插件卸载时它注册的一切会自动撤销。

那一个插件具体是怎么"插进去"的？有几条入口，从被动到主动：

- 随 profile 自带：dsh-base、dsh-web-app、dsh-headless 这三个核心 bundle 是 web / headless 两个 profile 模板的第一层，装好 dsh 就已在树上。
- 从 npm 装第三方插件：

```sh
dsh plugin --profile web add @nanmicoder/dsh-agent-teams
```

- 从 Git 仓库装（#ref 钉死分支/标签/提交）：

```sh
dsh plugin --profile web add "github:owner/repo#ref"
```

- 装完重启 dsh web 并刷新页面，用 dsh plugin --profile web list 或在 Web UI 的 Settings 到 Plugins 里确认它已启用。注意：只有 package.json 里声明了 dsh.bundle 的包才会被当作可装载的 bundle 插件。
- 不改源码改行为：各层按 bundle 到 profile 的 cordis.patch.yml 到 home 级 patch到--patch overlay 的顺序叠加，后层可整行覆盖前层的某个配置项；dsh --profile web --dump-config 能打印出最终解析出的整棵配置树。

如果你想自己写一个，骨架长这样：在 package.json 里用 dsh 字段声明它是一个 bundle，再导出一个 apply(ctx) 函数，在里面用 ctx.effect() / ctx.on() 注册能力（每个注册都返回一个清理函数，卸载时自动回滚）。

```ts
// package.json
{
  "name": "my-dsh-plugin",
  "dsh": { "bundle": "./cordis.patch.yml" }
}

// index.ts
export function apply(ctx) {
  // 观察或环绕一个 agent 事件
  ctx.on("agent/pre-step", (messages, next) => {
    // 可改写 messages，或调 next() 委托下去
    return next(messages)
  })

  // 注册一个工具，返回的 disposer 在卸载时清理
  ctx.effect(() => {
    ctx.tools.register({ /* ...schema 与执行逻辑... */ })
    return () => { /* 撤销注册 */ }
  })
}
```

这套机制就是后面"深度解析"要展开的 Cordis 内核，现在你只需要记住：插件 = 往 ctx 里挂能力 + 用可逆副作用保证能干净地摘下来。

## 二、深度解析：从 Cordis 内核到一次运行的来龙去脉

这一节钻到内部。dsh 的每一行行为背后都是 Cordis 在调度，所以先得把 Cordis 讲明白，否则后面的"插件树""patch""seam"都是黑话。

### 2.1 Cordis 是什么：五个观念

Cordis 是 dsh 底层的插件框架，它的设计思想写在一篇叫 A Programming Paradigm for Spatiotemporal Composability（时空可组合的编程范式）的论文里。对一个想写插件的开发者来说，只需要抓住五个观念：

- 插件就是一个实现了 Service 的对象。它可以是一个带可选 inject 和 apply(ctx) 字段的函数，也可以是一个 Service 子类；Cordis 会把它的生命周期挂载进当前上下文。
- 上下文（context）是服务的仓库。一个服务从上下文里认领一个稳定的键，比如 ctx.tools、ctx.llm、ctx.sessions；其他插件通过键来找服务，而不是直接 import 某个具体实现。
- 通过 inject 声明服务依赖。一个插件点名自己需要哪些服务，就会等到那些服务存在后才被加载，加载顺序不是靠手写启动序列，而是靠服务需求表达出来的。
- 类型化事件负责通信。服务通过 TypeScript 声明合并登记事件名，再按 observe / wrap / fan-out / in-order 的不同语义以 emit、waterfall、parallel、serial 四种方式分发。
- 注册是可逆的副作用。提示词片段、工具 schema、适配器、provider、监听器都通过 ctx.effect() 或 ctx.on() 安装，重载和卸载时会可预期地自动撤销。

把"可逆的副作用"这句话记住，它是后面所有可组合性的根基。

### 2.2 插件树与分层：profile、bundle、patch

运行中的 dsh，本质上是一棵插件树，由启动时按序叠加的各层组合而成。理解这棵树，要分清两个概念：

profile 是存放在 Harness home 里的具名组装（named assembly）。它列出自己叠放的组合包（bundles），存放自己安装的树外插件，并保存用户自己的 cordis.patch.yml。发行版随包交付了 web 和 headless 两个 profile 模板。

bundle（组合包）是 Cordis 配置项及其挂载代码的分发格式。它插入的内容始终可被其上各层 patch。两者都在各自 package.json 里通过 dsh 字段声明：dsh.profile 列出一个 profile 包含哪些 bundle，dsh.bundle 指向一个 bundle 的 patch 文件。

三个核心 bundle 构成骨架：

- dsh-base：每个 profile 的第一层，承载模型适配器、工具、持久化、沙箱与审批策略、设置、凭据、遥测。
- dsh-web-app：在 base 之上增加浏览器应用（Web UI）。
- dsh-headless：增加一次性运行器，且完全不带服务器，适合脚本里单次执行。

各层叠加在一份空条目列表之上，顺序是固定的：先按 profile 列出的顺序应用每个 bundle，然后应用 profile 自己的 cordis.patch.yml，再应用 home 级的那份，最后是任意 --patch overlay。一条 patch 按 id 定位某个条目，替换它的整个 config，或者插入一条新条目。

要查看你这台机器实际启动起来的配置树，命令是：

```sh
dsh --profile web --dump-config
```

它打印出来的任何一条条目，都可以被你自己的 patch 替换。这就是"不改源码就能改行为"的落地方式。

### 2.3 核心包一览

下面是向 Cordis 树贡献内容的部分核心包，来自官方架构文档：

| 包 | 职责 | ctx 键 |
|-|-|-|
| core/session | 仅追加的 SessionEvent 日志与内存存储 | ctx.sessions |
| core/system-prompt | 提示词片段与工具 schema 的组装 | ctx.systemPrompt |
| core/tools | 作用域化的工具注册表与带把关的执行流水线 | ctx.tools |
| core/agent | Agent 接口、活跃 agent 注册表与 agent/\* 事件 | ctx.agents |
| core/agent-loop | 实现该接口的默认驱动器 | ctx.agentLoop |
| core/scope | 按 agent 划分作用域的注册原语 | 库，无 ctx 键 |
| llm/llm | 消息与流式词汇表，以及适配器 seam | ctx.llm |

### 2.4 事件即扩展点

在 dsh 里，事件就是扩展点，而选对事件域是大多数改动的第一个决定。官方把事件分成三类：

- 会话事件（session events）：追加到日志，并通过 session/event 广播的持久事实。当某个事实必须在重新加载后仍然存在时，用它们。
- Agent 事件（agent/\*）：携带活跃 Agent，inbox、步骤、状态、请求、验证、续跑。要观察或拦截进行中的工作，用它们。
- 能力事件（fs/\*、tools/\*、telemetry/\*）：无需导入循环，就能向某个 seam 附加策略和适配器。

事件分发有四种模式，这是事件公共契约的一部分：

| 模式 | 是否 await | 分发顺序 | 有返回值 |
|-|-|-|-|
| emit | 否 | 按注册顺序观察 | 否 |
| waterfall | 否 | 按注册顺序观察 | 是 |
| parallel | 是 | 所有监听器并行观察 | 否 |
| serial | 是 | 按注册顺序观察 | 是 |

其中 waterfall 可以理解为"环绕式中间件"：监听器拿到 (...args, next)，调用 next() 把可能被包装过的结果委托给下一个服务；如果直接 return 而不调 next()，就短路了。对单一决策类事件（比如一个审批策略），短路就是设计意图，策略监听器自己拍板时直接 return，只做注解或观察的监听器则必须调 next() 委托下去。

### 2.5 一次轮次的完整流程

理解 agent 怎么跑，看"轮次（turn）"和"步骤（step）"的划分。一个步骤是一次模型请求加上它调用的工具；一个轮次包含零个或多个步骤，它在领取首条输入之前打开，在不再欠下任何工作时关闭。官方给出的时序骨架是这样的：

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step                  reject | enter(messages)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

几个关键点：turn/\*、step/\*、user/message、assistant/\*、tool/\* 是持久会话事件；其余是分属三个事件域的实时扩展点。agent/pre-step、agent/request、llm/stream 和三个 tools/\* 是 waterfall 事件，监听器必须调 next() 才能委托下去；agent/turn-stopping 是 serial 事件，没有 next()。

输入通过同一个 inbox 到达驱动器：有些消息会立即唤醒它，注入的上下文则留在 inbox 里，直到另一条消息把它唤醒。agent/pre-step 决定模型看到什么，监听器可以改写已领取的消息，也可以直接拒绝它们；首次领取被拒绝或改写为空时，仍然会关闭一个不含步骤的持久轮次，于是日志会如实记录这次尝试。


<section class="article-embed-note">
  <p class="article-embed-note-title">一次轮次怎么走（图解）</p>
  <p class="article-embed-note-lead">turn 包住若干 step；step 是一次模型请求加它调用的工具。</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>turn/start</b></p>
      <p>领取 next-step 输入与排队消息，组装提示词与工具 schema。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>agent/pre-step</b></p>
      <p>waterfall：可改写或拒绝消息。拒绝或改写为空则关掉空轮次。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>step：llm/stream</b></p>
      <p>agent/request 到流式输出，再经 tools/pre-execute · execute · post-execute。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>turn/end</b></p>
      <p>agent/turn-stopping 后结束。欠下的工具或新输入会再开 step。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">持久会话事件与实时扩展点是两套账，别混着读日志。</p>
</section>

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    面试里若被问"一轮 agent 怎么跑"，先画 turn 和 step，再谈 waterfall。
  </div>
</details>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="dsh"
      src="/images/childlike-sketch-dsh-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">溯源瓶</span>
  </div>
  <p class="duang-whisper-body">模型看见的，日志里必须能重建。口号变硬约束，才叫可追溯。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

### 2.6 会话日志：事件溯源与"模型可见即已记录"

这是社区口碑最好、也最值得单独讲的特性。dsh 的会话日志不是事后补的调试日志，而是架构层面的设计不变量。

会话日志是模型所见上下文的唯一来源。deriveMessages() 从这条日志投影出模型历史，而原始的 assistant/chunk 事件保证回放和 UI 保真。fork（分叉）、resume（恢复）、transcript（文本记录）、遥测、持久化，全部派生自同一条事件流。

更硬的一条约束叫"模型可见即已记录（model-visible is logged）"：抵达模型请求的一切，都必须能从日志重建，并且由一项运行时不变量来断言这一点。因此，新增一项模型可见输入，就要求新增一个会话事件，扩展 SessionEventMap，并从日志渲染。这条规则把"可追溯"从口号变成了编译期/运行期都会咬人的硬约束。

它的价值在调试和合规上最明显：失败的运行可以精确回放事件序列，可以从任意节点分叉试新路径，可以跨会话查"当时为什么这么决策"，也可以做合规审计。DeepSeek 自家 V4-Pro 的代码智能体基准，就是用 Minimal 模式（后文会讲）在这套开源环境里跑的，也就是说那些 headline 数字测的是"模型 + Harness 极简环境"的组合，而现在这套环境任何人都能复现。



### 2.7 能力 seam：换一个 provider 就改了整个产品

seam（能力接缝）是一项可替换能力，包含三种角色：声明接口的 Service Definition、实现它的 Service Provider、以及使用它的 Consumer（通常是面向模型的工具）。一个包可以合并承担多个角色，但单一角色本身不是 seam；添加一项能力，意味着把三者一并设计。

seam 正是"替换一个提供方就能改变整个产品"的原因。最妙的一个例子是文件系统与进程提供方共享同一个执行世界，把它们指向一个远程沙箱，Bash、PTY、LSP 会一并被搬过去，而无需为每个提供方写专门的 fork。子 agent 提供方也藏在同一个接口之后，从"新建一个子 agent"到"把一个轮次委派给另一个产品"，实现可以天差地别。

### 2.8 新行为该往哪放

官方给了一张"新行为归属位置"的映射表，基本就是插件开发的目录：

| 目标 | 机制 |
|-|-|
| 添加模型提供方 | 在 ctx.llm 上注册其适配器 |
| 添加面向模型的能力 | 在 ctx.tools 上注册；其 schema 加入提示词组装 |
| 让某会话拥有不同能力集 | 组装一个 agent preset；其中的服务行需要 isolate realm |
| 添加 shell 执行 | 注册 ctx.shell 后端；本地后端通过 ctx.subprocess spawn 进程 |
| 添加持久化终端执行 | 注册 ctx.terminals 后端和 dsh-tool-terminal |
| 添加用户命令 | 在 ctx.commands 上注册；它无需模型轮次即可分派 |
| 添加后台工作 | 在 ctx.jobs 上注册；job\_\* 工具负责收集或停止 |
| 添加文件系统访问或策略 | 注册 ctx.fs 提供方，或监听 fs/\* 事件 |
| 限制所启动的进程 | 使用 ctx.sandbox 后端；消费方在启动进程前包装 argv |
| 拦截请求、工具或轮次 | 使用相应的 agent/\* 或 tools/\* 事件；agent/turn-stopping 会停止轮次 |
| 添加模型可见上下文 | 调用 agent.inject()；它会落到下一次获准的请求中 |
| fork 活跃会话 | ctx.sessions.fork(source, boundary?, childSessionId?) |

## 三、范式：为什么"一切皆插件"是一种不同的世界观

讲完内部机制，这一节退一步看范式。dsh 最有趣的地方不在某个具体功能，而在于它用一套一致的哲学，重新组织了"agent 运行时"这件事。

### 3.1 固定架构 vs 插件架构

绝大多数 harness，无论闭源还是开源，都是固定架构（fixed architecture）。agent loop、工具注册表、会话存储是写死的，你能扩展的只有作者暴露出来的那几个 hook。想换模型层、换沙箱、换 UI？要么等官方支持，要么 fork 整个仓库改源码。

dsh 走的是反面。它的 README 第一行就写：everything is a plugin。模型、工具、技能、会话、沙箱、存储、循环、调度、UI，全都在 Cordis 插件边界之后，任何一项都能在配置里被选择、替换、扩展，而不动 Harness 的源码。所以它更像一套"用来组装 agent 运行时的套件"，而不是一个固定的编码助手。


<section class="article-embed-note">
  <p class="article-embed-note-title">固定架构 vs 插件架构（图解）</p>
  <table class="article-compare-table">
    <thead>
      <tr>
        <th>对比点</th>
        <th>固定架构</th>
        <th>dsh</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>agent loop</td>
        <td>写死在核心</td>
        <td>ctx.agentLoop 插件</td>
      </tr>
      <tr>
        <td>模型层</td>
        <td>常绑自家模型</td>
        <td>model-agnostic 插件</td>
      </tr>
      <tr>
        <td>扩展方式</td>
        <td>作者给的 hook</td>
        <td>挂插件或 patch 条目</td>
      </tr>
      <tr>
        <td>可审计性</td>
        <td>多半只记工具调用</td>
        <td>上下文注入也记</td>
      </tr>
    </tbody>
  </table>
  <p class="article-embed-note-foot">everything is a plugin：换提供方，不改 Harness 源码。</p>
</section>

| 维度 | 固定架构 harness | dsh（插件架构） |
|-|-|-|
| agent loop | 写死，改要动核心 | 是插件（ctx.agentLoop），可替换 |
| 模型层 | 常绑定自家模型 | 插件，model-agnostic |
| 工具注册 | 核心里注册 | ctx.tools 上的插件 |
| 扩展方式 | 作者暴露的 hook | 挂载插件到树旁，或 patch 条目 |
| 可审计性 | 通常只记工具调用 | 记每一次上下文注入 |

### 3.2 Cordis 的编程范式：时空可组合

Cordis 背后的论文标题是 A Programming Paradigm for Spatiotemporal Composability（时空可组合的编程范式）。拆开读：时间上可组合，指插件挂载、卸载、依赖解析都能在运行时干净地发生；空间上可组合，指不同插件向同一个共享上下文贡献服务与事件，彼此不通过写死的 import 耦合。

落到代码层面，就是前面那五个观念：服务认领稳定的 ctx 键、依赖通过 inject 表达、通信通过类型化事件、注册是可逆副作用。能力活在插件里，而不在一个特权核心里。

### 3.3 没有特权内核意味着什么

dsh 架构文档有一句很重的话：不存在需要打补丁的特权内核（there is no privileged kernel to patch）。扩展 dsh 的方式，是把插件挂载到其他插件旁边，而各项注册都是副作用，会在其插件卸载时撤销。

这听起来抽象，实际影响很大：你永远不需要为了加一个能力去修改某个"核心文件"。你要做的就是写一个插件，声明它需要哪些服务、贡献哪些服务、监听哪些事件，然后把它 mount 到树里。卸载时，它装进去的所有东西（工具、监听器、provider）都会被自动撤掉。这把"改框架"从一件让人提心吊胆的事，变成了"加一个邻居"。

### 3.4 可逆副作用带来的可组合性

把"可逆"当成一等公民，是 dsh 敢把一切做成插件的前提。正因为每次注册都带着处置逻辑（disposer），重载和卸载才能可预期地自动回滚。于是你可以：

- 用 patch overlay 临时覆盖某条配置，验证完去掉 overlay 就回到原状；
- 用 --dump-config 看清当前实际生效的完整配置树，再决定改哪条；
- 在 Creator 模式里，于内存中试验插件组合、拼出新预设，而不污染磁盘上的稳定配置。

这种"叠加、覆盖、撤销都廉价且确定"的特性，是固定架构框架很难给到的。

### 3.5 这对 Agent 工程意味着什么

把范式翻译成工程收益，主要有四条：

- 可审计。每一次上下文注入（系统提示、思维链、工具调用、子 agent 调度）都被记录并能回放，合规和调试都有据可查。
- 可复现。Minimal 模式把环境压到两个工具，配合 append-only 事件流，让模型评测的基准环境可以被任何人精确复现。
- 可替换。想换模型、换沙箱、换 UI、换审批策略，都是换插件，不是改核心；企业可以把内部数据接口、业务规则、工作流封装成自己的 bundle。
- 低门槛。MIT + 自托管，让金融、医疗这类受监管、需要本地可审计 agent 基础设施的行业，有了一个能直接 pilot 的起点。

## 四、相关项目与生态（都围绕 dsh 本身）

### 4.1 官方仓库与核心入口

项目本体在 deepseek-ai/deepseek-harness，MIT 许可证。几个一手入口：

- 官方文档站 deepseek-harness.github.io（教程与参考，随版本更新）；反馈与 bug 走 GitHub Discussions。
- 发现社区插件：给自己的仓库打上 dsh-plugin 这个 GitHub topic，就能被检索到；插件经 npm 或 Git 分发。
- 底层元框架 Cordis（github.com/cordiverse/cordis）， dsh 的"插件引擎"本身是另一个独立开源项目，它的设计来自北大-DeepSeek 合著的论文 A Programming Paradigm for Spatiotemporal Composability。要真正读懂 dsh 的"一切皆插件"，得先懂 Cordis。

### 4.2 仓库内部的官方插件生态

dsh 不是"一个核心 + 一堆外挂"，它的能力本身就是仓库里的一等公民。monorepo 在 packages/ 下交付了 49 个包（core、llm、mcp、sandbox、context、plan、goal 等），外加 100+ 个官方第一方插件。

这点最容易被忽略：四个运行模式（Standard / Code / Minimal / Creator）本质上就是四套不同的插件 bundle 组合，模式不是开关，而是"装载哪些插件"的预设。其中 Minimal 只保留持久 bash 和 str_replace_editor 两个工具，正是 DeepSeek 跑 V4-Flash 基准（Terminal-Bench 82.7）用的极简环境。

几个值得点名的官方 / 第一方插件：

- llm-pi-ai：通用多协议模型提供方，默认休眠、零路由，需要时再在 settings 里激活（下一节会展开它和 Pi 的关系）。
- dsh-toolkit：官方工具套件。
- agent-teams：在 ctx.agentTeams 上提供的实验性协作 seam，在可继续的子 agent 之上加了持久 roster、任务板和 mailbox。

### 4.3 社区插件生态与发现方式

开源、多模型、全栈插件化三者叠加，催生了一大批社区插件。几个聚合入口：

- awesome-deepseek-harness（0xsline 维护）：18 个分类、368 条人工精选。
- awesome-dsh：自动更新的 dsh-plugin topic 目录，2,600+ 仓库。
- Oh-My-DSH：1,117 个精筛插件，跨 1,521 个被监控仓库，合计 30 万+ star。

按方向挑几个真实存在的插件，感受一下生态长在哪：

| 方向 | 代表插件 | 做了什么 |
|-|-|-|
| 联网检索 | dsh-web-search-exa、dsh-web-search-pro | 多引擎路由的网页 / 搜索接入 |
| 办公文档 | dsh-office | 让模型编辑 Office 文档，Web 端带 docx/pdf 预览 |
| 会话迁移 | dsh-chat-import | 从 13 个编码 agent（Claude Code、Codex、Cursor 等）导入完整会话 |
| 飞书 / Lark | dsh-feishu-bot、dsh-feishu-notify、dsh-im-hub | 把会话事件推送到飞书，或多平台网关 |
| 语音 | dsh-voice、dsh-voice-webspeech | Edge 神经 TTS 朗读 + 语音输入 |
| 长期记忆 | dsh-memento、dsh-memory-evolve、dsh-recall | 跨会话的知识沉淀与召回 |
| 移动 / 桌面 | dsh-mobile、deepseek-harness-desktop | 把 UI 搬上手机，或用 Tauri 包成桌面端 |

### 4.4 和 Pi 是什么关系（llm-pi-ai 插件）

如果你读过这个博客的 Pi 深度解析系列，会在这里看到一个有趣的闭环。Pi 是 earendil-works/pi，一个用 TypeScript 写的 agent harness，最核心的 pi-ai 负责把 OpenAI / Anthropic / Google 等多家协议归一成一个统一接口。

dsh 同样是 TypeScript、同样 MIT、同样要做模型协议归一。而且它不是另起炉灶，dsh 的 llm-pi-ai 插件就是基于 pi-ai 构建的通用多协议提供方（默认休眠，零路由，需要时在 settings 里激活）。所以 Pi 系列里你读过的那套"多种协议归一化"机制，实际已经被 dsh 收编进自己的模型适配层了。

两者位置不同：Pi 主要是一层"面向模型的客户端抽象"，负责抹平 API 差异；dsh 是站在这层之上的"完整运行时"，除了模型，它还管工具、会话、沙箱、循环、UI、调度。可以粗略地说：Pi 解决"怎么统一和模型说话"，dsh 解决"怎么让一个统一的模型接口真正去干活"。

### 4.5 同名但不同的项目，注意区分

GitHub 上还有一个仓库也叫 deepseek-harness（作者 HenryZ / ModelBest），它是一个 Python 库，做 DeepSeek V4-Pro / V4-Flash 的协议契约封装（pip install deepseek-harness、dsh CLI、MCP server、Anthropic SKILL.md），记录并固化了若干条协议行为。它是第三方的 V4 协议包装库，和本文讲的官方 dsh（Cordis 元框架、一切皆插件）是完全不同的两件事，引用时别搞混。

## 五、使用：从零跑起来，并把它改造成自己的

这一节全是能直接敲的命令和配置。默认环境是装好 Node.js（官方建议 22.19.x 或 24+，推荐 24+）的机器。

### 5.1 安装与启动

最快的方式不需要克隆仓库，一条命令拉起 Web UI：

```sh
npx @deepseek-ai/dsh web
```

命令默认在 http://127.0.0.1:3080 起一个本地 Web UI，浏览器打开即可。注意地址是 127.0.0.1 而不是 localhost，有些环境下两者解析不一致。

如果你要改框架逻辑或写自己的插件，从源码跑：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

### 5.2 配置模型

全新实例启动后还不能直接用，它既没配模型也没选工作区。第一步是配模型。

方式一，Web UI：打开 Settings 到 Models，DeepSeek 卡片已预置，只需在 API Key 字段填入从 platform.deepseek.com 申请的密钥并保存，模型路由立即生效，不需要重启服务器。

方式二，环境变量（适合不想在页面里管密钥）：

```sh
export DEEPSEEK_API_KEY=sk-your-deepseek-key
export DSH_HOME=/path/to/your/dsh-home
npx @deepseek-ai/dsh web
```

方式三，自定义 OpenAI 兼容端点（企业内部网关、自建服务都走这个）：在 Settings 到 Models 选择 Add a custom provider，填写小写且永久的 Provider ID、Base URL、API 协议、凭据、至少一个模型；点 Fetch available models 可以按 OpenAI 兼容的 GET /models 拉取模型列表。Provider ID 一旦创建不可改名，请求记录、已保存会话、模型默认值、凭据引用都会用到它，要改名只能新建再删旧的。

目录里内置的厂商（Anthropic、OpenAI 等）填 API Key 即可，会自动带出端点、协议和模型列表；但 Bedrock、Vertex、Azure、Codex 用的是原生认证，分别对应 AWS 凭据与区域、ADC 项目、api-version、OAuth，只填 API Key 是配不全的。

安全细节值得专门提一句：密钥是只写的，保存在 $DSH_HOME/.credentials.yaml，页面只保留脱敏后的凭据引用，永远不会回显明文，也不会把明文落盘到 settings.yaml。主配置 $DSH_HOME/settings.yaml 支持热重载，改完立即生效无需重启。默认 $DSH_HOME 是 \~/.dsh。

### 5.3 四种运行模式

dsh 内置四种预设模式（agent presets），决定一个会话里挂哪些工具、用什么人格。它们加载的是不同的默认插件集合：


<section class="article-embed-note">
  <p class="article-embed-note-title">四种模式 = 四套插件组合</p>
  <p class="article-embed-note-lead">模式不是开关，是装载哪些 bundle 的预设。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 180" role="img" aria-label="四种 agent preset">
        <rect class="mixup-panel" x="20" y="40" width="140" height="80" rx="10"/>
        <text class="mixup-title" x="90" y="85" text-anchor="middle">standard</text>
        <text class="mixup-caption" x="90" y="140" text-anchor="middle">日常全套</text>
        <rect class="mixup-panel is-accent" x="175" y="40" width="140" height="80" rx="10"/>
        <text class="mixup-title" x="245" y="85" text-anchor="middle">code</text>
        <text class="mixup-caption" x="245" y="140" text-anchor="middle">程序化调工具</text>
        <rect class="mixup-panel is-soft" x="330" y="40" width="140" height="80" rx="10"/>
        <text class="mixup-title" x="400" y="85" text-anchor="middle">minimal</text>
        <text class="mixup-caption" x="400" y="140" text-anchor="middle">基准两工具</text>
        <rect class="mixup-panel" x="485" y="40" width="140" height="80" rx="10"/>
        <text class="mixup-title" x="555" y="85" text-anchor="middle">creator</text>
        <text class="mixup-caption" x="555" y="140" text-anchor="middle">改自身运行时</text>
        <circle class="mixup-dot is-live" cx="400" cy="30" r="5"/>
      </svg>
    </div>
  </figure>
</section>


<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="dsh"
      src="/images/childlike-sketch-dsh-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">组合瓶</span>
  </div>
  <p class="duang-whisper-body">四种模式不是四个开关，是四套装载清单。Minimal 那两件工具，才是基准环境。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

| 模式 | 英文名 / 配置值 | 适用场景 |
|-|-|-|
| 标准模式 | standard | 日常开发默认，工具最全 |
| PTC 模式 | code | 多步复杂编排，一段代码搞定长链路 |
| 极简模式 | minimal | 只有持久 Bash + 文件编辑器，做基准测试 |
| 创造模式 | cordis | 读写运行时、拼新预设，仅插件开发者用 |

标准模式（standard）加载完整工具链：文件编辑、Shell、网页检索、技能、计划、目标、子 agent、工作流，是绝大多数日常任务的首选。

PTC 模式（code，即 Programmatic Tool Calling）在标准模式之上额外开启代码模式 SDK：模型不再一步步调单个工具，而是写一段 TypeScript 程序，把多步操作合并成一次执行。本来要来回调 5 次工具的任务，变成 1 次，能明显省 token、降通信开销，适合批量重构这类长链路。

极简模式（minimal）只保留两个工具，一个持久化 Bash 和一个 str_replace_editor 文本编辑器，提示词固定、不加载额外上下文，行为最可控，专门用来在最小干扰环境下做模型工具调用基准测试（SWE-bench 类）。

创造模式（cordis / creator）在标准模式基础上，多了"读改写自身运行时"的能力，可以让 agent 帮你写新预设、开发插件；官方明确提示这等同 shell 权限，只建议在开发插件、创作新预设时用。

切换入口有两个：Web UI 里 Settings 切模式，对新会话生效；或者改配置文件：

```yaml
agent-presets:
  default: standard
```

### 5.4 Headless 无界面模式

除了 web，发行版还交付了 headless 这个 profile：一个不带服务器、一次性运行的执行器，适合塞进 shell 脚本里跑单次任务：

```sh
dsh --profile headless "扫描项目目录，执行单元测试并输出测试失败信息"
```

### 5.5 Python SDK

除了 TypeScript 运行时，官方还发了 Python SDK（deepseek-harness-sdk），要求 Python 3.10+，支持 Linux x64、Linux arm64、macOS 14+ arm64。它的内置运行时不需要系统装 Node.js，适合把同一套执行能力嵌进自动化程序或内部业务系统。

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49152,
    cwd=str(workspace),
    session_root=str(session_dir),
    cordis=str(config_file),
) as harness:
    result = harness.run(
        task="读取当前目录代码文件，分析项目结构并输出说明文档",
        session_id="demo_session_001",
    )
    print(result.final_response)
```

做模型评测时，Python SDK 文档引导你跑一个名为 jsonrpc-agent 的 minimal 变体，并用独立的工作区和 session ID 隔开互不干扰的基准任务。

### 5.6 插件开发与配置替换

不想改源码、只想加能力的第一手段，是 patch 一条已存在的配置条目。先看清当前实际配置树：

```sh
dsh --profile web --dump-config
```

它打印出来的任何条目，都能被你自己的 patch 替换。patch 按 id 定位某条条目，替换它的整个 config，或插入一条新条目。home 级和 profile 级各有一份 cordis.patch.yml，叠加顺序已在前面讲过。

要引入树外插件（bundle），命令是：

```sh
dsh plugin --profile web add <bundle-name>
```

写一个插件本身，就是在你的 package.json 里通过 dsh 字段声明自己：dsh.profile 列出一个 profile 包含哪些 bundle，dsh.bundle 指向一个 bundle 的 patch 文件。插件内部通过 ctx.effect() / ctx.on() 注册工具、监听器、provider，并在卸载时自动撤销。前面 2.8 的"新行为归属位置"映射表，就是写插件时最直接的目录。

从 Git 仓库安装第三方插件时，建议固定 commit，并先检查它的安装脚本，pnpm 可能会要求你显式授权依赖的构建脚本，而这些脚本会在 agent 沙箱之外执行，存在安全风险。



### 5.7 工作区隔离、审批与可追溯

安全上 dsh 有几道内建护栏：

- 工作区隔离：Agent 只允许操作你选定的工作目录，不能越界碰系统其他文件。
- 审批策略：涉及高风险修改的操作会弹出确认，避免无授权改动。
- Trajectory 视图：把会话日志按来源分类展示，你能看清系统提示、思维链、工具调用分别来自哪。
- resume / fork / search / replay：全部基于同一条 append-only 事件流，失败运行可精确回放，可从任意节点分叉试新路径。

### 5.8 排错与注意事项

| 报错 / 现象 | 处理方法 |
|-|-|
| MISSING_CREDENTIAL | 到模型页存储提供方密钥，或配置所引用的环境变量 |
| UNKNOWN_MODEL | 选择已配置的模型，或给自定义提供方补上缺失的模型 |
| Fetch available models 返回 401 | 检查 API Key 是否正确 |
| 图片在发送前被拒绝 | 该模型未在配置里声明图片模态，手动录入的模型默认按纯文本处理 |

几个必须记牢的注意点：

- 开发者预览：接口和格式会变，生产用户务必锁定具体发布版本，别直接跟 main 分支。
- 凭据安全：$DSH_HOME/.credentials.yaml 含明文密钥，注意文件权限，千万别提交进 Git 仓库。
- Provider ID 永久：自定义提供方的 ID 创建后不可改名，要改名只能新建再删旧的。

### 小结与延伸阅读

DeepSeek Harness 把"模型之外的执行层"做成了开源、MIT、model-agnostic 的插件套件。它的三根支柱是 Cordis 插件框架、append-only 事件溯源会话、以及显式的能力 seam；由此带来的可审计、可复现、可替换，正是受监管行业和内部工具团队最看重的。对一个想深入源码的人，建议路线是：先读 Cordis primer 建立五个观念，再读官方架构文档的子系统参考，最后用 --dump-config 看清你机器上的实际配置树，从 patch 一条条目开始动手。

延伸阅读：官方仓库 deepseek-ai/deepseek-harness（含中英文架构文档）、awesome-deepseek-harness（社区指南与插件）、deepseek-harness-book（蓝皮书）。如果你还想看"模型协议归一"这层是怎么实现的，[Pi 深度解析（二）](/posts/pi-ai-protocol-normalize/) 正好讲了 dsh 复用的那套 pi-ai 归一化机制。
