---
author: Duang
pubDatetime: 2026-08-09T10:30:00+08:00
title: Agent 拆解专栏
featured: true
draft: false
tags:
  - Agent 拆解专栏
description: 把真正有意思的 Agent 项目拆开看：从单轮循环到多智能体拓扑，再到后端和前端。每篇都带真实路径、核心代码和工程取舍。
---

这个专栏只做一件事：把我觉得真正值得琢磨的 Agent 项目掰开揉碎了看。每篇不是 README 复述，而是真钻代码、看数据结构、找设计取舍。标签：[Agent 拆解专栏](/tags/Agent%20拆解专栏/)。

读这个系列的预期：

- 每个项目先看为什么存在（demo 之后的那个痛点），再看进程拓扑、Agent 技术层、后端、前端。
- Agent 技术层会拆单轮循环、工具模型、多智能体拓扑是怎么声明和路由的、记忆和治理的切入点。
- 会带 Mermaid 拓扑图、核心代码片段（带真实路径）、和我自己踩过或判断可能踩的坑。
- 不说口号，不堆 buzzword。判断都是我的第一人称判断。

已写：

- [Prime Agent 深度解析：自进化的递归语言模型智能体](/posts/prime-agent-deep-dive/) — PrimeIntellect-ai/prime-agent，核心两个抽象：递归语言模型（RLM）和持续框架（Continual Harness），看它怎么让 LLM 自己管理上下文，而不是用脚手架替它管。
- [ego-lite 深度解析：为 AI Agent 重写的人机共享浏览器](/posts/ego-lite-deep-dive/) — citrolabs/ego-lite，闭源浏览器 + 开源 Node.js/CDP harness，三层结构 + 任务空间所有权 + 强快照 + learning 子系统，看它怎么同时解决登录态、抢 tab、token 三件老大难。

后续想拆：Orloj（多智能体拓扑 + claim/lease worker 那一套）、Claude Code 的 skill 系统、Cursor Apply 那个 diff 决策循环。
