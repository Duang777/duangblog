import type { LingoTerm } from "./types";

/** Harness engineering 词包。裸词 Harness 已在其他词包，这里不重复定义。 */
export const HARNESS_ESSAY_LINGO: LingoTerm[] = [
  {
    id: "harness-engineering",
    title: "Harness engineering",
    subtitle: "把模型包成能干活的运行时",
    definition:
      "设计 loop、工具、上下文、安全和扩展面，让模型把一次回答变成一件做完的工作。2026 年 7 月的源码解剖把它收成一句：Agent 等于模型加 harness。",
    aliases: ["Harness engineering", "harness engineering", "Harness Engineering"],
    source: {
      label: "Barbaste et al., arXiv:2609.00006",
      url: "https://arxiv.org/abs/2609.00006",
    },
  },
];
