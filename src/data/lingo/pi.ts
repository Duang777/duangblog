import type { LingoTerm } from "./types";

/** Pi / pi-ai 协议归一、上下文交接与模型接入域词包。 */
export const PI_LINGO: LingoTerm[] = [
  {
    id: "pi-ai",
    title: "pi-ai",
    subtitle: "@earendil-works/pi-ai",
    definition:
      "Pi monorepo 最底层的公开包：唯一直接与模型 API 对话的一层。不负责 Agent 循环、终端 UI 或会话存储；只抹平各家 LLM 协议差异，向上露出统一的 Models 接口。",
    aliases: ["pi-ai", "Pi-ai", "@earendil-works/pi-ai"],
  },
  {
    id: "assistant-message-event",
    title: "AssistantMessageEvent",
    subtitle: "归一化流式事件",
    definition:
      "pi-ai 对外吐出的统一事件联合类型：text / thinking / toolcall 的 start·delta·end，以及 done / error。不论底层是 OpenAI、Anthropic 还是 Google，上层只订阅这一套事件。",
    aliases: [
      "AssistantMessageEvent",
      "assistant message event",
      "归一化流式事件",
    ],
  },
  {
    id: "pi-context",
    title: "Context",
    subtitle: "pi-ai 统一输入",
    definition:
      "pi-ai 的统一请求形状：可选 systemPrompt、必填 messages、可选 tools。四种协议实现各自 convertMessages 成厂商格式，调用方不必分支。",
    aliases: ["pi-ai Context", "统一 Context", "Context 进去"],
  },
  {
    id: "compat-matrix",
    title: "compat",
    subtitle: "可覆盖兼容开关",
    definition:
      "把厂商 quirks 从散落 if/else 收成显式开关，例如 supportsStore、maxTokensField、thinkingFormat。默认由 baseUrl / provider 探测，再允许 model.compat 逐项覆盖。",
    aliases: [
      "compat",
      "Compat",
      "compat 矩阵",
      "兼容矩阵",
      "detectCompat",
      "getCompat",
    ],
  },
  {
    id: "toolcall-delta",
    title: "toolcall_delta",
    subtitle: "流式工具调用增量",
    definition:
      "工具参数尚未传完时就向上推送的增量事件。配合 partial JSON 解析，上层可以边收边读参数、边收边执行，而不必等整个 tool call 结束。",
    aliases: [
      "toolcall_delta",
      "toolcall-delta",
      "toolcall delta",
      "流式工具调用",
    ],
  },
  {
    id: "parse-streaming-json",
    title: "parseStreamingJson",
    subtitle: "部分 JSON 解析",
    definition:
      "对流式到达、尚不完整的 JSON 字符串做尽力解析，抽出当前已可确定的字段。pi-ai 用它在 toolcall_delta 阶段把 arguments 累积成可部分读取的对象。",
    aliases: [
      "parseStreamingJson",
      "partial JSON",
      "部分 JSON 解析",
      "流式 JSON 部分解析",
    ],
  },
  {
    id: "transform-messages",
    title: "transformMessages",
    subtitle: "跨厂商历史清洗",
    definition:
      "送出请求前的脏活集中处：规范化 tool call id、处理 thinking 签名与 redacted、给孤儿 tool call 注入合成结果、图像降级、跳过 error/aborted 坏轮次。上层只传 Context，清洗细节收在这一层。",
    aliases: [
      "transformMessages",
      "transform-messages",
      "transform messages",
    ],
  },
  {
    id: "openai-responses-api",
    title: "OpenAI Responses",
    subtitle: "Responses API",
    definition:
      "OpenAI 较新的对话协议面，字段与 Chat Completions 不同（如 store、instructions、reasoning）。pi-ai 默认 store:false，并按模型能力决定 developer 角色是否启用。",
    aliases: [
      "OpenAI Responses",
      "Responses API",
      "openai-responses",
    ],
  },
  {
    id: "openai-completions-api",
    title: "OpenAI Completions",
    subtitle: "Chat Completions",
    definition:
      "经典的 messages + tools Chat Completions 协议。pi-ai 用它对接大量 OpenAI 兼容端点；字段名差异（如 max_tokens vs max_completion_tokens）交给 compat 决定。",
    aliases: [
      "OpenAI Completions",
      "Chat Completions",
      "openai-completions",
      "Completions（Chat）",
    ],
  },
  {
    id: "anthropic-messages-api",
    title: "Anthropic Messages",
    subtitle: "Messages API",
    definition:
      "Anthropic 的对话协议：system 常单独成字段，thinking 有 budget_tokens 与 adaptive effort 等模式，stop reason 需映射到 pi-ai 统一枚举。",
    aliases: [
      "Anthropic Messages",
      "anthropic-messages",
      "Messages API",
    ],
  },
  {
    id: "google-generative-ai",
    title: "Google Generative AI",
    subtitle: "contents / parts",
    definition:
      "Google 生成式 API 的一套请求与流式形状。工具侧 functionCall 常作为完整 part 一次到达，不像 OpenAI 那样片片增量；pi-ai 因此对工具流式做了不同映射。",
    aliases: [
      "Google Generative AI",
      "google-generative-ai",
      "Gemini API",
    ],
  },
  {
    id: "create-provider",
    title: "createProvider",
    subtitle: "开放注册入口",
    definition:
      "pi-ai 注册厂商 / 端点的统一工厂。官方 Anthropic 与本地 Ollama / vLLM 走同一路径：带上 models、baseUrl、auth，再绑定一个 lazy 的协议 API 工厂。",
    aliases: ["createProvider", "create provider", "createModels"],
  },
  {
    id: "ollama",
    title: "Ollama",
    subtitle: "本地模型运行时",
    definition:
      "本机跑开源模型的常见引擎，常暴露 OpenAI 兼容的 /v1 接口。接到 pi-ai 时通常 api 选 openai-completions，并按需用 compat 覆盖 quirks。",
    aliases: ["Ollama", "ollama"],
  },
  {
    id: "vllm",
    title: "vLLM",
    subtitle: "高吞吐推理引擎",
    definition:
      "面向生产的开源 LLM 推理服务，常提供 OpenAI 兼容 API。接入 Agent 时要确认结构化 tool_calls、thinking 字段名，以及推理 token 预算是否会吃光 max_tokens。",
    aliases: ["vLLM", "vllm"],
  },
  {
    id: "thinking-format",
    title: "thinkingFormat",
    subtitle: "推理字段格式开关",
    definition:
      "compat 里描述各家把思考内容放在哪个字段 / 哪种形状的枚举（如 openai、deepseek、openrouter）。自托管端点字段名不统一时，靠它而不是业务 if 来对齐。",
    aliases: [
      "thinkingFormat",
      "thinking format",
      "thinkingFormat 枚举",
    ],
  },
  {
    id: "lazy-api-factory",
    title: "lazy API 工厂",
    subtitle: "首次 stream 再 import",
    definition:
      "pi-ai 对各协议实现做延迟加载：真正开始 stream 才动态 import 对应文件，减小核心包体积与副作用。自定义端点同样绑定 openAICompletionsApi() 这类 lazy 工厂。",
    aliases: [
      "lazy 工厂",
      "lazy API",
      "lazy 加载",
      "openai-completions.lazy",
    ],
  },
  {
    id: "orphan-tool-call",
    title: "孤儿 tool call",
    subtitle: "缺结果的工具调用",
    definition:
      "历史里 assistant 发出了工具调用，却没有对应 toolResult。重放时厂商 API 常会拒。transformMessages 会注入合成错误结果（如 No result provided）兜底。",
    aliases: [
      "孤儿 tool call",
      "orphan tool call",
      "孤儿工具调用",
    ],
  },
  {
    id: "models-generated",
    title: "models.generated",
    subtitle: "生成模型目录",
    definition:
      "由脚本从权威数据源生成的模型清单产物（带 as const 联合类型与校验）。手改会被覆盖；compat 与价格等元数据随生成进入内置 Models。",
    aliases: [
      "models.generated.ts",
      "模型目录生成",
      "builtinModels",
    ],
  },
  {
    id: "system-prompt-field",
    title: "systemPrompt",
    subtitle: "独立于 messages 的系统提示",
    definition:
      "Context 的顶层字段，而不是 Message 联合里的 system role。OpenAI、Anthropic、Google 对系统提示的塞法不同；抽成独立字段后，transformMessages 只管 messages，各厂商适配器自己决定怎么写进请求体。",
    aliases: [
      "systemPrompt",
      "没有 system role",
      "system 这个 role",
    ],
  },
  {
    id: "thinking-signature",
    title: "thinkingSignature",
    subtitle: "推理回放的不透明签名",
    definition:
      "pi-ai 把各家推理回放数据收成同一个字段：Anthropic 的 signature、OpenAI Responses 的 encrypted_content、被抹除时的密文。上层不解析内容，只在同模型时原样回传。",
    aliases: [
      "thinkingSignature",
      "签名 blob",
      "不透明 blob",
      "encrypted_content",
    ],
  },
  {
    id: "thought-signature",
    title: "thoughtSignature",
    subtitle: "Google 思想签名",
    definition:
      "Google 专用、绑在 toolCall 或思考块上的 base64 不透明签名。跨模型必须剥离；即便同厂商，也要同 model 且合法 base64 才保留。",
    aliases: ["thoughtSignature", "thought signature"],
  },
  {
    id: "redacted-thinking",
    title: "redacted thinking",
    subtitle: "被安全滤波抹除的推理",
    definition:
      "厂商把推理文本抹掉后，密文仍可能留在 thinkingSignature 里供同模型多轮回放。跨模型既不能降级成纯文本，也不能回放，只能丢弃。",
    aliases: [
      "redacted thinking",
      "redacted",
      "被安全滤波抹除",
    ],
  },
  {
    id: "normalize-tool-call-id",
    title: "normalizeToolCallId",
    subtitle: "跨厂商 tool call id 规范化",
    definition:
      "transformMessages 在跨模型时调用的回调：把 OpenAI Responses 那种 450+ 字符、带管道符的长 id，收成目标厂商能接受的短 id（Anthropic 最长 64、字符集受限）。同一次对话里用映射表把 toolResult.toolCallId 一起改掉。",
    aliases: [
      "normalizeToolCallId",
      "tool call id 规范化",
      "规范化 tool call id",
    ],
  },
  {
    id: "abort-signal",
    title: "AbortSignal",
    subtitle: "中断透传",
    definition:
      "从 ProviderRequestOptions.signal 一路传到 provider.stream。中断时 emit error 事件，reason 为 aborted，并携带已生成的部分 AssistantMessage。和真实失败的 error 分开，方便上层丢弃残缺轮次。",
    aliases: [
      "AbortSignal",
      "aborted vs error",
      "stopReason:\"aborted\"",
      "reason:\"aborted\"",
    ],
  },
  {
    id: "tool-result-details",
    title: "ToolResult.details",
    subtitle: "给 UI 的富结果",
    definition:
      "ToolResultMessage 把给模型读的文本放在 content，把给界面渲染的结构放在 details。pi-ai 只定契约、不解释 details；真正劈成两面的逻辑在 pi-agent-core。",
    aliases: [
      "ToolResult.details",
      "details 给 UI",
      "details 喂 UI",
      "content 和 details",
    ],
  },
];
