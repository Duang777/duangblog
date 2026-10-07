import type { LingoTerm } from "./types";

/** pstack 词包。只收会反复出现的入口词，不把 24 条原则拆成词条。 */
export const PSTACK_LINGO: LingoTerm[] = [
  {
    id: "playbook",
    title: "Playbook",
    subtitle: "按失败场景写好的步骤",
    definition:
      "一套写好的固定步骤，对着一类具体失败，不按抽象任务类型来切。入口从里面挑一条，把步骤抄进待办，再按步骤调用别的 skill。",
    aliases: ["playbooks", "playbook", "Playbook"],
    source: {
      label: "pstack",
      url: "https://github.com/cursor/plugins/tree/main/pstack",
    },
  },
  {
    id: "poteto-mode",
    title: "poteto-mode",
    subtitle: "只接收目标的入口",
    definition:
      "pstack 的入口 skill。你只说目标，它从 playbook 里挑最匹配的一条，再按步骤调用别的 skill。跳过的步骤留在清单上，并写明理由。",
    aliases: ["/poteto-mode", "poteto-mode"],
    source: {
      label: "pstack",
      url: "https://github.com/cursor/plugins/tree/main/pstack",
    },
  },
];
