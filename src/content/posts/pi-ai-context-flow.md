---
author: Duang
pubDatetime: 2026-08-29T16:00:00+08:00
modDatetime: 2026-08-29T16:00:00+08:00
title: Pi 深度解析（三）：pi-ai 之二，上下文怎么在厂商之间流动
featured: false
draft: false
tags:
  - Pi 深度解析
description: 归一化之后，历史消息怎么在 Claude / GPT / Gemini 之间不丢、不串、不报错：上下文结构、跨厂商交接、签名回放、中断与工具分流。
revisions:
  - date: 2026-08-29
    note: 首发。飞书论述按原稿对齐；边注、动态图解与词卡另加，不改论述。
---

**系列说明**｜这是 [Pi 深度解析](/posts/pi-deep-dive/) 的第三篇（系列第 3/7）。上一篇：[pi-ai 之一：四种协议怎么被归一化成同一个接口](/posts/pi-ai-protocol-normalize/)。本篇仍在 `pi-ai`：历史对话这条消息流，怎么在 Claude / GPT / Gemini 之间安全流动。

Pi 深度解析系列进度：上一篇《pi-ai 之一》（系列第 2/7 篇）把四家厂商四种协议归一成了「Context 进去、AssistantMessageEvent 流出来」的统一接口，还讲了模型目录生成和自定义模型接入。本篇是系列第 3/7 篇，进入同一个 pi-ai 包的进阶机制：归一化之后，历史对话这条消息流本身，怎么在 Claude / GPT / Gemini 之间安全流动——上下文对象结构、跨厂商交接转换、签名 blob 回放、中断语义、工具结果分流、工具参数流式解析。下一篇（第 4/7 篇）进入 pi-agent-core，讲 agent loop、事件模型、消息队列、transport 抽象。

先接住上一篇结尾抛出来的几件事。第一篇第三节给 pi-ai 列的能力清单里，除了已经讲过的「四种协议归一、模型目录生成、compat 矩阵、自定义模型接入」，还剩四块没讲：跨厂商上下文交接、中断与部分结果、工具结果分两份、流式 JSON 部分解析。这些其实都在回答同一个问题：协议归一化解决的是「单次调用怎么发」，而本篇解决的是「一轮对话跨多次、跨多个厂商，消息怎么不丢、不串、不报错」。

上一篇的最小例子里，你传进 streamSimple 的是一个 Context，拿回来的是一串事件。但 Context.messages 里的每条消息，内部到底是什么形状？换模型时历史怎么转？中断时已有的内容去哪了？工具结果为什么既能喂模型又能喂 UI？本篇把这几点拆开讲透。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="handoff"
      src="/images/childlike-sketch-handoff-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">交接瓶</span>
  </div>
  <p class="duang-whisper-body">单次调用归一了，还没完。历史要能换厂，才叫真的通。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 一、上下文对象：贯穿全栈的统一内部表示

pi-ai 不依赖任何厂商的消息格式。它定义了一套自己的内部消息表示，所有厂商适配器都在「内部表示」和「厂商线格式」之间做转换。这套内部表示的核心是两个类型：输入用的 Context，和贯穿全栈的 Message 联合。

```ts
// 统一的输入上下文：系统提示单独抽离，messages 是内部消息数组
export interface Context {
  systemPrompt?: string;        // 系统提示词，是独立字段（消息里没有 system 这个 role）
  messages: Message[];          // 贯穿全栈的规范化内部表示
  tools?: Tool[];               // 工具定义列表
}

// 消息联合类型：只有三种 role，没有 system
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

这里有个反直觉但很重要的点：Message 联合里没有 "system" 这个 role。系统提示不混在消息流里，而是 Context 的独立顶层字段。原因很实际——OpenAI 把 system 当第一条 message，Anthropic 用独立的 system 字段，Google 又塞进 contents 的 systemInstruction。如果内部表示也搞一个 system role，那每次转换都要在「独立字段」和「消息数组」之间搬来搬去。pi-ai 直接让 systemPrompt 独立，各厂商适配器自己决定怎么塞进自家请求体。后面第四节会看到，transformMessages 也不动 systemPrompt，它只管 messages 数组。

<details class="marginalia" open>
  <summary>没有 system role</summary>
  <div class="marginalia-body">
    系统提示抽成 Context.systemPrompt，是因为三家塞法完全不同。混进 messages，换厂就要搬格式。
  </div>
</details>

另外，这套 Message 联合本身就是「内部表示」，pi-ai 没有再定义一层「内部 Message」和「外部 Message」——Context.messages 经由每个厂商的 convertMessages / transformMessages 变成线格式，但类型始终是同一个 Message。这就保证了上层（pi-agent-core、pi-tui）拿到的消息形状永远一致，不管背后是哪个厂商。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：Context · system 不进消息流</p>
  <p class="article-embed-note-lead">上层永远看见同一套 Message。systemPrompt 单独搁着，各厂自己决定怎么塞进请求体。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="systemPrompt 独立，messages 只有三种 role">
        <rect class="mixup-panel is-accent" x="24" y="36" width="160" height="130" rx="12"/>
        <text class="mixup-title" x="104" y="88" text-anchor="middle">systemPrompt</text>
        <text class="mixup-caption" x="104" y="114" text-anchor="middle">独立字段</text>
        <rect class="mixup-panel" x="220" y="36" width="120" height="130" rx="12"/>
        <text class="mixup-title" x="280" y="88" text-anchor="middle">user</text>
        <rect class="mixup-panel is-accent" x="356" y="36" width="120" height="130" rx="12"/>
        <text class="mixup-title" x="416" y="80" text-anchor="middle">assistant</text>
        <text class="mixup-caption" x="416" y="108" text-anchor="middle">text / thinking</text>
        <text class="mixup-caption" x="416" y="128" text-anchor="middle">toolCall</text>
        <rect class="mixup-panel" x="492" y="36" width="124" height="130" rx="12"/>
        <text class="mixup-title" x="554" y="88" text-anchor="middle">toolResult</text>
      </svg>
    </div>
  </figure>
  <p class="article-embed-note-foot">transformMessages 只管 messages 数组，不动 systemPrompt。</p>
</section>

## 二、一条 assistant 消息由哪些块拼成

Message 三种角色里，user 最简单（纯文本或文本+图片），toolResult 留到第三节讲。最复杂的是 assistant：它的 content 不是一整段字符串，而是一组「内容块」的数组，可能混合文本、思考、工具调用。

```ts
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];  // 三类内容块按顺序排列
  api: Api;                        // 来自哪个协议（openai-completions / anthropic-messages ...）
  provider: ProviderId;           // 来自哪个厂商
  model: string;                  // 模型 id
  usage: Usage;                   // token 用量（input/output/cacheRead/cacheWrite）
  stopReason: StopReason;         // 停止原因
  // 还有 responseId / diagnostics / deferred / errorMessage 等可选字段，用于调试与恢复
  timestamp: number;              // Unix 毫秒
}
```

content 数组里的块类型各有判别字段 type：

```ts
export interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;         // OpenAI responses 的消息元数据（legacy id 或 TextSignatureV1）
}
export interface ThinkingContent {
  type: "thinking";
  thinking: string;               // 推理文本
  thinkingSignature?: string;     // 厂商特定的推理回放数据（加密或不透明）
  redacted?: boolean;             // true=被安全滤波抹除，密文存在 thinkingSignature 供多轮回放
}
export interface ToolCall {
  type: "toolCall";
  id: string;                     // 工具调用 id（跨厂商格式不同，见第四节）
  name: string;                  // 工具名
  arguments: Record<string, any>; // 参数对象（流式增量累积而来，见第七节）
  thoughtSignature?: string;     // Google 专用：复用思想上下文的不透明签名
  namespace?: string;            // OpenAI Responses 动态/命名空间工具
}
```

stopReason 是个字符串枚举，取值就这几个：

```ts
export type StopReason =
  | "pending"    // 还没开始
  | "stop"       // 正常说完
  | "length"     // 达到 max_tokens 截断
  | "toolUse"    // 停下来等工具结果
  | "error"      // 出错
  | "aborted"    // 被中断（见第六节）
  | "deferred";  // 延迟工具（原生异步工具，等回查）
```

注意 stopReason 里没有 "toolResult" 这种值——工具结果是独立的 ToolResultMessage，不是 assistant 消息的停止原因。这一点后面讲中断和跨厂商交接时会反复用到。

## 三、工具结果的两个面：给模型的 content，给 UI 的 details

工具跑完之后，结果要同时服务两个消费者：模型需要一段它能读懂的文本（塞回对话继续推理），UI 需要一段能渲染的富内容（高亮、表格、图片、折叠树）。如果只给一份字符串，UI 就得自己从文本里反向解析结构，既脆弱又重复。pi-ai 在类型层就把这两面拆开：

```ts
export interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;             // 对应哪个工具调用
  toolName: string;              // 工具名
  content: (TextContent | ImageContent)[];  // 给模型的文本/图片（即"output"）
  details?: TDetails;            // 给 UI 的富内容，pi-ai 完全不解释
  usage?: Usage;                 // 工具自身用量，不计入主 LLM 上下文
  isError: boolean;              // 是否出错
  timestamp: number;
}
```

关键要澄清：给模型的字段叫 content（不是 output），给 UI 的叫 details。pi-ai 这一层只定义这个契约，并不负责把工具执行结果「拆」成这两份——它没有去生成 details 的逻辑，transformMessages 对 toolResult 只重写 toolCallId，从不碰 content/details。真正的分流发生在 pi-agent-core 的工具实现与 agent loop 里：

```ts
// pi-agent-core：工具执行完后，把结果分成两面再包成 ToolResultMessage
function createToolResultMessage(finalized: FinalizedToolCallOutcome): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: finalized.toolCall.id,
    toolName: finalized.toolCall.name,
    content: finalized.result.content ?? [],   // 给模型的文本（pi-ai 要求的 content）
    details: finalized.result.details,         // 给 UI 的富内容
    usage: finalized.result.usage,
    isError: finalized.isError,
    timestamp: Date.now(),
  };
}
```

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：工具结果 · content 喂模型，details 喂 UI</p>
  <p class="article-embed-note-lead">pi-ai 只定契约。真正劈成两面的逻辑在 pi-agent-core。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 200" role="img" aria-label="工具结果分成 content 和 details">
        <rect class="mixup-panel" x="24" y="50" width="150" height="100" rx="12"/>
        <text class="mixup-title" x="99" y="100" text-anchor="middle">工具跑完</text>
        <rect class="mixup-pipe" x="186" y="86" width="60" height="24" rx="10"/>
        <circle class="mixup-dot is-live" cx="216" cy="98" r="5"/>
        <rect class="mixup-panel is-accent" x="262" y="36" width="150" height="128" rx="12"/>
        <text class="mixup-title" x="337" y="88" text-anchor="middle">content</text>
        <text class="mixup-caption" x="337" y="114" text-anchor="middle">给模型读</text>
        <rect class="mixup-panel is-soft" x="438" y="36" width="176" height="128" rx="12"/>
        <text class="mixup-title" x="526" y="88" text-anchor="middle">details</text>
        <text class="mixup-caption" x="526" y="114" text-anchor="middle">给 UI 渲染</text>
      </svg>
    </div>
  </figure>
  <p class="article-embed-note-foot">原始日志别塞进 content，窗口会当场被撑穿。</p>
</section>

这样分层的好处是：pi-ai 保持「只定义契约、不碰工具逻辑」的薄抽象，而上层既能默认工作（content 喂模型），也能精细控制（details 喂 UI）。下一篇讲 pi-agent-core 时你会看到工具实现怎么同时产出这两份。

## 四、跨厂商交接：同模型 vs 跨模型的核心策略

换模型是最容易翻车的时刻。历史对话里既有上一家的 thinking 签名、又有上一家格式的 tool call id，直接原样发给新厂商，十有八九被拒。这份脏活集中在 transformMessages（src/api/transform-messages.ts:64）。它的核心策略只有一句话：同模型才保留签名，跨模型就降级。

先做两件事：把 content 为 null 的消息归一化成空数组（兼容手写历史/旧 session 文件），把当前模型不支持的图片降级成占位文本。然后逐条消息转换，user 和 toolResult 基本透传，重点在 assistant。

```ts
export function transformMessages(messages: Message[], model: Model, normalizeToolCallId?) {
  const toolCallIdMap = new Map<string, string>();   // 原 id -> 规范化 id
  // 先归一化空 content，再降级不支持的图片
  const normalizedMessages = messages.map((m) => (m.content == null ? { ...m, content: [] } : m));
  const imageAwareMessages = downgradeUnsupportedImages(normalizedMessages, model);

  return imageAwareMessages.map((msg) => {
    if (msg.role !== "assistant") return msg;          // user / toolResult 透传
    const assistantMsg = msg as AssistantMessage;
    // 同模型：厂商 + 协议 + 模型 id 全一致才算
    const isSameModel =
      assistantMsg.provider === model.provider &&
      assistantMsg.api === model.api &&
      assistantMsg.model === model.id;

    return {
      ...assistantMsg,
      content: assistantMsg.content.flatMap((block) => {
        if (block.type === "thinking") {
          if (block.redacted) return isSameModel ? block : [];        // 抹除推理仅同模型可回放
          if (isSameModel && block.thinkingSignature) return block;  // 同模型带签名保留（即便文本为空）
          if (!block.thinking || block.thinking.trim() === "") return [];  // 空思考块丢弃
          if (isSameModel) return block;
          return { type: "text" as const, text: block.thinking };     // 跨模型转纯文本
        }
        return block;
      }),
    };
  });
}
```

这段逻辑把「思考」的三种命运分清楚了：被安全滤波抹除的（redacted）只同模型能回放，跨模型直接丢；同模型且带签名（包括 OpenAI 那种文本为空、只有加密推理的）原样保留；空思考块丢弃；跨模型没签名的思考块降级成纯文本——因为新厂商读不懂这家的推理格式，但文本本身还有用。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：thinking · 同模型留签名，跨模型降级</p>
  <p class="article-embed-note-lead">厂商 + 协议 + 模型 id 全一致才算同模型。密文绑的是权重，换厂喂回去会 400。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="同模型保留签名，跨模型降级或丢弃">
        <rect class="mixup-panel is-accent" x="28" y="40" width="250" height="120" rx="12"/>
        <text class="mixup-title" x="153" y="88" text-anchor="middle">同模型</text>
        <text class="mixup-caption" x="153" y="116" text-anchor="middle">签名原样回放</text>
        <rect class="mixup-panel is-soft" x="362" y="40" width="250" height="120" rx="12"/>
        <text class="mixup-title" x="487" y="80" text-anchor="middle">跨模型</text>
        <text class="mixup-caption" x="487" y="108" text-anchor="middle">思考转纯文本</text>
        <text class="mixup-caption" x="487" y="132" text-anchor="middle">redacted 直接丢</text>
      </svg>
    </div>
  </figure>
  <p class="article-embed-note-foot">想让模型看见自己刚才怎么想的来续写，换厂之后只能接受降级。</p>
</section>

tool call 块还要处理两件事：跨模型剥离 Google 的 thoughtSignature，以及跨模型规范化 tool call id。

```ts
        if (block.type === "toolCall") {
          let tc: ToolCall = block;
          // 跨模型：剥掉 Google 专用的 thoughtSignature（新厂商用不上）
          if (!isSameModel && tc.thoughtSignature) {
            tc = { ...tc };
            delete (tc as { thoughtSignature?: string }).thoughtSignature;
          }
          // 跨模型：触发 id 规范化回调（OpenAI Responses 的 450+ 字符长 id 必须改短）
          if (!isSameModel && normalizeToolCallId) {
            const id = normalizeToolCallId(tc.id, model, assistantMsg);
            if (id !== tc.id) { toolCallIdMap.set(tc.id, id); tc = { ...tc, id }; }
          }
          return tc;
        }
```

为什么 tool call id 要专门规范化？因为 OpenAI Responses 生成的 id 是 450+ 字符、带管道符的长串，而 Anthropic 要求匹配 `^[a-zA-Z0-9_-]+$`、最长 64 字符。不规范化，跨厂商切换时工具调用和它的结果就对不上，API 直接报错。各厂商在 convertMessages 里提供自己的 normalizeToolCallId（OpenAI Responses 拆长 id 加 fc_ 前缀、Anthropic 正则校验、Google 替换非法字符并截断 64）。

最后还有两个兜底：跳过 error/aborted 的残缺轮次，以及给孤儿 tool call 注入合成结果。

```ts
// 跳过 error / aborted 的不完整轮次：可能只有推理没有正文、工具调用残缺
// 重放会触发 API 报错（如 OpenAI "reasoning without following item"）
if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
  continue;
}

// 为没有对应结果的孤儿 tool call 注入合成结果，满足 API 顺序要求
result.push({
  role: "toolResult",
  toolCallId: tc.id,
  toolName: tc.name,
  content: [{ type: "text", text: "No result provided" }],
  isError: true,
  timestamp: Date.now(),
} as ToolResultMessage);
```

有了这两条兜底，模型重新发起调用时不会因为「挂空的工具调用」或「上轮没跑完的残片」被拒。注意第一节说的 stopReason 里没有 "toolResult"——这里 error/aborted 的判定正是基于 stopReason 这个独立字段，和工具结果消息是两回事。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="handoff"
      src="/images/childlike-sketch-handoff-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">签名瓶</span>
  </div>
  <p class="duang-whisper-body">同模型才肯认那块蜡封。换厂硬喂，请求当场 400。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 五、签名 blob 回放：让推理在多轮里连续

很多厂商的推理（thinking/reasoning）不是白送的——要在下一轮把推理「接上」，必须回传厂商下发的一段不透明签名。这段签名在不同厂商叫不同名字、存在不同字段，pi-ai 把它们统一收进 ThinkingContent.thinkingSignature（或被抹除时存密文），并在请求重建时按各家格式塞回去。

Anthropic 的 thinking 有 signature 字段。流式时每个 content_block 的 signature 增量被累积进 thinkingSignature；请求重建时原样塞回 thinking 块的 signature：

```ts
// 流式捕获：每个 delta 的 signature 增量追加到块上
block.thinkingSignature = block.thinkingSignature || "";
block.thinkingSignature += event.delta.signature;

// 请求重建：把签名原样塞回 thinking 块的 signature 字段
const hasThinkingSignature = !!thinkingSignature && thinkingSignature.trim().length > 0;
if (!hasThinkingSignature) {
  blocks.push({ type: "thinking", thinking: ..., signature: "" });
} else {
  blocks.push({ type: "thinking", thinking: ..., signature: thinkingSignature });  // 带回放签名
}
```

被安全滤波抹除的推理（redacted thinking）也走 thinkingSignature：密文存在这里，请求时还原成 redacted_thinking 块。这正是为什么第四节里 redacted 块「仅同模型可回放」——密文只对该模型有效。

OpenAI Responses 的加密推理叫 encrypted_content。请求时显式要求回放密文，流式完成时把整个 reasoning item 序列化进 thinkingSignature：

```ts
// 请求时显式要求回放密文
params.include = ["reasoning.encrypted_content"];

// 流式完成时把整个 reasoning item 序列化进 thinkingSignature
slot.block.thinkingSignature = JSON.stringify(item);

// 回放时反序列化并作为 reasoning item 推回
if (block.thinkingSignature) {
  const reasoningItem = JSON.parse(block.thinkingSignature) as ResponseReasoningItem;
  output.push(reasoningItem);
}
```

Google 则用 thoughtSignature，且规则更严：必须同 provider+同 model、且是合法 base64 才保留，否则丢弃。这保证跨模型不会把一串无效签名带过去。

```ts
// 同 provider+model 才保留 thoughtSignature，且必须合法 base64
function resolveThoughtSignature(isSame: boolean, sig?: string): string | undefined {
  return isSame && isValidThoughtSignature(sig) ? sig : undefined;
}
```

把这三家放一起看，pi-ai 的做法很清楚：不试图理解签名里是什么，只把它当「不透明 blob」存进 thinkingSignature，再按各家要求还原。这样既让推理在多轮里连续，又不把厂商的加密格式泄露到上层类型里。

<details class="marginalia interview" open>
  <summary>不透明 blob</summary>
  <div class="marginalia-body">
    上层类型里看不见 Anthropic signature / OpenAI encrypted_content / Google thoughtSignature 三套名字。只看见 thinkingSignature。
  </div>
</details>

## 六、中断语义：AbortSignal 怎么一路透传

用户按 Ctrl-C、UI 关掉面板、上层决定换策略，都可能要中断一次正在流的调用。pi-ai 把中断编码进流协议本身，而不是靠抛异常逃逸。

入口处，signal 从 ProviderRequestOptions.signal 一路透传到 provider.stream。complete 只是 stream 的收尾：

```ts
// stream 把 signal 透传到 provider，complete 只是 stream().result()
stream(model, context, options?) {
  return lazyStream(model, async () => {
    const provider = this.requireProvider(model);
    return provider.stream(requestModel, context, requestOptions);  // signal 在 requestOptions 里
  });
}
async complete(model, context, options?) {
  return this.stream(model, context, options).result();  // 收尾，拿到完整 AssistantMessage
}
```

适配器内部有两处处理中断。流开始前若已 abort，直接抛错短路；流中捕获中断，归一化成 stopReason:"aborted" 并 emit 一个 error 事件：

```ts
// 流开始前若已 abort，直接抛错短路
if (options?.signal?.aborted) {
  throw new Error("Request was aborted");
}

// 流中捕获中断：归一化为 aborted 并 emit error 事件（携带当前部分内容）
output.stopReason = options?.signal?.aborted ? "aborted" : "error";
output.errorMessage = formatProviderError(error);
stream.push({ type: "error", reason: output.stopReason, error: output });  // error 事件带部分 AssistantMessage
stream.end();
```

这里的关键设计是：error 事件的 error 字段不是个简单错误，而是「当前这个带部分内容的 AssistantMessage」。也就是说，中断瞬间模型已经吐出的文本、思考、工具调用，全部被保留在 error 里，上层可以检查、可以续上。而且 stopReason 把 "aborted"（用户取消）和 "error"（真实失败）区分开——下一轮 transformMessages 会跳过 aborted 的残缺轮次，但上层能明确知道这是「被打断」而非「出错」。

网络层也透传 signal：Google 设 config.abortSignal，Bedrock 把 signal 传给 client.send 的 abortSignal 选项。整条链路没有一处把中断吞掉。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      data-bottle-id="handoff"
      src="/images/childlike-sketch-handoff-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">中断瓶</span>
  </div>
  <p class="duang-whisper-body">点停止不是空。半段字还在 error 里，只是标了 aborted。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 七、工具参数流式渐进解析：边收边执行

回到第一篇说的「工具结果分两份、流式 JSON 部分解析」。参数 JSON 是逐片到达的，pi-ai 必须在 JSON 还没收完时就能解析出「目前已经能读的部分」，工具才能边收边校验、边收边执行。这个能力落在 parseStreamingJson。

```ts
// 四层兜底：完整修复 → 部分解析 → 修复后部分解析 → 空对象
export function parseStreamingJson(partialJson: string | undefined) {
  if (!partialJson || partialJson.trim() === "") return {} as any;  // 空输入直接空对象
  try {
    return parseJsonWithRepair(partialJson);          // 1) 先尝试完整修复解析
  } catch {
    try {
      return partialParse(partialJson) ?? {};         // 2) 失败→容错部分解析（partial-json 库）
    } catch {
      try {
        return partialParse(repairJson(partialJson)) ?? {};  // 3) 再试"修复后的"部分解析
      } catch {
        return {} as any;                              // 4) 兜底空对象，绝不抛错
      }
    }
  }
}
```

repairJson 自己是个字符级扫描器，专门处理流式 JSON 常见的破损：裸控制字符转义、非法转义前的反斜杠翻倍。所以它既能修整段也能修片段。四层兜底保证了：哪怕参数收到一半、引号没闭合、反斜杠截断，也能尽量给出一个「目前能解析的对象」，实在不行就返回空对象而不是让整个流崩掉。

<section class="article-embed-note pi-figure">
  <p class="article-embed-note-title">图解：parseStreamingJson · 四层兜底，绝不把流弄崩</p>
  <p class="article-embed-note-lead">缺括号、字符串没写完、尾巴多逗号，先修再解析。实在不行给空对象。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 170" role="img" aria-label="四层 JSON 解析兜底">
        <rect class="mixup-chip" x="16" y="36" width="140" height="88" rx="10"/>
        <text class="mixup-title" x="86" y="78" text-anchor="middle">1 完整修复</text>
        <rect class="mixup-chip" x="172" y="36" width="140" height="88" rx="10"/>
        <text class="mixup-title" x="242" y="78" text-anchor="middle">2 部分解析</text>
        <rect class="mixup-chip" x="328" y="36" width="150" height="88" rx="10"/>
        <text class="mixup-title" x="403" y="78" text-anchor="middle">3 修后再部分</text>
        <rect class="mixup-chip is-accent" x="494" y="36" width="130" height="88" rx="10"/>
        <text class="mixup-title" x="559" y="78" text-anchor="middle">4 空对象</text>
      </svg>
    </div>
  </figure>
</section>

在 OpenAI Completions 的适配器里，每个 delta 把增量参数追加到 partialArgs 缓冲，并立刻用 parseStreamingJson 解析出当前可消费的 arguments，同时 emit toolcall_delta：

```ts
// 每个 delta 把增量参数追加到 partialArgs 缓冲，并立即解析出当前可消费的 arguments
let delta = "";
if (toolCall.function?.arguments) {
  delta = toolCall.function.arguments;
  block.partialArgs = (block.partialArgs ?? "") + toolCall.function.arguments;
  block.arguments = parseStreamingJson(block.partialArgs);  // 增量即解析
}
stream.push({ type: "toolcall_delta", contentIndex: ..., delta, partial: output });  // 边收边发

// 到 toolcall_end 再最终化一次，并清理 partialArgs 这个临时缓冲（不持久化）
block.arguments = parseStreamingJson(block.partialArgs);
delete block.partialArgs;  // 只解析态用，回放只带解析后的 arguments
```

因为每个 toolcall_delta 都带着「已尽力解析」的 arguments 对象，消费方（agent loop）在流没结束时就拿到了逐步完整的参数，工具可以边收边校验 schema、边收边执行。到 toolcall_end 再最终化一次并清掉 partialArgs 这个临时缓冲，保证持久化和回放时只带干净的 arguments，不带上中间的脏缓冲。

## 八、这一层的设计取舍

把上下文、中断、工具三块放一起，pi-ai 的取舍和前两篇一脉相承：薄抽象 + 显式覆盖，而不是拒绝不兼容厂商。

上下文上，它用一套 Message 联合类型作为内部表示，transformMessages 不是「转换格式」而是「规范化 + 跨模型策略决策」——图片降级、thinking 保留/转文本/丢弃、thoughtSignature 剥离、toolCallId 规范化、孤儿 toolCall 合成、error/aborted 跳过，全部以「同模型才保留签名、跨模型就降级」为核心。各厂商再在其上做线格式转换。

中断上，信号从 ProviderRequestOptions.signal 透传到 provider.stream，并在 complete 处收敛为 stream().result()，中断语义被编码进流协议本身（error 事件携带 reason:"aborted" 与部分 AssistantMessage），让上层能区分「用户取消」和「真实失败」，且中断中间态可被下一轮安全丢弃。

工具上，类型层把「给模型的 content」和「给 UI 的 details」显式分离，但分流逻辑完全交给 pi-agent-core；参数解析用 parseStreamingJson 的四层容错兜底，让「边收边解析、边收边执行」在不完整 JSON 上也能成立。

一句话：pi-ai 把厂商差异显式摊开成可覆盖的字段与回调（thinkingSignature / thoughtSignature / encrypted_content / redacted / normalizeToolCallId / allowEmptySignature…），而不是用一层厚抽象去抹平。这样上层既能默认工作，也能逐厂商精细控制。

## 九、下一篇预告与待解问题

本篇把 pi-ai 包的「上下文 / 中断 / 工具」讲完了，但有个核心问题一直没碰：这些消息块、事件、工具调用，到底被谁驱动着一轮轮跑起来？答案是 pi-agent-core 的 agent loop。下一篇（第 4/7 篇，pi-agent-core）我会逐行读 agent loop，讲清：事件订阅模型（简化事件系统）、两种消息队列模式（一次一条 / 一次全部）、transport 抽象（本地直接跑 vs 通过代理跑），以及工具结果怎么在那一层被真正分成 content 和 details。它也是后面 RPC 模式和 Web UI 的基础。

本篇留几个待解问题，下一篇会陆续接住：

- agent loop 怎么把 AssistantMessageEvent 流重新组装成一条 Message 存进历史？
- 工具调用 emit 之后，loop 怎么等结果、怎么把结果塞回 Context 再发起下一轮？
- transport 抽象怎么做到「本地跑」和「远程代理跑」同一套代码？
- context 压缩（历史太长怎么裁剪）是在哪一层做的？

## 十、几个关键机制，展开讲透

前面几节把机制铺开了，但有几个点容易一眼带过、真写代码时踩坑。这一节不考你，直接把「为什么这样设计、实际会出什么错」说清楚。

### 1. 内部 Message 为什么没有 system role

pi-ai 的 Message 联合类型里只有 user、assistant、toolResult 三种 role，压根没有 system。系统提示被抽成了 Context 上的独立字段 systemPrompt，而不是 messages 数组里的一条消息。原因是三家对 system 的处理完全不同：Anthropic 要求 system 走请求顶层的数组、OpenAI 把它塞进 messages 当 developer 或 user 角色、Google 用 systemInstruction 字段。如果把 system 当成普通消息写进 messages，跨厂商切换时就得每次手动改格式。抽成 Context.systemPrompt 之后，transformMessages 按目标 api 自动决定怎么塞——你只写一次，换模型不用动。实际观察：你永远不需要在 messages 里手动放 system 消息，漏了也不会报错，只是模型收不到系统提示。

### 2. 换个模型，一段 thinking 会经历什么

thinking（思考过程）不是普通文本，它带着厂商的加密签名。同模型继续对话时，Anthropic 的 thinkingSignature、OpenAI 的 encrypted_content、Google 的 thoughtSignature 会被原样保留并回传，模型能验证这段思考确实出自自己、且没被篡改。一旦换成不同模型，这些签名就失效了——加密绑定了具体模型权重，跨模型喂回去要么被拒、要么直接 400。所以 transformMessages 的策略是「同模型才保留签名，跨模型就降级」：把 thinking 转成纯文本（丢了可回放签名）继续参与上下文，或干脆丢弃 redacted thinking 块。redacted thinking 尤其严格，它只能在生成它的那个模型上回放，换个模型连降级都做不到，只能丢。常见坑：你想让模型看到自己刚才怎么想的来续写，但换了模型后那段思考变成不可回放的密文，必须接受降级成纯文本。

### 3. tool call id 为什么必须规范化

工具调用靠 id 把「模型发起的 toolcall」和「你返回的 tool result」配对。问题是各厂商的 id 格式不统一：OpenAI Responses 给的是 fc_xxx 这种带前缀的长串，Anthropic 接受任意字符串，而很多本地引擎（Ollama、vLLM、DeepSeek 兼容端点）只认数字或很短的 id。如果模型吐的 id 和目标厂商格式对不上，你回传的 tool result 就匹配不上，厂商直接 400。transformMessages 用 normalizeToolCallId 回调统一 id 空间——同一次对话里，不管底层厂商给什么格式，pi-ai 内部用一套规整后的 id，回放时再映射回去。常见坑：你手动拼 tool result、自己编了 id 没走规范化，跨厂商切换就配对失败。

### 4. 为什么要跳过失败消息、给孤儿 tool call 补结果

历史消息必须一对一对齐：每条 assistant 的 toolcall 都得有对应的 tool result，否则厂商 API 直接拒绝。transformMessages 在重建上下文时做两件保洁：第一，跳过 stopReason 为 error 或 aborted 的 assistant 消息——这些是失败或被中断的回合，内容残缺，塞回历史既会让模型困惑也可能被厂商拒；第二，遇到孤儿 tool call（模型 emit 了 toolcall 但没拿到 id/name，或者整个回合中断没产生 result），注入一条合成的 tool result，内容是 No result provided 且标记 isError:true。这样消息对闭合，历史始终干净，下一轮发起请求不会因为缺 result 而 400。常见坑：你以为中断后什么都不用管，但如果那段残缺的 toolcall 残留在历史里没被注入合成 result，下一轮请求必挂。

### 5. 中断时拿到的「部分消息」是什么

中断往往发生在文本或工具流到一半：用户点了停止，此时模型可能已经吐了半段文字或一个不完整的工具参数。pi-ai 不会把这场中断当成什么都没发生，而是 emit 一个 error 事件，error 字段里携带一条 reason 为 aborted、但装着已生成部分内容的 AssistantMessage。上层拿到它有两个选择：直接丢弃（下一轮从头来），或者保留这段残缺内容续写。reason:"aborted" 这个标记很关键——它让上层能区分用户主动取消和真实网络/模型异常，后者 reason 是 error。实际观察：你 abort 之后拿到的不是空对象，而是一条可能残缺的 AssistantMessage，里面 partial 内容就是中断前流出来的那部分。

### 6. content 和 details 到底分别给谁

工具跑完，结果分成两面：content 是喂给模型的纯文本——模型只能读文本，所以这里放模型决策要用的结论（比如查到余额 128 元）；details 是给 UI 渲染的富结构——图片、链接、状态条、原始 JSON，模型读不到，但界面能漂亮地展示。真正把结果劈成这两面的逻辑不在 pi-ai，而在 pi-agent-core：工具执行完返回 details，agent-core 抽出 content 给模型、把 details 交给 UI 层。pi-ai 这一层只定义 ToolResultMessage 的 output/details 字段形状，不负责分流。常见坑：把整个大对象（比如几百行原始日志）塞进 content，会瞬间撑爆上下文窗口；正确做法是 content 只放模型要的结论，原始数据放 details。

### 7. parseStreamingJson 的四层兜底为什么必要

工具参数往往是模型一边生成一边往下吐的，你拿到的 JSON 经常是残缺的：少了闭合括号、字符串没写完、末尾多了个逗号、数字被截断。parseStreamingJson 做四层容错兜底分别接住这些情况——缺括号就补上、字符串未结束就当成完整串、尾随逗号忽略、截断的数字就近取整。它支撑的是边收边执行：每收到一点参数就尝试解析，一旦解析出完整对象，工具立刻开跑，不用等整个流结束。这意味着模型工具参数还没吐完，你的工具可能已经预执行了一半。常见坑：你以为必须等流结束才能调工具，其实有了部分解析，工具可以提前动起来，延迟更低；但代价是工具可能基于不完整参数先跑，需要你的工具实现能容忍重试或幂等。
