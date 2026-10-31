---
author: Duang
pubDatetime: 2026-10-30T15:50:00+08:00
title: "你的 agent 是一个装满 Markdown 和 TypeScript 的文件夹：Cursor Agent SDK 转正了"
featured: true
draft: false
tags:
  - 最新速递
description: 2026-10-20，Cursor Agent SDK 正式 GA。一个 agent 是装满 Markdown 和 TypeScript 的文件夹，指令文件变成可部署程序的入口。
revisions:
  - date: 2026-10-30
    note: 首发。按成稿整理，挂到最新速递。
---

2026-10-30 · 最新速递

本文挂在 [最新速递](/tags/最新速递/)。原文写于 2026-10-28。

## 一条 changelog 里藏着一次"毕业"

2026 年 10 月 20 日，Cursor 的 Agent SDK 正式 GA。官方 [changelog](https://cursor.com/changelog/agent-sdk) 只写了一句话，但分量很重：你可以把一个 agent 定义成一个装满代码的文件夹，用 eval 测试它，然后部署到 Cursor 或你自己的基础设施上。

这篇文章的作者 Piekwerk 长期在做一件事：给 12 个技术栈维护版本钉死的 agent 配置包，也就是 AGENTS.md、CLAUDE.md、.cursorrules、copilot-instructions.md 这些指令文件。所以他对这次发布最感兴趣的点，不是又多了一个 bot 框架，而是这个发布对"指令文件"这个体裁做了什么。

结论是：指令文件毕业了。它不再是一个 IDE 的配置文件，而是一个可部署程序的入口点，有测试、有部署目标、走完整的软件工程流程。

## 先看清楚：这次到底交付了什么

Agent SDK 不是从零设计的框架，而是 Cursor 用来构建自家 managed agent 的那套 harness。Cursor 自己的 Bugbot、Security Review、Approval Bot、Rollouts 全都跑在它上面。现在它被拆成 npm 包，任何人可以直接装：

```bash
npx @cursor/agent-sdk init ./my-bot
cd my-bot
agent-sdk dev
```

agent-sdk dev 会在本地起一个带 playground 的 bot。加 --template 参数，可以从安全审查员、owners 策略审批、PR 自动修复，或 Linear/Jira 分流器这几个官方模板起步。作者特别提醒：即使你不打算部署任何 bot，这些模板也值得读一遍，因为它们展示了 Cursor 内部是怎么结构化一个可用 agent 的。

## 文件夹契约：每个文件都是 agent 的一部分

一个 agent 是一个固定布局的小项目：

```text
my-bot/
  instructions.md      # prompt 本体
  tools/               # 一个文件一个类型化动作，TypeScript
  skills/              # 模型按需加载的操作规程
  mcp-connections/     # 来自 MCP 服务器的工具
  channels/            # bot 接收和回复消息的渠道
```

prompt 用 Markdown 写，工具是 TypeScript 函数。有意思的是布局不是约定而是被机器校验的：agent-sdk validate 检查项目结构，agent-sdk info 打印发现了什么。也就是说，这个项目结构是"可检查的正确性"，不是"大家自觉遵守的习惯"。

## instructions.md 就是 prompt，所以要按 prompt 来预算

所有适用于 CLAUDE.md 或 rules 文件的经验，在这里都成立，只有一个区别：这段 prompt 会跟随 bot 处理的每一个事件。一个在每次 pull request 上醒来的审查 bot，每次醒来都要为它的指令文件付费。所以作者此前总结的 300 行指令预算逻辑直接适用，而且当 agent 无人值守运行时，"保持常驻 prompt 短小"这个纪律只重要不次要。

这是整个设计里最反直觉也最正确的一点：配置文件时代的文件可以写得啰嗦，因为反正是人读；变成 prompt 之后它每一行都要付 token 成本，而且是乘上事件次数。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    没人值守之后，常驻 prompt 的长度就是每次醒来的固定开销。
  </div>
</details>

## skills/ 和 mcp-connections/ 住进了同一棵树

这个布局把业界已经口头推荐很久的一种拆分落成了目录：稳定的行为放进 instructions.md，按需的知识放进 skills/，外部系统通过 mcp-connections/ 接入。skills/ 存的是模型相关时才加载的规程，是 Agent Skills 的形状，大块参考材料只在相关时进上下文；mcp-connections/ 放外部服务器里的工具。三个角色在同一个项目里各占一个一级目录，关于"某段配置到底该放哪"的猜测就消失了。

## Eval 断言的是工具调用，不是措辞

这篇文章作者认为真正算新闻的是 eval 的设计。一个 eval 向 bot 发送固定消息，然后断言它做了什么：跑了哪些工具、输入是什么、回复长什么样。不是"回答听起来对不对"，而是"它是否用正确的参数调用了正确的工具"。agent-sdk eval 可以在本地跑，也可以在 CI 里跑。

还有 replay：agent-sdk github replay 能把一个真实 pull request 转成带签名的 webhook payload 发给 bot，这样 GitHub 驱动的 bot 不用等真实推送就能测试。加 --dry-run --fixtures-dir fixtures/ 参数，payload 直接变成 eval fixtures。

这一步补齐了指令文件工作一直缺的闭环：一个 prompt 改动，和证明行为没漂移的 eval，落在同一个 PR 里。

## 部署是一条命令，退出路径是一个 Node 进程

agent-sdk deploy 会构建 agent、给它一个 URL、在 Cursor 的基础设施上启动它，密钥和集成从 dashboard 管理。也可以完全自托管：每个 agent 就是单个 Node 进程，可以打包进容器。这和 Cursor 的 self-hosted runners 是同一种形态。托管路径方便，自托管路径是真实的逃生舱，不是一个占位功能。

## 事件进来，会话保留

agent 会在这些事件上醒来：GitHub、GitLab、Bitbucket 的 pull request、评论和 CI 事件，Slack 的 mention 和 DM，任意 provider 的 webhook，还有 cron 定时。GitHub 事件走 Cursor 账号拉取，所以不需要暴露公开 webhook URL。每个对话保持自己的 session，保存每一条消息和工具调用的完整记录，PR 或 Slack 线程上的跟进会恢复同一个 session。对审查 bot 来说，这意味着上下文能跨过一个 pull request 的整个生命周期存活。

<section class="article-embed-note">
  <p class="article-embed-note-title">你的 agent 是一个文件夹</p>
  <p class="article-embed-note-lead">指令文件从 IDE 配置，升级成可部署程序的入口。</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>instructions.md</b></p>
      <p>prompt 本体。每个事件都随行加载。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>tools/</b></p>
      <p>一个文件一个动作，TypeScript 函数。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>skills/</b></p>
      <p>按需加载的规程，相关时才进上下文。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>mcp-connections/</b></p>
      <p>外部 MCP 服务器提供的工具。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>channels/</b></p>
      <p>bot 接收和回复消息的渠道。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">先 validate，再本地 dev 和 eval，用 replay 沉淀 fixture，最后 deploy 到 Cursor，或打成一个 Node 进程自己跑。</p>
</section>

## 如果你在维护 agent 配置，这意味着什么

指令文件这个体裁刚刚毕业。prompt、工具、eval、渠道现在住进同一个仓库，和你的其他软件走同一个评审流程，这正是"给 agent 配置做版本管理"的论点，从单个文件放大到了整个 agent。

有两件事值得盯着。第一，模型被钉死在代码里：官方 launch post 里的 defineAgent 调用带 composer-2.5 和 effort 参数，也就是说模型路由决策变成了可评审的 diff。以前换模型是 IDE 设置里的一下点击，现在是一个 PR。第二，harness 是 Cursor 的：agent 文件夹本身是可移植的，但围绕它的生态是 Cursor 的，密钥、dashboard、事件拉取都在那边。

作者的第一个上手建议很实在：把一条现有 rules 文件移植成 instructions.md，为你在意的那个行为写一个 eval，然后看哪里会破。这个练习教给你的 agent 配置知识，比读多少模板都多。

## 参考来源

Piekwerk [Cursor's Agent SDK is GA: your agent is a folder of Markdown and TypeScript](https://dev.to/piekwerk/cursors-agent-sdk-is-ga-your-agent-is-a-folder-of-markdown-and-typescript-1jh8)（dev.to，2026-10-28）。Cursor [Introducing the Agent SDK](https://cursor.com/blog/agent-sdk)（cursor.com/blog/agent-sdk，2026-10-20，Rustam Lalkaka）。Cursor Changelog [Agent SDK](https://cursor.com/changelog/agent-sdk)（2026-10-20）。
