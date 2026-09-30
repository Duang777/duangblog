import type { LingoTerm } from "./types";

/** Personal AI 产品层词包。Harness 已在 dsh.ts，这里不重复定义。 */
export const PERSONAL_AI_LINGO: LingoTerm[] = [
  {
    id: "personal-ai",
    title: "Personal AI",
    subtitle: "个人 AI 助理",
    definition:
      "面向单个用户长期运行的助理，而不是一次一单的任务工具。它要记住这个人，在状态变化时主动做事，并且通常活在一台持续运行的机器上，而不是只活在一轮对话里。",
    aliases: ["Personal AI", "个人 AI 助理"],
  },
  {
    id: "cloud-computer",
    title: "Cloud Computer",
    subtitle: "云电脑",
    definition:
      "单独租给 Agent、可以持续开机的云端电脑。文件、浏览器和后台进程留在这台机器上，下一次不必从空对话重新交代背景。Muse 的 Secure VM、Manus 的 Cloud Computer、Dots 的独立云端电脑，都是这一层。",
    aliases: ["Cloud Computer", "云电脑", "Muse Secure VM", "Secure VM"],
  },
  {
    id: "proactive-agent",
    title: "Proactive",
    subtitle: "按用户状态主动行动",
    definition:
      "不等用户发来任务，而是根据这个人当前的状态决定要不要开口、要不要动手。组织单位是人现在处于什么状态，不是这一单做到哪了。",
    aliases: ["Proactive", "主动性"],
  },
  {
    id: "agent-digital-identity",
    title: "Agent Identity",
    subtitle: "Agent 的数字身份",
    definition:
      "Agent 拥有独立于用户的对外身份，例如自己的邮箱、电话、支付账户或企业凭据，并以此发消息、接电话或付款。这和借用用户账号去操作不是同一件事。",
    aliases: ["数字身份", "Agent 数字身份", "digital identity"],
  },
  {
    id: "agent-boundaries",
    title: "Boundaries",
    subtitle: "权限三档",
    definition:
      "OpenAI 给常驻 Agent 定的行为边界，分成 auto-allowed、ask-first、never-do 三档。敏感操作必须人批。默认可连接的应用走只读工具，不能擅自发消息或改用户的电脑。",
    aliases: ["Boundaries"],
  },
  {
    id: "personal-memory",
    title: "Memory",
    subtitle: "和个人有关的长期档案",
    definition:
      "从邮件、日历、文件里判断哪些信息重要、如何更新、何时影响行动，并收进可查看、可修改、可删除的结构化档案。它回答的是接下来还该记得什么。Context 只回答这一刻看见了什么。",
    aliases: ["长期记忆", "Memories"],
  },
];
