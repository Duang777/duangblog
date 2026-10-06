import type { LingoTerm } from "./types";

/** Code Mode 词包。MCP 已在其他词包，这里不重复定义。 */
export const CODE_MODE_LINGO: LingoTerm[] = [
  {
    id: "code-mode",
    title: "Code Mode",
    subtitle: "写代码去调工具，而不是逐个点工具",
    definition:
      "把 MCP 工具转成带类型的 API，让模型写一段代码在沙箱里调用。循环和过滤留在沙箱，上下文里只留下最终结果。",
    aliases: ["Code Mode", "code mode", "Codemode", "codemode"],
    source: {
      label: "Cloudflare, Code Mode",
      url: "https://blog.cloudflare.com/code-mode/",
    },
  },
];
