import type { LingoTerm } from "./types";

/**
 * Agent 系统架构设计 · 上下文工程域词包。
 * Context Rot 已在 agent.ts；本包只收本柱会反复出现的词。
 */
export const AGENT_ARCH_LINGO: LingoTerm[] = [
  {
    id: "context-engineering",
    title: "Context Engineering",
    subtitle: "上下文工程",
    definition:
      "在每次推理时，从不断变化的信息宇宙里策展并维护「最优 token 集合」的一套策略：选什么进窗口、按什么顺序放、用什么结构切开、怎么压缩、哪一段可缓存。\n\n它管的是模型实际看见的全部 token，不只是你事先写好的那段 prompt。",
    aliases: [
      "Context Engineering",
      "context engineering",
      "上下文工程",
    ],
  },
  {
    id: "prompt-engineering",
    title: "Prompt Engineering",
    subtitle: "提示工程",
    definition:
      "为获得更好结果而编写和组织模型指令的方法，焦点通常是 system prompt 怎么写。它是一次写好的「怎么说」；多轮 Agent 里还要叠上下文工程，管每一步「该提供什么」。",
    aliases: [
      "Prompt Engineering",
      "prompt engineering",
      "提示工程",
    ],
    source: {
      label: "Wikipedia: Prompt engineering",
      url: "https://en.wikipedia.org/wiki/Prompt_engineering",
    },
  },
  {
    id: "attention-budget",
    title: "Attention Budget",
    subtitle: "注意力预算",
    definition:
      "把上下文窗口当成有限工作记忆：每多塞一个 token，就消耗一部分注意力。窗口不是仓库，目标不是塞满，而是把最该被注意的 token 放在最该被注意的位置。",
    aliases: ["attention budget", "Attention Budget", "注意力预算"],
  },
  {
    id: "lost-in-the-middle",
    title: "Lost in the Middle",
    subtitle: "中途丢失",
    definition:
      "长上下文里，模型对开头和结尾的信息权重更高，对中间段召回更差。工程上意味着：关键指令和工具 schema 放前，当前问题和最相关检索放后，支撑材料不要堵在正中间。",
    aliases: [
      "Lost in the Middle",
      "lost in the middle",
      "中途丢失",
    ],
    source: {
      label: "arXiv: Lost in the Middle",
      url: "https://arxiv.org/abs/2307.03172",
    },
  },
  {
    id: "kv-cache-hit-rate",
    title: "KV-cache hit rate",
    subtitle: "KV 缓存命中率",
    definition:
      "相同前缀能否复用已算过的注意力键值。Agent 输入远长于输出，前缀一变（时间戳、乱序 JSON、中途改工具定义），后面整段缓存作废。生产里它同时打延迟和成本，常被当成最该盯的单一指标。",
    aliases: [
      "KV-cache",
      "KV-cache 命中率",
      "KV-cache hit rate",
      "KV cache hit rate",
    ],
  },
  {
    id: "compaction",
    title: "Compaction",
    subtitle: "上下文压缩",
    definition:
      "对话接近窗口上限时，让模型生成高保真摘要，用「摘要 + 最近若干轮」重启窗口。最安全的轻量形式是清理深处的工具原始结果，只留指针和要点。",
    aliases: ["Compaction", "compaction", "上下文压缩"],
  },
  {
    id: "agentic-memory",
    title: "Agentic Memory",
    subtitle: "结构化笔记",
    definition:
      "把计划、进度、关键事实写到上下文之外的文件里，需要时再拉回窗口。压缩因此可恢复：URL 和路径还在，正文就可以从窗口里拿掉。适合跨会话、有里程碑的长任务。",
    aliases: [
      "Agentic Memory",
      "agentic memory",
      "结构化笔记",
      "Structured Note-taking",
    ],
  },
  {
    id: "mask-dont-remove",
    title: "Mask, Don't Remove",
    subtitle: "遮蔽，而非移除",
    definition:
      "不要在循环中途动态增删工具定义。工具 schema 通常在前缀里，一改就打穿 KV 缓存；旧动作还引用已消失的工具时，模型也容易幻觉。正确做法是遮住 logits / 用 response prefill 收窄动作空间。",
    aliases: [
      "Mask, Don't Remove",
      "Mask Don't Remove",
      "遮蔽，而非移除",
      "遮蔽而非移除",
    ],
  },
];
