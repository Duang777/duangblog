import type { LingoTerm } from "./types";

export const AGENT_LINGO: LingoTerm[] = [
  {
    id: "rlm",
    title: "RLM",
    subtitle: "Recursive Language Model",
    definition: "递归语言模型。一种 Agent 设计范式：让 LLM 使用持久 Python REPL 管理输入数据，并从该 REPL 内部调用独立的子 LLM。不做摘要压缩，而是通过递归委托和程序化处理控制上下文增长。",
    aliases: ["RLM", "递归语言模型", "Recursive Language Model"],
  },
  {
    id: "context-rot",
    title: "Context Rot",
    subtitle: "上下文腐烂",
    definition: "随着 LLM 上下文窗口变长，模型在长上下文中的推理能力、召回能力会下降的现象。不是信息真的丢了，而是模型在长序列中定位和利用信息的效率变差，表现为结果变随机、引用错位、忘记前面的指令。",
    aliases: ["context rot", "上下文腐烂", "上下文衰减"],
  },
  {
    id: "continual-harness",
    title: "Continual Harness",
    subtitle: "持续框架",
    definition: "Prime Agent 中让 Agent 跨会话积累经验的机制。把补充提示、记忆、技能描述和可复用子 Agent 规范存为持久状态，通过 /refine 基于实际工作轨迹做小型、有证据支持的更新。基础系统提示固定不变，只修改补充层。",
    aliases: ["持续框架", "Continual Harness", "/refine"],
  },
  {
    id: "host-bridge",
    title: "Host Bridge",
    subtitle: "主机桥接边界",
    definition: "Prime Agent 中 Python 内核与 TypeScript 主机之间的信任边界。凭证、Provider 执行、记录写入、调度等敏感操作留在 TypeScript 侧，Python 只能通过类型化的主机请求获取这些能力，TypeScript 验证每个请求并拥有最终状态转换权。",
    aliases: ["Host Bridge", "主机桥接", "host bridge"],
  },
  {
    id: "answer-variable",
    title: "答案变量机制",
    subtitle: "Prompt-as-a-Variable",
    definition: "RLM 的设计之一。每次 rollout 初始化 answer = { content, ready } 字典，LLM 可以跨多轮修改 content，编辑草稿，反复迭代，直到将 ready 标记为 True 才提取最终答案。允许通过扩散方式逐步生成，而非一次性给出。",
    aliases: ["答案变量", "answer variable", "prompt as a variable"],
  },
  {
    id: "agent-skills-standard",
    title: "Agent Skills 标准",
    subtitle: "agentskills.io",
    definition: "一种跨 Agent 框架共享技能的标准。技能包使用 SKILL.md 声明名称、描述和指令，Python 支持的技能还包含 pyproject.toml 和 src 包。Prime Agent、Claude Code、OpenAI Codex 等可通过标准目录发现和加载这些技能。",
    aliases: ["Agent Skills 标准", "agentskills", "skills 标准"],
  },
  {
    id: "daemon-session",
    title: "Daemon 会话",
    subtitle: "后台常驻会话",
    definition: "Prime Agent 由 daemon 进程支持的会话模式。客户端终端关闭只是与 daemon 分离，Worker 进程及其 IPython 内核、调度作业、子 Agent 后代继续后台运行。稍后可通过 attach 重新连接。",
    aliases: ["Daemon 会话", "后台会话", "常驻会话", "daemon session"],
  },
];
