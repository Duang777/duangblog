---
author: Duang
pubDatetime: 2026-10-07T23:40:00+08:00
title: "生产可观测性：从\"系统慢\"到\"根因\"的完整链路（Go / TypeScript）"
featured: true
draft: false
tags:
  - 高性能后端实战
description: 可观测性不是打日志。从发现故障到定位根因，靠 Logs、Metrics、Traces，再加上 Profiling 和 SLO。后半按 Go / TypeScript 把 OTel 接到 Collector。
revisions:
  - date: 2026-10-07
    note: 首发。按成稿整理，挂到高性能后端实战。
  - date: 2026-10-08
    note: 补上 OpenTelemetry 接入一节，按成稿更新。
---

2026-10-07 · 高性能后端实战

本文挂在 [高性能后端实战](/posts/perf-backend/)。第一篇把"快"拆成可度量的数字。这篇讲这些数字在生产里怎么串成证据链。十四篇里的下一篇仍是 CPU 缓存，这篇不占那个序号。

写这篇博客的起因，是不少后端和 Agent 方向的同学把可观测性理解成"打日志"。如果目标是生产系统出了问题能在几分钟内定位到具体原因，那可观测性就应该被理解成一套从"发现故障"到"定位根因"的完整方法，而不是某个单独的监控工具。技术栈是 Go / TypeScript 时，它的核心结构非常稳定：Logs、Metrics、Traces 三件套打底，往上加 Profiling、Alerting 和 SLO/SLI。本文按实际后端项目的落地顺序拆，最后落到 Go/TS 的接入方式和 2026 年最新的 Agent 观测进展。

## 先理解：到底什么叫可观测性

先看一个场景。线上用户点击"生成报告"，链路是 API Gateway 到 Go API Server 到 PostgreSQL 到 Redis 到 LLM API 到 返回。用户反馈"生成报告怎么突然变慢了"。只知道"接口 500 了"不叫可观测性，因为下一个问题"哪里慢了"没有答案。可观测性要回答的是：request_id=abc123，总耗时 8.7s，其中 API Server 8.7s，往下拆 PostgreSQL 30ms、Redis 5ms、LLM API 8.5s（再拆 DNS 10ms、Connect 20ms、TTFT 2.1s、Generation 6.3s）。进一步能发现是 LLM provider A 的 P95 latency 升高、timeout rate 升高。从"接口慢"走到"是 LLM provider 的 TTFT 和生成阶段变慢"，这才叫可观测性。

所以它的目标可以精确定义为一句话：任何一次线上异常，都能在几分钟内沿着证据链定位到具体原因，而不是停在"服务出问题了"这个层面。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-evidence-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">证据瓶</span>
  </div>
  <p class="duang-whisper-body">几分钟里走到原因。停在出问题了，不算。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 三大支柱：Logs / Metrics / Traces

可观测性先记住三件事的定位差异，它们不是互相替代，而是配合使用。Metrics 回答"有多严重"：QPS、P99、错误率、CPU 是数值型时间序列；Logs 回答"发生了什么"：error message、stack trace、request_id 是带上下文的离散事件；Traces 回答"请求经过哪里"：service A 到 service B 到 DB 是一条完整请求的路径。同一个故障，三者的观察粒度依次递进：先看 Metrics 发现异常，再用 Trace 定位在哪一段，最后查 Logs 看具体错误。

## Metrics：生产系统最重要的第一层

Metrics 是数值型时间序列，比如 http_requests_total{service="api",status="200"} 或 http_request_duration_seconds{service="api",route="/users/:id"}。设计时先分清四类指标，它们的语义完全不同。

Counter 只增不减，典型如请求数、错误数、数据库异常数、消息消费数、LLM 调用数，Go 里用 requestCounter.Add(ctx, 1)。Gauge 可以上下变化，典型如 goroutine 数、活跃连接数、队列长度、内存占用，Go 里常见 activeRequests.Add(ctx, 1) 加 defer activeRequests.Add(ctx, -1)。Histogram 统计分布而不是均值，比如 http_request_duration_seconds 记录的不是"平均 200ms"，而是 P50=80ms、P90=180ms、P95=300ms、P99=1.2s 这样一组分位值。生产系统里 P95/P99 往往比平均值有价值得多：平均响应 100ms 但 P99 是 8s，用户依然会觉得系统很慢，平均值把长尾藏掉了。

落地时一般不会自己发明监控协议，主流做法是 OpenTelemetry（OTel）：应用里装 OTel SDK（Go/Node.js），通过 OTLP 上报到 Collector，再由 Collector 分发到 Prometheus（Metrics）/ Tempo（Traces）/ Loki（Logs）。这套"应用 到 SDK 到 OTLP 到 Collector 到 后端"的管道是当前生产架构的事实标准。

<section class="article-embed-note">
  <p class="article-embed-note-title">请求一路走，遥测一路收</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>请求</b></p>
      <p>API Gateway，再到 Go 服务，再到 PostgreSQL、Redis、LLM。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>遥测</b></p>
      <p>SDK 经 OTLP 到 Collector。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>落点</b></p>
      <p>Prometheus、Loki、Tempo，再到 Grafana 和告警。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">应用打到 Collector，Collector 再分到三套后端。</p>
</section>

## Logs：不要把日志理解成 fmt.Println

最差的生产日志是 fmt.Println("request failed")。不知道哪个请求、哪个用户、哪个服务、什么错误、耗时多少、调用哪个下游，这种日志在排障时基本没有检索价值。生产日志应该是结构化日志：一个 JSON 里同时带 level、service、message、request_id、trace_id、user_id、route、error 字段，这样 Loki、Elasticsearch 才能按字段查询。

Go 的写法是用标准库 log/slog：logger.Error("database query failed", "request_id", requestID, "user_id", userID, "error", err)，或 logger.Info("request completed", "method", r.Method, "path", r.URL.Path, "status", status, "duration_ms", duration.Milliseconds())。TypeScript 侧同理，logger.info({ requestId, userId, route: req.path, durationMs }, "request completed")。这里重点不是日志写得多，而是日志必须带上下文。每一条都能回答"这行日志属于哪个请求、哪个用户、哪次调用"。Node.js 生产常用 Pino（高吞吐场景性能更好）或 Winston，配合 OpenTelemetry 注入上下文。

## Traces：真正解决"请求到底慢在哪里"

Trace 是请求的完整路径记录。假设 POST /chat 产生一个 Trace：HTTP POST /chat 500ms 下面挂着 retrieve 120ms（里面再拆 pgvector 50ms、rerank 70ms）、LLM 350ms（connect 20ms、TTFT 100ms、generation 230ms）、response 30ms。看到这张图，慢在哪一段一目了然。

一个 Trace 由多个 Span 组成：HTTP Request Span 下面挂 DB Query Span、Redis Span、LLM Request Span。每个 Span 通常带 trace_id、span_id、parent_span_id、start_time、duration、status、attributes、events。Go 里用 tracer.Start(ctx, "GetUser") 创建，span.SetAttributes(attribute.String("user.id", userID)) 打属性，异常时 span.RecordError(err) 加 span.SetStatus(codes.Error, "database query failed")。

这里有一个 Go 特有的关键点：为什么一定要传 context。可观测性在 Go 里的传播载体就是 context。HTTP Span 通过 r.Context() 传进 service，service 里 tracer.Start(ctx, "GetUser") 会挂到父 Span 下面，再传给 repo.Find(ctx, id)，链路就串起来了。如果中间有人写了 db.Query(context.Background(), ...)，等于重新造了一个和请求无关的根，Trace 就在这里断掉。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    context.Background() 一写，这条 Trace 就断了。
  </div>
</details>所以生产 Go 服务里 context 不只是取消请求，它同时承担 Trace 与 request metadata 的传播。跨服务传播靠 HTTP Header 里的 traceparent（形如 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01），Service A 的 Trace 通过它流到 Service B 的 Server Span，再往下到 DB，全部属于同一个 Trace。

生产里不会每个 handler 手动写 Span，而是用中间件统一注入：Middleware 里 tracer.Start(r.Context(), r.Method+" "+r.URL.Path)，defer span.End()，再 next.ServeHTTP(w, r.WithContext(ctx))，所有请求自动产生 Trace。实际项目一般直接用 OpenTelemetry 提供的 HTTP instrumentation。Node.js 同理：OTel SDK 加自动 instrumentation 就能给 Express/Fastify、PostgreSQL、Redis、OpenAI 调用自动生成 Span。

## 最关键的一环：Trace 与 Log 的关联

生产环境最有价值的能力是 Correlation：看到 Trace ID abc123，去日志系统查 trace_id=abc123，就能从"DB 慢"跳到"看到 SQL error"。Grafana 里 Trace 到 发现 DB 慢 到 点 Span 到 跳到对应日志 到 看到 SQL error，是一条完整的证据链。所以生产系统要尽量让 Trace ID 同时出现在 Metrics 的维度、Logs 的字段和 Traces 的 ID 上，三者共用一个关联键。

## 一个完整请求该记录什么：注意高基数

以 POST /api/chat 为例，HTTP Metrics 建议至少记录 http_requests_total、http_request_duration_seconds、http_request_errors_total，维度用 service、method、route、status_code。这里有一个非常常见的坑：不要直接把 URL 原始值当 label。/users/123、/users/456、/users/789 会产生海量 label，正确做法是归一化成 /users/:id。这就是高基数（Cardinality）问题：把 user_id、request_id、trace_id、email、完整 URL 放进 Metrics label，遇到千万级用户，Prometheus 会产生海量 time series，直接拖垮存储。这些高基数值应该放 Logs 和 Traces，而不是 Metrics。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-crowd-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">基数瓶</span>
  </div>
  <p class="duang-whisper-body">用户编号别进指标标签。进去了，存储先倒。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 看板设计：应用看 RED，基础设施看 USE

后端服务最经典的是 RED：Rate（请求速率，requests/s）、Errors（错误率，5xx/total）、Duration（延迟，P50/P95/P99）。一个 API 服务最基本的 Dashboard 就是 QPS 1250、Error Rate 0.12%、P50 45ms、P95 180ms、P99 1.2s 这一组数。基础设施则是 USE：Utilization（利用率，CPU 72%、内存 68%、磁盘 80%）、Saturation（饱和程度，CPU load、queue length、goroutine waiting、connection pool waiting）、Errors（disk errors、network errors、OOM）。应用层看 RED，基础设施看 USE，这是面试非常值得讲的对应关系。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    应用看 RED，机器看 USE。两套别搁在一张图里混着讲。
  </div>
</details>

## 数据库与 Redis 的可观测

PostgreSQL 不能只监控 CPU，还要看连接池、query latency、慢查询、lock wait、事务死锁、错误。一组典型数值是 active 82 / idle 18 / max 100、P95 query 120ms、P99 2.3s、deadlocks 0。Go 里 sql.DB 直接暴露 db.Stats()：OpenConnections、InUse、Idle、WaitCount、WaitDuration，这些数据在排查连接池问题时很有价值。Redis 关注 hit rate、miss rate、latency、connections、memory、eviction、command errors。当 Redis latency 从 8ms 涨到 500ms，靠 Trace 里的 Redis Span 就能定位是哪条命令、哪个 key 的问题。

## Go 特有：runtime 指标与 pprof

Go 和 Java/Node 不一样，有一套自己的 runtime 指标：goroutine 数、GC 次数、Heap Alloc、GC pause、CPU。重点关注 runtime.NumGoroutine()。如果 goroutine 从 1000、2000、5000、10000 一路涨到 50000 不回落，多半是 goroutine leak（channel 没人消费、锁等待、context 泄漏）。性能剖析用 pprof：/debug/pprof/ 能采样 CPU、Heap、Goroutine、Mutex、Block、Thread。比如发现 CPU 90%，跑一个 CPU profile，看到某函数占 65%，结果是 JSON serialization 太重。这就是 Profiling，它和 Metrics、Trace 解决的是不同层面的问题。

Profiling 属于可观测性，因为它是链路定位的最后一环：Metrics 发现系统慢，Trace 定位到哪个请求/服务慢，Profiling 定位到具体哪段代码慢。典型链路是 P99 升高 到 Trace 显示 LLM API 不是问题 到 Go API CPU 90% 到 pprof 显示 json.Marshal 占 40%。2026 年这个环节已经产品化成持续 profiling（continuous profiling）：Parca Agent 通过 eBPF 每秒采样 19 次全系统栈，Pyroscope 用 eBPF 探针做 always-on 的 CPU 剖析，Profiling 信号已纳入 OpenTelemetry，可以按 OTLP 上报到 Grafana 里和 Metrics/Traces 一起看。这意味着生产环境可以默认开 profiling，不用等出问题再手动抓。

## 告警与 SLO：从监控进入治理

告警不要做"CPU > 80% 就报警"。CPU 80% 不一定影响用户。更应该关注 Error Rate、Latency、Availability、Saturation：比如 5xx > 1% 持续 5 分钟，或 P99 > 2s 持续 10 分钟。再往上就是 SLI/SLO/SLA：SLI 是实际测量值（successful requests / total requests），SLO 是目标（99.9% 请求成功），SLA 是对客户的服务承诺。Error Budget 是这层的核心概念：SLO 99.9%，一个月 43200 分钟，允许失败 0.1% 也就是 43.2 分钟。如果本月已经消耗 40 分钟，就该减少高风险发布。这已经从"监控技术"进入"生产系统治理"。

## Go 与 TypeScript 的指标对照

| 维度 | Go | TypeScript / Node.js |
|-|-|-|
| HTTP | QPS / P95 / P99 | QPS / P95 / P99 |
| Error | 5xx | 5xx |
| DB / Cache | 连接池 / Query / Redis Hit Rate | 连接池 / Query / Redis Hit Rate |
| Runtime | Goroutine / GC / Heap | Event Loop / Heap / GC |
| Profiling | pprof（CPU profile） | CPU profile（--prof） |
| Logs | slog / Zap | Pino / Winston |

Node.js 特别需要关注 event loop lag、heap、GC、CPU、active handles、HTTP latency、DB pool。因为 Node 是事件循环模型：event loop lag 突然从 5ms 变 800ms，即使 CPU 看起来不高，接口也会整体卡顿。

## 如果是 AI / Agent 后端：还要多一层观测

传统 HTTP Metrics 对 Agent 系统不够用了。链路变成用户 到 Agent 到 LLM 到 Tool 到 RAG 到 DB，需要观测的指标多了一层：LLM latency、TTFT、tokens（input/output）、cost、model、provider、tool latency、retrieval latency、retrieval hit、rerank score、agent steps。一个 agent.run 的 Trace 应该是这样：LLM call（model=qwen, input=1200, output=500, 1.8s）、Tool call（search_web=300ms）、RAG（embedding=30ms, vector_search=50ms, rerank=100ms）、再一个 LLM call（2.1s）。这样才能回答"为什么这个 Agent 慢"，而不是只看到 POST /agent/run = 4.5s。

<section class="article-embed-note">
  <p class="article-embed-note-title">一次 agent.run</p>
  <div class="article-flow-stack">
    <div class="article-flow-row is-client">
      <p><b>LLM call</b></p>
      <p>model、input、output、耗时。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>Tool call</b></p>
      <p>比如 search_web。</p>
    </div>
    <div class="article-flow-row is-server">
      <p><b>RAG</b></p>
      <p>embedding、vector_search、rerank。</p>
    </div>
    <div class="article-flow-row is-client">
      <p><b>LLM call</b></p>
      <p>再来一轮。</p>
    </div>
  </div>
  <p class="article-embed-note-foot">4.5 秒要能拆开，不能停在这一个总数上。</p>
</section>

这一层在 2026 年已经标准化了：OpenTelemetry 的 GenAI 语义约定（GenAI Semantic Conventions）于 2026 年 6 月稳定，定义了 System Spans、Model Spans、Agent Spans 三层结构，以及 chat、embeddings、retrieval、execute_tool、invoke_agent 等操作，核心属性是 gen_ai.system、gen_ai.request.model、gen_ai.usage.input_tokens。AWS Bedrock AgentCore、微软 Agent Framework、阿里云 LoongSuite 都已按这套约定上报，意味着不同厂商的 Agent 可观测数据可以用同一套 schema 查询。这是 Agent 可观测性和传统后端对齐的标志性进展。

## 生产可观测性真正的核心：排障思维

面试不要只回答"我们用 Prometheus + Grafana 做监控"，那太浅。完整的回答应该是一条链路：从 Metrics、Logs、Traces 三个维度建设，Metrics 关注 RED（QPS、错误率、P95/P99），Logs 用结构化日志并通过 request_id 和 trace_id 关联上下文，Traces 用 OpenTelemetry 串联 HTTP、RPC、数据库、Redis 等下游调用；基础设施层补 CPU、内存、连接池、GC、goroutine（或 Node.js event loop）等 runtime 指标；Grafana 做统一 Dashboard 和告警，结合 SLO 管理稳定性；Go 服务再用 pprof 定位 CPU、内存、goroutine 性能问题。

而真正要建立的排障思维是那条完整的证据链：用户反馈"系统变慢了" 到 Metrics 显示 P99 从 500ms 到 3s 到 Trace 显示主要慢在 DB 到 DB Metrics 显示连接池 WaitCount 激增 到 Logs 显示 connection timeout 到 进一步检查发现连接池 max=100 但数据库连接上限只有 100 到 根因是连接池配置不合理 到 修复后 P99 恢复。可观测性解决的是从"发现故障"一路走到"定位根因"，不是停在"发现故障"。

## OpenTelemetry 接入：Go / TypeScript 的固定链路

OTel 接入是一条固定链路：

1. 应用通过 SDK + Instrumentation 生成 Metrics / Traces / Logs
2. 经 OTLP 上报给 OpenTelemetry Collector
3. Collector 接收、处理、转发到 Prometheus（指标）/ Loki（日志）/ Tempo（链路）
4. Grafana 统一展示与告警

三方职责分工：应用负责产生 telemetry，Collector 负责过滤、批处理、采样、路由，后端负责存储和查询。理解这个分工，接入的每一步都好安排。

### OTel 的五个核心组成

OpenTelemetry 不是 Grafana，也不是日志数据库。它提供五样东西：

- **API**：代码里埋点的入口，例如 otel.Tracer("user-service")
- **SDK**：真正执行采集、采样、批处理、导出的实现
- **Instrumentation**：帮你自动埋点的现成集成（HTTP / DB / Redis）
- **Exporter**：把数据发往后端的通道
- **Semantic Conventions**：属性命名的行业约定

关键理解：业务代码只依赖稳定的 API，换 SDK 或换后端都不动业务代码。

### Instrumentation：能自动的不要手动

假设用了 Gin，你不想在每个 Handler 里手动写 tracer.Start(...)。直接用 Gin Instrumentation，每个请求自动生成 HTTP Span（method、route、status、duration 都有）。数据库、Redis、HTTP Client 同理。

生产经验：能自动的不要手动；手动 Span 只留给有业务语义的节点，比如 Agent 的一次运行、一次 RAG 检索。

### Go 接入：三步走

**第一步，安装依赖：**

```go
go get go.opentelemetry.io/otel
go get go.opentelemetry.io/otel/sdk
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc
```

**第二步，初始化 TracerProvider：**

```go
func initTracer() (*trace.TracerProvider, error) {
    exporter, err := otlptracegrpc.New(context.Background())
    if err != nil { return nil, err }
    provider := trace.NewTracerProvider(trace.WithBatcher(exporter))
    otel.SetTracerProvider(provider)
    return provider, nil
}
// 启动时：provider, err := initTracer()
// defer provider.Shutdown(context.Background())
// 然后：tracer := otel.Tracer("user-service")
```

**第三步，业务代码创建 Span：**

```go
ctx, span := tracer.Start(ctx, "GetUser")
defer span.End()
// 出错时：
span.RecordError(err)
span.SetStatus(codes.Error, "database query failed")
```

Go 有一条铁律：必须一直传 context。Handler 用 r.Context() 进 service，service 的 Span 挂到父 Span 下，repo.Find(ctx, id) 继续往下挂，最终形成三层 Trace：HTTP GET /users/:id 到 GetUser 到 DB Find User。谁在中间写一个 context.Background()，Trace 就在哪里断掉。

### Context Propagation：跨服务怎么串

这是 OTel 最核心的概念之一。Service A 通过 HTTP Header 里的 traceparent（形如 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01）把 trace_id 传给 Service B，再传给 PostgreSQL，整条请求属于同一个 Trace。

### Go 接入：HTTP 与数据库 instrumentation

生产环境不推荐自己写 HTTP middleware，直接接现成的：

```go
// 服务端：每个 HTTP 请求自动产生 Span
handler := otelhttp.NewHandler(router, "user-service")
http.ListenAndServe(":8080", handler)

// 客户端：调下游时 Trace 能连起来
client := http.Client{
    Transport: otelhttp.NewTransport(http.DefaultTransport),
}
```

数据库 instrumentation 会为 SELECT users 生成 Span 并记录 duration。但有一个生产重点：

- 不要无脑把完整 SQL 参数塞进 Span
- password、token、email、身份证、access_token 都要谨慎处理

### TypeScript / Node.js 接入

方式和 Go 类似。先装依赖：

```bash
npm install @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-grpc
```

再初始化：

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: "http://localhost:4317" }),
});
sdk.start();
```

业务代码用 startActiveSpan：

```typescript
const tracer = trace.getTracer("user-service");
async function getUser(id: string) {
  return tracer.startActiveSpan("GetUser", async (span) => {
    try {
      return await repository.findUser(id);
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

**Node.js 最大的优势是 auto instrumentation**：HTTP、Express、Fastify、PostgreSQL、Redis、gRPC 自动生成 Span，一个 POST /chat 的 Trace 自动挂上 PostgreSQL、Redis、LLM 调用，生产环境几乎不需要手动埋点。

### Go 与 Node 的上下文区别

对应关系值得记牢：

| 维度 | Go | Node.js |
|-|-|-|
| 上下文机制 | context.Context | AsyncLocalStorage（Async Context） |
| 传播方式 | 显式传参 | Promise / async / callback 自动传递 |
| 抽象层结果 | Trace 到 Span 到 Child Span | Trace 到 Span 到 Child Span |

所以 await serviceA() 再 await serviceB() 仍然保持同一个 Trace。抽象层面两者最终都是同一结构。

### Metrics 怎么接

Go：

```go
meter := otel.Meter("user-service")
requestCounter, _ := meter.Int64Counter("http.server.requests")
requestCounter.Add(ctx, 1)

latency, _ := meter.Float64Histogram("http.server.duration")
latency.Record(ctx, duration.Seconds())
```

TypeScript：

```typescript
const meter = metrics.getMeter("user-service");
const requestCounter = meter.createCounter("http.server.requests");
requestCounter.add(1);

const latency = meter.createHistogram("http.server.duration");
latency.record(duration);
```

最终链路：Application 到 OTel Metrics 到 Collector 到 Prometheus 到 Grafana。

### Logs 怎么接：不必全托管

一个重要的现实建议：生产环境不一定需要让 OTel 接管所有日志。Go 用 slog / zap 打 JSON stdout，接 Loki，完全够用。重点是日志里带 trace_id 和 span_id：

```json
{
  "level": "error",
  "message": "db query failed",
  "trace_id": "abc123",
  "span_id": "def456"
}
```

这样 Grafana 就能从 Trace 跳到 Logs。日志管道的选择和 Trace/Metrics 正交，只要关联键一致就行。

### Collector：为什么值得存在

不推荐让应用直接连接所有后端（Prometheus、Tempo、Loki、Jaeger 各连一遍），那会让每个服务都背着后端拓扑。标准做法：应用只知道一个 OTLP 端点（OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317），其余交给 Collector。

Collector 的职责是一条流水线：接收 到 过滤 到 Batch 到 Sampling 到 Enrich 到 Routing 到 Export。例如 10000 spans/s 进来，采样后降到 1000 spans/s 再发 Tempo；以后从 Tempo 换成 Jaeger，应用代码都不用改。

pipeline 配置大概长这样：

```yaml
receivers:
  otlp:
    protocols:
      grpc: {}
      http: {}
processors:
  batch: {}
exporters:
  otlp:
    endpoint: tempo:4317
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp]
```

### Sampling 与 Cardinality：两道必踩的坑

假设 10000 req/s、每个请求 10 个 Span，就是 100000 spans/s，全量保存成本很高，所以生产必须做采样。最简单的随机 10% 能用，但更有价值的是 Tail-based Sampling：

| 请求类型 | 示例 | 保留比例 |
|-|-|-|
| 正常请求 | 耗时 100ms | 1% |
| 错误请求 | 返回 500 | 100% |
| 慢请求 | P99 级别 | 100% |

它比随机采样更有价值，因为保留的样本恰好是排障需要的。

Cardinality 的规则再强调一遍：

- Metrics label 只放 service、route、method、status_code 这类低基数维度
- user_id、request_id、trace_id 一律放 Trace 和 Log
- 否则千万用户会让 Prometheus 产生海量 time series

### AI / Agent 系统：Root Span 与 LLM Metrics

做 Agent 系统时，给每次 Agent Run 建一个 Root Span agent.run，下面挂子 Span：

```text
agent.run
├── llm.generate（model / provider / tokens / latency）
├── tool.search（tool_name / latency）
├── retrieval
│   ├── embedding
│   ├── vector_search
│   └── rerank（retrieval_top_k）
└── llm.generate
```

同样注意隐私：不要把完整 prompt、用户隐私、token、API Key 直接塞进 Span。

LLM 层还要有自己的 Metrics，才能回答"为什么今天成本涨了"：

- llm_requests_total / llm_request_duration_seconds
- llm_input_tokens_total / llm_output_tokens_total
- llm_errors_total / llm_ttft_seconds / llm_cost_total

典型归因链路：Dashboard 显示 Output Tokens 升高 到 定位到某个 Agent 到 平均 output tokens 从 2k 涨到 8k 到 查是 Prompt / Agent loop 异常。成本问题也能走完整证据链。

### 生产接入 7 步

1. 安装 OTel SDK
2. 初始化 TracerProvider / MeterProvider
3. 配置 OTLP Exporter
4. 接入 HTTP / DB / Redis Instrumentation
5. 打通 Context Propagation
6. OTLP 上报 Collector
7. Collector 分发 Prometheus / Tempo / Loki

### 面试回答骨架

面试官问"你们项目怎么做 OpenTelemetry 可观测"，可以按这条链回答：

> 我们主要基于 OpenTelemetry 做统一的 Trace 和 Metrics 采集。Go 服务通过 OTel SDK 初始化 TracerProvider 和 MeterProvider，同时对 HTTP、数据库、Redis 接入 instrumentation；业务中对于 Agent、RAG、LLM 调用等关键节点再补充手动 Span。请求上下文通过 Go 的 context.Context 传递，保证 HTTP、Service、DB 以及下游 RPC 串成完整 Trace。Node.js 服务类似，通过 OTel SDK 和 auto instrumentation 接入 HTTP、数据库等组件，依赖 Node 的异步上下文传播 Trace Context。应用侧统一通过 OTLP 把 telemetry 发给 Collector，由 Collector 做 batch、sampling、过滤和路由，再分别发送到 Prometheus、Tempo、Loki，Grafana 统一展示。线上出问题时，先通过 Metrics 发现 QPS、错误率或 P99 异常，再从 Trace 定位具体慢 Span，最后通过 trace_id 关联日志定位根因。

这段覆盖了 OTel SDK、Instrumentation、Context Propagation、OTLP、Collector、Metrics、Trace、Logs、Sampling、Grafana，基本就是生产系统 OTel 接入的完整骨架。

## 我的几点判断

这套体系里最容易踩的坑有三个：一是把 Metrics label 塞进高基数字段，等于自己把监控后端压垮；二是 Logs 不带上下文，事后无法按请求检索；三是只装了三件套但没有关联键，Trace 和 Log 各查各的。可观测性的真正成本不在工具，而在约定。全链路共用一个 trace_id、所有日志带相同字段、所有指标用同一套命名，这些约定比选哪个后端重要得多。

对 Go/TS 项目，起步建议是从 OTel 接入开始：SDK 到 Instrumentation 到 Context Propagation 到 OTLP 到 Collector 到 Prometheus/Loki/Tempo 到 Grafana，这条管道跑通后再逐步加持续 profiling 和 SLO。对 Agent 项目，直接按 GenAI 语义约定上报，把 LLM 调用、工具调用、RAG 检索当成一等公民的 Span，而不是塞在"HTTP 慢"里。Agent 系统的性能问题几乎都发生在 HTTP 层之下的模型调用和工具编排里。

## 参考与延伸阅读

- OpenTelemetry 官方（语义约定与 Collector）：https://opentelemetry.io
- OpenTelemetry GenAI 语义约定：https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
- Grafana Pyroscope 持续 profiling：https://grafana.com/docs/pyroscope/
- Parca（eBPF 全系统 profiler）：https://www.parca.dev
- OpenTelemetry GenAI Observability 介绍（2026-05）：https://opentelemetry.website.cncfstack.com/blog/2026/genai-observability/
- AWS Bedrock AgentCore Evaluations（按 OTel GenAI 约定评估 Agent 框架，2026-08）：https://aws.amazon.com/blogs/machine-learning/evaluate-any-agent-framework-with-amazon-bedrock-agentcore-evaluations/
