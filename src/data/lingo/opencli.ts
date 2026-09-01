import type { LingoTerm } from "./types";

/** OpenCLI 运行时 / 适配器 / 浏览器桥接域词包。 */
export const OPENCLI_LINGO: LingoTerm[] = [
  {
    id: "opencli",
    title: "OpenCLI",
    subtitle: "@jackwener/opencli",
    definition:
      "一个 AI 原生的 CLI 运行时和适配器平台。把网站能力、已登录 Chrome 的浏览器动作、以及本地 CLI / Electron / 插件，收成同一棵可发现、可编排、可输出结构化结果的命令树。不等于大模型，也不等于通用爬虫。",
    aliases: ["OpenCLI", "@jackwener/opencli", "jackwener/OpenCLI"],
  },
  {
    id: "opencli-spec",
    title: "OpenCLI Specification",
    subtitle: "OCS",
    definition:
      "定义 CLI 应如何被机器理解和调用的规范。与 GitHub 上的 jackwener/OpenCLI 是不同项目，只是名字相近。",
    aliases: [
      "OpenCLI Specification",
      "OCS",
      "OpenCLI Specification（OCS）",
    ],
  },
  {
    id: "browser-bridge",
    title: "Browser Bridge",
    subtitle: "浏览器桥接扩展",
    definition:
      "装在 Chrome/Chromium 里的轻量扩展，加上本机 daemon，把 CLI 动作交给已登录页面执行。登录态继续留在浏览器里，命令负责发动作、收回结果。",
    aliases: ["Browser Bridge", "浏览器桥接扩展", "OpenCLI Browser Bridge"],
  },
  {
    id: "opencli-adapter",
    title: "Adapter",
    subtitle: "站点适配器",
    definition:
      "把某个站点或应用的具体协议，转成 OpenCLI 统一命令契约的代码或配置。调用者只表达搜索、读取、下载等意图，不必知道站点内部 API、Cookie 名称或 DOM 结构。",
    aliases: ["站点适配器", "OpenCLI adapter", "TypeScript adapter"],
  },
  {
    id: "command-registry",
    title: "Command Registry",
    subtitle: "统一命令注册表",
    definition:
      "启动时合并内置 adapter、用户 adapter、插件和外部 CLI 后得到的命令目录。每条命令带 site、参数、access、strategy、columns 等元数据，让 Agent 不用读源码也能发现怎么调用。",
    aliases: ["Command Registry", "统一注册表", "命令注册表"],
  },
  {
    id: "public-api-strategy",
    title: "PUBLIC_API",
    subtitle: "公开接口策略",
    definition:
      "不需要登录，Node 侧直接请求公开 API。快、简单、适合 CI，但只能拿到公开能力。官方 adapter-author 流程建议优先选它。",
    aliases: ["PUBLIC_API", "Strategy.PUBLIC"],
  },
  {
    id: "cookie-api-strategy",
    title: "COOKIE_API",
    subtitle: "带登录态的接口策略",
    definition:
      "带着浏览器 Cookie / CSRF 等信息去打接口。结构化、速度快、复用登录态；会话过期和认证细节需要维护。",
    aliases: ["COOKIE_API", "Strategy.COOKIE"],
  },
  {
    id: "page-fetch-strategy",
    title: "PAGE_FETCH",
    subtitle: "页面同源 fetch",
    definition:
      "在页面同源上下文里发起 fetch，借用页面运行时和同源权限。内部 API 通常没有外部契约，站点改版后容易坏，维护成本高。",
    aliases: ["PAGE_FETCH"],
  },
  {
    id: "intercept-strategy",
    title: "INTERCEPT",
    subtitle: "拦截网络响应",
    definition:
      "触发页面自然动作并拦截目标请求或响应。能处理复杂签名，但归因、分页、响应匹配和回归成本都高。",
    aliases: ["INTERCEPT", "Strategy.INTERCEPT"],
  },
  {
    id: "dom-state-strategy",
    title: "DOM_STATE",
    subtitle: "页面状态读取",
    definition:
      "读取 SSR HTML、hydration / bootstrap JSON 或页面状态。不一定依赖私有接口，但字段和结构仍可能随页面改版变化。",
    aliases: ["DOM_STATE"],
  },
  {
    id: "ui-selector-strategy",
    title: "UI_SELECTOR",
    subtitle: "可见 UI 操作",
    definition:
      "通过可见 UI、DOM 或无障碍语义执行操作。对写操作和用户可见流程自然，但要处理弹窗、页面状态和选择器漂移。",
    aliases: ["UI_SELECTOR", "Strategy.UI"],
  },
  {
    id: "tab-lease",
    title: "Tab lease",
    subtitle: "标签页租约",
    definition:
      "运行时暂时占用某个 tab 的所有权，把命令路由到指定标签。命令结束或显式 close 后释放，避免并行任务抢同一个页面。",
    aliases: ["Tab lease", "标签页租约", "tab lease"],
  },
  {
    id: "cdp",
    title: "CDP",
    subtitle: "Chrome DevTools Protocol",
    definition:
      "Chrome、Chromium 和 Electron 暴露的调试接口，支持导航、执行 JavaScript、读 DOM、看网络和控制页面。谁能访问 CDP 端点，谁就可能控制该浏览器里的页面和会话。",
    aliases: ["CDP", "Chrome DevTools Protocol", "Chrome DevTools 调试协议"],
    source: {
      label: "Chrome DevTools Protocol",
      url: "https://chromedevtools.github.io/devtools-protocol/",
    },
  },
  {
    id: "hydration",
    title: "Hydration",
    subtitle: "注水",
    definition:
      "SSR 页面把服务器初始数据交给前端 JavaScript 接管的过程。很多 SPA 会把初始数据放在脚本或全局状态里，有时比抓最终 DOM 更稳，但字段格式仍不是公开契约。",
    aliases: ["Hydration", "hydration", "注水"],
  },
  {
    id: "adapter-fixture",
    title: "Fixture",
    subtitle: "测试夹具",
    definition:
      "保存一份可重复使用的输入与期望输出，用来验证字段、列、类型和行数，不必每次都依赖实时页面。通过只说明输出形状匹配，不自动证明字段语义没有错位。",
    aliases: ["Fixture", "fixture", "测试夹具"],
  },
  {
    id: "opencli-doctor",
    title: "opencli doctor",
    subtitle: "环境诊断",
    definition:
      "检查 daemon、扩展、浏览器连通性和本机环境。doctor 通过前，不要把站点返回空数据直接归因于 adapter。",
    aliases: ["opencli doctor"],
  },
  {
    id: "sysexits",
    title: "sysexits.h",
    subtitle: "Unix 退出码风格",
    definition:
      "OpenCLI 退出码跟 Unix sysexits.h 一类约定走：0 成功，2 用法错误，66 空结果，69 服务不可用，75 临时失败，77 需要认证，78 配置错误，130 被中断。脚本应按码分支，而不是只看输出是不是空字符串。",
    aliases: ["sysexits.h", "退出码"],
  },
  {
    id: "yaml-pipeline",
    title: "YAML pipeline",
    subtitle: "声明式管道",
    definition:
      "用 YAML 描述 fetch、download、browser、intercept、tap、transform 等步骤。适合简单的数据抓取和字段映射；复杂站点更适合 TypeScript adapter。",
    aliases: ["YAML pipeline", "声明式管道", "声明式 pipeline"],
  },
];
