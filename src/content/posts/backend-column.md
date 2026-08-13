---
author: Duang
pubDatetime: 2026-07-25T01:30:00+08:00
title: 后端专栏
featured: true
draft: false
tags:
  - 后端专栏
description: 后端专栏系列入口。从一次请求出发，记录服务端边界、时序和真实故障。
---

标签：[后端专栏](/tags/后端专栏/)。

下面是当前已写完的内容，分子专栏组织。

## 后端架构深度解析（三种语言对照）

同一套分层骨架（接入层 / 业务层 / 数据层 / 基础设施层），用 Go、Python、TypeScript 各写一遍，对比每种语言自带的并发模型和生态习惯，避免用框架代替思考。

- [Go 篇：用 goroutine 和接口把高并发写进骨架](/posts/backend-arch-go/)
- [Python 篇：顺着一次请求看懂系统的每一层](/posts/backend-arch-python/)
- [TypeScript / Node 篇：单线程事件循环与 NestJS 工程骨架](/posts/backend-arch-ts/)

## 请求过境

跟着一次真实的 HTTP 请求从 `listen` 到 `accept`、读 header、读 body、跑 handler、写响应、关连接，把每一步的超时、边界和故障都拆清楚。每一篇解决一个"我之前一直混用"的问题。

- [Handler 里的 Context 怎么传到数据库查询](/posts/context-to-db/)

---

已开两个子专栏：**后端架构深度解析**（三语言对照，分层骨架与可运行代码）与 **请求过境**（沿着一次请求到时序与故障）。后面继续写连接池抖动、四种 timeout 各自的边界、写响应途中断网等场景。
