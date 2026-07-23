---
author: Duang
pubDatetime: 2026-07-18T09:30:00+08:00
title: 无服务器个人站：从写完到上线
draft: false
tags:
  - 部署
  - 随笔
description: Git 推送即发布。Cloudflare Pages 对我这种个人博客已经够用。
---

这个博客不需要自己买 VPS。构建产物是静态文件，交给 CDN 托管即可。

## 实际流程

1. 在 `src/content/posts/` 写 Markdown  
2. 本地 `npm run dev` 预览  
3. `git push` 到 GitHub  
4. Cloudflare Pages / GitHub Actions 自动构建部署  

几分钟后，线上就能看到更新。

## 为什么适合个人博客

- **几乎零运维**：没有数据库、没有要打补丁的应用服务器  
- **速度快**：静态资源走边缘节点  
- **文章可迁移**：内容就是仓库里的文件，换主题也不怕锁死  

对我来说，「主要是发博客」这件事，静态站已经是最优解之一。剩下的重点只有一个：把想写的内容写下来。
