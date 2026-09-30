---
author: Duang
pubDatetime: 2026-10-01T02:20:00+08:00
title: "系统设计面试题拆解｜OpenAI Agents SDK｜2026-09-30"
featured: true
draft: false
tags:
  - thinking
description: OpenAI Agents SDK 用很少的原语做生产级多智能体。这篇按面试的九个维度拆容量、架构、并发、可用和一致性。
revisions:
  - date: 2026-10-01
    note: 首发。按成稿整理，挂到 thinking。
---

> [!NOTE]
> 🎯
>
> **今日选题：OpenAI Agents SDK**（OpenAI 官方开源，Python / JS 双 SDK）。核心定位：以极小原语集（Agents、Handoffs、Guardrails、Function tools、Sessions、Tracing）构建生产级多智能体应用的轻量框架，内置 MCP 工具调用、沙箱执行、人在回路（HITL）与全链路追踪。设计哲学与 AutoGen（对话驱动）、LangGraph（图状态机）、CrewAI（角色团队）截然不同：**以轻量原语 + 运行时为骨架，把灵活性还给开发者，把可靠性交给运行时**。本拆解覆盖面试系统设计题完整九维度。

2026-09-30 · 系统设计面试拆解

本文挂在 [thinking](/tags/thinking/)。

## 一、需求澄清与功能边界

面试应答话术：OpenAI Agents SDK 解决的是"如何用最少的抽象、在真实生产环境里跑多智能体"。它的原语只有 5 个，Agent（带指令和工具的 LLM）、Handoffs / Agents-as-tools（委派与移交）、Guardrails（输入输出校验）、Function tools（函数即工具）、Sessions（持久化上下文）；再加 Tracing 与 HITL 两个横切能力。

| 维度 | 澄清点与话术 |
|-|-|
| **功能需求** | 单 Agent 任务循环；多 Agent 通过 handoff 移交控制权（去中心化）；agent 嵌套为工具（中心化编排）；输入/输出 guardrail 并行校验并快速失败；工具函数自动生成 schema + Pydantic 校验；MCP 远程工具；会话持久化；人工介入。 |
| **非功能需求** | 同步 / 异步 / 流式（StreamedRun）运行；事件流（RunResultStreaming）；并发多 agent 编排（asyncio.gather）；trace 级可观测性；沙箱隔离执行。 |
| **约束** | 强依赖 OpenAI 模型生态（虽支持自定义 LLM，但最顺手的是 OpenAI）；成本 = token 消耗随 handoff 层级放大；合规与安全靠 guardrail + sandbox + 最小权限工具授权。 |

个人总结：它和 LangGraph / CrewAI 最大的差别是**"原语极少、组合自由"**，你不需要学图、学角色团队，用 Python 的 if / for / asyncio 就能编排。代价是复杂控制流要自己写，框架不替你兜底。

## 二、容量估算（先亮假设再推算）

场景假设：承载一个日活 100 万的智能客服 + 通用助手平台，平均每用户每天 3 次会话，其中 40% 触发多智能体 handoff。

| 指标 | 推算过程 | 结果 |
|-|-|-|
| **日均请求** | 100万 DAU × 3 次 | 300 万次/天 |
| **平均 QPS** | 300万 / 86400s | ≈ 35 RPS |
| **峰值 QPS** | 平均 × 峰均比 6 | ≈ 210 RPS |
| **放大系数** | 单会话平均 1.8 个 agent 节点；每节点 1\~3 次 LLM 调用；40% 会话含 handoff | 每个用户请求放大 **3\~5 倍**；峰值 ≈ 630\~1050 次 LLM 调用/s |
| **流式连接数** | 峰值同时在线执行 | 数万 SSE 长连接 |
| **token 吞吐** | 平均 2k 输入 + 400 输出 token/次 | 峰值约 1.3M\~2.1M token/s 输入、260K\~420K token/s 输出 |
| **存储增量** | 会话记录 + messages + 记忆 + trace | 日增约 3\~10 GB，90 天保留约 0.3\~1 TB |
| **带宽** | 输出 token ≈ 2 bytes/token + SSE 帧开销 | 峰值约 0.6\~1 MB/s 纯文本输出 |

关键口径：多智能体系统的容量核心不是 HTTP QPS，而是**LLM 调用 QPS 与 token 吞吐**。handoff 链越长、agent 越多，放大系数越高，面试时主动讲这个放大系数，是本题的最大加分点。

<details class="marginalia" open>
  <summary>放大系数</summary>
  <div class="marginalia-body">
    先报 HTTP QPS，面试官听到的是一台普通网关。先报每次请求会变成几次模型调用，后面的限流和账单才对得上。
  </div>
</details>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-amp-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">放大瓶</span>
  </div>
  <p class="duang-whisper-body">35 这个数很好看。要扛的是模型调用。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>


## 三、技术栈选型

| 层 | 选型 | 理由 / 权衡 |
|-|-|-|
| **语言/运行时** | Python（SDK 原生）+ asyncio | Python-first 设计；I/O 密集用 asyncio 提升单进程并发；GIL 限制下重计算靠多进程 |
| **编排引擎** | Agents SDK Runner（AgentLoop） | 内置 turn 循环、tool 循环、handoff 切换、guardrail 并行校验；替代自研编排 |
| **网关** | APISIX / Kong / Envoy | 统一限流、鉴权、SSE 转发；流量治理从业务抽离 |
| **消息队列** | Kafka / RabbitMQ | 长任务异步解耦；handoff 事件与结果回写削峰 |
| **缓存/会话** | Redis | Sessions 上下文缓存、限流计数、幂等表；需持久化与主从 |
| **关系库** | PostgreSQL / MySQL | 会话元数据、用户与 agent 绑定、任务状态 |
| **向量库** | pgvector / Milvus | 长期记忆检索、RAG 工具支撑 |
| **对象存储** | S3 / OSS | trace 文件、沙箱工作区、大文件工具结果 |
| **可观测** | SDK Tracing + OTel | Generation / Function / Guardrail / Handoff 四级 span，天然对接 Prometheus / Grafana / Jaeger |
| **沙箱** | SDK Native Sandbox | 文件检查、命令执行、代码编辑隔离；harness 与 compute 分离，安全 + 持久化 + 弹性扩展 |

## 四、架构设计（无状态编排 + 异步解耦）

## 落地实现指南：怎么设计 · 用什么 · 怎么用

这一章把前面的架构决策翻译成可以照做的实现步骤，覆盖三件事：**怎么设计**（落地流程与决策顺序）、**用什么**（组件清单与选型）、**怎么用**（可直接运行的代码骨架）。面试时若能流畅背出这一段，会明显高于"只讲概念"的候选人。

### 一、怎么设计：从需求到架构的落地顺序

1. **先定流程边界**：哪些请求走同步快路径（单 agent 单轮问答），哪些走异步慢路径（多 handoff 长流程），用一张"流程分类表"划分。
2. **再拆 agent 结构**：按职责把任务拆成独立 agent（如客服助手 = 路由 agent + 售后/售前/技术三个子 agent），确定 handoff 关系图。
3. **后定存储**：会话上下文（Sessions）用 Redis 主从 + Postgres 备份；长期记忆入向量库；trace 文件入对象存储。
4. **再补保护层**：网关限流、LLM 并发池、多 Provider failover、guardrail、幂等表。
5. **最后上观测**：接 Tracing 导出、指标采集、结构化日志，再放量。

### 二、用什么：落地组件清单

| 组件 | 用哪个 | 在 SDK 里怎么对应 |
|-|-|-|
| **Agent 定义** | openai-agents SDK 的 Agent 类 | Agent(name=..., instructions=..., tools=[...], model=...)，指令即角色，工具即能力 |
| **多 agent 协作** | Handoffs / Agents-as-tools | handoffs=[triage_agent] 移交控制权；或用 function tool 包装子 agent 做中心化调用 |
| **工具** | Function tools + MCP | @function_tool 装饰任意 Python 函数，自动生成 schema + Pydantic 校验；远程工具走 MCP 集成 |
| **校验** | Guardrails | input_guardrails / output_guardrails，并行校验输入输出，失败快速失败 |
| **会话** | Sessions（可插拔存储） | Runner.run(agent, input, session_id=...)，上下文持久化到配置的 SessionStore |
| **运行** | Runner（同步/异步/流式） | run() / run_async() / run_streamed()，事件流输出 raw/deltas/tool/handoff |
| **沙箱** | Native Sandbox | 文件/命令/代码操作在受控沙箱执行，与编排计算分离 |
| **可观测** | 内置 Tracing | 自动生成 Generation/Function/Guardrail/Handoff span，可导出到自有监控 |
| **人工介入** | Human-in-the-loop | 关键步骤可暂停，等人确认后继续 |

### 三、怎么用：代码骨架（可直接运行）

**① 定义工具**
```python
from agents import function_tool

@function_tool
def get_weather(city: str) -> str:
    """查询城市天气，返回温度与天气状况。"""
    # 这里可以是真实 API 调用
    return f"{city}：晴，26℃"

@function_tool
def query_order(order_id: str) -> str:
    """查询订单状态。"""
    return f"订单 {order_id}：已发货，预计明日送达"

```

**② 定义 Agent（含 handoff）**
```python
from agents import Agent, Runner, guardrails

# 子 agent：售后
after_sales = Agent(
    name="售后助手",
    instructions="你是售后客服，处理退换货、物流、发票问题。语气亲切。",
    tools=[query_order],
)

# 子 agent：售前
pre_sales = Agent(
    name="售前助手",
    instructions="你是售前顾问，介绍商品、比价、推荐。",
    tools=[get_weather],  # 示例：售前也用天气（如户外装备推荐）
)

# 路由 agent：先判意图，再 handoff
triage = Agent(
    name="路由助手",
    instructions=(
        "你是总台。根据用户意图分发：\n"
        "- 涉及订单/物流/售后 → handoff 给 售后助手\n"
        "- 涉及商品/购买/推荐 → handoff 给 售前助手\n"
        "- 闲聊 → 直接回答"
    ),
    handoffs=[after_sales, pre_sales],
)

# 输入护栏：简单关键词校验
async def guardrail_check(ctx, agent, input_text):
    banned = ["诈骗", "赌博"]
    for w in banned:
        if w in input_text:
            return guardrails.InputGuardrailResult(
                tripwire_triggered=True, output="抱歉，该内容无法处理。"
            )
    return guardrails.InputGuardrailResult(tripwire_triggered=False)

```

**③ 用 Runner 运行（同步 / 流式 / 会话）**
```python
import asyncio
from agents import Runner

async def main():
    # 同步运行：单次问答
    result = await Runner.run(triage, "我的订单 10086 到哪了？")
    print(result.final_output)   # 应输出售后助手的结果

    # 带会话：跨轮保持上下文
    session_id = "user-123"
    r1 = await Runner.run(triage, "我要买个登山包", session_id=session_id)
    r2 = await Runner.run(triage, "那天气怎么样？", session_id=session_id)
    # r2 能记住 r1 的上下文（Sessions 外置）

    # 流式运行：逐帧输出（供 SSE 推送）
    async for event in Runner.run_streamed(triage, "介绍一下登山包"):
        if event.type == "raw_response_event":
            delta = event.data.delta
            # 把 delta 逐帧推给前端 SSE
            print(delta, end="")

asyncio.run(main())

```

**④ 多 agent 并行编排（asyncio.gather）**
```python
async def parallel_run():
    # 两个无依赖任务并行执行，减少整体时延
    r1, r2 = await asyncio.gather(
        Runner.run(pre_sales, "帮我推荐一款露营帐篷"),
        Runner.run(after_sales, "我要退换一个睡袋"),
    )
    return r1.final_output, r2.final_output

```

### 四、落地时的关键注意点

- **Handoff 别滥用**：每多一次 handoff 就放大 LLM 调用与延迟，能用单 agent 工具完成就别拆 agent。
- **并发控制**：用 asyncio.Semaphore 限制并发 LLM 调用，防打爆 Provider；突发流量靠 MQ 削峰。
- **幂等优先**：工具副作用（发邮件/扣款/写库）必须带 request_id 去重。
- **观测先行**：上线前先接 Tracing 和指标，否则多 agent 链路排障极其痛苦。
- **会话存储选型**：开发期可用内存；生产必须外置 Redis + Postgres，支持断线恢复与多副本。

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：两条路径</p>
  <p class="article-embed-note-lead">单轮问答留在同步链路上。多 handoff 的长流程先写进队列，再由 worker 执行。</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 180" role="img" aria-label="同步快路径和异步慢路径"><text class="perf-label" x="8" y="48">快路径</text><rect class="perf-hbar" x="120" y="28" width="490" height="28" rx="3"/><text class="perf-chip-sub" x="132" y="47">单 agent 单轮，SSE 直接往外推</text><text class="perf-label" x="8" y="108">慢路径</text><rect class="perf-hbar" x="120" y="88" width="490" height="28" rx="3"/><text class="perf-chip-sub" x="132" y="107">多 handoff，先入 Kafka，worker 写回会话</text><text class="perf-label is-tail" x="8" y="158">状态</text><rect class="perf-hbar is-tail" x="120" y="138" width="490" height="28" rx="3"/><text class="perf-chip-sub" x="132" y="157">Runner 不存会话，Sessions 在外面</text></svg>
  </figure>
  <p class="article-embed-note-foot">实例挂了可以从 Redis 把会话再读回来，不必把状态焊在某一台机器上。</p>
</section>

核心架构决策：

- **运行时无状态化**：Runner 不持有用户状态，所有会话上下文外置到 Sessions 存储；任意实例可接管任意会话（一致性哈希路由优化缓存命中）。
- **同步快路径 + 异步慢路径**：单 agent 单轮问答走同步 SSE 快路径保流式体验；多 handoff 长流程投 MQ，Worker 消费执行，结果写会话供轮询/推送。
- **Handoff 去中心化移交**：agent 执行中由模型决定移交目标，Runner 自动切换"当前 agent + 指令 + 上下文"，无需中央调度器，天然支持水平扩展。
- **外部依赖兜底**：LLM Provider 故障，failover；guardrail 校验失败，快速失败并返回安全兜底话术。
- **沙箱与 compute 分离**：agent 代码/文件操作在沙箱执行，与编排计算分离，兼顾安全与弹性扩缩容。

### 架构决策 · 生产级实现细节

下面是五个核心决策在生产环境里真正落地的做法、参数与踩坑点，面试时挑 2-3 个展开即可。

#### ① 运行时无状态化：一致性哈希路由 + 会话亲和

- **实现**：Runner 实例是无状态 Pod，把 `session_id` 做一致性哈希，路由到固定实例以命中 Sessions 本地缓存；实例扩缩容时用虚拟节点减少缓存抖动。
- **生产细节**：无状态的核心收益是"任意实例可接管任意会话"，故障实例被摘除后，哈希会平滑迁移到相邻实例，从 Redis 重新加载会话。代价是首次命中可能缓存 miss、多一次 Redis 读；用 `本地 L1 缓存 + Redis L2` 两级缓解。
- **注意**：会话亲和是"优化"而非"强约束"，不能把状态写死在实例内存；否则一旦该实例挂掉会话就丢。

#### ② 同步快路径 + 异步慢路径：怎么切分、怎么回写

- **切分规则**：预计完成时间  3 秒或多 handoff，异步投 MQ。
- **异步链路**：请求，网关，编排服务写入 Kafka（topic 按业务分）， Worker 消费执行，结果写回会话表 + 推 `run_finished` 事件，客户端轮询或订阅推送。
- **回写一致性**：Worker 用 `outbox + 幂等表` 保证"结果落库"与"通知客户端"最终一致，避免结果丢了还让用户干等。

#### ③ Handoff 去中心化移交：事件化 + 防环 + 超时

- **事件化**：每次 handoff 产生 `handoff_started / handoff_completed` 事件，记入 trace 的 HandoffSpan，可复盘"为什么移交给了这个 agent"。
- **防环与限深度**：维护 handoff 跳数计数器，超过阈值（如 5 跳）强制结束回兜底；避免 agent 互相移交死循环烧 token。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-loop-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">移交瓶</span>
  </div>
  <p class="duang-whisper-body">互相移交五次，账已经不是一次问答了。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

- **超时与兜底**：单 agent 单轮推理设超时（如 60s），超时走 failover 模型或返回"正在处理，请稍后再试"。

#### ④ 外部依赖兜底：failover 参数与熔断

- **failover**：OpenAI 为主、备用 Provider 为备；主请求失败/超时（如 10s）自动切换备用。两个 Provider 的 key 独立配置、独立限流配额。
- **熔断器参数**：错误率 > 50% 且窗口内请求 > 20，打开熔断；熔断后 30s 进入半开，放少量探测请求，成功即关闭。用 `pybreaker / resilience4j` 实现。

#### ⑤ 沙箱与 compute 分离：隔离级别与资源限制

- **隔离**：agent 的文件/命令/代码操作跑在独立沙箱（容器级隔离），与编排计算分机部署；沙箱仅授权最小工具与最小网络白名单。
- **资源限制**：沙箱设置 CPU / 内存 / 磁盘配额与执行超时，防止 agent 失控占资源或跑飞。
- **为什么分离**：编排实例保持轻量、可快速扩缩容；沙箱按需弹性伸缩，互不影响，也降低安全风险。

## 五、高并发设计

### 高并发设计 · 生产级实现细节

#### ① 多层限流与流量整形

- **第一层·网关**：Kong/APISIX 用令牌桶按租户（如每租户 500 RPS）和按模型（全局 LLM 配额）双维度限流，超限返回 429 + `Retry-After`。
- **第二层·应用**：编排服务内用 `asyncio.Semaphore(并发上限)` 限制同时进行中的 LLM 调用；配合 `aiolimiter` 做令牌桶，防止突发。
- **第三层·Provider 侧**：每个模型 Provider 预留配额，本层限流兜底防把第三方打崩。
- **整形**：对非实时请求做漏桶平滑，把高峰流量摊平到低谷，保护下游。

#### ② SSE/WebSocket 长连接管理

- **实现**：连接与会话绑定（session_id），断线用 `Last-Event-ID` / 序号续传；事件驱动 I/O（asyncio / Go goroutine）承接数万连接。
- **心跳与清理**：定时 heartbeat 探测死连接并回收；设置连接空闲超时。
- **背压**：客户端消费慢时，服务端对消息队列做 backpressure，避免内存积压拖垮进程。
- **容量口径**：长连接数 ≠ QPS；按"在线同时执行数"单独估，内存占用量 = 连接数 × 每连接缓冲。

#### ③ 水平扩展策略

- **编排层**：Runner 无状态，直接横向加副本；用 HPA 按 CPU 与队列积压双指标自动扩缩容。
- **工具计算层**：CPU 密集的工具（代码执行、数据分析）单独部署、独立扩，不挤占编排。
- **Session 层**：Redis 集群 + 一致性哈希，随流量水平扩展；避免单点。

#### ④ 缓存降热与结果复用

- **静态缓存**：agent 指令、工具 schema、模型配置（几乎不变）进程内缓存，LRU + 失效时间。
- **结果缓存**：相同子问题（如同 topic 检索、同订单查询）按"输入 hash + 版本"缓存，命中直接返回，降 token 与延迟；注意缓存 key 要含模型与上下文指纹，避免张冠李戴。
- **热点保护**：缓存穿透时用空结果缓存 + 布隆过滤器，防打爆下游。

#### ⑤ 异步削峰

- **投递**：多 handoff 长流程作为消息写 Kafka，按 session_id 分区保证顺序；Worker 按消费能力拉取。
- **削峰效果**：突发流量先落队列排队，Worker 匀速消化，保护 LLM Provider 与下游系统；队列积压是核心告警项。
- **死信与重试**：消费失败进重试队列，超过 N 次进死信队列，人工或降级处理。

#### ⑥ 推理并发控制

- **多 agent 并行**：无依赖分支用 `asyncio.gather` 并发执行，整体时延降到最慢分支。
- **单 agent 内**：tool 循环串行保证正确性（后一步依赖前一步结果）；同一会话内不并行写状态，避免乱序。
- **全局并发预算**：编排层设置"同时进行 LLM 调用上限"，超过则排队或返回"忙，稍后重试"。
- **限流/流量整形**：网关令牌桶按租户/模型限流；SDK 层对并发 LLM 调用用 asyncio.Semaphore 限并发，防打爆 Provider。
- **SSE/WebSocket 长连接**：事件驱动 I/O 承接数万连接；StreamedRun 输出事件流（raw response / deltas / tool calls / handoff）逐帧推送，连接与 session 绑定，断线可重连恢复。
- **水平扩展**：Runner 无状态 + 会话外置，直接横向加副本；CPU 密集（工具计算）独立扩。
- **缓存降热**：agent 指令/工具 schema 缓存；相同子问题结果缓存复用降 token 与延迟。
- **异步削峰**：多 handoff 长流程进 MQ，Worker 消费；突发流量排队消化。
- **推理并发控制**：多 agent 并行编排用 asyncio.gather 并发执行独立分支；单 agent 内 tool 循环串行保正确性。

## 六、高可用设计

### 高可用设计 · 生产级实现细节

#### ① 多副本 / 多 AZ / 故障转移

- **部署**：Runner ≥ 2 副本、分布 ≥ 2 个可用区；前端负载均衡做健康检查（`/healthz`），实例故障自动摘除，流量切到存活实例。
- **SLA**：99.9% 对应年停机少于 8.76 小时。
- **AZ 级容灾**：跨 AZ 双活，某 AZ 整体故障时，会话从另一 AZ 的 Redis 副本恢复。

#### ② 状态可靠与 checkpoint 恢复

- **Sessions 存储**：Redis 主从 + AOF 持久化做主存储，异步落 Postgres 做备份；主从切换用哨兵/集群自动 failover。
- **checkpoint**：长流程每完成一个 agent 节点/关键工具调用就写一次 checkpoint；崩溃后从最近 checkpoint 重放未完成步骤，不重跑全链。
- **恢复流程**：实例重启，从 Redis 读会话，校验一致性，从 checkpoint 继续执行。

#### ③ LLM 多 Provider 兜底 + 熔断

- **failover**：OpenAI 主 + 备用模型（如本地/Anthropic）；主请求超时/失败自动切换，Provider 间 key 与配额隔离。
- **熔断参数**：错误率 > 50% 且窗口请求 > 20，熔断打开；30s 半开后放探测，成功即关闭；避免雪崩。
- **降级链**：主力模型，备用模型，本地小模型，返回兜底结果（"服务繁忙，请稍后再试"）。

#### ④ 降级策略

- **流程降级**：多 handoff 流程在故障时降级为单 agent 直答，牺牲质量保可用。
- **功能降级**：工具失败不阻塞主流程，返回"工具不可用"提示继续对话；guardrail 失败快速失败返回安全话术。
- **读写降级**：Redis 不可用降级到 Postgres；缓存不可用直接透传 DB。

#### ⑤ 幂等与容灾重放

- **消息幂等**：MQ 消费按消息唯一 ID 去重（Redis SETNX / 幂等表），重放不产生重复消费。
- **工具副作用幂等**：发邮件/扣款/写库等写操作带 `request_id`，服务端幂等表去重。
- **崩溃重放安全**：重放只执行无副作用或幂等的步骤；有副作用的步骤靠 request_id 保证只发生一次。

| 维度 | 做法 | 目标 |
|-|-|-|
| **多副本/多AZ** | Runner 多副本 + 跨 AZ 部署；网关健康检查摘除故障实例 | 消除单点，99.9%（年停机少于 8.76 小时） |
| **状态可靠** | Sessions 写 Redis 主从 + 异步落 Postgres；checkpoint 后继续执行 | RTO 秒级、任务不丢 |
| **LLM 多 Provider** | OpenAI 主 + 备用模型 failover；熔断器防雪崩 | 外部抖动不影响核心 |
| **降级策略** | handoff 降级为单 agent 直答；guardrail 失败快速失败返回兜底话术；工具失败不阻塞主流程 | 峰值/故障下仍可用 |
| **幂等容灾** | 消息消费幂等（消息 ID 去重）；工具副作用幂等（request_id）；崩溃后重放安全 | 一致 + 可靠 |

## 七、一致性与会话状态管理

### 一致性与会话状态管理 · 生产级实现细节

#### ① Sessions 外置 + event sourcing

- **事件模型**：每次状态变更（agent 发言、工具调用、task 输出）作为不可变事件追加，事件含 `event_id / session_id / type / payload / ts / seq`；当前状态 = 事件流重放结果。
- **快照压缩**：事件流无限增长会拖慢重放，定期（如每 1000 条或每天）生成"当前状态快照"，后续从快照 + 增量事件恢复。
- **生产收益**：可审计、可回溯、可 debug（"时光倒流"回滚到任意时间点）；崩溃后重放到最近一致点即恢复。

#### ② 最终一致性 + 消息顺序

- **异步落库**：任务结果异步写库，不强一致；同一会话内顺序通过 `session_id 哈希到同一 Kafka 分区`、分区内串行消费保证。
- **顺序校验**：消费端按 seq 递增校验，乱序（如分区重平衡）时缓存待重排。
- **最终收敛**：对账任务定时检查"已执行 vs 已落库"，补齐缺口。

#### ③ 工具副作用幂等

- **request_id**：每次工具调用生成唯一 `request_id`（UUID），随调用透传。
- **幂等表**：服务端按 request_id 建唯一索引，先查，已处理直接返回原结果，未处理才执行并写入；用 Redis `SETNX + 过期` 做快速幂等，DB 唯一索引做最终兜底。
- **场景**：发邮件、扣款、写库、调用外部 API，全部必须幂等，防止重试重复执行。

#### ④ 本地事务 + Outbox 模式

- **原子性**：本地事务内同时写"业务记录 + outbox 表（待发消息）"，两者同事务，要么都成功要么都失败。
- **投递**：后台任务扫描 outbox，投递 MQ 成功标记已发送；投递失败重试（带指数退避）。
- **收益**：避免"先写库后发消息"或"先发消息后写库"的不一致，也避开分布式事务。
- **清理**：已确认消息定期归档删除，防 outbox 表膨胀。

#### ⑤ 记忆一致性（乐观锁）

- **版本号**：长期/实体记忆记录带 `version`；更新时带"我读到的 version"，提交时校验，一致才写并自增，不一致说明被并发修改，拒绝或重试。
- **短期记忆**：随会话，天然单写者，冲突少。
- **实体记忆**：多 agent 并发更新同一实体（如客户偏好）用乐观锁串行化，避免后写覆盖先写。
- **Sessions 外置 + 版本化**：会话上下文作为不可变消息追加（event sourcing 风格），当前状态 = 消息序列重放；崩溃后从最近 checkpoint 恢复，支持"回溯重放"调试。
- **最终一致性**：结果异步落库；同一会话内消息顺序通过 session_id 哈希到同一 Kafka 分区、分区内串行消费保证。
- **幂等副作用**：每次工具调用带唯一 request_id，服务端幂等表去重，重试不产生重复副作用（如重复发邮件/扣款）。
- **本地事务 + Outbox**：写库与发事件用本地事务 + outbox 表，后台扫描投递 MQ，实现"写库与发消息"原子性，避免分布式事务。
- **记忆一致性**：长期记忆更新用乐观锁（版本号），并发写入冲突时拒绝/重试。

## 八、可观测性、监控与扩展性

### 可观测性、监控与扩展性 · 生产级实现细节

#### ① 全链路追踪（Trace）

- **trace 结构**：每个用户请求一个 `trace_id`；LLM 生成（GenerationSpan）、工具调用（FunctionSpan）、guardrail（GuardrailSpan）、handoff（HandoffSpan）四级 span 父子串联。
- **导出**：SDK 内置 Tracing 自动生成 span，通过 OTel 导出到 Jaeger/Tempo；生产按需采样（如全量 + 采样），控制存储成本。
- **排障**：一个请求 = 一次完整 trace，能直观看到"哪一步慢、哪个模型超时、handoff 到了谁"。

#### ② 指标（Metric）与告警

- **核心指标**：QPS、P50/P95/P99 首字延迟、总延迟、错误率、LLM 限流率、工具失败率、MQ 积压、token 用量、成本。
- **采集**：Prometheus 采集，Grafana 看板；关键指标按请求总量聚合 + 按租户/agent 拆分。
- **告警阈值示例**：LLM 限流率 > 5%、MQ 积压持续增长、错误率破线、P95 延迟超阈值，Alertmanager 通知。

#### ③ 日志（Log）

- **结构化**：JSON 日志全量采集，含 trace_id / session_id / agent / task / model / token 用量 / 耗时。
- **关联**：按 trace_id 关联检索"一次请求的所有日志"；统一入 ELK/Loki，接告警。

#### ④ 容量与成本管理

- **按租户**：统计各租户 token 消耗与成本，设配额与上限，超额熔断或告警。
- **模型路由**：小任务路由小模型，复杂任务用大模型；结果缓存降 token。
- **成本告警**：单日成本突增触发告警，防失控。

#### ⑤ 演进路径

- **阶段**：单机验证，异步化 + 多进程，Sessions 外置，沙箱 compute 分离，分库分表，多区域。
- **原则**：每阶段先补齐对应观测能力（trace/指标/日志），避免"裸奔上线"后难以定位问题。
- **链路追踪**：SDK 内置 Tracing，LLM 生成（GenerationSpan）、工具调用（FunctionSpan）、guardrail（GuardrailSpan）、handoff（HandoffSpan）四级 span 父子串联；一个用户请求 = 一次完整 trace，可直接可视化"哪个 agent 说了什么、调了什么工具、移交给了谁"。

<details class="marginalia" open>
  <summary>四级 span</summary>
  <div class="marginalia-body">
    Generation、Function、Guardrail、Handoff 不分开记的话，排障时只能看到最后一句回复，看不出话是在哪一次移交里变掉的。
  </div>
</details>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-span-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">追踪瓶</span>
  </div>
  <p class="duang-whisper-body">四级 span 串起来，才知道是谁把话交出去的。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

- **指标告警**：QPS、P50/P95 首字延迟、错误率、LLM 限流率、工具失败率、MQ 积压、token 成本；Grafana + Alertmanager。
- **日志**：JSON 结构化日志含 trace_id / agent / model / token 用量，统一入 ELK/Loki。
- **容量成本管理**：按租户统计 token；小任务路由小模型；结果缓存降 token；配额 + 告警防失控。
- **演进路径**：单机验证，异步化 + 多进程，Sessions 外置，沙箱 compute 分离，分库分表，多区域；每阶段先补齐观测能力。

## 九、面试追问点速查

| 常见追问 | 参考答案要点 |
|-|-|
| Handoffs 和 Agents-as-tools 区别？ | handoff 是去中心化移交控制权（peer 关系）；as-tools 是中心化嵌套（父子关系），agent 把另一个 agent 当工具调用 |
| 为什么放大系数高？ | 每次 handoff 换 agent 都要重建上下文 + 新一轮 LLM 调用；链越长放大越明显，按 3\~5 倍估 |
| Guardrail 怎么并行？ | 输入 guardrail 与 agent 执行并行跑，失败快速失败；输出 guardrail 在结果产出后校验，可改写或拦截 |
| 会话一致性怎么做？ | 消息追加 + checkpoint；session 哈希分区保顺序；request_id 幂等；outbox 保证写库发消息原子 |
| 断线重连如何恢复？ | 会话外置 + 事件流重放，从最近 checkpoint 续跑，不重跑全链 |
| SDK 为什么不用图/团队抽象？ | 原语少、组合自由、学习曲线低；复杂控制流用语言特性表达 |
| 沙箱作用？ | 文件/命令/代码隔离执行；harness 与 compute 分离，安全、持久化、可弹性扩展 |
| 与 AutoGen 选型差异？ | AutoGen 对话驱动适合研究/自由协作；Agents SDK 轻量生产向、OpenAI 生态；LangGraph 图状态机适合强控制流 |

## 十、面试口述话术包（照着念版）

每段约 30\~50 秒，按"结论先行，讲关键，给例子"组织，直接背下来即可应对对应维度的问题。

### 10.1 需求澄清（怎么开口）

> 我先确认边界。这个系统要解决的是多智能体协同：用户一句话进来，可能触发一个或多个 Agent 分头干活。功能上我要 Agent、任务移交 Handoff、输入输出校验 Guardrail、工具调用、会话持久化这几块。非功能上我要考虑并发，比如目标是日活百万，峰值可能到几百 QPS，还要注意一个用户请求会放大成几次甚至十几次内部 LLM 调用，这才是真正要扛的吞吐。约束上它强依赖外部大模型，所以要考虑限流、成本和安全合规。我先按这个口径往下估容量，你看合适吗？

### 10.2 容量估算（核心亮点）

> 我先亮假设：日活 100 万，平均每用户每天 3 次会话，40% 触发多智能体移交。算下来日均 300 万请求，平均约 35 QPS，峰值按 6 倍约 210 QPS。但重点不在这，多智能体的特征是放大系数：平均一次会话 1.8 个 Agent 节点，每个节点 1 到 3 次模型调用，40% 会话带移交，所以每个用户请求平均放大 3 到 5 倍模型调用，峰值要到每分钟几万次。同时要考虑流式连接数、token 吞吐、存储增量和带宽。我认为多智能体系统的容量核心是模型调用吞吐和 token 成本，不是 HTTP QPS。

### 10.3 技术栈（为什么这么选）

> 我按层选型。语言用 Python 配合 asyncio，因为这是 SDK 原生、I/O 密集场景并发好。编排直接用 SDK 的 Runner，内置了任务循环、工具循环、移交切换和护栏校验，不用自研。网关用 Kong 或 APISIX 做限流鉴权和 SSE 转发。队列用 Kafka，因为长流程要异步解耦和削峰。缓存和会话用 Redis，关系库用 PostgreSQL，向量库用 pgvector，对象存储用 S3 存 trace 文件。可观测用 SDK 内置 tracing 导出到 Jaeger。每个选择我都权衡过：比如为什么用 Kafka 不用 Redis，因为要持久化和削峰，消息不能丢。

### 10.4 架构（一句话说清）

> 我的核心是"无状态编排加异步解耦"。Runner 不保存用户状态，所有会话上下文外置到 Sessions，所以任意实例能接管任意会话，天然水平扩展。同步快路径给单 Agent 单轮问答保证流式体验，多移交的长流程走消息队列异步执行。Handoff 是去中心化的，模型自己决定移交目标，Runner 自动切换，不需要中央调度器。外部依赖用多 Provider 兜底和熔断。沙箱和计算分离，保证安全和弹性。

### 10.5 高并发（讲三层限流）

> 高并发我分三层控制。第一层网关用令牌桶按租户和模型限流，超限返回 429。第二层应用层用信号量限制同时进行的模型调用数。第三层是 Provider 侧预留配额兜底。流式我用 SSE 长连接，事件驱动 I/O 承接数万连接，心跳保活、断线续传。多 Agent 并行用 asyncio.gather 并发执行独立分支，削峰靠把长流程投队列让 Worker 匀速消化。缓存上静态配置进程内缓存、相同子问题结果缓存复用降 token。

### 10.6 高可用（SLA 与兜底）

> 我做到 99.9% 可用性，对应年停机少于 9 小时。Runner 多副本跨可用区部署，网关健康检查自动摘除故障实例，无状态所以 RTO 秒级。状态可靠靠 Sessions 写 Redis 主从加 Postgres 备份，崩溃后从最近检查点续跑。模型调用多 Provider 冗余加熔断，主模型挂了自动切换备用。降级链是：多 Agent 降成单 Agent，层级流程降成顺序，工具失败不阻塞主流程。消息消费和工具副作用都做幂等，靠消息 ID 和 request_id 去重，重放安全。

### 10.7 一致性（讲事件溯源和幂等）

> 会话状态我外置到 Sessions 并且用事件溯源，每次状态变更作为不可变事件追加，当前状态就是重放结果，还能做快照压缩。最终一致为主，同一会话的消息靠哈希到同一 Kafka 分区、分区内串行消费保证顺序。工具副作用必须幂等，每次调用带 request_id，服务端幂等表去重，防止重试重复发邮件或扣款。跨服务我用本地事务加 Outbox，写库和发消息一个事务里完成，后台投递。长期记忆更新用乐观锁版本号，并发冲突拒绝或重试。

### 10.8 可观测性（讲四级 span）

> 这是多智能体系统最能体现工程能力的地方。我用 SDK 内置的 tracing，一个请求是一条完整 trace，包含模型生成、工具调用、护栏校验、Agent 移交四级 span，父子串联，能直观看到哪个 Agent 说了什么、调了什么工具、移交给了谁。指标上我盯 QPS、延迟分位、错误率、模型限流率、队列积压和 token 成本。日志是结构化 JSON 带 trace_id 方便关联。成本管理按租户统计 token，小任务用小模型，结果缓存降成本。演进路径从单机到异步化、外置会话、沙箱分离、分库分表、多区域，每步先补齐观测。

## 十一、端到端生产部署配置示例

## 参考来源

下面给一份可直接照抄的生产部署骨架：容器编排、环境变量、限流与熔断配置、可观测导出。面试能讲出"这些参数怎么定"比罗列组件更显深度。

### 11.1 Docker 服务骨架
```docker
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# 健康检查端口，供网关探活
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

```

### 11.2 关键环境变量

| 变量 | 作用 / 建议值 |
|-|-|
| `OPENAI_API_KEY / BACKUP_API_KEY` | 主备模型 key，failover 时切换 |
| `SESSION_STORE` | redis:// 主从地址；异步落 Postgres |
| `MAX_CONCURRENT_LLM` | 并发上限，如 20，超出排队 |
| `KAFKA_BROKERS` | 长流程消息队列地址 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | trace 导出目标（Jaeger/Tempo） |
| `TRACE_SAMPLE_RATIO` | 采样率，生产常用 1.0 全量或 0.1 |

### 11.3 网关限流配置（Kong 令牌桶示意）
```yaml
# 按 tenant 维度限流：每租户 500 请求/分钟
plugins:
  - name: rate-limiting
    config:
      minute: 500
      policy: redis
      redis_host: redis-master
      fault_tolerant: true
      limit_by: consumer

```

### 11.4 熔断器配置示例
```python
from pybreaker import CircuitBreaker

llm_breaker = CircuitBreaker(
    fail_max=10,          # 连续失败 10 次触发
    reset_timeout=30,     # 30 秒后进入半开
    exclude=[TimeoutError],
)

@llm_breaker
def call_llm(prompt):
    try:
        return primary_model(prompt)
    except Exception:
        return backup_model(prompt)   # failover 到备用模型

```

### 11.5 面试加分提示

- 讲到 99.9% 可用性时，主动说出"对应年停机少于 8.76 小时"，能体现你真算过。
- 讲限流时强调"三层：网关、应用、Provider"，比只说令牌桶更完整。
- 讲放大系数时给出具体数字（如 3\~5 倍）而非泛泛，这是多 Agent 系统区别于单 Agent 的关键。

参考链接。

- [OpenAI Agents SDK 官方文档（Python）](https://openai.github.io/openai-agents-python/)
- [Agents / Handoffs / Guardrails 概念](https://openai.github.io/openai-agents-python/agents/)
- [Tracing：四级 span 说明](https://openai.github.io/openai-agents-js/guides/tracing/)
- [Running agents：guardrail / handoff 运行参数](https://openai.github.io/openai-agents-python/running_agents/)
- [OpenAI Agents SDK 中文介绍（Sessions / HITL / Tracing）](https://openai.github.io/openai-agents-python/zh/)

