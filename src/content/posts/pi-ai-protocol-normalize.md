---
author: Duang
pubDatetime: 2026-08-18T20:40:00+08:00
title: Pi 深度解析（二）：pi-ai 之一，四种协议怎么被归一化成同一个接口
featured: false
draft: false
tags:
  - Pi 深度解析
description: 进入 pi-ai：四家协议怎么收成同一套 Context / AssistantMessageEvent，compat 矩阵怎么探测与覆盖，模型目录怎么生成，以及 Ollama / vLLM 怎么走同一条 createProvider 路。
revisions:
  - date: 2026-08-18
    note: 首发。飞书论述按原稿对齐；边注、动态图解与词卡另加，不改论述。
---

**系列说明**｜这是 [Pi 深度解析](/posts/pi-deep-dive/) 的第二篇（系列第 2/7）。第一篇：[Pi 的包怎么分层，以及它故意不做的那些事](/posts/pi-overview/)。本篇只进 `pi-ai`：四种协议怎么归一、模型目录怎么生成、本地引擎怎么接进来。

Pi 深度解析系列进度：上一篇《Pi 的包怎么分层，以及它故意不做的那些事》（项目全景，系列第 1/7 篇）已经把四层包结构、作者重写动机、以及"故意不做"的清单铺开了。本篇是系列第 2/7 篇，进入最底层 pi-ai，只讲一件事：四家厂商四种协议（OpenAI Completions / OpenAI Responses / Anthropic Messages / Google Generative AI）是怎么被归一化成同一个调用接口的，模型目录又是怎么生成的，最后你怎么把自己的本地引擎（Ollama / vLLM）接进来。下一篇（第 3/7 篇）是 pi-ai 之二，讲上下文对象、跨厂商交接、中断与工具分流。

先接住上一篇结尾抛出来的几件事。第一篇第二节专门讲了"自托管模型的工具调用为什么容易坑"：托管 API 直接吐 tool_calls，自托管引擎（vLLM 等）吐纯文本，靠 tool call parser 反解；坑在于 parser 和 chat template 不匹配、流式和非流式不一致、参数不受 schema 约束、响应体缺字段。第一篇第三节又给 pi-ai 列了一串能力：四种协议归一、模型目录生成、compat 矩阵、跨厂商上下文交接、中断与部分结果、工具结果分两份、流式 JSON 部分解析，以及"为什么不用 Vercel AI SDK"。本篇就把"四种协议归一 + 模型目录生成 + 自定义模型接入"这三块拆开讲透。第一篇文末的"下一篇"指向了一个 pi-deep-dive 占位链接，真实的第二篇就是本篇。

## 一、pi-ai 在整个项目里站什么位置

pi-ai 是四个公开包里最底层、也是唯一直接和模型说话的那一层。它不知道"Agent"是什么，不关心工具循环、不关心终端 UI、不关心会话怎么存。它的全部工作，就是抹平各家 LLM API 的差异，让上层（pi-agent-core、pi-tui、pi-coding-agent）只用跟一个统一的接口打交道。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    pi-ai 的薄，是故意的：只统一接口，不把 Agent 循环、UI、会话存储拽进来。
  </div>
</details>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="pi-ai"
      src="/images/childlike-sketch-pi-ai-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">归一瓶</span>
  </div>
  <p class="duang-whisper-body">四家协议脏在不同地方。上层只该看见一套事件，不该看见四套字段名。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

为什么这一层必须存在？因为每家厂商的 API 都是脏活，而且脏在不同的地方：

- 请求体结构不同。OpenAI 用 messages + tools，Anthropic 用 system 单独字段 + tools，Google 又是一套 contents/parts，OpenAI Responses 还多了 instructions 和 store。
- 流式事件不同。OpenAI 吐 SSE 的 delta，Anthropic 吐 content_block_delta，Google 的 functionCall 是整体到达不分片。
- 工具调用格式不同。OpenAI 的 tool_calls 带 450+ 字符的 id 还含管道符，Anthropic 只接受 64 字符且限定字符集。
- thinking / reasoning 字段不同。有的叫 reasoning_effort，有的叫 budget_tokens，有的塞在 reasoning_content，名字和位置都不统一。
- stop reason、错误体、价格元数据，每家各写一套。

第一篇反复强调 Pi 的哲学是"如果我不需要就不建"。落到 pi-ai 上，它的做法是：只做最薄的一层统一抽象，把厂商差异表达成一组"可覆盖的开关"（compat），而不是为每个怪异厂商写一堆 if/else。这一层对外只暴露一个东西：Models 集合。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：pi-ai 站在最底层</p>
  <p class="article-embed-note-lead">它不关心 Agent 循环和终端 UI。只抹平各家 LLM API，让上层只跟一个接口说话。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 250" role="img" aria-label="四层包与 pi-ai">
        <rect class="mixup-panel" x="80" y="18" width="480" height="44" rx="10"/>
        <text class="mixup-sub" x="320" y="46" text-anchor="middle">pi-coding-agent</text>
        <rect class="mixup-panel" x="80" y="72" width="480" height="44" rx="10"/>
        <text class="mixup-sub" x="320" y="100" text-anchor="middle">pi-tui · pi-agent-core</text>
        <rect class="mixup-panel is-accent" x="80" y="126" width="480" height="52" rx="10"/>
        <text class="mixup-title" x="320" y="158" text-anchor="middle">pi-ai · 唯一直接跟模型说话</text>
        <circle class="mixup-dot is-live" cx="160" cy="220" r="7"/>
        <circle class="mixup-dot is-io" cx="260" cy="220" r="7"/>
        <circle class="mixup-dot is-live" cx="360" cy="220" r="7"/>
        <circle class="mixup-dot is-io" cx="460" cy="220" r="7"/>
        <text class="mixup-caption" x="320" y="244" text-anchor="middle">Completions · Responses · Anthropic · Google</text>
      </svg>
    </div>
  </figure>
</section>

## 二、统一接口长什么样：Context 进去，AssistantMessageEvent 流出来

pi-ai 的统一接口由三个类型定义撑起来，都在 src/types.ts 里。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：统一接口 · Context 进，事件流出</p>
  <p class="article-embed-note-lead">四种协议都吃同一个 Context，吐同一套 AssistantMessageEvent。换模型只改 getModel 参数。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="Context 到事件流">
        <rect class="mixup-panel" x="24" y="60" width="150" height="90" rx="12"/>
        <text class="mixup-title" x="99" y="100" text-anchor="middle">Context</text>
        <text class="mixup-caption" x="99" y="124" text-anchor="middle">system · messages</text>
        <rect class="mixup-pipe" x="190" y="92" width="70" height="24" rx="10"/>
        <rect class="mixup-panel is-accent" x="280" y="50" width="160" height="110" rx="12"/>
        <text class="mixup-title" x="360" y="96" text-anchor="middle">Models</text>
        <text class="mixup-caption" x="360" y="120" text-anchor="middle">stream / complete</text>
        <rect class="mixup-pipe" x="456" y="92" width="70" height="24" rx="10"/>
        <rect class="mixup-panel" x="542" y="60" width="74" height="90" rx="12"/>
        <text class="mixup-label" x="579" y="100" text-anchor="middle">事件</text>
        <text class="mixup-caption" x="579" y="124" text-anchor="middle">流</text>
        <circle class="mixup-dot is-live" cx="225" cy="104" r="5"/>
        <circle class="mixup-dot is-live" cx="491" cy="104" r="5"/>
      </svg>
    </div>
  </figure>
  <p class="article-embed-note-foot">toolcall_delta 让参数边收边解析，工具可以不等整包传完再动。</p>
</section>

第一是输入 Context（src/types.ts:516）：

```ts
export interface Context {
  systemPrompt?: string;   // 系统提示词（system prompt），可选
  messages: Message[];     // 完整对话历史，必填
  tools?: Tool[];          // 工具定义列表，可选；不传就是纯聊天
}
```

四种协议都接收同一个 Context，各自在内部 convertMessages 成自家的格式。你不用管现在背后是 Anthropic 还是 Google。

第二是输出，一套归一化的流式事件 AssistantMessageEvent（src/types.ts:530）。无论底层是哪家，流式回调吐出来的都是这同一个联合类型：

```ts
export type AssistantMessageEvent =
  // 整体开始：返回当前已累积的 partial 消息
  | { type: "start"; partial: AssistantMessage }
  // 一段文本的开始 / 增量 / 结束（contentIndex 标记是第几段内容）
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  // 思考（reasoning）同样有 开始 / 增量 / 结束 三态
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  // 工具调用也有 开始 / 增量 / 结束（增量阶段参数即可被部分解析）
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  // 整轮结束：reason 是停止原因，message 是完整结果
  | { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse" | "deferred">; message: AssistantMessage }
  // 出错：reason 是 aborted 或 error
  | { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };
```

这里面最值得说的是 toolcall_delta。它在流式传输过程中，对还没传完的工具参数 JSON 做"部分解析"：工具参数不用等整个调用传完就能被读取，工具可以边收边执行。这正是第一篇说的"工具结果分两份、流式 JSON 部分解析"在协议层落地的样子。

第三是 Model（src/types.ts:807），一个模型条目的形状。api 字段是判别联合的"判别式"，决定这个模型走哪套协议实现：

```ts
export interface Model<TApi extends Api> {
  id: string;                // 模型在 pi-ai 内的唯一标识
  name: string;              // 展示名
  api: TApi;                 // 判别式：走哪套协议实现（openai-completions / openai-responses / anthropic-messages / google-generative-ai ...）
  provider: ProviderId;      // 所属厂商 id
  baseUrl: string;           // 厂商 API 基地址，detectCompat 据此猜测兼容差异
  reasoning: boolean;        // 是否支持推理（思考）能力
  input: ("text" | "image")[];  // 输入模态：文本、图片
  cost: ModelCost;           // 单价：input / output / cacheRead / cacheWrite
  contextWindow: number;     // 上下文窗口大小（token 数）
  maxTokens: number;         // 单次最大输出 token 数
  compat?: /* 按 api 取对应的 Compat 接口，可覆盖厂商探测值 */;
}
```

上层调用方只需要拿到一个 Model，丢进 Models 的四个方法之一。Models 的入口（src/models.ts:203）就这四个：

```ts
stream(model, context, options?): AssistantMessageEventStream;          // 流式，返回事件流，需自己拼装消息
complete(model, context, options?): Promise<AssistantMessage>;           // 非流式，直接拿到完整结果
streamSimple(model, context, options?): AssistantMessageEventStream;     // 流式简化版，自动只留文本/工具增量
completeSimple(model, context, options?): Promise<AssistantMessage>;    // 非流式简化版
```

一个最小可运行的调用长这样：

```ts
import { builtinModels } from "@earendil-works/pi-ai";   // 引入内置模型集合工厂

const models = builtinModels();                          // 拿到全部内置厂商 + 几百个模型
const model = models.getModel("anthropic", "claude-sonnet-4-5")!;  // 按 厂商+模型id 取一个 Model

// 用简化流式入口发起调用：系统提示 + 一条用户消息
const stream = models.streamSimple(model, {
  systemPrompt: "You are a helpful assistant.",
  messages: [{ role: "user", content: "用一句话解释什么是上下文窗口" }],
});

// 遍历流式事件：文本增量直接打印，结束事件打印停止原因
for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
  if (event.type === "done") console.log("\n[stop:", event.reason, "]");
}
```

注意这里没有任何协议分支。换模型只改 getModel 的两个参数，后面整条调用链不变。这就是归一化给上层带来的好处。

## 三、四种协议各自怎么被收进这个接口

pi-ai 当前归一了四套协议，每套一个实现文件，外加一个 lazy 工厂（首次真正 stream 时才动态 import，所以核心包体积小、无副作用）：

| 协议 | 实现文件 | 关键请求差异 |
|-|-|-|
| OpenAI Completions（Chat） | src/api/openai-completions.ts | store / max_tokens 字段、thinkingFormat、tool_calls 流式 |
| OpenAI Responses | src/api/openai-responses.ts | store:false、developer vs system、reasoning、prompt cache |
| Anthropic Messages | src/api/anthropic-messages.ts | thinking budget / adaptive effort、stop reason 映射 |
| Google Generative AI | src/api/google-generative-ai.ts | functionCall 整体到达、不支持工具调用流式 |

每个协议实现把自己家的 SSE / 响应结构，映射成第二节那套 AssistantMessageEvent。下面看几个最能说明差异的点。

### OpenAI Responses：默认 store:false，developer 角色看推理能力

Responses API 默认不带 store（src/api/openai-responses.ts:294 附近）：

```ts
const params = {
  model: model.id,                                          // 模型 id
  input: messages,                                          // 已转换好的对话
  stream: true,                                             // 走流式
  prompt_cache_key: ...,                                    // 提示词缓存键
  prompt_cache_retention: getPromptCacheRetention(compat, cacheRetention),  // 缓存保留时长（compat 决定）
  store: false,                                             // 默认不持久化（Cerebras/xAI/Chutes 等不支持 store）
};
if (model.reasoning) {                                      // 支持推理才加 reasoning 字段
  params.reasoning = { effort: ..., summary: options?.reasoningSummary || "auto" };
  params.include = ["reasoning.encrypted_content"];         // 顺便取回加密推理内容
}
```

developer 角色也不是写死的（src/api/openai-responses-shared.ts:176）：模型支持 developer 角色且开了推理时才是 developer，否则退回 system。

### OpenAI Completions：字段差异靠 compat 决定

同样一个"最大 token 数"，不同厂商字段名不一样。pi-ai 不写死，而是问 compat（src/api/openai-completions.ts:702）：

```ts
if (compat.supportsStore) params.store = false;   // 该厂商支持才带 store 字段
if (options?.maxTokens) {
  // 不同厂商字段名不同：Chutes/DeepSeek 用 max_tokens，其余用 max_completion_tokens
  if (compat.maxTokensField === "max_tokens") params.max_tokens = options.maxTokens;
  else params.max_completion_tokens = options.maxTokens;
}
```

### Anthropic Messages：thinking 两种模式

Anthropic 这边，老模型走 budget_tokens，自适应思考模型走 output_config.effort（src/api/anthropic-messages.ts:1080）：

```ts
if (options.effort) {
  // 自适应思考模型：用 effort 表达思考强度
  params.thinking = { type: "adaptive", display };
  params.output_config = { effort: options.effort };
} else {
  // 老模型：用固定 budget_tokens 控制思考预算，默认 1024
  params.thinking = { type: "enabled", budget_tokens: options.thinkingBudgetTokens || 1024, display };
}
```

stop reason 也要映射：end_turn 变 stop、max_tokens 变 length、tool_use 变 toolUse、refusal 变 error。

### Google Generative AI：工具调用整体到达，不分片

这是四种里最特殊的一个。OpenAI 的 tool_calls 是逐片增量到达的，Google 的 functionCall 是作为完整 part 一次性送达，参数 args 早已成形。所以 pi-ai 只发一个 toolcall_delta，携带整个 JSON.stringify(toolCall.arguments)（src/api/google-generative-ai.ts:194）。这也是第一篇清单里"Google 不支持工具调用流式"的来源。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    面试常问：流式工具调用为什么要 partial JSON？答 toolcall_delta，参数边收边解析，才能边收边执行。
  </div>
</details>

### 工具调用流式解析：边收边执行的关键

OpenAI Completions 这边，tool call 是增量到达的。parseStreamingJson 会把每片 arguments 累积起来，拼成可部分解析的 JSON，并实时 push toolcall_delta（src/api/openai-completions.ts:523）：

```ts
if (choice?.delta?.tool_calls) {                         // 本片有工具调用增量
  for (const toolCall of choice.delta.tool_calls as <StreamingToolCallDelta[]) {
    const block = ensureToolCallBlock(toolCall);          // 拿到/新建对应的工具调用块
    // 首次出现时记录 id，并建立 id -> block 的索引
    if (!block.id && toolCall.id) { block.id = toolCall.id; toolCallBlocksById.set(toolCall.id, block); }
    const name = toolCall.function?.name ?? toolCall.custom?.name;  // 取工具名（标准或自定义）
    if (!block.name && name) block.name = name;          // 首次出现时记录名字

let delta = "";
    if (toolCall.function?.arguments) {                   // 累积参数片段
      delta = toolCall.function.arguments;
      block.partialArgs = (block.partialArgs ?? "") + toolCall.function.arguments;
      block.arguments = parseStreamingJson(block.partialArgs);   // 部分 JSON 解析：边收边解析
    }
    // 向上层推送 工具调用增量 事件，参数此刻已能部分读取
    stream.push({ type: "toolcall_delta", contentIndex: getContentIndex(block), delta, partial: output });
  }
}
```

这段代码就是"工具可以边收边执行"的协议层实现：上层订阅到 toolcall_delta 时，参数已经能解析出一部分，不用等整个工具调用传完。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    transformMessages 是跨厂商切换的防火墙：id 规范化、孤儿 tool result、坏轮次丢弃，全在这一处。
  </div>
</details>

## 四、脏活集中地：transformMessages

归一化不只在"发出去"的时候做，还在"送出去之前"做。跨厂商切换模型时，历史对话要被转成目标模型能接受的形状。这份脏活全部集中在 src/api/transform-messages.ts 的 transformMessages() 里。它一次处理五件事。

### 1. tool call id 规范化

OpenAI Responses 生成的 tool call id 是 450+ 字符、带管道符 | 的长串；Anthropic 要求 id 匹配 ^[a-zA-Z0-9_-]+$、最长 64 字符。transformMessages 建一个 toolCallIdMap，通过 normalizeToolCallId 回调改写（src/api/transform-messages.ts:60 注释 + 127）。上层切换厂商时不会被 id 格式卡住。

### 2. thinking 签名与 redacted 处理

同模型重放需要保留 thinkingSignature（尤其是 OpenAI 的加密推理），所以同模型的 thinking 块带签名就原样保留；跨模型时丢弃 redacted thinking（那是只对本模型有效的不透明加密内容），空 thinking 转成纯文本（src/api/transform-messages.ts:100）。跨模型的 tool call 还会剥掉 thoughtSignature。

### 3. 孤儿 tool call 注入合成结果

这是最容易让 API 报错的情况：assistant 发了工具调用，但对话里没有对应的工具结果。transformMessages 会遍历消息，给每个孤儿 tool call 注入一条合成结果，文本是 "No result provided"、标记为 error（src/api/transform-messages.ts:167）：

```ts
result.push({
  role: "toolResult",                        // 这是一条工具结果消息
  toolCallId: tc.id,                         // 对应哪个工具调用的 id
  toolName: tc.name,                         // 工具名字
  content: [{ type: "text", text: "No result provided" }],  // 兜底文本
  isError: true,                             // 标记为错误结果，避免厂商 API 拒绝
  timestamp: Date.now(),                     // 时间戳
} as ToolResultMessage);
```

有了这条兜底，模型重新发起调用时不会因为"挂空的工具调用"被厂商 API 拒绝。

### 4. 图像降级

模型不支持图片输入时（model.input 不含 "image"），user 消息和 toolResult 里的图片块会被替换成占位文本，比如 "(image omitted: model does not support images)"（src/api/transform-messages.ts:35）。调用方不用自己判断每个模型支不支持图。

### 5. 跳过损坏消息

stopReason 是 error 或 aborted 的 assistant 消息，是上一次没跑完的不完整轮次（可能只有推理没有正文、工具调用残缺）。重放它们会触发 API 报错（比如 OpenAI 报 "reasoning without following item"），所以整条丢弃（src/api/transform-messages.ts:195）：

```ts
const assistantMsg = msg as AssistantMessage;
// 跳过上一次没跑完的不完整轮次（可能只有推理、工具调用残缺），重放会触发 API 报错
if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
  continue;
}
```

这五件事都收口在 transformMessages 里，上层代码因此保持干净：你只管传 Context，脏活交给这一层。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：compat · 先探测，再逐模型覆盖</p>
  <p class="article-embed-note-lead">差异不散落成 if/else。detectCompat 猜默认，model.compat 显式覆盖优先。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 200" role="img" aria-label="compat 两阶段">
        <rect class="mixup-panel" x="40" y="40" width="220" height="120" rx="12"/>
        <text class="mixup-title" x="150" y="88" text-anchor="middle">阶段 A</text>
        <text class="mixup-caption" x="150" y="116" text-anchor="middle">baseUrl 自动探测</text>
        <text class="mixup-label" x="150" y="140" text-anchor="middle">detectCompat</text>
        <rect class="mixup-panel is-accent" x="380" y="40" width="220" height="120" rx="12"/>
        <text class="mixup-title" x="490" y="88" text-anchor="middle">阶段 B</text>
        <text class="mixup-caption" x="490" y="116" text-anchor="middle">model.compat 覆盖</text>
        <text class="mixup-label" x="490" y="140" text-anchor="middle">getCompat</text>
        <path class="mixup-arrow" d="M 280 100 H 360"/>
        <circle class="mixup-dot is-live" cx="320" cy="100" r="6"/>
      </svg>
    </div>
  </figure>
</section>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="pi-ai"
      src="/images/childlike-sketch-pi-ai-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">compat 瓶</span>
  </div>
  <p class="duang-whisper-body">厂商 quirks 别散落在业务 if 里。写成可覆盖开关，探测打底，模型再盖一层。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 五、兼容矩阵：差异不是硬写 if/else，而是可覆盖的开关

第一篇第三节给过一张 compat 清单：Cerebras/xAI/Mistral/Chutes 不接受 store；Mistral/Chutes 用 max_tokens；不支持 developer 角色；Grok 不喜欢 reasoning_effort；推理字段名不统一；Google 不支持工具调用流式。这些不是散落在业务代码里的 if/else，而是抽象成三个 Compat 接口（src/types.ts:552 / 615 / 635）：

- OpenAICompletionsCompat：supportsStore、supportsDeveloperRole、supportsReasoningEffort、maxTokensField、thinkingFormat、requiresThinkingAsText 等十几项。
- OpenAIResponsesCompat：supportsDeveloperRole、supportsLongCacheRetention、supportsStrictMode 等。
- AnthropicMessagesCompat：forceAdaptiveThinking、allowEmptySignature、supportsEagerToolInputStreaming 等。

兼容值的来源分两阶段，这正是 pi-ai 处理厂商差异的核心机制。

### 阶段 A：按 baseUrl 自动探测 detectCompat

很多厂商的差异能从 baseUrl / provider 名猜出来。detectCompat（src/api/openai-completions.ts:1455）就是干这个的，比如：

```ts
// 先判断是不是"非标准"厂商（NVIDIA/Cerebras/xAI/Together/Chutes/DeepSeek 等）
const isNonStandard =
  isNvidia || provider === "cerebras" || baseUrl.includes("cerebras.ai") ||
  provider === "xai" || baseUrl.includes("api.x.ai") ||
  isTogether || baseUrl.includes("chutes.ai") || isDeepSeek || ... ;

// 哪些厂商用 max_tokens 而非 max_completion_tokens
const useMaxTokens =
  baseUrl.includes("chutes.ai") || isDeepSeek || isMoonshot ||
  isCloudflareAiGateway || isTogether || isNvidia || isAntLing || isZai;

// Grok 就是 xAI
const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");

return {
  supportsStore: !isNonStandard,                       // Cerebras/xAI/Chutes 不接受 store
  supportsDeveloperRole: isOpenRouterDeveloperRoleModel || (!isNonStandard && !isOpenRouter),
  supportsReasoningEffort: !isGrok && !isZai && !isMoonshot && !isTogether && ...,  // Grok 不喜欢
  maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",           // Chutes/DeepSeek 用 max_tokens
  // 思考字段格式各家不同，统一抽象成 thinkingFormat 枚举
  thinkingFormat: isDeepSeek ? "deepseek" : isZai ? "zai" : isTogether ? "together"
    : isAntLing ? "ant-ling" : isOpenRouter ? "openrouter" : "openai",
};
```

### 阶段 B：逐模型 model.compat 覆盖 getCompat

探测值只是默认。getCompat（src/api/openai-completions.ts:1555）允许每个模型用 model.compat 显式覆盖，规则是"显式覆盖优先，否则用 URL 探测"：

```ts
function getCompat(model) {
  const detected = detectCompat(model);     // 先按 URL/厂商名探测出默认兼容值
  if (!model.compat) return detected;        // 模型没有显式覆盖就直接用探测值
  return {
    // 显式覆盖优先；没写的字段回落到探测值（?? 空值合并）
    supportsStore: model.compat.supportsStore ?? detected.supportsStore,
    supportsReasoningEffort: model.compat.supportsReasoningEffort ?? detected.supportsReasoningEffort,
    maxTokensField: model.compat.maxTokensField ?? detected.maxTokensField,
    thinkingFormat: model.compat.thinkingFormat ?? detected.thinkingFormat,
    // ... 其余字段同样 "?? detected"
  };
}
```

### 生成脚本里硬编码的厂商级 quirks

那些探测覆盖不到、或要手工订正的差异，写在生成模型目录的脚本里。比如 Together 和 NVIDIA NIM（src/scripts/generate-models.ts:152 / 209）：

```ts
// Together 厂商级兼容预设：关掉 store/developer 角色/推理强度，用 max_tokens
const TOGETHER_BASE_COMPAT: OpenAICompletionsCompat = {
  supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false,
  maxTokensField: "max_tokens", supportsStrictMode: false, supportsLongCacheRetention: false,
};
// NVIDIA NIM 走 OpenAI 兼容，同样关掉这些能力
const NVIDIA_OPENAI_COMPAT = {
  supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false,
  maxTokensField: "max_tokens", supportsStrictMode: false, supportsLongCacheRetention: false,
};
```

### 回看第一篇的那张清单

现在可以逐条对上代码位置了：

- Cerebras / xAI / Chutes 不接受 store：经 isNonStandard 到 supportsStore: !isNonStandard（openai-completions.ts:1476、1507）。Mistral 走的是另一套 Conversations 协议，本来就没有 store 字段。
- Mistral / Chutes 用 max_tokens：Chutes 经 useMaxTokens（openai-completions.ts:1492）；Mistral 经 Conversations API 的 max_tokens。
- 不支持 developer 角色：OpenAI Responses 默认 supportsDeveloperRole:true，非标厂商在 model.compat 显式置 false；Completions 侧 useDeveloperRole = model.reasoning && compat.supportsDeveloperRole。
- Grok 不喜欢 reasoning_effort：isGrok 到 supportsReasoningEffort: !isGrok（openai-completions.ts:1501、1509）。
- 推理字段名不统一：统一抽象成 thinkingFormat 枚举（openai、openrouter、deepseek、together、zai、qwen、ant-ling 等十余种），在请求构造时展开成各异的字段。
- Google 不支持工具调用流式：functionCall 整体到达，前面第三节已经讲清。

所以"新增一个怪异厂商"往往很简单：在 detectCompat 里加一个 isXxx 判断，再在生成脚本里加一段 XXX_BASE_COMPAT。这是 pi-ai 把"拒绝不兼容厂商"换成"显式开关"的具体落地。

## 六、模型目录是怎么生成的

前面所有 Model 条目不是手写的，是构建期由脚本生成的。生成脚本在 src/scripts/generate-models.ts（约 3000 行），数据源有三层。

### 权威数据源

主数据源是 models.dev 的 API（src/scripts/generate-models.ts:1328）：

```ts
const response = await fetch("https://models.dev/api.json");  // 拉取权威模型元数据（优先级最高）
```

辅以 OpenRouter（https://openrouter.ai/api/v1/models）、NVIDIA NIM、Vercel AI Gateway，以及大量硬编码的 baseUrl 和手工修正。优先级是 models.dev 优于 OpenRouter：注释里写了 "models.dev has priority"。reasoning 档位图另由 models-dev-reasoning-options.ts 提供。

### 生成产物两条线

脚本跑完产出两类产物：

- JSON 分片：src/providers/data/<provider>.json，每个厂商一个，外加 .manifest.json（记录 schema 版本、结构 hash、各文件 hash）。
- TS 聚合：src/models.generated.ts 聚合所有 ./providers/<provider>.models.ts。每个 <provider>.models.ts 直接 import 对应的 JSON：

```ts
import values from "./data/openai.json" with { type: "json" };   // 直接 import 生成好的 JSON 分片
export const OPENAI_MODELS: ModelCatalog<typeof values, "openai"> =
  flattenModelCatalog("openai", values);   // 压平成统一的模型目录结构
```

### 条目形状与 as const 联合类型

每个模型条目带 contextWindow、input/output 单价（cost）、reasoning 标志、input 能力（text/image）、compat 覆盖等。关键在于它用 as const 推导出字面量联合类型：src/models.generated.ts 里的 MODELS 是 \`readonly "openai": typeof OPENAI_MODELS\` 这样的结构。于是 getBuiltinModel("openai", "gpt-5") 在编译期就能校验这个 id 是否合法，拼错字直接编译不过。

### 生成期校验

脚本不是生成完就完事。model-data.ts 的 validateModelDataDirectory（schema 版本 v3）会校验：provider 文件集合与聚合器一致、manifest 的 structureHash / 文件 hash 匹配、每个条目的 id / provider / api / name / baseUrl / reasoning / input / contextWindow / maxTokens / cost 字段齐全且类型正确。某条数据缺字段，生成会直接失败。

### 运行期加载

运行期，createModels()（src/models.ts:735）建一个空集合；builtinModels()（src/providers/all.ts:135）则把它和 40+ 个内置 provider 工厂一起注册进来：

```ts
export function builtinModels(options?) {
  const models = createModels(options);        // 建一个空模型集合
  for (const provider of builtinProviders()) {
    models.setProvider(provider);               // 把 40+ 个内置厂商工厂逐个注册进来
  }
  return models;                                // 返回可直接调用的完整模型集合
}
```

builtinProviders() 里列了 anthropic、openai、google、deepseek、groq、xai、mistral、together 等四十多个工厂。这就是为什么你 import 一个 builtinModels() 就能直接调几十家厂商的几百个模型。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="pi-ai"
      src="/images/childlike-sketch-pi-ai-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">接入瓶</span>
  </div>
  <p class="duang-whisper-body">Ollama 和 Anthropic 走同一条 createProvider 路。没有白名单，也就没有特权厂商。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 七、自定义模型与本地引擎接入

这一节是第一篇第二节"自托管模型工具调用坑"的工程答案：你自己的本地引擎（Ollama / vLLM / LM Studio）怎么接进 pi-ai。

### 没有 createOpenAICompatibleProvider 工厂

先说一个反直觉的点：pi-ai 不提供"一键注册 OpenAI 兼容端点"的工厂，也不内置"从纯文本里反解工具调用"的 parser。它只给你两个基础件：createProvider()（src/models.ts:762）和四个协议的 API 工厂函数（openAICompletionsApi() 等，都是 lazy 加载）。

所以"注册一个 Ollama / vLLM 端点"的写法和官方厂商完全一样：

```ts
import { createProvider, createModels } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";  // 懒加载 OpenAI Chat 协议实现

// 注册一个本地 Ollama 端点，写法和官方厂商完全一致
const ollama = createProvider({
  id: "ollama",                                      // 厂商 id
  name: "Ollama (local)",                            // 展示名
  baseUrl: "http://localhost:11434/v1",              // 本地引擎地址
  auth: { apiKey: envApiKeyAuth("Ollama key", ["OLLAMA_API_KEY"]) },  // 从环境变量读 key
  models: [{
    id: "llama3", name: "Llama 3", api: "openai-completions",   // 走 OpenAI Chat 兼容协议
    provider: "ollama", baseUrl: "http://localhost:11434/v1",
    reasoning: false, input: ["text", "image"], cost: {/* 单价 */},
    contextWindow: 8192, maxTokens: 4096,            // 上下文窗口与最大输出
  }],
  api: openAICompletionsApi(),                       // 绑定协议实现
});

const models = createModels();    // 建空集合
models.setProvider(ollama);       // 把自定义端点注册进去
```

官方厂商 anthropicProvider()（src/providers/anthropic.ts:43）是同一模式的"正式版"：createProvider({ ..., api: anthropicMessagesApi() })，只不过 models 来自预生成的 ANTHROPIC_MODELS。你的自定义端点和 Anthropic 走的是完全相同的注册路径，没有任何白名单限制。

### 自托管工具调用为什么能 work

关键在上一节那段 tool_calls 流式解析：pi-ai 依赖 OpenAI 兼容端点吐出结构化的 tool_calls 增量。只要你的 vLLM / Ollama 启用了 function calling，它吐出的 tool_calls 会被 parseStreamingJson 累积、边收边发 toolcall_delta，一路归一化到上层。如果某个本地模型只能输出"纯文本形式的工具调用"（不 emit 标准 tool_calls），pi-ai 这一层没有通用文本抽取器：要么让端点自身提供 OpenAI 兼容的 tool_calls，要么走 pi-messages 这种透传式自定义 API。

推理字段也一样：很多自托管端点把思考放在 reasoning_content / reasoning / reasoning_text 的不同字段，代码用"取第一个非空"策略避免重复（src/api/openai-completions.ts:494）。

### 自定义模型数据从哪来

models.json / registerProvider 的加载器不在 pi-ai 包内：它只出现在注释里，真正的 \~/.pi/agent/models.json 加载属于上层的 pi / agent 包。pi-ai 这边，createProvider 是统一入口；API key 用 envApiKeyAuth("...", ["YOUR_KEY"]) 解析；生成脚本的 --json-output 还会写一份 models.json 供上层消费。换句话说，你自己写扩展或上层配置时，最终都汇聚到 createProvider + 一个 API 工厂。

### 显式 quirk 覆盖：本地引擎要留心

接本地引擎时，别忘了 compat 覆盖。比如 vLLM 上推理和答案共享 max_tokens，如果没有 thinking token 预算，一个重推理的轮次可能把整个 max_tokens 吃光、最后不吐答案。这种情况要在模型上设 supportsThinkingTokenBudget: true（compat 里的开关，openai-completions.ts:596 有注释）。类似地，某个模型的思考格式特殊，也可以直接在 model.compat 里覆盖 thinkingFormat。

## 八、这一层设计哲学小结

把前面六节收一下，pi-ai 的哲学就一句话：统一抽象加显式 quirk 开关，而不是拒绝不兼容厂商。

- 统一抽象面：所有协议收敛到 Context 输入与 AssistantMessageEvent 输出；调用方只跟 Models 的四个方法打交道，provider 才拥有真正的 stream 行为。
- 差异转移为可覆盖开关：厂商差异不写死在业务 if/else，而是抽象成三个 Compat 接口，取值来自"URL 自动探测 加 逐模型 compat 覆盖"。
- 脏活集中、可组合：tool call id 规范化、thinking 签名、孤儿 tool result 合成、图像降级，全在 transformMessages；请求体差异集中在各协议的 buildParams。
- 开放注册：createProvider + lazy API 工厂，让 Ollama / vLLM / LM Studio 与官方厂商走完全相同路径。

代价也明确：维护这张 compat 矩阵是体力活，模型目录要靠脚本同步、不能手改（src/models.generated.ts 第一行就写着 "Do not edit manually"）。但换来的是"四协议归一、目录生成、自定义接入"三件事彼此正交：协议实现只管映射进统一事件，目录脚本只产带 compat 的 Model 数据，用户接入只调 createProvider。

## 九、下一篇预告与待解问题

下一篇是系列第 3/7 篇：pi-ai 之二，讲上下文对象结构、跨厂商上下文交接（签名 blob 回放）、中断与部分结果（AbortSignal）、工具结果分两份（TypeBox / AJV 校验）、流式 JSON 部分解析的细节。本篇留几个待解问题，下篇开头会逐条接住：

- Context 里的 Message 到底有哪几种 content block？text / thinking / toolCall / toolResult 各自长什么样？
- 跨厂商切换模型时，那个"签名 blob"是怎么生成、又怎么回放来保证 thinking 不丢的？
- 中断（AbortSignal）和"部分结果"在流式的 AssistantMessageEvent 里是怎么表达的？
- 工具结果为什么要"分两份"（TypeBox / AJV 校验）？不校验会出什么乱子？
- 流式 JSON 部分解析的边界在哪？参数还没传完时怎么保证能解析出可执行的部分？

## 十、面试高频考点清单

如果你去面 Agent / LLM infra 岗，pi-ai 这层常被问到的点（都和本篇讲的实际机制对应）：

- 为什么大厂 agent harness 普遍自研 LLM 抽象层，而不是直接用 Vercel AI SDK 这类库？：控制力更强、接口面更小、能跨厂商做一致测试矩阵，而不是被某个 SDK 的封装卡死诊断入口。
- 流式工具调用为什么要做 partial JSON 解析？：工具参数可以边收边执行，降低首 token 到首次工具调用的延迟，这正是 toolcall_delta 的存在意义。
- 跨厂商切换模型时，历史对话里的 tool call id 不一致会引发什么？：格式不符会被厂商 API 拒，所以要做 id 规范化；孤儿 tool call 还要注入合成结果兜底。
- prompt caching 在跨厂商怎么抽象？：有的用 Anthropic 式 cache_control，有的用 OpenAI 式 prompt_cache_retention，pi-ai 用 cacheControlFormat 等开关统一表达。
- 把 vLLM / Ollama 这类自托管引擎接进 agent 框架，要特别处理哪些点？：确保端点吐结构化 tool_calls、厘清 thinking 字段名（thinkingFormat）、给推理 token 设预算（supportsThinkingTokenBudget），否则容易不吐答案或工具调用解析失败。
