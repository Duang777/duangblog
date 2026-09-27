---
author: Duang
pubDatetime: 2026-09-28T03:00:00+08:00
title: 怎么写一个好的 CLI：2026 年的人机双用户设计
featured: true
draft: false
tags:
  - thinking
description: 2026 年 CLI 同时服务人与 Agent。整理可发现性、结构化输出、DX 与 AX 双模式，以及落地建议。
revisions:
  - date: 2026-09-28
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> 核心结论：今天的软件服务人类，明天的用户是 Agent。人需要可发现性、一致性与克制的输出；Agent 需要确定性、结构化输出与无头操作。

2026-09 · 深度调研

2026 年命令行接口（CLI）正在发生一次身份转变。它不再只是给程序员准备的效率工具，而是成为 AI Agent 调用软件的主要通道：Q1 2026 有至少六个仓库以“给已有软件一个 Agent 可用的结构化 CLI”为出发点，累计超过 13 万星标，fork 比例普遍在 5% 到 9% 之间，明显高于典型热门仓库的 1.5% 到 3%，被视为真实生产采用的信号。

一句话概括这场变化的共识：今天的软件服务人类，明天的用户是 Agent。这篇文章整理 2026 年关于 CLI 设计的最新讨论，分为面向人的设计、面向 Agent 的设计、两者的统一以及落地建议。

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：DX 给人，AX 给 Agent</p>
  <p class="article-embed-note-lead">环境检测决定默认形态。非 TTY 给 JSON，交互终端给表格。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 220" role="img" aria-label="DX 面向人，AX 面向 Agent"><text class="perf-label" x="8" y="36">DX</text><rect class="perf-hbar" x="148" y="20" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="36">表格、语义配色、交互确认</text><text class="perf-label" x="8" y="76">AX</text><rect class="perf-hbar is-tail" x="148" y="60" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="76">默认 JSON、无头认证、dry-run</text><text class="perf-label" x="8" y="116">检测</text><rect class="perf-hbar" x="148" y="100" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="116">TTY / NO_COLOR / NO_TUI</text><text class="perf-label" x="8" y="156">纪律</text><rect class="perf-hbar" x="148" y="140" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="156">流分离、退出码、窄响应、变更边界</text><text class="perf-label is-tail" x="8" y="196">产出</text><rect class="perf-hbar is-tail" x="148" y="180" width="460" height="22" rx="3"/><text class="perf-chip-sub" x="160" y="196">结构化命令 + SKILL.md</text></svg>
  </figure>
  <p class="article-embed-note-foot">两者的交集是纪律，不是两套互斥产品。</p>
</section>

## 面向人的 CLI：可发现性与一致性

面向人的 CLI 设计在 2026 年已经有一套成熟的准则，以 Command Line Interface Guidelines（clig.dev）为代表。其核心理念是 human-first：传统 Unix 命令假定主要由程序调用，如今大部分 CLI 由人使用，设计应当优先考虑人。

首先是流与退出码的基本纪律。主输出走 stdout，机器可读内容也走 stdout，因为管道默认从 stdout 取数据；日志、错误与提示走 stderr，这样命令在管道中被串联时，提示信息显示给用户而不会混入下一个命令的输入。

退出码必须正确：成功返回 0，失败返回非零，并尽量把非零码映射到最重要的失败模式，脚本靠它判断成败。

其次是帮助与发现。程序应当完整支持 -h 与 --help，子命令也应有各自的帮助文本。当程序需要参数而未提供时，显示简洁帮助而非报错或无输出：只包含程序做什么、一两个示例、少量 flag 说明，并提示传 --help 查看完整列表，jq 是这一模式的范例。flag 命名遵循既有惯例（--all、--force、--json、--dry-run、--no-input、--quiet、--version 等），用户猜得到就不需要查文档。

再次是输出的人性化。人类可读的输出优先，判断输出由谁读的启发式是“是否为 TTY”：交互终端里可以展示表格、颜色与动画，管道或文件里则不应有颜色与动画。

提供 --json 与 --plain 两个出口，前者给出结构化数据，后者保证一行一条记录、便于 grep 与 awk。默认输出应简短，成功时少说话；但改变系统状态时必须告知用户发生了什么（git push、git status 是范例）。颜色要有意图地使用，并遵守 NO_COLOR 与 --no-color。

最后是交互与安全。优先用 flag 而非位置参数，flag 语义更清楚且便于未来扩展；所有 flag 都要有长形式。需要用户输入时提示，但绝不强制交互：stdin 非 TTY 时跳过提示，直接要求 flag。

危险操作（删除、生产环境写入）执行前确认，非交互环境用 --force 或 --dry-run 表达。网络请求应可配置超时并设合理默认；程序应当可恢复，失败后重跑能从断点继续。

Ctrl-C 要尽快退出，清理逻辑限时，第二次 Ctrl-C 强制终止。设计上尽可能 crash-only：无需清理就能直接退出，下一次运行完成收尾。

<details class="marginalia" open>
  <summary>TTY</summary>
  <div class="marginalia-body">
    非 TTY 默认 JSON。交互终端展示表格，管道与 Agent 调用获得结构化数据。
  </div>
</details>

## 面向 Agent 的 CLI：结构化与确定性

2026 年 CLI 最大的变化是用户群体从“人”扩展到“Agent”。Agent 无法点击按钮、无法完成交互式 OAuth、上下文窗口有限，这些约束直接改变了设计优先级。OpenAI 在 Codex 的官方 cli-creator 指南与 Google 的 Agent-Aware CLI 规范中给出了高度一致的原则，可以归纳为七条。

第一，结构化输出成为默认。每个命令都应返回可解析的 JSON，而不是为人类排版的表格；默认响应保持窄小，数据量大时写入文件并返回路径，而不是把全部内容灌进上下文。OpenAI 的示例对比很直观：同样列出构建记录，表格输出让 Agent 浪费 token 解析对齐字符，窄 JSON 则直接可用。

第二，发现先于详情。命令面按“先搜索后按 ID 读取”组织：list 或 search 命令带筛选与分页，get 命令按稳定 ID 返回完整对象。这与人浏览 API 的方式一致，也是 Agent 自然的 explore-then-drill 模式。

第三，认证必须无头化。Agent 无法完成基于浏览器的 OAuth 流程，CLI 应支持环境变量、API Key 或 token 文件等无头认证方式；凭证缺失时清晰报错并指出应设置哪个环境变量，而不是卡在交互登录。Google 的规范补充：也可以立即以机器可读错误失败，提示人类先手动完成认证。

第四，写操作要有安全边界。CLI 应声明哪些命令只读、哪些需要人工审批；配套的 SKILL.md 明确写出审批边界，与 Codex 的 approval mode 对应。destructive 操作提供 --dry-run，让 Agent 在不产生副作用的情况下验证参数映射与请求载荷。

第五，文件路径优于内联内容。输出超过几百 token 就写文件并返回路径，由 Agent 决定是否读取，避免污染上下文窗口。

第六，PATH 可安装且与目录无关。CLI 应可从任意目录调用，安装到 PATH，内部使用绝对路径，而不是依赖项目根目录上下文。

第七，错误码可预测。使用标准退出码加结构化错误 JSON，错误对象包含机器可读的 code 字段，让 Agent 能决定重试、升级或中止，而不是解析含糊的自然语言报错。Google 还强调错误提示要可执行：把可复制粘贴的修复命令写进 stderr（例如“Hint: run 'app init' to create a database”），让 Agent 读到错误就能自纠。

## 两套要求如何统一：DX 与 AX 的双模式设计

面向人的可发现性与面向 Agent 的确定性看似冲突，实际上可以统一为双模式设计。Google 的 Agent-Aware CLI 把这一范式命名为 DX 与 AX：DX（Developer Experience）面向人类操作者，强调可发现性、丰富 TUI、语义配色与直观别名；AX（Agent Experience）面向自主 Agent，强调确定性、严格的机器可读输出、无头认证、激进的数据范围控制与变更安全。

| 维度 | DX：面向人类 | AX：面向 Agent |
|-|-|-|
| 输出 | 表格、语义配色、富 TUI | 默认 JSON、稳定字段顺序、窄响应 |
| 认证 | 交互式登录、浏览器 OAuth | 环境变量、API Key、token 文件 |
| 数据范围 | 展示全部信息，供人浏览 | 默认限制条数，--limit / --status 筛选 |
| 变更操作 | 交互确认（y/n） | --dry-run 预览、--force 跳过、审批边界 |
| 错误 | 自然语言解释 | 结构化错误 JSON + error.code + 修复命令 |
| 上下文 | 无约束 | 截断大文本、关键项置顶、默认脱敏凭据 |

统一的关键机制是环境检测：尊重 NO_COLOR 与 NO_TUI 环境变量自动回退到非交互、无样式模式；检测 stdout 是否为 TTY，决定默认输出 JSON 还是表格。许多实践者采取“非 TTY 默认 JSON”的策略：交互终端展示人类友好表格，管道与 Agent 调用获得结构化数据。

## CLI 与 MCP 的取舍

一个值得单独讨论的问题是：为什么不用 MCP 而是用 CLI 给 Agent 提供能力？defi-cli 作者在构建过 MCP server 与 CLI 之后明确建议：只要可能就选 CLI。MCP 会带来 schema 描述、工具元数据与连接管理的大量上下文开销，挤占 Agent 有限的上下文窗口；而 CLI 一次调用、得到结构化输出、没有持久连接与 schema 协商。

Codex 官方博客引用的对比研究更有说服力：在 75 组相同任务的测试中，CLI 方案的 token 成本比 MCP 低 10 到 32 倍，可靠性约 100% 对 MCP 的 72%。

这并非否定 MCP。合理的分工是：MCP 用于有状态、会话内工具（数据库连接、浏览器会话），CLI 用于无状态、可组合的操作（搜索日志、查询 API、下载产物）。模型已经在海量 shell 脚本与 Unix 管道上训练过，组合语法内化在权重里；给 Agent 一个结构良好的 CLI，它可以用训练中见过无数次的方式去管道、过滤与串联。

defi-cli 的实践给出了一个完整的参照：每个命令都支持 --output json 与 --input-json/--input-file 结构化输入；用 --select 让 Agent 只取需要的字段，保持响应紧凑；执行前默认模拟（--simulate 对每一步做 eth_call 校验，revert 即中止）；命令面拆成 plan、submit、status 的生命周期，把意图与执行分离，避免一条命令直达危险动作。

作者还强调：Agent 友好必须第一天就设计，事后补做代价高昂；命令面要小而克制，因为每个命令都是 Agent 必须解析的表面积；同时应随 CLI 分发一个 SKILL.md，编码使用模式，而不是让 Agent 只靠 --help 推断。

<details class="marginalia" open>
  <summary>MCP</summary>
  <div class="marginalia-body">
    75 组相同任务里，CLI 的 token 成本比 MCP 低 10 到 32 倍，可靠性约 100% 对 72%。
  </div>
</details>

## 落地建议

落到实现层面，Go 生态的 Cobra 与 Viper 是 2026 年 Agent-Aware CLI 的参考实现。Cobra 侧：用 GroupID 给命令分组，避免根帮助变成一堵文字墙；每个命令完整填写 Short、Long、Example 三个字段（5 到 10 词的行动动词摘要、详细说明、3 到 5 个可复制的示例）；在 PersistentPreRun 钩子里先做配置与连通性校验，失败快速退出。Viper 侧：配置遵循 XDG 规范（如 ~/.config/app/config.yaml）；取值优先级固定为 flag 大于环境变量大于配置文件大于默认值；密钥走环境变量而不是 flag，避免泄入 shell 历史。

文档层面，把 AGENTS.md 或 GEMINI.md 放在仓库根目录，说明工具的用法、工作流与标准；为复杂子命令提供符合 agentskills.io 规范的 skills/ 目录。CLI-Anything 项目的做法是自动生成：用七阶段流水线从任意代码库产出带 --json、REPL 与 SKILL.md 的完整 CLI harness，把“GUI 转 CLI”变成一条可重复的生产线：这本身也印证了 Agent 原生接口可以规模化生产。

X 生态同样在践行这些原则：twitter-cli 为非 TTY 输出默认 YAML、支持 --json，并随工具提供 SKILL.md 供 Claude Code 等 Agent 直接调用；X 官方的 xurl 与社区工具 xmaster 都声明“从第一天为 AI agent 设计”，统一提供结构化 JSON 输出、语义化退出码与管道感知的自动 JSON。终端工具链正在整体转向 Agent 可消费的结构化接口。

## 结论

2026 年写一个 CLI，本质上是在设计一个同时服务人与 Agent 的接口层。人需要可发现性、一致性与克制的输出；Agent 需要确定性、结构化输出与无头操作。

两者的交集是纪律：流的正确分离、语义化的退出码、可预测的错误、窄小的默认响应、安全的变更边界。CLI 正在扮演十五年前 REST API 的角色：软件如何暴露自己，决定了谁能在此基础上构建。

今天的选择是：让一切软件的能力都可以表达为一条带结构化输出的命令，并配一份 Agent 能读懂的说明文件。

## 参考

- [Command Line Interface Guidelines（clig.dev）](https://clig.dev)
- [OpenAI《Create a CLI Codex can use》](https://developers.openai.com/codex/use-cases/agent-friendly-clis)
- Google Cloud《Agent-Aware CLI》
- [Codex Knowledge Base《Building Agent-Friendly CLIs with Codex CLI》（2026-04，更新于 2026-09）](https://codex.danielvaughan.com/2026/04/28/building-agent-friendly-clis-codex-cli-composable-tool-design/)
- [Gustavo《Designing defi-cli for AI Agents》（provingground.xyz，2026-04）](https://www.provingground.xyz/p/designing-defi-cli-for-ai-agents)
- [OSS Insight《The Agent Interface Layer: Software’s New Platform Primitive》（2026-03）](https://ossinsight.io/blog/agent-native-cli-wave-2026)
- [HKUDS/CLI-Anything（README 与 CLI-Hub）](https://github.com/HKUDS/CLI-Anything)
- [X 官方 xurl](https://github.com/xdevplatform/xurl)
- twitter-cli / xmaster 项目文档

核验日期：2026-09-23。
