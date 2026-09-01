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
    aliases: ["站点适配器", "OpenCLI adapter", "TypeScript adapter", "Adapter（适配器）", "Adapter"],
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
    aliases: ["INTERCEPT", "Strategy.INTERCEPT", "Intercept"],
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
    aliases: ["Tab lease", "标签页租约", "tab lease", "Tab lease（标签页租约）"],
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
    id: "cli",
    title: "CLI",
    subtitle: "Command-Line Interface",
    definition:
      "命令行界面。通过文字命令调用程序，容易脚本化、管道组合，也能被 Agent 当工具调用。",
    aliases: [
      "CLI（Command-Line Interface",
      "Command-Line Interface",
      "命令行界面",
    ],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Command-line_interface",
    },
  },
  {
    id: "runtime",
    title: "Runtime",
    subtitle: "运行时",
    definition:
      "真正负责加载、执行命令，并连接浏览器或系统的程序环境。OpenCLI 里包括 CLI 进程、本机 daemon、Browser Bridge 和可选的 CDP 连接。",
    aliases: ["Runtime"],
  },
  {
    id: "opencli-daemon",
    title: "Daemon",
    subtitle: "守护进程",
    definition:
      "后台持续运行、接收 CLI 请求、管理连接和会话生命周期的本地进程。OpenCLI 默认监听 localhost:19825，再经 Browser Bridge 接到已登录 Chrome。",
    aliases: ["Daemon（守护进程）", "本地 daemon"],
  },
  {
    id: "websocket",
    title: "WebSocket",
    subtitle: "双向长连接",
    definition:
      "支持双向长连接的通信协议。OpenCLI 用它在 CLI / daemon 与浏览器扩展之间持续交换动作、页面状态和错误。",
    aliases: ["WebSocket"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/WebSocket",
    },
  },
  {
    id: "http-cookie",
    title: "Cookie",
    subtitle: "浏览器会话数据",
    definition:
      "浏览器保存的小段会话数据，常用来表示登录状态或偏好。OpenCLI 复用当前浏览器已经拥有的 Cookie，而不是把密码抄进脚本。",
    aliases: ["Cookie"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/HTTP_cookie",
    },
  },
  {
    id: "csrf",
    title: "CSRF",
    subtitle: "跨站请求伪造防护",
    definition:
      "网站用来确认请求来自可信页面或会话的机制。带登录态访问接口时，适配器常常要带着 Cookie 和 CSRF 信息一起发。",
    aliases: ["CSRF", "跨站请求伪造"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Cross-site_request_forgery",
    },
  },
  {
    id: "spa",
    title: "SPA",
    subtitle: "Single-Page Application",
    definition:
      "单页应用。页面不完全刷新，前端通过路由和 API 更新内容。元素索引和 ref 可能在路由变化后失效，动作前要重新 state。",
    aliases: ["SPA", "Single-Page Application", "单页应用"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Single-page_application",
    },
  },
  {
    id: "ssr",
    title: "SSR",
    subtitle: "Server-Side Rendering",
    definition:
      "服务端渲染：服务器先生成 HTML，再由浏览器接管。很多站点会把初始数据放进页面，供前端 hydration。",
    aliases: ["SSR", "Server-Side Rendering", "服务端渲染"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Server-side_rendering",
    },
  },
  {
    id: "dom",
    title: "DOM",
    subtitle: "Document Object Model",
    definition:
      "浏览器把 HTML 页面表示成可查询、可交互的树结构。选择器、快照和 UI 操作都落在这棵树上。",
    aliases: ["DOM", "Document Object Model"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Document_Object_Model",
    },
  },
  {
    id: "dom-snapshot",
    title: "DOM snapshot",
    subtitle: "DOM 快照",
    definition:
      "某一时刻对页面结构和可交互元素的结构化观察。数字 ref 只对当次快照有效，页面变化后不能盲用。",
    aliases: ["DOM snapshot", "DOM 快照"],
  },
  {
    id: "css-selector",
    title: "CSS selector",
    subtitle: "CSS 选择器",
    definition:
      "用标签、属性或层级表达要操作的页面元素。OpenCLI 的 browser skill 允许数字 ref 或 CSS selector，但更稳妥的是先 state / find 再点刚刚拿到的 ref。",
    aliases: ["CSS selector", "CSS 选择器"],
  },
  {
    id: "element-ref",
    title: "Ref",
    subtitle: "页面元素短引用",
    definition:
      "页面快照给元素分配的短引用。页面变化后可能失效，不能跨快照盲用。",
    aliases: ["数字 ref"],
  },
  {
    id: "target-id",
    title: "Target ID",
    subtitle: "标签页标识",
    definition:
      "浏览器调试层识别某一个标签页的 ID。多 tab 时可以把命令精确路由到指定页面。",
    aliases: ["Target ID", "target ID", "Tab target"],
  },
  {
    id: "browser-session",
    title: "Session",
    subtitle: "浏览器会话",
    definition:
      "一组可连续复用的浏览器操作上下文。同一个 session 名称用来复用状态；一次性任务用 ephemeral，多步交互用 persistent。",
    aliases: ["Session（会话）", "Ephemeral session", "Persistent session"],
  },
  {
    id: "same-origin",
    title: "Same-origin",
    subtitle: "同源",
    definition:
      "协议、域名和端口都相同，浏览器据此限制页面间访问权限。PAGE_FETCH 能工作，正是因为它在页面同源上下文里发起请求。",
    aliases: ["Same-origin", "同源"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Same-origin_policy",
    },
  },
  {
    id: "pipeline",
    title: "Pipeline",
    subtitle: "管道",
    definition:
      "把请求、浏览器动作、转换、拦截和下载拆成可组合步骤。每个节点不一定是文本，也可能是 JSON、页面状态、网络响应或文件对象。",
    aliases: ["Pipeline（管道）"],
  },
  {
    id: "deterministic",
    title: "Deterministic",
    subtitle: "确定性",
    definition:
      "相同输入在相同环境下，尽量得到相同的命令路径、输出形状和错误分类。OpenCLI 的理想是发现阶段允许探索，运行阶段执行已验证的 adapter。",
    aliases: ["Deterministic（确定性）", "Deterministic"],
  },
  {
    id: "agent-native",
    title: "Agent-native",
    subtitle: "面向 Agent 设计",
    definition:
      "强调机器可发现、结构化输入输出、明确错误和副作用。例如 opencli list -f json、结构化错误码，以及 browser 动作返回的 matches_n / match_level。",
    aliases: ["Agent-native"],
  },
  {
    id: "manifest",
    title: "Manifest",
    subtitle: "清单",
    definition:
      "用文件描述 adapter、插件或命令的名称、版本和能力，供发现和安装使用。",
    aliases: ["Manifest"],
  },
  {
    id: "jsonp",
    title: "JSONP",
    subtitle: "跨域数据模式",
    definition:
      "一种较旧的跨域数据模式：服务返回 JavaScript 调用而不是纯 JSON。站点侦察时要能认出来，避免按普通 JSON 去解析。",
    aliases: ["JSONP"],
    source: {
      label: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/JSONP",
    },
  },
  {
    id: "streaming",
    title: "Streaming",
    subtitle: "流式传输",
    definition:
      "响应不是一次性完成，而是持续发送数据片段或事件。如果站点只有实时推送、没有可用的 HTTP 读取路径，常规 adapter 方式可能不合适。",
    aliases: ["Streaming"],
  },
  {
    id: "declarative",
    title: "Declarative",
    subtitle: "声明式",
    definition:
      "描述想要的步骤和结果，不详细规定每一步如何实现。OpenCLI 的 YAML pipeline 走这条路。",
    aliases: ["Declarative", "声明式"],
  },
  {
    id: "imperative",
    title: "Imperative",
    subtitle: "命令式",
    definition:
      "按程序顺序明确写出每个动作、条件和分支。复杂站点更适合 TypeScript adapter。",
    aliases: ["Imperative", "命令式", "命令式 TypeScript", "命令式适配器"],
  },
  {
    id: "structured-envelope",
    title: "Structured envelope",
    subtitle: "结构化信封",
    definition:
      "结果中同时包含值、匹配数、置信级别或错误代码等机器字段，方便 Agent 按 code 分支而不是解析自然语言报错。",
    aliases: ["Structured envelope", "结构化信封"],
  },
  {
    id: "replay",
    title: "Replay",
    subtitle: "重放",
    definition:
      "用相同或替换参数再次执行已观察到的请求或流程，用来验证路径是否可靠。写 adapter 前应记录多个输入下的 replay 结果。",
    aliases: ["Replay", "replay"],
  },
  {
    id: "tty",
    title: "TTY",
    subtitle: "终端设备",
    definition:
      "程序可据此区分交互式输出和被管道接收的机器输出。所以同样一条命令，人读可以是 table，Agent 读应显式指定 json。",
    aliases: ["TTY"],
  },
  {
    id: "passthrough",
    title: "Passthrough",
    subtitle: "透传",
    definition:
      "不重写外部 CLI 的参数、标准输入输出和退出码，只统一入口。opencli external register 就是这一层。",
    aliases: ["Passthrough", "透传"],
  },
  {
    id: "supply-chain-risk",
    title: "Supply-chain risk",
    subtitle: "供应链风险",
    definition:
      "第三方插件、依赖或安装脚本可能夹带恶意代码或脆弱依赖。插件本质上是在本机被发现、加载并执行的 JS/TS，应像安装依赖一样审查来源和版本。",
    aliases: ["Supply-chain risk", "供应链风险"],
  },
  {
    id: "api-endpoint",
    title: "API endpoint",
    subtitle: "接口端点",
    definition:
      "服务接收请求的 URL、方法和参数组合。adapter 侦察时要记录观察到的 endpoint，以及它是公开契约还是站内未文档化接口。",
    aliases: ["API endpoint"],
  },
  {
    id: "playwright",
    title: "Playwright",
    subtitle: "浏览器自动化库",
    definition:
      "底层浏览器自动化库，适合测试和复杂流程。它是库；OpenCLI 在命令注册、adapter 生态、输出契约和 Agent 发现面上再包一层。",
    aliases: ["Playwright"],
  },
  {
    id: "puppeteer",
    title: "Puppeteer",
    subtitle: "Chrome 自动化库",
    definition:
      "用 CDP 驱动 Chrome 的自动化库。和 Playwright 一样是自动化层，不是带发现面的命令生态。",
    aliases: ["Puppeteer"],
  },
  {
    id: "scrapy",
    title: "Scrapy",
    subtitle: "爬虫框架",
    definition:
      "面向大规模抓取、并发和爬虫工程。目标与 OpenCLI 不同：OpenCLI 更偏登录态产品操作、命令组合和桌面应用控制。",
    aliases: ["Scrapy", "Crawl4AI"],
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
    aliases: ["YAML pipeline", "声明式管道", "声明式 pipeline", "YAML pipeline（声明式管道）"],
  },
];
