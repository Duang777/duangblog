import type { LingoTerm } from "./types";

/** Claude Code mods 词包。MCP、Harness、Skills 标准已在其他词包，这里不重复定义。 */
export const CLAUDE_MODS_LINGO: LingoTerm[] = [
  {
    id: "claude-code-mod",
    title: "Claude Code mods",
    subtitle: "进程内的事件处理器",
    definition:
      "插件里的 JavaScript 或 TypeScript 函数，跑在 Claude Code 进程里面。每次动作发出事件，函数可以观察、改写，或自己返回结果。",
    aliases: ["Claude Code mods", "Claude Code Mods", "mods"],
    source: {
      label: "Anthropic, Customize Claude Code with mods",
      url: "https://claude.com/blog/claude-code-mods",
    },
  },
  {
    id: "settings-hooks",
    title: "Settings hooks",
    subtitle: "进程外的配置钩子",
    definition:
      "写在 settings 文件里的钩子。用 shell 命令、HTTP 请求或提示来跑，人在 Claude Code 进程外面。可以放行、拒绝、记日志。不能改写事件，也不能画界面。",
    aliases: ["settings hooks", "Settings hooks"],
    source: {
      label: "Claude Code, Mods overview",
      url: "https://code.claude.com/docs/en/plugins/mods/overview",
    },
  },
  {
    id: "sec-default",
    title: "sec-default",
    subtitle: "最先加载的安全 mod",
    definition:
      "Claude Code 内置的安全 mod。在 Team、Enterprise，以及打开了托管设置的机器上最先加载，用来拦住用户安装的 mods 改掉权限 deny 规则。",
    aliases: ["sec-default", "cc-plugin-sec-default"],
    source: {
      label: "Claude Code, Mods overview",
      url: "https://code.claude.com/docs/en/plugins/mods/overview",
    },
  },
];
