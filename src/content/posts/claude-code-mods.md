---
author: Duang
pubDatetime: 2026-10-03T02:40:00+08:00
title: "Claude Code Mods：把编码 Agent 变成可编程的运行时"
featured: true
draft: false
tags:
  - 最新速递
description: 2026-10-01，Anthropic 给 Claude Code 加上 mods。插件里的函数跑在进程内，可以观察、改写或接管事件。
revisions:
  - date: 2026-10-03
    note: 首发。按成稿整理，挂到最新速递。
---

2026-10-03 · 最新速递

本文挂在 [最新速递](/tags/最新速递/)。

## 01 · 引言：一条官方账号的发布帖

2026 年 10 月 1 日，Anthropic 官方开发者账号 ClaudeDevs 发布了一条 71 秒演示视频，宣布 Claude Code 现在支持 mods：你可以改变它的行为、定制界面、替换成自己的功能，用几行 TypeScript 写一个，或直接让 Claude 帮你写。mods 随插件分发，通过 `/plugin` 在 CLI 或桌面端安装。这条帖子获得约 1.77 万点赞、317 万浏览（X 平台口径）。同日，Anthropic 官方博客《Customize Claude Code with mods》与上手文档同步上线。

本文拆解 mods 的机制、它与既有扩展机制的边界、内置 mods 的示范意义，以及企业侧的治理模型，最后落在对自建 Agent harness 的借鉴价值上。

## 02 · Mods 是什么：进程内的事件处理器

官方定义：mod 是一个插件（plugin），由 JavaScript 或 TypeScript 事件处理器构成。Claude Code 每次动作都会发出事件，调用工具、请求权限、绘制界面的一部分，mod 在这些事件上注册函数，函数可以观察事件、改写事件或直接接管事件。本质上，mod 是 hooks 的函数形态：Claude Code 既有 settings hooks（配置在 settings 文件中、以 shell 命令、HTTP 请求或提示运行），mod 的处理器则作为函数运行在 Claude Code 进程内部。

这个进程内是关键差异。settings hooks、skills、status line、MCP servers 都在 Claude Code 之外工作：各自运行脚本，或给 Claude 文本与工具。mod 跑在进程内，因此能做到它们做不到的事：绘制可用界面（transcript 旁的面板、prompt 上方的 band、带按钮和输入框的组件）、重画 Claude Code 自己绘制的界面（工具调用行、spinner、提问对话框）、介入工具调用（按住一个工具调用先问用户、不执行工具直接回答、把一次请求发给另一个模型）、在 `/command` 上运行你自己的代码（无需 Claude turn，Claude 工作期间也能执行）、在 hooks 之间共享数据（同一文件内的变量，一个 hook 记录、另一个展示）。

## 03 · 为什么做 mods：hooks 够用但不够自由

官方博客给出了直接的动机：开发者一直想要对 Claude Code 的更多控制权，而不想等 Anthropic 逐个发功能。hooks 提供了部分控制，但 hooks 不能改写事件、不能绘制新 UI、不能替换功能。mods 可以。发布前 Anthropic 在 GitHub 上公开了设计征求意见，这条帖子是正式发布。

从时间线看，这不是孤立动作。2026 年 3 月 Anthropic 发布 auto mode（权限分类器，官方称用户批准了 93% 的权限提示），2026 年 5 月发布动态工作流（dynamic workflows），2026 年 9 月 Claude Code 出现 AGENTS.md 加载的 telemetry 依赖争议（社区报告关掉 telemetry 后 AGENTS.md 不加载，官方修复于 v2.1.281）。mods 是把控制权交还用户这条路线上的最新一步，但它把控制层级从配置提到了编程。

![图 1 mod 是事件处理器](/images/claude-mods-fig-hook.jpg)

**图 1｜** 事件从左边进来，先经过你的 hook，再交给后面的插件和 Claude Code。观察、改写、接管是同一条链上的三种动作。

## 04 · 工作原理：三个文件与一条事件链

一个最小 mod 只有三个文件：`plugin.json`（插件清单）、`hooks/hooks.json`（指向代码文件）、`hooks/register.js`（代码，注册事件处理器）。`register` 函数在 mod 加载时调用一次，内部用 `on(event, matcher?, hook)` 注册钩子。每个钩子形状相同：`async ($, e, next) => {}`，其中 `$` 是 mods API（ui、session、state、store、fs、process、clock、http、tool、command、model），`e` 是事件数据，`next` 把事件交给下一个插件与 Claude Code 自身行为。

钩子形成中间件链。一个钩子有三种动作：观察（`await next(e)` 后再看结果）、改写（`next({ ...e, command: safer })` 改变下游看到的参数）、接管（不调 `next`，直接返回，如拒绝工具调用）。多个 mods 钩同一事件时按加载顺序运行，先加载的先见事件、后收结果，因此可以堆叠不同作者的 mods。模块运行在独立沙箱中，无 DOM、无 Node，一切外部操作经 `$` 走 mods API。这正是 Claude Code 能在安装前列出这个 mod 钩了哪些事件、请求哪些能力的原因。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：一个钩子的三种动作</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>观察</b></p>
      <p>先交给下一个，再看结果。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>改写</b></p>
      <p>把事件改完再往下传。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>接管</b></p>
      <p>不调用 next，自己返回。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">三种动作都在同一条中间件链上。</p>
</section>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-hook-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">挂钩瓶</span>
  </div>
  <p class="duang-whisper-body">不调用 next，这件事就停在你这里。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

官方文档给出一个完整示例：计数 Claude 的工具调用并把数字显示在 spinner 旁。`tool.call` 钩子每次调用加一、请求重绘；`ui.render` 钩子在 spinner 组件上追加后缀。80 行的 Token Weather（claude.dev 上手教程，作者 Addy Osmani）则展示了完整能力：`session.start` 与 `turn.complete` 时读取 `$.session.usage()` 取上下文占用，把读数存进 `$.state`（热重载后仍存活），`ui.render` 在 AbovePrompt 组件上绘制天气预报条。按占用率分档（Clear/Cloudy/Showers/Storm/Compact soon），附 sparkline 与增量趋势。

## 05 · 内置 mods：可裁剪的 Claude Code

mods 最值得注意的产品决策是：部分内置功能本身就以 mod 形式实现。官方博客明确写道，内置的 `/diff` 功能现在就是一个 mod。可以在 `/plugin` 里关掉它，或用自己写的版本替换。官方计划随时间推移把更多内置功能迁移为 mods，让 Claude Code 收敛为一个小核心，用户只加自己需要的部分。

官方文档列出当前内置 mods：`cc-plugin-agents-md`（加载 AGENTS.md 作为项目指令）、`cc-plugin-diff`（接管 `/diff` 并绘制面板）、`cc-plugin-plugin-authoring`（给 Claude 提供写 mods 的 skill）、`cc-plugin-sec-default`（保护组织托管配置不被用户安装的 mods 越权改动，见下节）、`cc-plugin-telemetry`（分析记录）、`cc-plugin-you-should-know`（默认禁用，后台 side agent 在长任务中提醒用户可能遗漏的信息）。其中四个的源码公开在 Claude Code 仓库 `mods/` 目录，带测试，是学习官方写法的活教材。

## 06 · 团队与企业：sec-default 与治理

mods 随插件分发，因此既有插件控制全部适用：管理员可以允许或阻止插件市场。Team/Enterprise 计划由 owner 在管理控制台设置；Claude API 与第三方 API 计划由管理员推送托管设置。在 Team/Enterprise 与任何启用托管设置的机器上，内置 mod sec-default 最先加载，阻止用户安装的 mods 做危险动作（例如覆盖权限 deny 规则）；其源码公开。管理员可以让自己的 mods 优先加载，此时应把 sec-default 保留在列表中以维持其限制。

官方给出的团队用例有三个：CI/CD 状态面板（对话旁显示流水线状态并随构建实时更新）、生产保护（任何触及生产配置的命令先确认）、审计日志（最先加载的 mod 记录其他所有 mod 的每次调用）。安全模型是显式的：mod 以你的权限运行，能读写你的文件、启动进程、发起网络请求、读取环境变量与设置文件（含 API key）、看到会话中每个提示与工具调用、改写提示与工具调用、在未经询问时批准工具调用、消耗你的用量。

<details class="marginalia" open>
  <summary>权限跟着人走</summary>
  <div class="marginalia-body">
    mod 读写文件、发请求、看环境变量，用的都是你的权限。sec-default 能拦住一批危险动作，挡不住换工具绕过去。
  </div>
</details>

## 07 · 与既有机制的边界：一张对比表

官方文档用一张表划定 mods、settings hooks、skills、MCP servers 的边界，选型规则明确：要面板/band/自定义命令/改写事件用 mod；要用已有脚本做允许/拒绝/记录用 settings hook；反复粘贴同一段指令用 skill；Claude 需要接外部系统用 MCP。四者不互斥。一个插件可以同时装下四者。

| 维度 | Mods | Settings hooks | Skills | MCP servers |
|-|-|-|-|-|
| **形态** | 插件内函数，Claude Code 进程内调用 | shell 命令 / HTTP / 提示，生命周期事件触发 | SKILL.md 指令文件 | 外部进程或服务 |
| **能改什么** | 工具调用、提示、命令、turn、界面绘制 | 工具调用是否放行、参数与结果、附加上下文 | Claude 知道什么、能做什么 | Claude 有哪些工具 |
| **能画界面** | 能 | 不能 | 不能 | 不能 |
| **写什么** | JavaScript / TypeScript | 脚本 + settings.json 条目 | Markdown | 任意语言的服务端 |
| **选它当…** | 面板 / band / 自定义命令 / 改写事件 | 用已有脚本做允许 / 拒绝 / 日志 | 反复粘贴同一段指令 | Claude 接外部系统 |

![图 2 扩展 Claude Code 的四种机制](/images/claude-mods-fig-boundary.jpg)

**图 2｜** mods 进到进程里。hooks、skills、MCP 留在进程外。一个插件可以把四者装在一起。

## 08 · 安装、信任与安全实践

mod 以插件形式安装：会话内 `/plugin install name@marketplace`，或 shell 中 `claude plugin install`。安装或更新后运行中的会话需 `/reload-plugins`，否则下次启动加载。安装前可列出 mod 钩了哪些事件、请求哪些调用（读文件、网络请求等）而不运行它：先拿到插件文件（例如克隆仓库），再 `claude plugin validate` 该目录，输出中的 `hooks:` 与 `calls:` 行即为其行为清单。

信任边界明确：mod 是带你的权限运行的代码，只应安装自可信作者与市场。关闭方式分三档。单个 mod 在 `/plugin` 的 Installed 标签禁用；所有已装 mod 单会话关闭用 `--safe-mode`；所有自装 mod 全会话关闭在 `~/.claude/settings.json` 设 `disableAllHooks: true`（组织托管的仍运行）。官方还提示：mods 能重新绘制 Claude Code 大部分界面，但不能改变权限提示框本身。它不能改变提示向你展示的内容。版本要求是 Claude Code v2.1.287+，默认开启；早前测试期的 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` 已被忽略。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-panel-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">面板瓶</span>
  </div>
  <p class="duang-whisper-body">界面能重画。权限框那一块动不了。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

社区对安全边界的测试值得记录。机器之心报道了社区对 Claude hooks/mods 的对抗测试：故意让一个 hook 卡住时它静默失败，原本有风险的操作仍继续执行；拦截一次文件写入后，AI 换了另一个工具照样把文件写进去（拦截未说明具体原因）；拿有问题的代码跑安全检查，结果仍判断一切正常。这些测试的对象是 hooks 的既有行为，但直接适用于理解 mods 的能力边界。mods 提供更强的介入能力，同时也把拦截是否真正生效的问题放得更大。加上 2026 年 9 月社区记录的 48k 文件误删事件与 AGENTS.md telemetry 依赖争议，可编程扩展的信任问题已经成为编码 Agent 的主流讨论议题。

## 09 · 我的点评：mods 是 harness 可编程化的标志性一步

把 mods 放进行业语境看，它对应的是一个明确趋势：harness 正在从配置可调的产品变成可编程的运行时。Anthropic 此前通过 CLAUDE.md、settings hooks、skills 逐层开放控制，mods 是控制层级的跃迁：从声明式配置到命令式编程，从进程外脚本到进程内函数。与 OpenAI 2026 年 1 月拆解的 Codex agent loop 对比更清楚：Codex 把智能体循环当作内部架构对外讲解，而 Anthropic 把循环的每个环节（提示提交、工具调用、权限请求、界面绘制）都变成可钩事件开放给用户。两条路线一个是解释架构，一个是出租架构。

三个设计点值得自建 harness 借鉴。第一，事件即契约：把提示提交、工具调用、turn 起止、界面绘制全部定义成显式事件，扩展者只需面向事件编程，harness 内部实现可自由演进。第二，中间件链与三种动作：观察/改写/接管的分类把扩展能力约束在可审计的范围内，配合模块沙箱、外部操作必须经 API 的规则，使安装前静态审查成为可能。`claude plugin validate` 的 `hooks:` / `calls:` 清单是很好的模式。第三，内置功能与扩展同构：`/diff` 以 mod 实现意味着平台与生态共享同一套机制，扩展作者写的代码与官方功能走同一条链，这同时保证了能力对等与可裁剪性。

<details class="marginalia" open>
  <summary>同一条链</summary>
  <div class="marginalia-body">
    内置的 /diff 也是 mod。别人写的和官方的走同一套事件，才能换掉，也能关掉。
  </div>
</details>

风险同样值得指出。mods 以用户权限运行且不沙箱化，能力越强、滥用面越大；社区测试已经证明拦截不一定真拦得住，因为模型可以换工具绕行。企业侧的 sec-default 与托管排序是缓解而非根治。对 Go 技术栈的实现者，这套模式的移植路径清楚：进程内事件总线 + 中间件链 + 能力显式授予（`$` API 白名单）+ 静态审查工具，四件套与语言无关。

## 10 · 参考来源

- [Customize Claude Code with mods · Anthropic（2026-10-01）](https://claude.com/blog/claude-code-mods)
- [Mods overview · Claude Code 官方文档](https://code.claude.com/docs/en/plugins/mods/overview)
- [Getting started with Claude Code mods · Addy Osmani（2026-10-01）](https://claude.dev/blog/getting-started-with-claude-code-mods/)
- [ClaudeDevs 官方发布帖（2026-10-01，约 1.77 万赞 / 317 万浏览）](https://x.com/ClaudeDevs/status/2105721434807083061)
- [How we built Claude Code auto mode · Anthropic（2026-03-25）](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [Claude Mods 开始上线，社区用插件魔改 Claude Code · 机器之心](https://www.jiqizhixin.com/articles/2026-09-15-2)
- [48K Files Gone · AgentConn（2026-09-20）](https://agentconn.com/blog/agent-deleted-48k-files-enterprises-spending-1000-night/)
