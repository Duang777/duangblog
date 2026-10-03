import type { LingoTerm } from "./types";

/** 多 harness RL 词包。Harness 已在其他词包，这里不重复定义。 */
export const MULTI_HARNESS_LINGO: LingoTerm[] = [
  {
    id: "agentic-rl",
    title: "Agentic RL",
    subtitle: "在多步工具使用上做强化学习",
    definition:
      "用强化学习训练模型去做多步工具调用，而不是只训练单轮补全。循环、工具和上下文由 harness 提供，模型在这个接口里面被更新。",
    aliases: ["agentic RL", "agentic reinforcement learning", "智能体强化学习"],
    source: {
      label: "Hugging Face, The ultimate guide to multi-harness RL",
      url: "https://huggingface.co/spaces/FineEnvs/multi-harness-rl",
    },
  },
  {
    id: "openenv",
    title: "OpenEnv",
    subtitle: "harness 和训练器共用的接口",
    definition:
      "RL 环境的标准接口。提供 Gymnasium 风格的 reset、step 和 state。在这篇工作里它不负责训练，也不定义奖励。捕获代理通过它记下模型调用。",
    aliases: ["OpenEnv"],
    source: {
      label: "huggingface/OpenEnv",
      url: "https://github.com/huggingface/OpenEnv",
    },
  },
  {
    id: "capture-proxy",
    title: "Capture proxy",
    subtitle: "记下模型真正生成的 token",
    definition:
      "坐在 harness 和模型服务之间的代理。harness 把它当成普通的模型地址来调用。代理记下 token id、生成时的对数概率和损失掩码，再把请求转出去。",
    aliases: ["捕获代理", "capture proxy", "Capture proxy"],
    source: {
      label: "huggingface/OpenEnv",
      url: "https://github.com/huggingface/OpenEnv",
    },
  },
];
