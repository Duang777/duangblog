---
author: Duang
pubDatetime: 2026-07-25T01:30:00+08:00
modDatetime: 2026-07-25T01:55:00+08:00
title: 后端专栏
featured: true
draft: false
tags:
  - 后端专栏
description: 服务端机制笔记的总入口。小栏目请求过境从一次 HTTP 的超时拆起。
---

后端专栏记的是服务端怎么跑、线上怎么挂：协议、并发、存储、缓存、队列、鉴权、排障。标签：[后端专栏](/tags/后端专栏/)。

其中一条线叫 **请求过境**，只顺着一次请求往下拆。第一篇从 Go 的 `net/http.Server` 超时字段写起：

- [HTTP 进到 Go 进程之后，超时到底卡在哪](/posts/request-crossing/)

后面同一条线会接着写 context 下传、连接池和请求生命周期、网关超时怎么和服务端对齐。相关文同时带标签 `后端专栏` 和 `请求过境`。
