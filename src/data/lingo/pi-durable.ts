import type { LingoTerm } from "./types";

/** Pi Durable 词包。Harness、Checkpoint、Compaction、Handoff 已在其他词包，这里不重复定义。 */
export const PI_DURABLE_LINGO: LingoTerm[] = [
  {
    id: "pi-durable",
    title: "Pi Durable",
    subtitle: "持久化 harness 框架",
    definition:
      "Earendil 在 2026-10-01 与 Pi 1.0 同日公开的实验包。它不替代 Pi 编码 agent，而是用来构建 harness：Harness.open(storage) 打开持久化会话，对话、任务和文档落到存储里。",
    aliases: ["Pi Durable", "pi-durable"],
    source: {
      label: "Earendil, Pi Durable",
      url: "https://earendil.com/posts/pi-durable/",
    },
  },
  {
    id: "durable-execution",
    title: "Durable execution",
    subtitle: "进程死了还能按日志接着跑",
    definition:
      "把工作流的每一步记进事件日志。Worker 挂了就换一台机器重放，已经完成的步骤不重复做。Temporal 把模型调用和工具调用放在 Activity 里，用这套契约恢复。",
    aliases: ["durable execution", "Durable Execution", "Durable execution"],
    source: {
      label: "Temporal, Durable, Flexible Multi-Agent Systems",
      url: "https://temporal.io/blog/durable-flexible-multi-agent-systems",
    },
  },
];
