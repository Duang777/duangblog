import type { LingoTerm } from "./types";

/** DeepSeek Harness / Cordis / dsh 运行时词包。 */
export const DSH_LINGO: LingoTerm[] = [
  {
    id: "agent-harness",
    title: "Harness",
    subtitle: "智能体运行框架",
    definition:
      "模型之外的执行层：把模型接到文件系统、终端、网页和工具上，并组织上下文、工具调用与任务循环。DeepSeek 的口号是 Model + Harness = Agent；dsh 就是这一层的开源实现。",
    aliases: ["Harness", "harness", "agent harness", "智能体运行框架"],
  },
  {
    id: "dsh",
    title: "dsh",
    subtitle: "DeepSeek Harness CLI",
    definition:
      "DeepSeek Harness 的命令行名。MIT 开源的 agent 工作台，底层由 Cordis 驱动，模型、工具、会话、沙箱、UI 乃至 agent loop 都以插件形式可替换。",
    aliases: ["dsh", "DeepSeek Harness", "deepseek-harness"],
  },
  {
    id: "cordis",
    title: "Cordis",
    subtitle: "时空可组合插件框架",
    definition:
      "dsh 底层的元框架：服务认领稳定的 ctx 键，依赖用 inject 表达，通信走类型化事件，注册通过可逆副作用安装。没有需要打补丁的特权内核。",
    aliases: ["Cordis", "cordis", "时空可组合"],
  },
  {
    id: "cordis-ctx",
    title: "ctx",
    subtitle: "Cordis 共享上下文",
    definition:
      "插件向共享上下文贡献与消费能力的仓库。例如 ctx.tools、ctx.llm、ctx.sessions。插件彼此通过键查找服务，而不是硬编码 import 某个实现。",
    aliases: ["ctx", "ctx.tools", "ctx.llm", "ctx.sessions", "共享上下文"],
  },
  {
    id: "cordis-effect",
    title: "可逆副作用",
    subtitle: "ctx.effect / disposer",
    definition:
      "提示词片段、工具 schema、适配器、监听器都通过 ctx.effect() 或 ctx.on() 安装，并返回清理函数。插件卸载时注册内容可预期地自动撤销，这是一切皆插件能组合起来的前提。",
    aliases: ["可逆副作用", "ctx.effect", "disposer", "可逆注册"],
  },
  {
    id: "dsh-bundle",
    title: "bundle",
    subtitle: "Cordis 组合包",
    definition:
      "Cordis 配置项及其挂载代码的分发格式。profile 按顺序叠放 bundles，再用 patch 覆盖。dsh-base、dsh-web-app、dsh-headless 是三个核心 bundle。",
    aliases: ["bundle", "bundles", "组合包", "dsh-base", "dsh.bundle"],
  },
  {
    id: "dsh-profile",
    title: "profile",
    subtitle: "具名组装",
    definition:
      "存放在 Harness home 里的具名组装：列出叠放的 bundles、树外插件和用户的 cordis.patch.yml。发行版自带 web 与 headless 两套模板。",
    aliases: ["profile", "profiles", "--profile", "具名组装"],
  },
  {
    id: "waterfall-event",
    title: "waterfall",
    subtitle: "环绕式事件分发",
    definition:
      "Cordis 事件分发模式之一：监听器拿到 (...args, next)，调用 next() 把可能被包装的结果委托给下一个服务；直接 return 而不调 next() 即短路。适合审批等单一决策。",
    aliases: ["waterfall", "waterfall 事件", "环绕式中间件"],
  },
  {
    id: "model-visible-logged",
    title: "模型可见即已记录",
    subtitle: "model-visible is logged",
    definition:
      "dsh 会话日志的硬约束：抵达模型请求的一切，都必须能从 append-only 日志重建，并由运行时不变量断言。新增模型可见输入，就要新增对应的会话事件。",
    aliases: [
      "模型可见即已记录",
      "model-visible is logged",
      "model-visible",
    ],
  },
  {
    id: "capability-seam",
    title: "seam",
    subtitle: "能力接缝",
    definition:
      "一项可替换能力的三角：声明接口的 Service Definition、实现它的 Provider、使用它的 Consumer。换一个 provider（例如把文件系统指到远程沙箱），相关工具会一并搬家。",
    aliases: ["seam", "能力接缝", "capability seam"],
  },
  {
    id: "agent-preset",
    title: "agent preset",
    subtitle: "运行模式预设",
    definition:
      "决定会话挂哪些工具、用什么人格的插件组合。dsh 内置 standard / code / minimal / creator；模式不是开关，而是装载哪些 bundle 的预设。",
    aliases: [
      "agent preset",
      "agent-presets",
      "运行模式",
      "standard 模式",
      "minimal 模式",
      "PTC 模式",
    ],
  },
  {
    id: "llm-pi-ai",
    title: "llm-pi-ai",
    subtitle: "基于 pi-ai 的模型插件",
    definition:
      "dsh 官方插件：基于 Pi 的 pi-ai 做通用多协议模型提供方，默认休眠、零路由，需要时在 settings 里激活。负责抹平各家 API；dsh 本身负责在其上跑完整运行时。",
    aliases: ["llm-pi-ai", "llm pi-ai"],
  },
];
