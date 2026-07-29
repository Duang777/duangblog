---
author: Duang
pubDatetime: 2026-07-25T01:30:00+08:00
modDatetime: 2026-07-25T01:55:00+08:00
title: Backend notes
featured: true
draft: false
lang: en
tags:
  - 后端专栏
description: Entry point for server-side mechanism notes. The Request Crossing series starts with HTTP timeouts in Go.
---

Backend notes cover how servers run and how they fail in production: protocols, concurrency, storage, cache, queues, auth, debugging. Tag: [Backend notes](/en/tags/后端专栏/).

One thread is **Request Crossing** — walking a single request downward. Two posts so far:

- [Where timeouts bite after HTTP enters a Go process](/en/posts/request-crossing/)
- [How Handler Context reaches database queries](/en/posts/context-to-db/)

Next on that line: connection pools vs request lifetime, and aligning gateway timeouts with the server. Related posts carry both `后端专栏` and `请求过境`.
