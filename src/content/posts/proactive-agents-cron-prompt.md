---
author: Duang
pubDatetime: 2026-10-30T14:30:00+08:00
title: "所有主动式 Agent，本质上都是带 prompt 的 cron job"
featured: true
draft: false
tags:
  - 最新速递
description: Harrison Chase 那条推文说破了：主动式 Agent 的记忆、主动、分流、提醒和编排，都是定时跑一段 prompt。
revisions:
  - date: 2026-10-30
    note: 首发。按成稿整理，挂到最新速递。
---

2026-10-30 · 最新速递

本文挂在 [最新速递](/tags/最新速递/)。原文写于 2026-10-28。

## Harrison Chase 那条推文，点破了主动式 Agent 的秘密

2026 年 10 月 28 日，LangChain CEO Harrison Chase 发了一条推文，转发量不算夸张，但内容很值得琢磨：cron 是一个简单的技术，却能在 agent harness 里解锁一大堆新能力，比如记忆（做梦）、主动性、用户提醒，还有更多。被引用的那条原帖更直白：几乎所有你见过的主动式 Agent，本质都是带 prompt 的 cron job。那些"过夜做梦"的记忆、那些主动 ping 你的 agent，全都是一个超过 50 年的操作系统老概念上的定时运行。

这不是一句俏皮话。当天 LangChain 官方博客同步发了一篇技术长文，由工程负责人 Nathan Drezner 执笔，标题是 [How to Build Proactive, Always-On Agents](https://www.langchain.com/blog/proactive-agents)，专门讲怎么用 Managed Deep Agents 的 Schedules SDK 构建主动式 Agent。把推文和这篇博客放在一起读，能看到一套相当完整的工程思路。

## 先理解：cron 为什么是"50 年前的 OS 老概念"

cron 是 Unix 世界最古老的定时任务机制之一，1979 年随 V7 Unix 引入，到今天几乎所有服务器、CI、云平台还在用。它的核心能力只有一件事：在指定时间或按固定节奏，执行一段预先定义的任务。这个机制朴素到让人觉得不值一提，但它恰好解决了一个现代问题：Agent 怎么在没有人类输入的情况下自己"醒来"干活。

主动式 Agent（proactive agent）这两年成了大厂押注的方向，博客里点名 Muse、Instinct、Dots、Claude Duet、Hone 这些产品，加上 Anysphere 的 Claude Duet，共同特征是"总是在线、环境式、不等人开口就做事"。Nathan 在博客开头用了一个 Baader-Meinhof 现象做类比：你第一次学到某个词，之后就会到处看到它。他说主动式 Agent 也是这样，一旦你意识到它们背后都是 cron，你会到处看到 cron 的影子。

## cron 到底解锁了什么：五个能力层

博客把 crons 解锁的能力拆成五块，每一块背后都是一个具体的定时任务设计，这是全文最值钱的部分。

第一块是记忆，业内俗称"做梦"（dreaming）。所有主动式 Agent 的共同特点是能记住你较长时间尺度上的事实。实现方式很大一部分是跑一个后台任务：按固定节奏（比如每天一次）把之前的对话压缩成更密集的记忆形态，从反思对话的产物中提取长期记忆。也就是说，"做梦"不是一个玄乎的比喻，它就是每天凌晨一个 cron 把白天的对话重新想一遍、写成记忆。这也是我们从 Harness 到 memory 一直强调的：记忆不是存下来的，是整理出来的。

第二块是主动性（proactiveness）。主动式 Agent 会主动发起沟通，讲一个它觉得你可能感兴趣的想法。背后机制是 agent 有一个"目标"概念：通用型 agent 的目标就是当好助手，比如标记即将到来的截止日期、跟进一条没结束的线程、推送与你工作相关的新闻；专用型 agent 比如 Hone，是朝着一个明确目标推进。实现上就是设一个 cron（比如每小时一次），定时提醒 agent 去探索下一步可以推进目标的新动作，这些动作最后以主动消息的形式出现在用户面前。

第三块是智能分流（smart triage）。这个世界噪音太多，常驻 Agent 的一大用途是盯住一个信息源（Slack、Email 等），只把相关的消息挑出来 ping 给你。实现上就是一个 cron（比如每 10 分钟一次），让 agent 去看事件流里有什么值得通知的。它不解决"理解消息"的问题，解决的是"什么时候去看"的问题。

第四块是提醒（follow-ups）。cron 不只用在后台。用户经常要求"到点提醒我"，比如"明天提醒我交报告"。这时候 agent 在对话中创建一条 cron，到点把自己唤醒、提醒用户。这一条和前面三条不同：它是用户主动发起的、即时的、按需的。

第五块是编排（orchestration）。Agent 舰队可以由一个编排 agent 统一管理，而这个编排 agent 需要有能力在未来把自己唤醒：它可以用 cron 监控整个舰队，在等待一个异步子任务完成时先"睡觉"，再定期醒来检查进度。这是多 agent 系统里被低估的一环，跨会话长时运行的 agent（比如 Pi Durable 这类 harness 要解决的事）本质上都绕不开"休眠-唤醒"这个循环。

<section class="article-embed-note">
  <p class="article-embed-note-title">一个 50 年前的 OS 概念，喂饱了主动式 Agent</p>
  <p class="article-embed-note-lead">核心机制是 cron 加 prompt。调度器按时把同一只 agent 唤醒。</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>记忆，做梦</b></p>
      <p>每天一次。把之前的对话压成更密的长期记忆。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>主动性</b></p>
      <p>每小时一次。按目标去找下一步，再主动发消息。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>智能分流</b></p>
      <p>每 10 分钟一次。盯 Slack、Email，只把相关的挑出来。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>提醒</b></p>
      <p>按需。用户说一声，agent 自己建一条 cron。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>编排</b></p>
      <p>定期轮询。编排 agent 先睡，再醒来看子任务。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">五件事都是同一张表：到点，跑一段 prompt。</p>
</section>

## 一个数据点：70% 的运行来自调度而不是人

博客给了一个非常能说明问题的数字：LangSmith 上超过 70% 的 Managed Deep Agent 运行来自定时调度，而不是人类在聊天框里打字触发。这意味着在这些系统里，主动行为已经不是锦上添花，而是默认路径。人发起的对话反而成了少数。当你说"我要构建一个常驻 Agent"时，你实际上在说"我要维护一张 cron 表"。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    人发起的对话变成少数之后，要值班的是那张调度表，不是聊天框。
  </div>
</details>

## 构建主动式 Agent 的两个关键部件

博客明确给出了结论：要构建这类 Agent，一般需要两个东西。

第一个是健壮的 cron 服务器。开发者要能方便地加 cron：支持任意调度表达式、每条 cron 带一段 prompt、如果 agent 跑的时候需要特定技能或权限也要一并带上；如果某个时间点有大量任务集中触发，服务器还要做轻微的抖动（jitter）把负载摊开。说白了，这是一个把"调度、prompt、权限"三个要素绑定在一起的执行平台。

第二个是 Agent 友好的接口。比如"提醒"这个动作，agent 需要能在对话中自己设置、查看、修改提醒，而且要受治理：它能给自己建提醒，但不能越权动别人的。这一层决定了主动式 Agent 能不能真正落地，而不只是 demo。

## Managed Deep Agents 里怎么落地

博客后半段给了具体的代码形态。Managed Deep Agents 托管在 LangSmith Deployments 上，内置 cron 服务器，可以动态触发 agent 运行。一个定时运行本质上很简单：一段提前定义好的 prompt，按计划触发，以创建这条 schedule 的人的身份带着线程和记忆执行。

Schedule 可以静态定义，作为 agent 设计的固定部分。比如一个每天早上 8 点跑一次的工作日报 agent，就是 schedules/ 目录下的一小段代码：

```python
from managed_deepagents import define_schedule

schedule = define_schedule(
    cron="0 8 * * 1-5",
    timezone="America/Los_Angeles",
    prompt="Inspect the sales report using your tools and send a KPI readout.",
)
```

也可以动态创建：把 Schedules SDK 包装成工具，让用户在对话中直接让 agent 安排重复任务，开发时根本不用预先想到这个场景。比如给 agent 装上三个工具 set_schedule、list_schedules、delete_schedule，用户说"每周五下午提醒我发周报"，agent 就现场创建一条 cron。更轻量的场景还可以只暴露一个 check_in_later 工具，让 agent 在几分钟后一次性唤醒自己。

```python
from datetime import datetime, timedelta, timezone
from langchain.tools import tool
from managed_deepagents import ManagedDeepAgentRuntime

@tool
async def check_in_later(prompt: str, minutes: int, runtime: ManagedDeepAgentRuntime) -> str:
    """Run a prompt once for the current user, a number of minutes from now."""
    at = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    item = await runtime.schedules.create(owner={"type": "user"}, at=at, prompt=prompt)
    return f"Scheduled a check-in {item['id']}."
```

## 怎么理解这件事

把推文、引用帖和官方博客放在一起，能提炼出三层意思。第一层，主动式 Agent 没有玄学：记忆做梦、主动出击、消息分流、提醒、编排，五个能力全部落在"定时运行一段 prompt"这个朴素机制上，工程上不需要什么新技术，需要的是把调度平台做好。第二层，Agent 从"人驱动的工具"变成"自己安排工作的系统"，调度权正在从开发者手里移交到 agent 手里：静态 schedule 是开发者预先设计的，动态 schedule 是 agent 在对话中自己创建的，后者才是"主动"二字的真正含义。第三层，对做 Agent 后端的人，这提醒我们给 agent 暴露"安排未来任务"的能力是一件优先级很高的事，不管用 cron、队列还是 workflow，本质上都是让 agent 拥有时间维度上的自主性。

一句话收尾：如果你在做 Agent，别只想着怎么把对话答好，也想想怎么让它在没人说话的时候自己醒来把事情做了。答案大概率就在一张 cron 表里。

## 参考来源

Harrison Chase 推文（@hwchase17，2026-10-28）。Nathan Drezner 引用帖与文章（@ndrezn）。LangChain 官方博客 [How to Build Proactive, Always-On Agents with the Schedules SDK in Managed Deep Agents](https://www.langchain.com/blog/proactive-agents)（2026-10-28）。LangChain 文档 [Add schedules to Managed Deep Agents](https://docs.langchain.com/langsmith/python/managed-deep-agents-schedules)（2026-10-27 更新）。
