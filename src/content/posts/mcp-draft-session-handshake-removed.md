---
author: Duang
pubDatetime: 2026-07-28T16:00:00+08:00
title: MCP 草案改了什么：会话和握手都被删掉了
draft: false
tags:
  - 最新速递
  - Agent
  - 拆解
description: 本文整理自 MCP 官方规范草案变更日志，对比 2025-11-25 版本，重点看会话、握手、MRTR 和迁移影响。
---
> 本文整理自 MCP 官方规范草案的变更日志（对比上一个版本 2025-11-25），原文见 [Key Changes](https://modelcontextprotocol.io/specification/draft/changelog#major-changes)。
>

我平时扫一眼 MCP 的变更日志，几分钟就翻完了，大多是加个字段、改个措辞。这次翻不动。相对 2025-11-25 版本，草案动的是协议的核心模型：会话没了，握手没了，服务端不能再反向给客户端发请求，连断流重连的能力也被拿掉了。这不是打补丁，是重新画了一遍地基。

如果你手里有正在跑的 MCP server 或客户端，这份改动会直接落到你的架构选择上，值得一条一条读完。下面把变更日志里的内容按主题重新组织了一遍，并在每一块后面补上它对实现意味着什么。

## 先回顾：本来的 MCP 是什么样的

在读改动之前，先把旧模型摆清楚，否则很难体会这次动的到底是哪根筋。

旧版 MCP 的运行方式是这样的：客户端先和服务端建立连接，发一个 `initialize`，把自己支持的协议版本、能力和身份报过去；服务端回一个 `InitializeResult`，报上自己的能力和身份；客户端再发一个 `notifications/initialized` 表示握手完成。这套开场白走完，一个会话就成立了，服务端下发 `Mcp-Session-Id`，客户端后续每个请求都带上它。

会话成立之后，双方都记住了对方是谁。这带来几个很好用、但也很贵的能力：服务端可以按会话身份给不同客户端返回不同的 `tools/list`；可以另开一条 HTTP GET 上的 SSE 长连推送变更通知，配合 `resources/subscribe` 订阅具体资源，断线了还能用 `Last-Event-ID` 从断点续传；可以用 `ping` 给这条长连接保活；`logging/setLevel` 设一次，整个会话的日志级别就定了。

最关键的是连接是双向的。服务端处理到一半发现信息不够，可以反过来给客户端发请求：用 `roots/list` 问客户端本地有哪些目录，用 `sampling/createMessage` 借客户端的模型跑一次推理，用 `elicitation/create` 向用户要一个输入。这段时间里，服务端一直挂着这次调用的上下文等结果。

<section class="article-embed-note">
  <p class="article-embed-note-title">旧版 MCP 会话生命周期（图解）</p>
  <div class="article-diagram-head">
    <span>客户端 Client</span>
    <span>服务端 Server</span>
  </div>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>阶段 1，握手开始</b></p>
      <p>客户端发送 `initialize`，携带协议版本、客户端能力和 `clientInfo`。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>阶段 2，握手返回</b></p>
      <p>服务端返回 `InitializeResult`，携带服务端能力和 `serverInfo`。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>阶段 3，会话成立</b></p>
      <p>客户端发送 `notifications/initialized`，服务端下发 `Mcp-Session-Id`。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>阶段 4，正常调用</b></p>
      <p>客户端调用 `tools/list` 和 `tools/call`，返回结果可随会话身份变化。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>阶段 5，服务端反向请求</b></p>
      <p>服务端可发起 `roots/list`、`sampling/createMessage`、`elicitation/create`，等待客户端补齐信息。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">核心特征：状态由连接和会话隐式携带，部署上云时需要会话粘滞。</p>
</section>

这套模型在本地 stdio 场景下非常自然：一个进程对一个进程，连接就是进程的生命周期，状态放内存里就行。问题出在上云之后 —— 会话状态得存在某处，负载均衡得保证同一会话的请求落到同一个实例，滚动发版一重启，所有客户端的会话全都作废。草案要拆的就是这个包袱。

## 先说结论

一句话概括：MCP 从一个有状态的长连接协议，改成了一个无状态的请求响应协议。

上面那套会话式的 RPC 模型，草案的选择是整个拆掉。每个请求自己携带全部上下文，服务端不需要记得任何东西，也就可以像一个普通的无状态 HTTP 服务一样部署。代价是一堆原本依赖会话的机制都得重新设计，下面大部分改动都是这个决定的连锁反应。

<section class="article-embed-note">
  <p class="article-embed-note-title">新旧 MCP 对照（图解）</p>
  <table class="article-compare-table">
    <thead>
      <tr>
        <th>对比点</th>
        <th>旧，会话模型</th>
        <th>新，无状态模型</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>启动方式</td>
        <td>必须握手，先走 <code>initialize</code> 和 <code>notifications/initialized</code>。</td>
        <td>无握手，每次请求在 <code>_meta</code> 里自带版本和能力。</td>
      </tr>
      <tr>
        <td>状态位置</td>
        <td>靠 <code>Mcp-Session-Id</code> 维持，会话状态在服务端。</td>
        <td>无会话，跨调用状态用显式 handle 参数传递。</td>
      </tr>
      <tr>
        <td>交互方向</td>
        <td>服务端可反向请求客户端，常见是 Roots、Sampling、Elicitation。</td>
        <td>改为 MRTR，返回 <code>input_required</code>，客户端补齐后重试。</td>
      </tr>
      <tr>
        <td>通知与断流</td>
        <td>GET + SSE，可用 <code>Last-Event-ID</code> 续传。</td>
        <td>走 <code>subscriptions/listen</code>，断流即作废，必须新 ID 重发。</td>
      </tr>
      <tr>
        <td>部署特性</td>
        <td>需要会话粘滞，滚动重启成本高。</td>
        <td>天然适合负载均衡、水平扩容、滚动发布。</td>
      </tr>
    </tbody>
  </table>
  <p class="article-embed-note-foot">核心变化：协议层做减法，扩缩容友好性提升，业务侧幂等和重试复杂度上升。</p>
</section>

## 一、会话被彻底移除

Streamable HTTP 传输里的 `Mcp-Session-Id` 头被删除，协议层面不再有会话这个概念。

随之而来的一个容易被忽略的约束是：`tools/list`、`resources/list`、`prompts/list` 这三个列表接口不再随连接变化。过去你可以根据会话的身份给不同客户端露出不同的工具集，现在不行了，同一个 server 对所有调用方给出同一张能力清单。如果你的产品靠根据登录用户动态生成工具列表这个能力吃饭，这里得提前想好替代方案，比如按租户拆出不同的端点地址。

那服务端确实需要跨调用保存状态的场景怎么办，比如一个多步骤的向导、一次长任务的中间结果？规范给的办法是服务端自己签发显式的 handle，然后当成普通的工具参数传来传去。这个设计其实很熟悉，就是 Web 里的分页 cursor 或者临时任务 ID。好处是状态变成了显式的、可见的、可以自己控制过期策略的东西，不再是藏在传输层里的隐形上下文。代价是这部分复杂度从协议层下沉到了业务层，每个 server 作者都得自己再实现一遍。

对应的 SEP 是 2567。

## 二、握手也没了

`initialize` 和 `notifications/initialized` 这套开场流程被取消。协议版本和客户端能力改成每个请求自带，放在 `_meta` 里。涉及四个键：

| 键 | 方向 | 作用 |
| --- | --- | --- |
| io.modelcontextprotocol/protocolVersion | 请求 | 声明本次请求使用的协议版本 |
| io.modelcontextprotocol/clientCapabilities | 请求 | 声明客户端能力 |
| io.modelcontextprotocol/clientInfo | 请求 | 客户端身份，建议每次带上 |
| io.modelcontextprotocol/serverInfo | 结果 | 服务端身份，建议每个结果都带 |

版本对不上时，服务端返回 `UnsupportedProtocolVersionError`。

这里有个现实的权衡：每个请求都重复携带版本和能力，字节数肯定变多了，但换来的是任意一个请求都可以被任意一个实例处理。对于要上网关、要水平扩容的服务来说，这笔账是划算的。

## 三、新增 server/discover

握手没了，但先看看你是谁、支持什么版本这个需求还在，所以规范新增了 `server/discover` 这个 RPC，并且写明服务端必须实现。

它返回服务端支持的协议版本列表、能力和身份。客户端可以选择在发任何其他请求之前先调一次，把版本选好；也可以在 STDIO 场景下拿它当向后兼容探针，看对面到底是新版还是旧版。

注意这个调用是可选的，不是强制前置步骤。客户端完全可以直接发 `tools/call`，只是得做好拿到版本错误的准备。这和之前的握手是两回事：握手是必须走的状态机，发现是一次普通查询。

上面两节对应 SEP 2575。

## 四、通知机制改走 subscriptions/listen

原来的 HTTP GET 端点，加上 `resources/subscribe` 和 `resources/unsubscribe`，一起被替换成一个入口 `subscriptions/listen`，本质上是一条长连的 POST 响应流。

客户端需要显式声明自己要听哪些类型，服务端确认后，给每条通知打上 `io.modelcontextprotocol/subscriptionId` 标签，客户端按这个 ID 分发。

| 订阅类型 | 含义 |
| --- | --- |
| toolsListChanged | 工具列表变更 |
| promptsListChanged | Prompt 列表变更 |
| resourcesListChanged | 资源列表变更 |
| resourceSubscriptions | 具体资源的订阅 |

这里有一个很容易实现错的地方，值得单独拿出来说：不是所有通知都走这条流。`notifications/progress` 和 `notifications/message` 属于请求作用域内的通知，它们仍然走引发它们的那个请求自己的响应流。换句话说，`subscriptions/listen` 只负责服务端主动推送的、和具体请求无关的变更通知；进度和日志这种附属于某一次调用的东西，跟着调用本身走。

把两类通知分开的好处是：一个无状态的服务，不需要为了发一条进度通知去查这个客户端的监听流在哪台机器上。

## 五、三个方法被直接删掉

`ping` 移除。无状态之后没有长期连接需要保活，存活探测交给传输层自己处理就够了。

`logging/setLevel` 移除。日志级别改成按请求设置，写在 `_meta` 的 `io.modelcontextprotocol/logLevel` 里。这条后面跟了一个硬性要求：请求里没带这个字段时，服务端不得为它发 `notifications/message`。也就是说日志默认是关的，需要就逐请求打开。

`notifications/roots/list_changed` 移除。这个和下面 Roots 被废弃是一回事。

## 六、MRTR：服务端不再反向发请求

这是整份变更里我觉得最值得琢磨的一处。

过去服务端处理到一半发现信息不够时，会反过来给客户端发请求，比如用 `roots/list` 问目录，用 `sampling/createMessage` 让客户端跑一次模型，用 `elicitation/create` 向用户要一个输入。这套做法隐含一个前提：连接是双向的，而且服务端在等待期间一直持有这次调用的上下文。无状态模型下这两个前提都不成立了。

新的 Multi Round-Trip Requests 模式，缩写 MRTR，把方向反过来：

服务端不再发请求，而是直接返回一个不完整的结果，类型是 `InputRequiredResult`，其中 `resultType` 为 input_required，`inputRequests` 字段里列出它还需要什么。客户端拿到后去凑齐这些信息，然后重试最初那个请求，把答案放在 `inputResponses` 里一并发过去。

服务端如果需要在多次重试之间关联同一件事，就把自己的标识编进 `requestState` 里。

配套的改动是所有结果都必须带 `resultType` 字段：普通结果是 complete，中间态是 input_required。旧版本服务端返回的结果没有这个字段，客户端必须当作 complete 处理，这是为了向后兼容留的口子。

这个模式带来的一个实际变化是，调用从一来一回变成了可能的多轮，客户端需要自己管好重试循环和次数上限。好处是每一轮都是一个完整、独立、可重放的请求，中间断了不会把服务端卡在一个悬着的状态里。

对应 SEP 2322。

## 七、Tasks 移出核心协议

实验性的 tasks 被挪出核心规范，放进了官方扩展 `io.modelcontextprotocol/tasks`，同时重新设计了一遍。变化有四处：

阻塞式的 `tasks/result` 被取消，改成用 `tasks/get` 轮询。新增 `tasks/update`，让客户端能在任务进行中向服务端补充输入。`tasks/list` 被移除。服务端可以不经过每请求的 opt-in，直接在结果里返回一个 task handle。

前两条都是无状态化的必然结果：阻塞等待需要服务端持有连接和上下文，轮询则没有这个要求。`tasks/list` 被移除同样如此，没有会话就没有当前连接的任务列表这个概念。

对应 SEP 2663。

## 八、流恢复能力被拿掉

Streamable HTTP 不再支持 SSE 流恢复和消息重投，`Last-Event-ID` 头和 SSE event ID 都被删除。

规则变得很直白：响应流一断，这个进行中的请求就作废，客户端必须用一个新的 request ID 重发，而不是接着断点继续。

这意味着可靠性的责任从协议转到了实现方身上。如果你的工具带副作用，比如下单、发邮件、写入外部系统，那么幂等设计就不再是可选项。客户端重发时用的是新 ID，服务端无法从协议层得知这是同一件事的重试，得靠你自己在参数里带幂等键。

## 九、缓存被写进了规范

这是一组容易被当成次要改动跳过去，但对性能影响很大的内容。

`tools/list`、`prompts/list`、`resources/list`、`resources/read`、`resources/templates/list` 这五个接口的结果，现在必须实现一个新的 `CacheableResult` 接口，带上两个字段：

`ttlMs` 是新鲜度提示，单位毫秒，告诉客户端这份结果可以缓存多久，目的是减少无意义的轮询。`cacheScope` 取值是 public 或 private，控制共享的中间层能不能缓存这份响应。两者和已有的 `listChanged` 通知是互补关系，不是替代关系：前者管多久去看一次，后者管变了马上告诉你。

与之直接相关的另一条：服务端应该保证 `tools/list` 的返回顺序稳定。原因不只是客户端缓存，更实际的是工具列表会被拼进 prompt，顺序一变，LLM 那边的 prompt 缓存就全部失效。如果你的工具列表是从 map 里遍历出来的，这里得加一次排序。

对应 SEP 2549。

## 十、传输层和 Schema 的调整

传输层多了硬性要求：Streamable HTTP 的 POST 请求必须带上 `Mcp-Method` 和 `Mcp-Name` 两个标准头。这两个头把原本埋在 JSON-RPC body 里的信息提到了 HTTP 层，好处是网关、日志系统、WAF 这些中间件不用解包就能做路由和限流。另外支持通过 `x-mcp-header` 从工具参数注入自定义头。对应 SEP 2243。

Schema 这边是反方向的放宽：`inputSchema` 和 `outputSchema` 允许使用任意 JSON Schema 2020-12 关键字，`structuredContent` 允许任意 JSON 值。同时补上了引用解析的要求和组合关键字的资源上限，防止有人写出无限嵌套的 schema 把客户端拖垮。对应 SEP 2106。

还有一条属于修正性质的变更：schema.json 里 minimum、maximum、default 的类型现在正确地反映为 number 而不只是 integer，之前是生成器参数写错导致的。

## 十一、错误码的重新划分

资源未找到的错误码从 -32002 改成 -32602，向 JSON-RPC 的 Invalid Params 对齐。

更重要的是规范这次定下了错误码分配政策，把 JSON-RPC 的服务端错误区间切成了两段：-32000 到 -32019 继续留给实现方自定义，现有 SDK 已经在用的那些被完整保留；-32020 到 -32099 归规范所有。

本次草案新引入的几个错误码也按这个策略重新编了号：

| 错误 | 旧编号 | 新编号 |
| --- | --- | --- |
| HeaderMismatch | -32001 | -32020 |
| MissingRequiredClientCapability | -32003 | -32021 |
| UnsupportedProtocolVersion | -32004 | -32022 |

同时 `HeaderMismatchError` 被正式加进 schema，之前它只存在于传输层的文字描述里。

## 十二、授权部分收紧

授权这块有四条变更，都是往更严格的方向走。

授权服务器应该按 RFC 9207 在授权响应里带上 `iss` 参数，而 MCP 客户端必须在兑换授权码之前，把这个 `iss` 和自己记录的 issuer 比对一次。这是防混淆攻击的标准做法。对应 SEP 2468。

客户端做动态注册时必须指定合适的 `application_type`，避免和 OpenID Connect 的重定向 URI 规则冲突。对应 SEP 837。

客户端凭据被明确绑定到签发它的那个授权服务器：持久化时必须以 issuer 作为键，不得在另一个授权服务器上复用，授权服务器一旦变更就必须重新注册。对应 SEP 2352。

最后一条是方向性的：OAuth 2.0 动态客户端注册协议（RFC 7591）作为注册机制被废弃，推荐换成 Client ID Metadata Documents。它仍然保留，用于兼容那些不支持新方式的授权服务器。

## 十三、可观测性

规范正式约定了 OpenTelemetry 的 trace context 在 `_meta` 中的传播方式，涉及 `traceparent`、`tracestate`、`baggage` 三个键。对应 SEP 414。

这件事本身不复杂，但意义不小。之前每个实现自己想一个字段名字传链路信息，跨系统拼不起来。现在有了统一约定，一次工具调用从客户端到 server 再到下游服务的完整链路，就能在现成的 APM 里直接看到。配合上面 Logging 被废弃、建议改用 OpenTelemetry，能看出规范在可观测性上的态度：不自己造轮子，直接用行业标准。

## 十四、废弃清单和生命周期政策

这次同时引入了一套功能生命周期与废弃政策，功能分成 Active、Deprecated、Removed 三种状态，废弃窗口期至少 12 个月，并且有一个专门的废弃功能登记表跟踪。对应 SEP 2596。

下面这些功能在窗口期内仍然完全可用，但新实现不应该再采用。

| 废弃项 | 官方建议的替代方案 |
| --- | --- |
| Roots | 通过工具参数、资源 URI 或服务端配置传递目录和文件 |
| Sampling | 直接对接 LLM 提供商的 API |
| Logging | stdio 场景写 stderr，或者改用 OpenTelemetry |
| HTTP+SSE 传输 | 迁移到 Streamable HTTP |
| includeContext 的 thisServer 和 allServers | 省略该字段或传 none |
| OAuth 2.0 动态客户端注册（RFC 7591） | Client ID Metadata Documents |

Roots、Sampling、Logging 三个一起被废弃，对应 SEP 2577。这三个功能有一个共同点：它们都要求服务端能反向调度客户端的能力。放在无状态和 MRTR 的背景下看，它们被废弃是顺理成章的事。

HTTP+SSE 传输从 2025-03-26 就已经标为 deprecated，这次只是把它正式归入新的生命周期政策。`includeContext` 的两个取值从 2025-11-25 起是软废弃，现在正式列为 Deprecated，官方说它们的移除不会晚于 Sampling 本身。

另外一个被移除的细节：2025-11-25 引入的 `notifications/elicitation/complete` 通知，以及 URL 模式 elicitation 请求里的 `elicitationId` 字段，这次都被删掉了。理由很清楚：在 MRTR 下，客户端是通过重试原请求来得知结果的，服务端主动发的完成信号和用来关联它的标识符，在新模型里不再成立。

## 十五、治理和流程

除了上面的生命周期政策，还有一条容易被忽略的流程变更：SEP 流程被正式化为基于 PR 的形式，提案以 markdown 文件放在 seps 目录下，编号从 PR 号派生，发起人和保荐人的职责写明，状态通过 PR 标签管理。对应 SEP 1850。

对普通使用者来说，这意味着以后追一个改动的来龙去脉会容易很多，变更日志里的每个 SEP 编号都能直接定位到对应的讨论。

## 如果你要迁移，优先看这几项

把上面的内容换成一份自查清单，服务端这边需要确认的是：有没有依赖会话 ID 存上下文，有没有根据会话动态返回不同的工具列表，有没有在用服务端反向请求，工具是否幂等，列表接口能不能给出稳定顺序和合理的 ttl，以及是否实现了 `server/discover`。

客户端这边需要确认的是：每个请求是否带全了协议版本和能力字段，能不能处理 input_required 的中间态并正确重试，缺失 `resultType` 时是否按 complete 处理，流断开后能不能用新 ID 重发，以及授权流程里有没有校验 `iss`。

## 结语

把这些变化放在一起看，方向是清楚的。

无状态是主线。没有会话，没有握手，每个请求自包含，MCP server 就可以像普通 HTTP 服务那样做负载均衡、水平扩容和滚动重启。我觉得这就是驱动其他所有改动的那条理由。

协议在做减法。ping、Roots、Sampling、Logging 这些顺手加上去的能力，要么被裁掉，要么进了废弃清单，核心只剩下工具、资源、Prompt。一个能被广泛实现的协议，表面积小一点不是坏事。

剩下的部分在往成熟的 Web 工程实践上靠。缓存语义、标准请求头、OpenTelemetry、JSON-RPC 错误码分配，这些都不是新东西，只是这次被正式写进了规范。加上明确的废弃政策和 SEP 流程，MCP 看起来正在从快速演进的实验品，转向一个可以被长期依赖的标准。

对已有实现来说，迁移成本不小，依赖会话、initialize 握手和服务端反向请求的项目改动尤其大。换来的是一个更简单、更容易正确实现的协议。

最后提一句，这仍然是 draft 状态，定稿前还可能变。现在适合做技术预研和架构评估，把那些一定会被影响的地方先识别出来，不必急着全量迁移。

---

参考链接：[MCP 规范草案变更日志](https://modelcontextprotocol.io/specification/draft/changelog)、[完整 diff](https://github.com/modelcontextprotocol/specification/compare/2025-11-25...draft)、[功能生命周期与废弃政策](https://modelcontextprotocol.io/community/feature-lifecycle)
