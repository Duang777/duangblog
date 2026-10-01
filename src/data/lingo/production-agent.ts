import type { LingoTerm } from "./types";

/** 生产级 Agent 手册词包。幂等、Session、HITL、Tracing 已在其他词包，这里不重复定义。 */
export const PRODUCTION_AGENT_LINGO: LingoTerm[] = [
  {
    id: "prompt-injection",
    title: "Prompt Injection",
    subtitle: "提示注入",
    definition:
      "用户或外部内容把指令混进模型输入，试图改掉系统已经定下的规则。授权、副作用和数据范围不能靠提示词挡住，要在服务端再查一次。",
    aliases: ["提示注入", "Prompt Injection", "prompt injection"],
    source: {
      label: "OWASP LLM01",
      url: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/",
    },
  },
  {
    id: "agent-control-loop",
    title: "Control loop",
    subtitle: "应用代码里的停止条件",
    definition:
      "决定模型还能不能再调一次工具的循环，写在应用代码里。到了 deadline、步数或 token 预算就结束，不等模型自己说停。",
    aliases: ["control loop", "Control loop"],
    source: {
      label: "Anthropic, Building effective agents",
      url: "https://www.anthropic.com/engineering/building-effective-agents",
    },
  },
];
