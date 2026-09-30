import type { LingoTerm } from "./types";

/** OpenAI Agents SDK 面试拆解用到、站点词库里还没有的原语。 */
export const AGENTS_SDK_LINGO: LingoTerm[] = [
  {
    id: "sdk-handoff",
    title: "Handoff",
    subtitle: "把控制权交给另一个 Agent",
    definition:
      "当前 Agent 不再继续回答，而是把这一轮的控制权交给另一个 Agent。Runner 换掉当前 agent、指令和上下文，中间没有一个中央调度器。每多一次移交，就多一轮模型调用。",
    aliases: ["Handoffs", "Handoff", "handoffs", "handoff"],
    source: {
      label: "OpenAI Agents SDK: Agents",
      url: "https://openai.github.io/openai-agents-python/agents/",
    },
  },
  {
    id: "sdk-guardrail",
    title: "Guardrail",
    subtitle: "和主回复并行的校验",
    definition:
      "跟模型回复同时跑的输入或输出检查。检查失败就停下，并返回一句兜底话，不把没通过的内容交给下一个 Agent 或用户。",
    aliases: ["Guardrails", "Guardrail", "guardrails", "guardrail"],
    source: {
      label: "OpenAI Agents SDK: Agents",
      url: "https://openai.github.io/openai-agents-python/agents/",
    },
  },
];
