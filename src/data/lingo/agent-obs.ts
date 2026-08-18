import type { LingoTerm } from "./types";

/**
 * Agent 可观测 / Trace 域词包。
 * 配 agent-trace-observability 等文；与 agent.ts（RLM / Prime 等）分开，避免一锅粥。
 */
export const AGENT_OBS_LINGO: LingoTerm[] = [
  {
    id: "observability",
    title: "Observability",
    subtitle: "可观测性",
    definition:
      "从系统对外留下的输出（指标、日志、链路）推断内部状态的能力。和监控不同：监控假设你事先知道要盯哪些数；可观测性要能回答你事先没想到的失败路径。\n\n对 Agent 尤其关键，因为下一步走哪条分支常由模型运行时决定，无法提前画死告警点。",
    aliases: ["Observability", "observability", "可观测性"],
    source: {
      label: "Wikipedia: Observability",
      url: "https://en.wikipedia.org/wiki/Observability",
    },
  },
  {
    id: "monitoring",
    title: "Monitoring",
    subtitle: "监控",
    definition:
      "针对已知信号的持续监视：你先定义指标和阈值，超标就告警。它回答“整体还健康吗”，不擅长解释“这一次为什么以奇怪方式失败”。",
    aliases: ["Monitoring", "monitoring", "监控"],
    source: {
      label: "Wikipedia: Network monitoring",
      url: "https://en.wikipedia.org/wiki/Network_monitoring",
    },
  },
  {
    id: "metrics",
    title: "Metrics",
    subtitle: "指标",
    definition:
      "可聚合、可加的数值信号，例如错误率、P99、过去五分钟平均 token 数。适合看趋势和整体健康，单次请求的因果链条通常看不清。",
    aliases: ["Metrics", "metrics", "指标"],
  },
  {
    id: "logs",
    title: "Logs",
    subtitle: "日志",
    definition:
      "离散事件记录，一行一个事实。能回答某个时刻发生了什么，但默认彼此无结构关联；海量日志里要把一次请求拼完整，还得靠共同的 trace 标识。",
    aliases: ["Logs", "logs", "日志"],
  },
  {
    id: "distributed-trace",
    title: "Trace",
    subtitle: "分布式追踪 / 链路",
    definition:
      "一次请求穿过多个环节时留下的完整因果树。整棵树共享同一个 trace_id，树上每个节点是一个 span，靠父子关系嵌套。\n\n它回答这一次从头到尾经历了什么、卡在哪、谁调了谁。LLM Agent 的可观测主角通常是 trace，并在节点上挂 prompt、completion、token、tool 等 AI 上下文。",
    aliases: [
      "distributed tracing",
      "Distributed Tracing",
      "分布式追踪",
      "链路追踪",
      "Traces",
      "traces",
    ],
    source: {
      label: "Wikipedia: Tracing (software)",
      url: "https://en.wikipedia.org/wiki/Tracing_(software)",
    },
  },
  {
    id: "span",
    title: "Span",
    subtitle: "跨度",
    definition:
      "trace 上的一个有起止时间的操作记录：有 name、duration、attributes，还可以挂子 span。例如“下单”是父 span，“扣库存”“调支付”是子 span。\n\n在 Agent 场景里，一次模型调用、一次 tool call、一段 RAG 检索，通常各自对应一个 span（或 Langfuse 里的 observation）。",
    aliases: ["Span", "span", "跨度", "子 span"],
  },
  {
    id: "trace-id",
    title: "trace_id",
    subtitle: "整棵树的唯一 ID",
    definition:
      "一条 trace 的全局标识。同一请求在不同服务、线程、进程里产生的 span 都带同一个 trace_id，后端才能把散落的片段拼回一棵树。\n\n多 Agent 编排时，主子 Agent 是否共用 trace_id，直接决定你能不能把跨角色的因果对上。",
    aliases: ["trace_id", "trace id", "Trace ID", "TraceId"],
  },
  {
    id: "span-id",
    title: "span_id",
    subtitle: "单个 span 的唯一 ID",
    definition:
      "当前操作节点的标识。子 span 用 parent_id（或等价字段）指向父 span 的 span_id，从而长出树，而不是一团平铺事件。",
    aliases: ["span_id", "span id", "Span ID", "parent_id"],
  },
  {
    id: "context-propagation",
    title: "Context Propagation",
    subtitle: "上下文传播",
    definition:
      "跨进程 / 跨线程调用时，把 trace_id、当前 span_id 等信息顺着请求带过去，让下游新建的 span 能挂成上游的子节点。没有传播，链路就会在服务边界处断裂。\n\n常见载体是 W3C Trace Context 的 `traceparent` 头，或各语言 OTel SDK 的 context API。",
    aliases: [
      "Context Propagation",
      "context propagation",
      "上下文传播",
      "trace context 传播",
    ],
  },
  {
    id: "w3c-trace-context",
    title: "W3C Trace Context",
    subtitle: "traceparent / tracestate",
    definition:
      "浏览器与服务之间传递分布式追踪上下文的 W3C 标准。核心是 HTTP 头 `traceparent`（版本、trace-id、parent-id、flags），可选 `tracestate` 携带厂商扩展。\n\nMCP 客户端、网关、子 Agent HTTP 调用若要接得上同一条因果链，通常按这套头注入与提取。",
    aliases: [
      "W3C Trace Context",
      "W3C Trace",
      "traceparent",
      "tracestate",
    ],
    source: {
      label: "W3C Trace Context",
      url: "https://www.w3.org/TR/trace-context/",
    },
  },
  {
    id: "opentelemetry",
    title: "OpenTelemetry",
    subtitle: "OTel",
    definition:
      "云原生可观测的开放标准与 SDK 生态：统一产生 traces、metrics、logs，并用 OTLP 导出到后端。\n\n对 LLM / Agent，还在演进 GenAI 语义约定（模型名、token 用量等属性键）。“兼容 OTel”往往只保证运输层；AI dashboard 认不认你的属性，才是有没有语义。",
    aliases: [
      "OpenTelemetry",
      "opentelemetry",
      "OTel",
      "otel",
      "OpenTelemetry SDK",
    ],
    source: {
      label: "OpenTelemetry",
      url: "https://opentelemetry.io/",
    },
  },
  {
    id: "otlp",
    title: "OTLP",
    subtitle: "OpenTelemetry Protocol",
    definition:
      "OpenTelemetry 用来把 telemetry 从应用送到 Collector / 后端的协议，常见 gRPC（4317）与 HTTP（4318）。自建 Collector 再扇出到 Langfuse、Jaeger 等，业务侧通常只依赖 OTLP。",
    aliases: ["OTLP", "otlp", "OpenTelemetry Protocol"],
  },
  {
    id: "otel-collector",
    title: "OTel Collector",
    subtitle: "接收 · 处理 · 导出",
    definition:
      "独立的遥测管道进程：用 receiver 收 OTLP，用 processor 做批处理 / 尾部采样，用 exporter 扇出到多个后端。服务只打标准 OTel，换观测产品时改 Collector 配置即可。",
    aliases: [
      "OTel Collector",
      "OpenTelemetry Collector",
      "otel-collector",
      "otel collector",
    ],
  },
  {
    id: "openinference",
    title: "OpenInference",
    subtitle: "Arize 主导的 AI span 语义",
    definition:
      "面向 LLM 应用的追踪语义与插桩约定，强调 span 类型本身可读，例如 LLM / tool / agent / chain。和纯通用 OTel span 相比，AI 专属 dashboard 更容易直接渲染。\n\n与官方 OTel GenAI 语义约定仍在磨合；迁移平台时要核对两边各支持到哪一层。",
    aliases: ["OpenInference", "openinference", "OpenInference span"],
  },
  {
    id: "otel-genai",
    title: "OTel GenAI 语义约定",
    subtitle: "gen_ai.* 属性",
    definition:
      "OpenTelemetry 为生成式 AI 调用约定的属性键空间，例如系统名、请求模型、输入 / 输出 token。基础 LLM 与 tool span 正在可移植化；score、reasoning 正文、人工标签等仍常是各家 vendor-extension。",
    aliases: [
      "OTel GenAI",
      "GenAI 语义约定",
      "OpenTelemetry GenAI",
      "gen_ai",
      "gen_ai.system",
    ],
  },
  {
    id: "langfuse",
    title: "Langfuse",
    subtitle: "开源 LLM 工程平台",
    definition:
      "面向 LLM / Agent 的开源可观测与工程平台：以带 AI 语义的嵌套 trace 为核心，覆盖 generation、score、prompt 版本、自托管与 OTLP 接入等。适合自建或云托管，不把你锁死在某一家模型厂商控制台里。",
    aliases: ["Langfuse", "langfuse"],
    source: {
      label: "Langfuse Docs",
      url: "https://langfuse.com/docs",
    },
  },
  {
    id: "langsmith",
    title: "LangSmith",
    subtitle: "LangChain 观测与评测",
    definition:
      "LangChain 生态的追踪、调试与评测产品。开启 tracing 后可自动上报链与 Agent 运行；与框架绑定深，适合已经在 LangChain / LangGraph 上的团队。",
    aliases: ["LangSmith", "langsmith"],
  },
  {
    id: "arize-phoenix",
    title: "Phoenix",
    subtitle: "Arize Phoenix",
    definition:
      "Arize 开源的 LLM 可观测与评估组件，常与 OpenInference 插桩一起用。可本地起来接收 trace，做排查与评测，偏开源 / 自托管路线。",
    aliases: ["Phoenix", "Arize Phoenix", "arize phoenix"],
  },
  {
    id: "helicone",
    title: "Helicone",
    subtitle: "代理式 LLM 可观测",
    definition:
      "通过把 API base_url 指到代理网关来记录、缓存与统计 LLM 请求的方案。业务代码改动面小，观测挂在请求路径上，而不是在应用内手写整棵 span 树。",
    aliases: ["Helicone", "helicone"],
  },
  {
    id: "apm",
    title: "APM",
    subtitle: "Application Performance Monitoring",
    definition:
      "传统应用性能监控：关注服务延迟、错误、依赖拓扑。对固定路径的微服务很有效；对“步数与分支由模型现决定”的 Agent，只看接口级 APM 往往会失明，需要补 AI 语义的 trace。",
    aliases: ["APM", "apm", "应用性能监控"],
    source: {
      label: "Wikipedia: Application performance management",
      url: "https://en.wikipedia.org/wiki/Application_performance_management",
    },
  },
  {
    id: "jaeger",
    title: "Jaeger",
    subtitle: "通用分布式追踪后端",
    definition:
      "CNCF 的开源分布式追踪系统，擅长通用 span 的查询与瀑布图。常与 OTel Collector 联用；要看 AI 原生语义时，通常再并行接 Langfuse 一类后端。",
    aliases: ["Jaeger", "jaeger"],
    source: {
      label: "Jaeger",
      url: "https://www.jaegertracing.io/",
    },
  },
  {
    id: "mcp",
    title: "MCP",
    subtitle: "Model Context Protocol",
    definition:
      "模型与外部工具 / 数据源之间的上下文协议，让 Agent 通过标准方式发现并调用能力。可观测上的难点是：工具执行往往跨进程，若不注入 Trace Context，主 Agent 的 span 与 MCP server 侧 span 会对不上。",
    aliases: [
      "MCP",
      "Model Context Protocol",
      "MCP 客户端",
      "MCP server",
      "MCP 协议",
    ],
  },
  {
    id: "langfuse-generation",
    title: "Generation",
    subtitle: "Langfuse 观察类型",
    definition:
      "Langfuse 里表示一次模型生成的 observation：通常带 input / output、model、token 用量与耗时。和通用 span 相比，字段更贴近 LLM 调用，方便按模型与 prompt 版本聚合成本与质量。",
    aliases: ["generation", "Generation", "Langfuse generation"],
  },
  {
    id: "langfuse-score",
    title: "Score",
    subtitle: "质量打分",
    definition:
      "挂在 trace / observation 上的可聚合质量信号。来源可以是用户赞踩、程序化规则（例如输出是否合法 JSON），或 LLM-as-judge。没有 score，prompt 改动只能靠感觉判断好坏。",
    aliases: ["score", "Score", "质量分", "Langfuse score"],
  },
  {
    id: "llm-as-judge",
    title: "LLM-as-judge",
    subtitle: "用模型评模型",
    definition:
      "另起一个模型（或同一模型另一套提示）给回答打分或写评语，用于事实性、相关性等难用正则判定的维度。要进线上闭环，通常把结果写成 score 挂回原 trace。",
    aliases: [
      "LLM-as-judge",
      "LLM as judge",
      "llm-as-judge",
      "用模型评模型",
    ],
  },
  {
    id: "prompt-versioning",
    title: "Prompt 版本化",
    subtitle: "可回退的提示词",
    definition:
      "把提示词模板当受控资产：有 name、version / label（如 production、staging），编译时注入变量，并在 generation 上带上版本信息。这样质量与成本回退时，能定位到是哪一次提示词编辑引入的。",
    aliases: [
      "prompt 版本",
      "Prompt 版本化",
      "prompt versioning",
      "提示词版本",
    ],
  },
  {
    id: "prompt-caching",
    title: "Prompt Caching",
    subtitle: "提示词缓存",
    definition:
      "对重复的长前缀提示做缓存计费 / 加速的能力（各模型厂商实现不同）。核算真实成本时，要把缓存命中与否打进 trace 维度，否则账单和用量对不上体感。",
    aliases: [
      "Prompt Caching",
      "prompt caching",
      "提示词缓存",
      "prompt cache",
    ],
  },
  {
    id: "human-in-the-loop",
    title: "Human-in-the-loop",
    subtitle: "人工在环",
    definition:
      "流程跑到关键点时暂停，等人类批准或修改后再继续。长程 Agent 需要把暂停 / 恢复做成可恢复状态，并在 trace 里留下 pause / resume 节点，否则排障时会以为链路丢了。",
    aliases: [
      "Human-in-the-loop",
      "human-in-the-loop",
      "human in the loop",
      "人工在环",
      "HITL",
    ],
  },
  {
    id: "agent-checkpoint",
    title: "Agent Checkpoint",
    subtitle: "会话状态检查点",
    definition:
      "多步 Agent 在关键步骤把状态持久化（例如 LangGraph 的 PostgresSaver），崩溃或人工暂停后从最近检查点续跑，而不是从头重放十几步。\n\n注意：数据库 InnoDB 的 Checkpoint 是另一回事；这里专指 Agent 工作流的状态快照。",
    aliases: [
      "Agent Checkpoint",
      "agent checkpoint",
      "PostgresSaver",
      "会话检查点",
      "状态检查点",
    ],
  },
  {
    id: "tail-sampling",
    title: "Tail Sampling",
    subtitle: "尾部采样",
    definition:
      "先收齐一条 trace（或看完关键属性）再决定去留的采样策略，相对头采样更能保留错误与慢请求。OTel Collector 里常用属性策略（如某租户全采）加概率策略组合。",
    aliases: ["Tail Sampling", "tail sampling", "尾部采样", "tail_sampling"],
  },
  {
    id: "pii-redaction",
    title: "PII 脱敏",
    subtitle: "落库前处理",
    definition:
      "把手机号、邮箱、证件号等个人敏感信息在写入日志 / trace 前掩码或剥离。Agent 常把用户原文塞进 prompt，观测系统默认全量记录会放大隐私风险，生产应默认关正文或只对灰度租户打开。",
    aliases: ["PII", "PII 脱敏", "脱敏", "个人敏感信息"],
  },
  {
    id: "vendor-extension",
    title: "Vendor Extension",
    subtitle: "厂商扩展字段",
    definition:
      "标准语义约定尚未覆盖、由各观测产品私有定义的字段或 span 类型，例如某些质量标签、reasoning 正文。换平台时基础 OTel / GenAI 字段可迁移，扩展字段通常要重接。",
    aliases: [
      "vendor-extension",
      "vendor extension",
      "厂商扩展",
      "私有扩展字段",
    ],
  },
  {
    id: "token-usage",
    title: "Token Usage",
    subtitle: "用量与成本归因",
    definition:
      "一次模型调用消耗的 input / output token（以及缓存读写等细分）。Agent 成本归因通常要叠租户、功能、prompt 版本、模型名等维度；只看总额无法定位谁在烧钱。",
    aliases: [
      "token usage",
      "Token Usage",
      "input_tokens",
      "output_tokens",
      "token 用量",
    ],
  },
];
