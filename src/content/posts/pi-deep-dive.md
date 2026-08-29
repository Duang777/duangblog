---
author: Duang
pubDatetime: 2026-07-31T21:50:00+08:00
modDatetime: 2026-07-31T21:50:00+08:00
title: Pi 深度解析
featured: true
draft: false
tags:
  - Pi 深度解析
description: Pi coding agent harness 的专栏入口。从全景与取舍开始，后面按包边界拆实现。
---

Pi 深度解析拆的是 [earendil-works/pi](https://github.com/earendil-works/pi)（原 `badlogic/pi-mono`）：一个偏极简的 TypeScript coding agent harness。标签：[Pi 深度解析](/tags/Pi%20深度解析/)。

已写的内容：

- [Pi 的包怎么分层，以及它故意不做的那些事](/posts/pi-overview/)（全景，第 1/7）
- [pi-ai 之一：四种协议怎么被归一化成同一个接口](/posts/pi-ai-protocol-normalize/)（第 2/7）
- [pi-ai 之二：上下文怎么在厂商之间流动](/posts/pi-ai-context-flow/)（第 3/7）

后面按包边界接着写：`pi-agent-core`、`pi-tui`、`pi-coding-agent`，再加一篇扩展与集成（RPC、OpenClaw、容器化）。
