---
author: Duang
pubDatetime: 2026-10-10T20:40:00+08:00
title: "Claude Managed Agents 动态工作流：让 Lead Agent 自己写编排程序"
featured: true
draft: false
tags:
  - 最新速递
description: 2026-10-09，Anthropic 把 Claude Managed Agents 的动态工作流推到公开 Beta。lead agent 自己写 workflow，服务端按阶段跑完再合并。
revisions:
  - date: 2026-10-10
    note: 首发。按成稿整理，挂到最新速递。
---

2026-10-10 · 最新速递

本文挂在 [最新速递](/tags/最新速递/)。

## Claude 把编排也交给了模型

Anthropic 在 2026 年 10 月 9 日把 Claude Managed Agents 的"动态工作流"（dynamic workflows）推到了公开 Beta。它不是又一个多智能体框架，而是把"编排这件事"本身交给模型：lead agent 先写出一段 workflow 程序，服务端把它当作一次 workflow run 在后台按阶段执行，跑完再合并结果。对开发者来说，这意味着多智能体系统从"你定义角色和流程"进化为"你描述目标，模型自己定义流程"。

## 这条消息在讲什么

Anthropic 官方开发者账号 ClaudeDevs 发布：Claude Managed Agents 动态工作流现已公开 Beta，定位是"为最重负载设计的新型多智能体编排"。原话的核心是：一个 lead agent 写出一份计划，这份计划跨多个 agent 分阶段运行，最后把结果合并。发布当天即收获过万点赞与数千收藏，热度集中在"它把 orchestrator 的角色也让给了模型"这一点上。

## 动态工作流到底是什么

官方 release notes 的定义很克制：对于"有很多组成部分"的任务（比如审查几百份文档），agent 可以写一个 workflow。workflow 是一个程序，运行许多 agents、分阶段执行、合并它们返回的结果；服务端把它作为 workflow run 在后台运行，agent 可以继续工作或结束本轮。关键点有三个：

- **workflow 是程序而不是配置：**由 agent 现场编写，不是开发者预置的流程文件
- **workflow run 是后台执行单元：**服务端拿到 workflow 后独立调度，不占用 lead agent 的回合
- **结果在末尾合并：**各阶段产物汇总后回到 lead agent 或用户手里

## 和 Claude Code 的动态工作流是什么关系

动态工作流这个概念并非首次出现。2026 年 5 月 28 日，Anthropic 就在 Claude Code 中发布了同名能力（现已 GA）：Claude 现场编写编排脚本，在单个会话里运行几十到几百个并行子 agent，交付前先自查。官方博客的说法是"原本按季度规划的工作，现在几天内完成"。两者同源不同载体：Claude Code 版本跑在你的终端和本地运行时里，Managed Agents 版本跑在 Anthropic 云端的受管沙箱中，走 API、有 session/thread 生命周期、可观测性也更完整。理解这条演进线很重要：先有单机版证明"模型自写编排"可行，再把同一套思想搬进生产级 API。

## 底层机制：多智能体编排是怎么组织的

Managed Agents 的多智能体能力从 5 月 19 日起就是公开 Beta。组织方式是：所有 agent 共享同一个沙箱、文件系统和 vault 凭据，但每个 agent 跑在独立的 session thread 里，拥有自己的对话历史和上下文隔离。coordinator（协调者）在主线程汇报活动，运行时按需派生新线程；线程是持久的，coordinator 可以给之前调用过的 agent 发后续任务，对方保留全部前文。每个 agent 有自己的模型、系统提示词、工具、MCP 服务器和技能，互不共享。

coordinator 通过 multiagent 配置声明可委派的 agent 名册：可以按 ID 引用已创建的 agent、固定某个版本、允许 spawn 自己的副本（self），或者配置一个 advisor 顾问——一个会话主线程可在回合中咨询的更强者，用于规划方向、解困或交付前审查。约束也明确：coordinator 只能委派一层，名册最多 20 个唯一 agent，并发线程上限 25。这些限制保证了编排复杂度的边界可控。

## 动态工作流把编排又推进一步

多智能体编排解决的是"把任务拆给谁"，动态工作流解决的是"拆完怎么串"。前者是运行时交互——coordinator 在回合中决定派谁、发什么消息；后者把决策本身编码成一段可执行程序——lead agent 一次性写出"分几个阶段、每阶段跑哪些 agent、结果如何过滤合并"的 workflow，服务端按程序执行，agent 的上下文在阶段间被有效管理。官方 cookbook 对 Claude Code 版本的描述是：模型写一段 JavaScript 编排脚本传给 Workflow 工具，脚本并行或分阶段 spawn 子 agent，把结果存在变量里，用普通代码做过滤、循环和验证。Managed Agents 版本沿袭同一思想，只是执行环境换成云端。

这带来两个直接价值。第一是规模：几十到几百个 agent 的并行编排不需要开发者手写 harness；第二是可靠性：模型可以在 workflow 里写检查步骤，交付前自验。配合之前发布的 Outcomes（用评分器按标准评估输出，不合格就重做），动态工作流让"模型自查、多轮修正"成为受管平台的一等公民。

## 适合什么场景

官方点名的典型场景是"组成部分很多"的任务：审查几百份文档、跨多个来源交叉核验、在复杂遗留代码库里排查横跨整个服务的 bug、牵涉上百个文件的迁移。这些任务的共同点是单次单 agent 无法完成，且子任务之间存在可编排的先后与并行关系。与之相对，单轮问答、流程完全固定的高频任务，用普通 agent 或传统 workflow 反而更简单——动态工作流的收益来自任务规模和不确定性。

## 开发者视角的几个判断

第一，这件事标志着多智能体编排正在从"框架优先"走向"意图优先"：开发者描述目标，模型生成执行计划。第二，对已经用 Claude Code 动态工作流的团队，Managed Agents 版本意味着同一套模式可以搬进 API 化的生产环境，获得沙箱、预算、webhook、审计这些平台级能力。第三，beta 阶段仍需谨慎：行为可能在版本间调整，编排脚本是模型生成的，边界参数（并发线程、名册规模、预算）需要自己验证。想尝鲜，带上 managed-agents-2026-04-01 beta header 即可，SDK 会自动附加。

## 参考

- Claude Platform release notes（2026-10-09 动态工作流条目）
- Claude Managed Agents overview
- Multiagent orchestration 文档
- Introducing dynamic workflows（Claude Code 博客）
- New in Claude Managed Agents（博客）
- Claude Cookbook 动态工作流示例
