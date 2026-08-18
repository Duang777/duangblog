---
author: Duang
pubDatetime: 2026-08-18T19:50:00+08:00
title: Agent 时代的 Trace 到底怎么做：从 Langfuse 看清数据模型与落地
featured: false
draft: false
tags:
  - Agent 系统架构设计
description: 不绑某个观测 SaaS。把 agent trace 的数据模型、五个难点、大厂路线和落地范式讲清楚，让你知道该埋什么、为什么埋、怎么避免被坑。
---

**系列说明**｜这是 [Agent 系统架构设计](/posts/agent-system-architecture/) 专栏的一篇侧记，不进（一）（二）编号。第一篇地基见 [定义、光谱与最小内核](/posts/agent-arch-definition/)。本篇专挖一件生产里绕不开的事：Agent 的 trace 该怎么埋、怎么看、怎么不被坑。

一篇写给后端工程师的实战向长文。重点不在"这个工具怎么装"，而在于把 agent trace 这件事的**数据模型、难点、大厂路线、落地范式**讲透，让你不管用 Langfuse、LangSmith、Phoenix 还是自家 OTel 栈，都能想清楚要在 trace 里埋什么、为什么这么埋、以及怎么避免被坑。

## 一、先打地基：什么是可观测性，什么是 trace，为什么 agent 特别需要它

很多人一上来就问"用 Langfuse 还是 LangSmith"，但在这之前有个更基本的问题没厘清：我们到底在解决什么问题。这一章先把地基打牢：可观测性是什么、trace 是什么、以及 agent 相比普通服务为什么非看 trace 不可。地基不稳，后面看各家方案会一直飘。

### 1.1 从监控到可观测性：不是同一个词

先区分两个常被混用的词。

**监控（monitoring）** 解决的是"我知道要看什么"的问题。你提前定义好几个指标（CPU 利用率、错误率、接口 P99），系统帮你看住它们，超阈值就告警。它的前提是：你大概知道哪里会出问题，并且问题能用几个数值表达。

**可观测性（observability）** 解决的是"我不知道会出什么错，但我能从系统输出反推出内部状态"的问题。这个词来自控制论，说的是一个系统如果状态可被外部观测完全推断，就是可观测的。落到工程上，意思是：当一次请求以你完全没预料到的方式失败时，你还能靠它留下来的线索（而不是靠你提前埋的点）还原出"当时发生了什么"。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    监控是你知道要看什么；可观测是你事后还能反推当时发生了什么。Agent 的分支是模型现决定的，所以只能押在后者。
  </div>
</details>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-trace-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">trace 瓶</span>
  </div>
  <p class="duang-whisper-body">指标只能告诉你病了。树才能告诉你哪根血管堵了。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

为什么这个区别对 agent 致命？因为 agent 的失败模式恰恰是你**预料不到**的：你没法提前说"我要盯住第 3 步的某指标"，因为第 3 步走不走、走哪条分支，是模型运行时现决定的。你只能事后再从 trace 里把因果拼回来。

可观测性的经典三支柱：

- **Metrics（指标）**：聚合的、可加的计数。比如"过去 5 分钟平均 token 数""错误率"。它回答"整体健康吗、趋势怎样"，但不回答"这一次具体为什么错"。
- **Logs（日志）**：离散的事件记录，一行一个事实。它回答"某个时刻发生了什么"，但彼此之间没结构关联，海量日志里很难拼出一条完整链路。
- **Traces（链路 / 追踪）**：把一次请求穿过的所有环节按父子 / 先后关系串成一棵树，每个节点带时间戳和上下文。它回答"这一次请求从头到尾经历了什么、卡在哪、谁调了谁"。

LLM agent 的可观测性，主角就是 traces，但要在上面挂满 AI 专属上下文（prompt、completion、token、tool 调用）。后面会反复用到这三支柱的概念。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：可观测三支柱 · 各答各的题</p>
  <p class="article-embed-note-lead">Metrics 看整体，Logs 看某时刻，Traces 把一次请求串成树。Agent 的主角是 Traces，但树上要挂满 prompt / token / tool。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 220" role="img" aria-label="Metrics Logs Traces 三支柱">
        <rect class="mixup-panel" x="24" y="36" width="180" height="140" rx="12"/>
        <text class="mixup-title" x="114" y="78" text-anchor="middle">Metrics</text>
        <text class="mixup-caption" x="114" y="108" text-anchor="middle">整体健康吗</text>
        <text class="mixup-label" x="114" y="136" text-anchor="middle">P99 / 错误率 / token</text>
        <rect class="mixup-panel" x="230" y="36" width="180" height="140" rx="12"/>
        <text class="mixup-title" x="320" y="78" text-anchor="middle">Logs</text>
        <text class="mixup-caption" x="320" y="108" text-anchor="middle">某时刻发生了什么</text>
        <text class="mixup-label" x="320" y="136" text-anchor="middle">离散事件，难串链</text>
        <rect class="mixup-panel is-accent" x="436" y="36" width="180" height="140" rx="12"/>
        <text class="mixup-title" x="526" y="78" text-anchor="middle">Traces</text>
        <text class="mixup-caption" x="526" y="108" text-anchor="middle">这一次谁调了谁</text>
        <text class="mixup-label" x="526" y="136" text-anchor="middle">父子 span 成树</text>
      </svg>
    </div>
  </figure>
  <p class="article-embed-note-foot">Agent 失败路径事先画不出来，所以只能事后从树里把因果拼回来。</p>
</section>

### 1.2 什么是 trace：一棵带时间戳的 span 树

抛开 LLM，先理解 trace 的通用形态。一次分布式请求（比如用户点下单，请求穿过网关、订单服务、库存服务、支付服务）会产生一条 **trace**：它由一串 **span**（跨度）组成，每个 span 代表"一段有起止时间的操作"，并且通过父子关系嵌套成树。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    面试常考点：trace / span / context propagation 分别解决什么。说不清这三样，后面谈 Langfuse 都是空转。
  </div>
</details>

关键概念：

- **span**：一次操作的记录，有 name、起止时间（duration）、以及一堆属性（attributes，比如这次调了哪个服务、传了什么参数）。
- **parent / child**：一个 span 可以包含子 span，形成树。比如"下单"是父 span，"扣库存"和"调支付"是它的两个子 span。
- **trace_id**：整棵树的唯一 ID，所有 span 共享它，这样散落在不同服务、不同机器的 span 能被重新拼回一棵树。
- **context propagation（上下文传播）**：调用跨进程时（比如订单服务调支付服务），要把 trace_id 和当前 span_id 顺着请求带过去，下游才能把它的 span 接成上游的子节点。这是分布式追踪能"串起来"的基础。

下面这段代码不依赖任何框架，纯手写一个 span 树，让你直观感受 trace 长什么样、父子关系怎么建：

```python
import time
import uuid

# 一个极简的 span：name 是这步叫什么，start/end 是起止时间，children 挂子 span
class Span:
    def __init__(self, name, trace_id, parent_id=None):
        self.name = name                # 这一步的名字，比如 "下单"
        self.trace_id = trace_id        # 整条 trace 的 ID，所有 span 共享
        self.span_id = uuid.uuid4().hex # 当前 span 的唯一 ID
        self.parent_id = parent_id      # 父 span 的 ID；根 span 为 None
        self.start = time.time()        # 开始时间戳
        self.end = None                 # 结束时间，结束时填
        self.attributes = {}            # 自定义属性，比如调了哪个服务

def finish(self):
        self.end = time.time()          # 结束时记录时间戳，duration = end - start

def duration_ms(self):
        if self.end is None:
            return 0
        return round((self.end - self.start) * 1000, 2)  # 转成毫秒

# 模拟一次下单请求：根 span 是"下单"，下面挂"扣库存"和"调支付"两个子 span
trace_id = uuid.uuid4().hex
root = Span("下单", trace_id)                  # 根 span，没有父节点

deduct = Span("扣库存", trace_id, root.span_id) # 子 span，父是 root
deduct.attributes["service"] = "inventory"      # 记一下调了哪个服务
time.sleep(0.05)                               # 假装花了 50ms
deduct.finish()

pay = Span("调支付", trace_id, root.span_id)    # 另一个子 span
pay.attributes["service"] = "payment"
time.sleep(0.08)
pay.finish()

root.finish()

# 打印这棵树的形状：三个 span 共享同一个 trace_id，靠 parent_id 串成树
print("trace_id =", trace_id)
print(f"  {root.name} ({root.duration_ms()}ms)")
print(f"    ├─ {deduct.name} ({deduct.duration_ms()}ms) -> {deduct.attributes['service']}")
print(f"    └─ {pay.name} ({pay.duration_ms()}ms) -> {pay.attributes['service']}")
```

跑出来大概是这样：

```text
trace_id = 3f2a...
  下单 (136.2ms)
    ├─ 扣库存 (51.3ms) -> inventory
    └─ 调支付 (81.7ms) -> payment
```

这就是 trace 的全部精髓：**一个 ID 把散布各处的操作收成一棵树，每个节点带时间和上下文**。你以后看 Langfuse / Datadog 里那棵嵌套树，本质就是上面这个结构加了 AI 字段。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：一条 trace · 根 span 下挂子 span</p>
  <p class="article-embed-note-lead">整棵树共享同一个 trace_id。父子靠 parent_id 串起来；跨进程还得靠 context propagation 把上下文带过去。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 260" role="img" aria-label="span 树示意">
        <rect class="mixup-panel is-accent" x="220" y="18" width="200" height="52" rx="10"/>
        <text class="mixup-title" x="320" y="50" text-anchor="middle">下单 · root</text>
        <line class="mixup-ring" x1="320" y1="70" x2="160" y2="120"/>
        <line class="mixup-ring" x1="320" y1="70" x2="480" y2="120"/>
        <rect class="mixup-panel" x="70" y="120" width="180" height="52" rx="10"/>
        <text class="mixup-sub" x="160" y="152" text-anchor="middle">扣库存</text>
        <rect class="mixup-panel" x="390" y="120" width="180" height="52" rx="10"/>
        <text class="mixup-sub" x="480" y="152" text-anchor="middle">调支付</text>
        <circle class="mixup-dot is-live" cx="160" cy="210" r="5"/>
        <circle class="mixup-dot is-live" cx="480" cy="210" r="5"/>
        <text class="mixup-label" x="320" y="216" text-anchor="middle">同一 trace_id · 不同 span_id</text>
      </svg>
    </div>
  </figure>
</section>

### 1.3 为什么 agent 特别需要 trace：普通监控会"失明"

现在落到 agent。普通 Web 服务里，代码路径是写死的：下单一定走"扣库存 -> 调支付"。你只要监控这两个服务的错误率和延迟就够了，因为流程是可预测的。

agent 完全相反，四个特性让传统监控直接失明：

**第一，运行路径是模型现选的，不可预测。** 你给 agent 一个任务"帮我订明天去上海的票"，它内部可能先调搜索工具看航班，也可能先问你偏好，也可能先调日历看日程：走哪条路、调几次工具、调哪些，是 LLM 根据上下文临时决定的。你没法提前埋"盯住第 3 步"，因为根本没有固定的第 3 步。一个 bug 可能是"模型在某种输入下陷入了调工具的死循环"，这种事你事先想不到，只能事后从 trace 里看到"它调了 47 次同一个工具才停下来"。

**第二，失败经常是"错得有理"，不会抛异常。** 普通服务出错，要么抛 500，要么超时，监控立刻红。agent 的失败常常是：返回了一段看起来完全合理、实则事实错误的答案（幻觉），或者调了一个不相关的工具、把任务做偏了，但全程 HTTP 200、没有异常。这种"静默错误"监控指标一个都抓不到，只能靠把 prompt、completion、tool 的出入参全记下来，人去 review 或者靠 eval 打分才发现。

**第三，成本是按 token 算的，跑飞了很贵。** 普通接口的成本大致是"一次调用一次计费"，可预期。agent 一次任务可能烧几千 token，如果陷入循环或选了最贵的模型反复重试，账单会爆。你得能按"哪次任务、哪个 agent、哪段 reasoning"精确归因 token 和钱，否则月底看到一张意外的大账单却不知道是谁烧的。

**第四，多 agent 串联时错误会级联。** 一个 supervisor 调度 5 个子 agent，子 agent A 给了错误的检索结果，导致子 agent C 基于错误前提做出了错误决策。这种跨 agent 的因果，如果不把"谁依赖了谁、各自吐了什么"记成一条共享 trace_id 的树，调试就是纯靠猜。

把这四点合起来：agent 是一个 **probabilistic（概率性）、多步、会自己调工具** 的系统，它的"正确性"和"成本"都不在你能事先写死监控指标的范畴里。你唯一能做的，是把每一次执行的完整轨迹（输入、每一步的思考、每一次工具调用的出入参、每一次模型返回、每步的 token 和耗时）都记成 trace，出了事再回放、再归因、再评估。这就是为什么 agent 可观测几乎等于"把 trace 做厚"。

这也是为什么下一章会讲 Langfuse 的数据模型：它本质上就是把上面那棵 span 树，换成了"每片叶子要么是一次模型调用、要么是一次工具调用、并且带着 prompt / completion / token 这些 AI 字段"的版本。理解了地基，上面那些平台的差异就好懂了。

---

## 二、为什么 agent 不能用传统 APM 糊弄过去

先说清楚一个问题：你团队里那套 Prometheus + Jaeger / Grafana Tempo + Datadog APM，为什么到了 LLM agent 这儿突然不够用了？

传统分布式追踪回答的是"**请求经过了哪些服务、哪里慢了、谁报错了**"。它的 span 类型是 client / server / internal / producer / consumer，属性是 `http.method`、`db.statement` 这种。一个典型的传统 span 长这样：

```json
{
  "name": "GET /checkout",            // 这个 span 的名字，一般是接口路径
  "kind": "SERVER",                  // 角色：服务端收到请求
  "attributes": {                    // 附带的标签，全是通用 HTTP/DB 维度
    "http.method": "GET",
    "http.route": "/checkout",
    "http.status_code": 200,
    "db.system": "postgresql"
  }
}
```

这些对 agent 来说基本是隔靴搔痒。一个 agent 跑一次，真正让你睡不着的问题是另一组：

- 模型到底被 prompt 了什么？它返回了什么？（这是最值钱的调试信息，也是最有风险的隐私数据）
- 它调用了哪个 tool、参数对不对、返回了什么、为什么选了这个 tool 而不是那个？
- 一个请求烧了多少 token、花了多少钱、TTFT（首 token 延迟）多少？
- 它为什么走偏了：是哪一步的 reasoning 出了问题，还是检索回来的上下文是错的？
- 多 agent 编排时，Agent 3 的一个决定其实依赖 Agent 1 一小时前的输出，这条因果链怎么还原？

同样一次 agent 调用，在 Jaeger 里你可能只看到一个 `POST /v1/chat/completions` 的 span，耗时 4 秒，但你完全不知道这 4 秒里模型在想什么、调了什么工具、烧了多少 token。而在 Langfuse 这类工具里，你会看到一棵嵌套树：agent 节点 到 思考节点 到 tool 调用节点 到 子 agent 节点 到 又一次 LLM generation 节点，每个节点都带着 prompt、completion、token 数、成本。

所以在 2024–2025 年，一批"LLM 原生"的可观测平台长出来了：Langfuse、LangSmith、Arize Phoenix、Helicone、W&B Weave、Datadog LLM Observability、Braintrust、Portkey、Lunary……它们的共同点是：**把一次 agent 执行当成一棵"嵌套观测树"，叶子节点是模型调用**，并且为 prompt、completion、token、model 版本、tool 调用、evaluation 这些概念提供了一等公民级别的字段。

Langfuse 是这个赛道的开源代表（核心 MIT 协议），它的数据模型最值得先吃透，因为它是后面所有方案对照的基准。

---

## 三、Langfuse 的数据模型：一棵带"AI 语义"的树

Langfuse 的四个核心嵌套概念：

**1. Trace（追踪）**

代表一个逻辑工作单元，通常就是"一个用户请求"或"一个 agent 任务"。它装着这次执行的整体 input / output，以及 user、session、tags、metadata 这类元信息。

**2. Observation（观测）： 三种子类型**

一棵 trace 里面挂一串 observation，分三种：

- **span**：包裹任意一段有起止时间的代码块，比如"检索知识库""调用计费 API"。
- **generation**：专门包裹一次模型调用，自带 prompt、completion、model 名、采样参数、input / output token 数、以及根据价格表**算出**的单位成本。
- **event**：记录一个没有持续时间的瞬时事实，比如"用户点了踩""触发了 guardrail"。

**3. Session（会话）**

把同一段对话里的多条 trace 归到一组，典型场景就是聊天界面的一个 thread。

**4. User（用户）**

跨时间把不同 session 关联到同一个人。

几个设计细节很关键，理解了才不会用错：

- **generation 的成本是"算"出来的，不是你传进去的**。Langfuse 维护一张模型价格表，根据 token 数反推成本。这意味着哪天 OpenAI 降价了，你历史上所有聚合数据会**回溯更新**：这点比让你自己填 cost 字段优雅得多，但也意味着你的价格表得跟上模型迭代。
- **score 是评估的统一抽象**。它可以挂在 trace、session、observation 或 dataset run 上，值可以是数值、类别或布尔。来源可以是人工标注、用户反馈 widget、程序化检查（正则 / 单测 / 业务规则）、或自动评估器（LLM-as-judge）。这是衡量"质量随时间变化"和"对比 prompt / 模型版本"的主要机制。
- **prompt 是带版本号的受控资源**。应用按 name + label（如 production）在运行时解析 prompt，每个 generation 会记下它用了哪个 prompt 的哪个版本。这样一旦出现质量或成本回退，你能直接定位到是哪一次 prompt 编辑引入的。

**重要的是：这套形态是"借鉴 OpenTelemetry，但为 LLM 数据留出一等字段"。** 这是理解后面所有方案冲突的钥匙。

### 3.1 Python SDK v3：一个函数把整棵 trace 建出来

下面这段是最常用的接入方式。注意 `@observe()` 装饰器会自动给函数建一个 span；如果函数内部还有被 `@observe()` 装饰的调用，它们会自动嵌套成父子关系，不需要你手写 trace_id 传递。

```python
from langfuse import get_client, observe   # get_client 拿全局客户端；observe 是装饰器，用来包出 span/generation

langfuse = get_client()                     # 初始化客户端，配置从环境变量或代码里读（公/私 key、host）

@observe()  # 装饰器：把这次函数调用自动记成一个 observation（因为里面是 LLM 调用，会被识别成 generation）
def call_llm(question: str, docs: str) -> str:
    # 构造发给模型的 messages，system 设定角色，user 带上问题和检索到的资料
    messages = [
        {"role": "system", "content": "你是知识库助手"},
        {"role": "user", "content": f"问题：{question}\n资料：{docs}"},
    ]
    # 真正调用模型；这一行会被 @observe 包成 generation，自动记录 model、prompt、completion、token
    resp = openai_client.chat.completions.create(model="gpt-4o", messages=messages)
    return resp.choices[0].message.content

@observe()  # 这个装饰器包的是整个"检索+回答"流程，会成为 call_llm 的父 span，形成嵌套树
def retrieve_and_answer(question: str) -> str:
    docs = search_kb(question)        # 普通函数，没有 @observe，不会单独成 observation
    answer = call_llm(question, docs) # 内部有 @observe，会自动挂到本函数的 span 下，形成父子关系
    return answer

question = "Langfuse 怎么算成本？"
answer = retrieve_and_answer(question)  # 调用入口，整条 trace 在这里开始

# 给当前这条 trace 附加业务维度，方便后面按用户/会话/环境聚合
langfuse.update_current_trace(
    input=question,                    # 这次请求的输入
    output=answer,                     # 这次请求的输出
    user_id="user_123",                # 关联到具体用户（跨 session 统计用）
    session_id="session_abc",          # 关联到具体会话（同一个聊天 thread 的多轮）
    tags=["agent", "kb-qa"],           # 业务标签，方便筛选
    metadata={"env": "prod", "app_version": "1.0.0"},  # 任意结构化元数据
)
langfuse.flush()  # 手动把缓冲的 observation 刷给服务端（SDK 本身后台也会批量 flush）
```

几个工程上的关键点（也是坑）：

- **SDK 不应该阻塞你的主链路延迟**。Langfuse 的 SDK 在内存里缓冲 observation，后台线程 / 协程批量 flush，可配 batch size 和 flush interval。后端连不上时指数退避重试，队列满才丢，所以业务代码不会被遥测拖死。
- **Python SDK v3 起支持原生 OpenTelemetry / OTLP 摄入**。这意味着你可以用现成的 OTel collector，把任意 OTel instrument 过的服务数据汇进 Langfuse，和专属 SDK 的 trace 混在一起看。这点对"我们已有成熟 OTel 栈"的团队特别重要。
- **敏感内容要脱敏**。prompt 和 completion 是最有价值的调试数据，也是最敏感的隐私数据。Langfuse 支持在 SDK 层做 redaction，别一股脑把用户 PII 和内部系统提示词全存进去。

### 3.2 TypeScript SDK：手动构建 trace

Python 装饰器很省事，但很多后端是 Node 服务。TS SDK 用的是显式的 `trace.generation().end()` 模式，更贴近手动埋点的心智：

```typescript
import { Langfuse } from "langfuse";   // 引入 Langfuse 客户端类
import OpenAI from "openai";           // 引入 OpenAI SDK

const langfuse = new Langfuse({ publicKey: "...", secretKey: "..." }); // 用你的项目公/私钥初始化
const openai = new OpenAI();                                                    // 初始化 OpenAI 客户端

// 先建一条 trace（对应一次请求/一个 agent 任务），挂上用户和会话维度
const trace = langfuse.trace({
  name: "chat",              // trace 名字，dashboard 里用来识别
  userId: "user_123",        // 用户维度
  sessionId: "session_abc",  // 会话维度
  input: question,           // 这次请求的输入
});

// 在 trace 下建一个 generation，专门包一次模型调用
const generation = trace.generation({
  name: "call-llm",                              // 这一步的名字
  model: "gpt-4o",                               // 用的模型
  input: [{ role: "user", content: question }],  // 发给模型的输入，会原样记录进 trace
});

// 真正调用模型
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: question }],
});

// 调用结束后，把输出和用量回填进 generation（usage 用于算成本）
generation.end({
  output: completion.choices[0].message.content,        // 模型返回的内容
  usage: {
    input: completion.usage?.prompt_tokens ?? 0,         // 输入 token 数，没有就记 0
    output: completion.usage?.completion_tokens ?? 0,    // 输出 token 数，没有就记 0
  },
});

// 瞬时事件：用户点了赞（event 类型，没有持续时间，用来记一个离散事实）
trace.event({ name: "feedback", input: { action: "thumbs_up" } });

await langfuse.flushAsync();  // 异步把数据刷给服务端
```

### 3.3 score：把"质量"变成可聚合的数字

前面说 score 是统一抽象，下面三种来源都落进同一个字段，方便你在 dashboard 里横向对比：

```python
# 来源一：用户显式反馈（来自前端 widget 的回调），值是 1 表示赞、0 表示踩
langfuse.score(trace_id=tid, name="user_feedback", value=1, comment="赞")

# 来源二：程序化规则。比如校验模型输出是不是合法 JSON、是否含预期字段，返回 True/False
langfuse.score(
    trace_id=tid,
    name="valid_json",
    value=json_valid,           # 布尔值：True 表示通过规则校验
)

# 来源三：LLM-as-judge。用另一个模型给这次回答打分，适合事实性/相关性这类难用规则判断的质量
judge = openai_client.chat.completions.create(
    model="gpt-4o",
    # 让裁判模型只输出一个 0-1 之间的分数，只看事实性
    messages=[{"role": "user", "content": f"给下面的回答打分 0-1，只看事实性：{answer}"}],
)
langfuse.score(
    trace_id=tid,
    name="faithfulness",                       # 这个 score 的名字，后面按它聚合
    value=float(judge.choices[0].message.content),  # 把裁判模型的输出转成数值
    comment="LLM-as-judge 评分",
)
```

### 3.4 prompt 版本化：让回退可定位

prompt 在 Langfuse 里是受控资源，运行时按 name + label 解析，每个 generation 会记下用了哪个版本。生产环境改 prompt 前先发一个 staging 版本灰度，出问题能立刻回滚：

```python
# 拉取 production 标签下最新版本的 prompt（label 也可以是 staging，用来灰度）
prompt = langfuse.get_prompt("kb-answer", label="production")

# compile 会把模板里的 {{变量}} 替换成实际值，复用你在控制台里编辑好的提示词模板
rendered = prompt.compile(question=question, docs=docs)

# 调用时，generation 会自动带上这个 prompt 的 name + version，
# 这样你能在"按 prompt 版本"维度对比质量和成本，哪次编辑引入回退一目了然
messages = [{"role": "user", "content": rendered}]
```

### 3.5 用 OTLP 把任意 OTel 数据汇进来

如果你已经有成熟的 OTel 栈，不想为 Langfuse 单独写 SDK 调用，可以走 OTLP：在 collector 里加一个 Langfuse 的 OTLP exporter，所有带 GenAI 语义约定属性的 span 会自动进 Langfuse：

```yaml
# otel-collector.yaml（节选）
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318   # OTLP 的 HTTP 端口，服务用 http/protobuf 上报
      grpc:
        endpoint: 0.0.0.0:4317   # OTLP 的 gRPC 端口，服务用 grpc 上报

processors:
  batch: {}                       # 批量处理，攒一批再发，降低网络开销

exporters:
  # Langfuse 的 OTLP 端点，Basic Auth = base64(project_id:secret_key)
  otlphttp/langfuse:
    endpoint: https://cloud.langfuse.com/api/public/otel
    headers:
      Authorization: "Basic <base64(project_id:secret_key)>"   # 用你的项目凭据拼 base64
  debug:
    verbosity: detailed           # 本地调试时打印 span 明细

service:
  pipelines:
    traces:
      receivers: [otlp]                 # 从上面两个 OTLP receiver 收数据
      processors: [batch]               # 过一遍批处理
      exporters: [otlphttp/langfuse, debug]  # 同时发到 Langfuse 和本地 debug 输出
```

启动后，任何用标准 OTel SDK 打了 `gen_ai.*` 属性的服务，它的 trace 都会同时出现在你的 Jaeger（debug exporter）和 Langfuse（带 AI 语义的 dashboard）里。

### 3.6 自托管：docker compose 一把起

数据不想出公司网络，就自托管。Langfuse 的 server 是 Next.js，配一个 Postgres（存元数据）和 ClickHouse（存 trace 明细，撑大量写入）即可：

```yaml
# docker-compose.yml（节选，生产还要加 S3 / 反向代理 / TLS）
services:
  langfuse-db:                      # 元数据数据库
    image: postgres:16
    environment:
      POSTGRES_DB: langfuse
      POSTGRES_PASSWORD: changeme   # 生产请换成强密码或 secrets 管理
  langfuse-clickhouse:              # trace 明细列存，扛高写入量
    image: clickhouse/clickhouse-server:24.3
  langfuse-server:                  # 应用服务（Next.js）
    image: langfuse/langfuse:2
    ports: ["3000:3000"]            # 对外暴露 HTTP 端口
    environment:
      DATABASE_URL: postgresql://postgres:changeme@langfuse-db:5432/langfuse
      CLICKHOUSE_URL: http://langfuse-clickhouse:8123
      NEXTAUTH_SECRET: "<随机串>"    # 用于登录鉴权，必须随机且保密
      SALT: "<随机串>"               # 用于加密，必须随机且保密
```

### 3.7 脱敏：别把 PII 直接落库

prompt 和 completion 里常有用户姓名、订单号、内部提示词。至少在 metadata 和 input 上做一层替换：

```python
import re

def redact(text: str) -> str:
    # 用正则把敏感模式替换成占位符；这里只是示例，生产要覆盖更多实体类型
    text = re.sub(r"\b\d{11}\b", "[PHONE]", text)        # 11 位手机号 → 占位
    text = re.sub(r"\b\d{15,18}\b", "[ID]", text)        # 15-18 位身份证/订单号 → 占位
    return text

# 记录 trace 时，input 先过脱敏，避免把原始 PII 写进可观测系统
langfuse.update_current_trace(
    input=redact(question),
    metadata={"pii_redacted": True},   # 留个标记，说明这条已脱敏
)
```

数据模型这一层吃透之后，你会发现后面所有平台的"树"都是这棵树的变体。下面看它们各自怎么长。

---

## 四、同类方案全景：它们的切入点其实各不相同

别把 Langfuse 和它的对手当成"同一个东西换皮"。它们的基因差异很大：

| 项目 | 基因 / 切入点 | 最适合谁 | 明显短板 |
|-|-|-|-|
| **Langfuse** | 开源、框架无关、细粒度 trace + 评估 + prompt 管理 | 想要完全开源、自托管、复杂 workflow 细追 | 评估能力比专业评估平台浅 |
| **LangSmith** | LangChain 原生，深度绑定 LangChain / LangGraph | 已经在 LangChain 生态里 | 非 LangChain 应用价值骤降 |
| **Arize Phoenix** | ML 可观测老玩家开源版，OTel 原生 | 已经在用 Arize、要语义相似度分析、要 OTel 标准化 | UI 不如商业产品精致、要自己运维 |
| **Helicone** | 代理（proxy）架构，改 base_url 即可接入 | 想 2 分钟上线、靠缓存降本 | 评估能力弱、偏纯观测 |
| **Datadog LLM Observability** | 传统 APM 巨头的 LLM 扩展 | 团队已经在用 Datadog 看系统指标 | 全量记每个请求很贵 |
| **W&B Weave** | 实验跟踪（ML 训练那套）延伸到 inference | 研究 / 实验导向、已用 Weights & Biases | 生产实时性不是强项 |
| **Braintrust** | 全生命周期（仿真 + 评估 + 实验 + 观测） | 复杂多 agent、要 agent 仿真 | 不是开源、偏商业 |
| **Portkey** | LLM 网关 + 路由 + 故障转移 + 观测 | 多模型、要统一 API 和网关 | 观测是附赠，不是主业 |

一个反直觉的事实：**很多平台底层都是 OTLP**。有项目把 LangGraph supervisor 接 OTel，然后同一个 trace 能切到 Langfuse / Phoenix / LangSmith / 原生 OTLP（Jaeger、Tempo、Collector）任意后端：因为这些平台都暴露 OTLP 端点，只是鉴权方式不同。所以"换后端"的成本，2025 年之后已经比 2023 年低很多了。

### 4.1 各家最小接入代码

为了让你直观感受"基因差异"，下面是三家的三行级接入：

LangSmith（LangChain 生态，一个装饰器）：

```python
from langsmith import traceable   # LangSmith 的装饰器，自动把函数调用记成 trace

@traceable
def retrieve_and_answer(question: str):
    docs = search_kb(question)
    return llm.invoke(f"{question}\n{docs}")   # 内部 LLM 调用会被自动记录
# 设 LANGCHAIN_TRACING_V2=true 即自动上报，无需显式 flush；这是它"深度绑定 LangChain"的体现
```

Phoenix（OTel 原生，装一个插桩包自动翻译）：

```python
from openinference.instrumentation.openai import OpenAIInstrumentor  # OpenInference 的 OpenAI 插桩
from phoenix.otel import register                                       # 注册到本地 Phoenix 的 OTLP 端点

# register 返回一个 tracer_provider，并指向本地 Phoenix 的 trace 接收地址
tracer_provider = register(project_name="default", endpoint="http://localhost:6006/v1/traces")
OpenAIInstrumentor().instrument(tracer_provider=tracer_provider)  # 一键插桩：之后所有 openai 调用自动变成 Phoenix 里的 trace
```

Helicone（proxy 架构，只改 base_url，零代码侵入）：

```python
from openai import OpenAI

# 把 base_url 指向 Helicone 的代理，再带上你的 Helicone key；业务代码其余部分完全不动
client = OpenAI(
    base_url="https://api.helicone.ai/v1",                       # 请求先过 Helicone 代理
    default_headers={"Authorization": "Bearer <HELI_CONE_KEY>"},  # 你的 Helicone 凭据
)
# 业务代码一行不改，所有请求自动被 Helicone 代理记录、缓存、统计
```

---

## 五、标准层的暗战：OpenTelemetry GenAI 约定 vs OpenInference

这是整篇文章里最该想明白的一段。你不搞清这层，选型时很容易被"我们支持 OTel"一句话带偏。

### 5.1 OpenInference（Arize 主导）

OpenInference 是一组"补充 OTel"的约定 + 插桩库，专门给 AI 应用做 trace。它原生被 Phoenix 支持，但也能喂给任何 OTel 兼容后端。它定义的是 **AI 原生的 span 类型**：`LLM`、`tool`、`agent`、`chain`，而不是 OTel 那套泛化的 client / server。配套一堆插桩包：`openinference-instrumentation-openai`、`-langchain`、`-llama-index`、`-bedrock`、`-mcp`、`-openai-agents` 等，基本是"装一个包、自动把框架内部事件翻译成 trace"的体验。

一行接入示例（LangChain 应用）：

```python
from openinference.instrumentation.langchain import LangChainInstrumentor  # LangChain 的 OpenInference 插桩
from opentelemetry.sdk.trace import TracerProvider                          # OTel 的核心：追踪器提供者
from opentelemetry.sdk.trace.export import SimpleSpanProcessor              # 把 span 处理掉（这里用最简单的同步处理）
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter  # 用 HTTP 把 span 发到 OTLP 端点

provider = TracerProvider()   # 创建一个 tracer provider
provider.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")))  # 把 span 发到本地 OTLP 接收器
LangChainInstrumentor().instrument(tracer_provider=provider)  # 给 LangChain 装插桩：之后它的 chain/agent/tool/llm 调用全部自动变成带 LLM/tool/agent 类型的 span
```

### 5.2 OpenTelemetry GenAI 语义约定

OTel 自己的 GenAI 工作小组在 2024 年起草、2025 年逐步稳定，定义的是 span 属性标准：`gen_ai.request.model`、`gen_ai.usage.input_tokens`、`gen_ai.tool.name`、`gen_ai.system` 等。到 2026 年，Langfuse、Arize、LangSmith、Braintrust、Datadog、Grafana 这些主流平台都"原生或用摄入适配器"支持 OTel GenAI。插桩库 OpenLLMetry（Traceloop）、OpenInference、LangChain OTel 集成都能吐出合规 span。

手动打一个合规 span 长这样（不依赖任何框架插桩，最透明）：

```python
from opentelemetry import trace   # 标准 OTel trace API
from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (
    GEN_AI_REQUEST_MODEL,        # 语义约定里的"请求模型"属性键
    GEN_AI_SYSTEM,               # 语义约定里的"AI 系统"属性键（openai/anthropic/...）
    GEN_AI_USAGE_INPUT_TOKENS,   # 输入 token 数属性键
    GEN_AI_USAGE_OUTPUT_TOKENS,  # 输出 token 数属性键
)

tracer = trace.get_tracer("my-agent")  # 拿一个 tracer，名字标识你的服务
with tracer.start_as_current_span("chat gpt-4o") as span:   # 开一个 span 作为当前上下文
    span.set_attribute(GEN_AI_SYSTEM, "openai")              # 标清楚这是 openai 的调用
    span.set_attribute(GEN_AI_REQUEST_MODEL, "gpt-4o")       # 标清楚用的模型
    # ... 真正调用模型 ...
    resp = openai_client.chat.completions.create(model="gpt-4o", messages=messages)
    # 调用完把用量回填进 span，平台据此算成本、做聚合
    span.set_attribute(GEN_AI_USAGE_INPUT_TOKENS, resp.usage.prompt_tokens)
    span.set_attribute(GEN_AI_USAGE_OUTPUT_TOKENS, resp.usage.completion_tokens)
```

### 5.3 但是："兼容 OTel"常常是个浅层承诺

这点很多人踩过坑。你可以技术上把 OTel 格式的数据发过去，但**语义解释层是丢的**。比如 OTel 定义的 span kind 在 AI 专属 dashboard 里会被渲染成 "unknown"，于是"这是一次 LLM 调用还是一次 tool 调用还是一次 RAG 查询"一眼看不出来，洞察直接归零。OpenInference 的 `LLM/tool/agent/chain` 类型在纯 OTel 后端里是没意义的标签。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    兼容 OTel 常常只是运输层兼容。AI dashboard 认不认你的属性，才是真正有没有语义。
  </div>
</details>

用一个对比就能看清差别：

```text
# 纯 OTel 后端看到的（只有通用属性，AI dashboard 渲染成 unknown）
Span: chat gpt-4o
  span.kind = CLIENT
  http.url  = https://api.openai.com/v1/chat/completions

# OpenInference / Langfuse 看到的（AI 原生语义，一眼能懂）
Span: chat gpt-4o
  span.kind   = LLM                 ← 类型本身就是 LLM
  gen_ai.system = openai
  gen_ai.request.model = gpt-4o
  gen_ai.usage.input_tokens = 1234
  gen_ai.usage.output_tokens = 88
```

所以现实是：**基础 trace（模型调用、tool 调用、agent span）已经可移植**，但 eval score、人工质量标签、reasoning trace 正文这些，至今仍是各家的 vendor-extension 字段。你换平台时，这些得重新接。别被"我们支持 OTel"一句话忽悠，要看它支持的是"OTel 通用 span"还是"OTel GenAI 语义约定 + AI 原生 span 类型"。

---

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：Agent trace 五个硬难点</p>
  <p class="article-embed-note-lead">嵌套切层、多 agent 因果、MCP 断链、成本归因、长程异步。每一项都对应一处真实踩坑。</p>
  <figure class="mixup-figure">
    <div class="mixup-scene">
      <svg class="mixup-svg" viewBox="0 0 640 200" role="img" aria-label="五个难点">
        <rect class="mixup-chip" x="16" y="40" width="112" height="100" rx="12"/>
        <text class="mixup-label" x="72" y="88" text-anchor="middle">嵌套树</text>
        <text class="mixup-caption" x="72" y="112" text-anchor="middle">层级怎么切</text>
        <rect class="mixup-chip" x="140" y="40" width="112" height="100" rx="12"/>
        <text class="mixup-label" x="196" y="88" text-anchor="middle">多 Agent</text>
        <text class="mixup-caption" x="196" y="112" text-anchor="middle">因果怎么接</text>
        <rect class="mixup-chip is-accent" x="264" y="40" width="112" height="100" rx="12"/>
        <text class="mixup-label" x="320" y="88" text-anchor="middle">MCP</text>
        <text class="mixup-caption" x="320" y="112" text-anchor="middle">断链怎么补</text>
        <rect class="mixup-chip" x="388" y="40" width="112" height="100" rx="12"/>
        <text class="mixup-label" x="444" y="88" text-anchor="middle">成本</text>
        <text class="mixup-caption" x="444" y="112" text-anchor="middle">四维归因</text>
        <rect class="mixup-chip" x="512" y="40" width="112" height="100" rx="12"/>
        <text class="mixup-label" x="568" y="88" text-anchor="middle">长程</text>
        <text class="mixup-caption" x="568" y="112" text-anchor="middle">暂停与续跑</text>
      </svg>
    </div>
  </figure>
</section>

## 六、Agent trace 的五个核心难点（重点章）

这部分是 agent 区别于普通 LLM 应用、也最考验 trace 设计的地方。

### 6.1 难点 1：嵌套树形 span：层级怎么切

单模型调用是一条线。agent 是一棵树：agent 到 思考 到 调 tool 到 tool 里又调了一次子 agent 到 子 agent 里再调 LLM。trace 的层级直接决定你能不能看懂一次执行。

经验法则：

- **每个 LLM 调用 = 一个 generation**（带 model、token、cost）。
- **每个 tool 调用 = 一个 span**（带 tool name、入参、返回值、耗时）。
- **每个 agent 的"一轮"或"一个子任务"= 一个父 span**，把上面的 generation 和 tool span 挂在它下面。
- **人工流程 / 业务步骤**（如"校验订单""发邮件"）也包成 span，这样非技术的同事也能顺着树读懂。

一段 trace 在 Langfuse 里序列化成 JSON 大致是这个结构，理解它你就理解了整个模型：

```json
{
  "id": "trace_abc",                          // 这条 trace 的唯一 ID
  "name": "research-agent-run",              // trace 名字
  "input": "调研一下向量数据库选型",            // 整体输入
  "output": "建议用 pgvector，理由如下...",     // 整体输出
  "observations": [                          // 挂在这条 trace 下的所有观测
    {
      "type": "span",                        // 类型一：span（一段有起止时间的逻辑）
      "name": "agent-loop",                  // 父节点：一轮 agent 循环
      "observations": [                      // span 内部还可以嵌套子 observation
        {
          "type": "generation",              // 类型二：generation（一次模型调用）
          "name": "planner-llm",
          "model": "gpt-4o",
          "input": { "messages": [...] },
          "output": { "content": "我需要先检索文档" },
          "usage": { "input": 1200, "output": 60, "total_cost": 0.012 }  // 成本是按价格表算出来的
        },
        {
          "type": "span",
          "name": "tool: search_docs",       // 一次工具调用，记录入参/出参/耗时元数据
          "input": { "query": "vector db benchmark" },
          "output": { "hits": 12 },
          "metadata": { "latency_ms": 340 }
        }
      ]
    }
  ],
  "scores": [{ "name": "quality", "value": 0.9 }]   // 挂在 trace 上的评估结果
}
```

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-trace-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">因果瓶</span>
  </div>
  <p class="duang-whisper-body">多 agent 最怕各记各的账。没有同一条 trace_id，排障就像两本日记对口供。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

### 6.2 难点 2：多 agent 编排：跨线程的因果怎么还原

单 agent 的 trace 还能读。5 个 agent 并发跑，会产生 5 条交错的 trace，因果依赖还跨线程：Agent 3 的决定依赖 Agent 1 的输出，而 Agent 1 是响应 Agent 5 的查询。没有能把跨 agent 依赖"拎出来"的工具，调试就是猜。

两个实用手段：

**第一，用同一个 `trace_id` 把多个子 agent 的执行并到一条 trace 里**。LangGraph 多 agent 场景里，主 agent 和子 agent 共享一个 `predefined_trace_id`，所有 span 归到一棵 trace 下，再分层看谁调了谁：

```python
from langfuse import Langfuse, get_client
from langfuse.langchain import CallbackHandler   # LangChain/LangGraph 的回调处理器，把内部事件记成 Langfuse observation
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

langfuse = get_client()
predefined_trace_id = Langfuse.create_trace_id()   # 主子 agent 共用同一个 trace_id，这是跨线程并串的关键
handler = CallbackHandler()

# 子 agent：research，挂在同一个 trace_id 下
@tool
def langgraph_research(question: str) -> str:
    # start_as_current_observation 开一个 observation 并指定它属于哪条 trace
    with langfuse.start_as_current_observation(
        as_type="span",                                    # 这是一个 span（不是 generation）
        name="call-research-sub-agent",
        trace_context={"trace_id": predefined_trace_id},   # 关键：并入同一条 trace，而不是新建
    ) as span:
        span.update(input=question)                        # 记录这一步的输入
        resp = research_agent.invoke(                       # 调用子 agent
            {"messages": [("user", question)]},
            config={"callbacks": [handler]},                # 用回调处理器，把子 agent 内部事件也记进来
        )
        span.update(output=resp["messages"][-1].content)    # 记录这一步的输出
    return resp["messages"][-1].content

# 主 graph：supervisor 调度多个子 agent
builder = StateGraph(AgentState)
builder.add_node("supervisor", supervisor_node)   # 调度节点
builder.add_node("research", langgraph_research)   # 子 agent 节点
builder.add_edge(START, "supervisor")              # 入口指向 supervisor
builder.add_edge("research", "supervisor")         # 子 agent 跑完回到 supervisor
builder.add_edge("supervisor", END)                # supervisor 决定结束
graph = builder.compile(checkpointer=MemorySaver())  # 编译时挂一个内存检查点（持久化可换 Postgres）

graph.invoke(
    {"messages": [("user", "调研向量数据库选型")]},
    # 主调用也带上同一个 handler 和 thread_id，确保整条链路 trace 互通
    config={"callbacks": [handler], "configurable": {"thread_id": "t1"}},
)
```

**第二，成本归因到 agent 级别**。因为每个 span 都带底层模型调用的 token 数，你能精确看到"Agent 2 吃掉了 70% 的 token 预算"，优化目标立马明确。用 Langfuse 的查询 API 聚合就能量化：

```python
from langfuse import Langfuse

lf = Langfuse()
# 拉取最近 7 天所有 generation（模型调用），后续按 observation 名字聚合 token 与成本
res = lf.fetch_generations(
    page_size=100,                         # 每页最多 100 条，生产要翻页
    from_timestamp="2026-08-06T00:00:00",  # 时间范围起点
)
agg = {}   # 聚合字典：name -> 各类用量累加
for g in res.data:
    name = g.name or "unknown"
    # setdefault 保证每个 name 第一次出现时有初始归零结构
    agg.setdefault(name, {"input": 0, "output": 0, "cost": 0.0, "n": 0})
    agg[name]["input"] += g.usage.input if g.usage else 0        # 累计输入 token
    agg[name]["output"] += g.usage.output if g.usage else 0      # 累计输出 token
    agg[name]["cost"] += g.usage.total_cost if g.usage else 0.0  # 累计成本
    agg[name]["n"] += 1                                            # 累计调用次数
# 按成本从高到低打印，一眼看出哪个环节最烧钱
for name, v in sorted(agg.items(), key=lambda x: -x[1]["cost"]):
    print(f"{name:30s} calls={v['n']:4d} cost=${v['cost']:.2f} tok_in={v['input']}")
```

### 6.3 难点 3：tool call 与 MCP：断掉的 trace 怎么接上

MCP（Model Context Protocol）2025 年爆火，带来一个具体可观测问题：**agent 侧产生 Trace A，MCP server 侧产生 Trace B，两边没有上下文传播**，当时有文章专门分析过这个断裂。

OTel MCP 语义约定（v1.39 引入）就是来修这个的。核心设计：

- MCP 跑在 JSON-RPC 上，但约定**优先用 MCP 专属语义而不是泛化 RPC 约定**，因为 MCP span 要带 session、tool call 这些上下文。
- **关键在 W3C Trace Context 传播**：客户端把 trace id 注入 MCP 请求，server 端提取并延续，server span 就嵌套在 client span 之下，协议边界被打通。

客户端注入 trace context（用 OTel 的 propagator 把当前 context 写进 MCP 请求的 headers / metadata）：

```python
from opentelemetry import trace
from opentelemetry.propagate import inject   # 把当前 trace context 注入到 carrier（这里是 headers 字典）
from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (
    GEN_AI_OPERATION_NAME,                  # "这次是什么操作" 的语义键
)
from opentelemetry.semconv._incubating.attributes.mcp_attributes import (
    MCP_METHOD_NAME,                        # MCP 方法名（如 tools/call）
    MCP_SESSION_ID,                         # MCP 会话 ID
)

tracer = trace.get_tracer("mcp-client")

def call_tool_over_mcp(method: str, params: dict, session_id: str) -> dict:
    headers: dict[str, str] = {}
    inject(headers)   # 关键：把当前 W3C trace context（trace_id/span_id）写进 headers，准备跨进程传播
    with tracer.start_as_current_span(f"tools/call {method}") as span:   # 开一个 MCP 客户端 span
        span.set_attribute(GEN_AI_OPERATION_NAME, "execute_tool")  # 标成"执行工具"
        span.set_attribute(MCP_METHOD_NAME, "tools/call")          # 标 MCP 方法
        span.set_attribute(MCP_SESSION_ID, session_id)             # 标 MCP 会话，便于关联同会话的多次调用
        # 通过 stdio / SSE 把 headers 传给 MCP server，server 端就能提取出父 context
        return mcp_transport.request(method, params, headers=headers)
```

服务端提取并延续，让 server span 自动成为 client span 的子节点：

```python
from opentelemetry.propagate import extract   # 从 carrier 里还原父 trace context

def handle_mcp_request(incoming_headers: dict, payload: dict):
    ctx = extract(incoming_headers)   # 从请求 headers 里提取父 span 的 context
    # 用提取出的 ctx 作为父，新开的 span 就会自动成为客户端 span 的子节点，跨进程链路打通
    with tracer.start_as_current_span(
        f"tools/call {payload['method']}", context=ctx
    ) as span:
        span.set_attribute(MCP_METHOD_NAME, payload["method"])   # 记录实际执行的方法名
        return do_work(payload["params"])
```

一个真实的多 agent + MCP 调用链在 dashboard 里长这样（跨进程、跨语言也被并成一条树）：

```text
invoke_agent weather-forecast-agent (INTERNAL)
├── chat {model} (CLIENT)            ← GenAI 模型调用
├── tools/call get-weather (CLIENT)  ← MCP 客户端
│   └── tools/call get-weather (SERVER) ← MCP 服务端（跨进程/跨语言）
└── chat {model} (CLIENT)
```

**去重**：如果外层 GenAI 插桩已经在追 tool 执行，MCP 插桩就**enrich 现有 span**（补 `mcp.method.name`、`mcp.session.id`），而不是新建一个重复 span。Datadog 的 MCP client monitoring 就是把 session 初始化、registry 发现（tools / list）、tool 调用（call_tool）每个阶段都做成 MCP span，并自动挂回发起 tool 请求的父 LLM span。

实践中最容易翻车的点：**MCP server 是别人写的、你控制不了它的插桩**。这时候往往需要在客户端侧做上下文注入，或者用一个被动网关 / proxy 拦截 LLM 请求来补 token 和上下文（dual-path 架构：server 端自管 trace，client 侧 proxy 管 token / cost，靠 trace id 把两条路径并成一条分布式 trace）。这正是 MCP 可观测当前最不成熟、也最该提前设计的环节。

### 6.4 难点 4：token / cost / latency 计量：成本归因的四种维度

agent 的可观测性里，成本和质量是和传统 APM 并列的"第一指标"。要追的至少有：

- **token 效率**：input / output 比、每条 reasoning chain 的平均成本。Claude 还要追 `cache_creation_input_tokens` 和 `cache_read_input_tokens`：开了 prompt caching 后，缓存命中与否对成本影响巨大（命中缓存的 input token 单价通常是正常的 1/10）。
- **延迟**：P50–P99，且要拆"模型推理"和"外部 tool 调用"分别算。对流式场景，**TTFT（time-to-first-token）是用户感知延迟**，单独追。
- **质量**：事实性、连贯性、安全评估分；agentic 场景还要追 tool call 成功率、结构化输出完成率、重试率。
- **业务影响**：每任务成本、按 prompt 版本的成功率、合规通过率。

把这些打上 `model / feature / user_id / tenant_id / conversation_id / 是否开 extended thinking` 的标签，才能做"按功能 / 按租户 / 按团队的精确成本归因"：而不是月底收到一张 \$40,000 的账单却不知道是哪个接口烧的。读 Claude usage 时务必把缓存字段也记上：

```python
usage = resp.usage
# 把业务维度打进 trace 的 metadata，后面才能按租户/功能分别算账
langfuse.update_current_trace(metadata={
    "tenant_id": tenant_id,        # 租户维度，多租户场景算各自成本
    "feature": "kb-qa",            # 功能维度
    "extended_thinking": True,     # 是否开了扩展思考，思考会多吃 token
})
# 把缓存命中情况也作为维度记录，便于核算 prompt caching 的真实收益
print({
    "input": usage.input_tokens,
    "output": usage.output_tokens,
    # getattr 取缓存字段，没有就默认 0（不是所有模型/调用都返回缓存字段）
    "cache_creation": getattr(usage, "cache_creation_input_tokens", 0),   # 新写入缓存的 token
    "cache_read": getattr(usage, "cache_read_input_tokens", 0),           # 命中缓存的 token
})
```

### 6.5 难点 5：长程、异步、流式：会话状态和 human-in-the-loop

agent 不像一次 HTTP 请求几秒就完。它可能是：

- **长程**：一个任务跑几分钟到几天（Google 的 Agent Runtime 支持 state 维持数天）。
- **流式 / 语音**：Realtime API 的语音 agent，trace 要覆盖音频输入输出、tool 调用、用户打断、agent 恢复。
- **human-in-the-loop**：执行到某一步暂停，把 agent 状态序列化存下来，等人审批或拒绝某个 tool 调用，再带着完整上下文 resume。

这些场景下 trace 必须能"暂停-恢复"，并且把序列化 / 恢复点也记进 trace。LangGraph 的状态持久化层原生干了这事：每步完成就把 state 落到 checkpointer，崩溃从最近检查点续：

```python
from langgraph.checkpoint.postgres import PostgresSaver   # 用 Postgres 做持久化检查点（崩溃可恢复）

# 用 with 管理连接生命周期，退出时自动关闭
with PostgresSaver.from_conn_string(DB_URL) as saver:
    graph = builder.compile(checkpointer=saver)   # 把检查点挂到编译好的 graph 上
    # 第 15 步挂了？用同一个 thread_id 重新 invoke，
    # LangGraph 会从第 14 步的检查点接着跑，而不是重跑 14 步
    graph.invoke(input_state, config={"configurable": {"thread_id": "job-42"}})
```

OpenAI 的 RealtimeAgent 则把 HITL 做成一等公民：能暂停执行、序列化 agent 状态、人工批准后带上下文 resume，并且这些暂停 / 恢复事件都进 Traces 仪表盘：

```python
from agents import Agent, RealtimeAgent

agent = Agent(name="Voice Assistant", instructions="你是语音客服")   # 定义一个语音客服 agent
realtime_agent = RealtimeAgent(agent, tracing_enabled=True)          # 开启 tracing，暂停/恢复都会进 trace
# 用户说"先别订，我要确认一下" → agent 状态被序列化暂停
# 人工在后台批准 → resume，完整上下文保留，trace 里能看到 pause/resume 节点
```

---

## 七、大厂方案解读：他们各自怎么锚定 agent trace

这部分结合 2025–2026 的公开资料，看四家云平台 + OpenAI + Anthropic 的实际路线。

### 7.1 OpenAI：把 tracing 变成基础设施的一等公民

2025 年 3 月，OpenAI 一口气发了 Responses API、Agents SDK、以及内置的 observability 工具。关键信号是：**tracing 不是外接工具，是 SDK 和 API 自带的**。

Agents SDK 把 handoffs（任务转交）、guardrails（护栏）、tracing、MCP 都做成核心原语。下面这段是一个完整可跑的多 agent + tool + 自动 trace 示例：注意你**完全不用手动建 span**，SDK 在运行时会自动把每个 agent 轮次、tool 调用、handoff 都记进 Traces 仪表盘：

```python
from agents import Agent, function_tool, Runner, handoff   # Agents SDK 核心：Agent、工具装饰器、运行器、转交

@function_tool                                    # 把一个普通函数变成 agent 可用的工具
def get_weather(city: str) -> str:
    """获取城市天气"""                             # docstring 会被当成工具描述告诉模型
    return f"{city} 今天晴，25 度"

# 子 agent：西班牙语 agent，带 handoff_description 让主 agent 知道何时转交
spanish_agent = Agent(name="Spanish agent", instructions="用西班牙语回答", handoff_description="处理西班牙语请求")
english_agent = Agent(
    name="English agent",
    instructions="用英语回答",
    tools=[get_weather],        # 挂上天气工具
    handoffs=[spanish_agent],   # 需要时把任务转交给西语 agent
)

# 运行，trace 自动生成（默认上报到 OpenAI Traces 仪表盘，无需任何额外埋点代码）
result = Runner.run_sync(english_agent, "What's the weather in Beijing?")
print(result.final_output)
```

6 月又补了 TypeScript 版（与 Python 功能对齐）、RealtimeAgent（带 HITL，能暂停执行、序列化 agent 状态、人工批准后带上下文 resume）、以及 **Traces 仪表盘支持 Realtime API 语音会话**：能可视化音频输入输出、tool 调用、用户打断。

几个要点：

- **免费的**：Traces 不单独收费，只按模型 token 计费（社区有人专门问过）。
- **能脱离 SDK 手动打 trace**：虽然官方主推 Agents SDK，但 `/v1/traces` 端点本质可用（社区从 SDK 反推的），能 POST `trace_id / input / outputs / usage / metadata`：

```python
import httpx, uuid

trace_id = str(uuid.uuid4())   # 自己生成一个唯一 trace id
# 直接 POST 到 OpenAI 的 traces 端点，把一次执行的基本信息报上去
httpx.post(
    "https://api.openai.com/v1/traces",
    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},   # 用你的 OpenAI key 鉴权
    json={
        "trace_id": trace_id,
        "input": "用户问题",                                  # 这次请求的输入
        "outputs": [{"output": "模型回答"}],                  # 这次请求的输出
        "metadata": {"env": "prod"},                         # 任意元数据
    },
)
# 注意：OpenAI 还没给这套手动接口完整公开文档，属于"能用但不保证稳定"
```

对 agent 开发者来说，OpenAI 的路线是"**平台内闭环**"：你用我的模型、我的 SDK、我的 Responses API、我的工具，trace 和 eval 我全包了，你不用自己接 Langfuse。代价是绑定加深。

### 7.2 Google：OTel 直送 Cloud Monitoring，走"云原生标准"路线

Google 的打法最贴传统可观测体系：

- **Vertex AI Agent Engine 内置可观测性**：直接把 **OpenTelemetry traces 吐进 Google Cloud Monitoring**。这点和 Langfuse 的"v3 支持 OTLP"异曲同工：大家都往 OTel 靠。
- **Gemini Enterprise（2025 整合后的平台）**：Agent Observability 提供"复杂 agent reasoning 的可视化追踪做实时调试"，还有 Agent Simulation（用合成用户交互自动打分）、Agent Evaluation（用多轮 autorater 对真实流量持续评分）。
- **self-healing**：Agent Engine 能自动重试失败的 tool 调用、切 fallback 模型、回滚有问题的版本，不用人工干预。
- **ADK 开源（Apache 2.0）**，已支持 Python / Java / Go，Langfuse 也有官方集成：`openinference-instrumentation-vertexai` 包一行 wrap，vertexai 调用就变成发往 Langfuse 的 OTel span。

把 Vertex 的 trace 导出到 Cloud Monitoring 的最小配置：

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider                  # 标准 OTel tracer 提供者
from opentelemetry.sdk.trace.export import BatchSpanProcessor        # 批量处理 span，生产用批量而非同步
from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter  # GCP 的 trace 导出器

provider = TracerProvider()
provider.add_span_processor(
    # 把 span 批量导出到 Cloud Trace（按 project_id 归属）
    BatchSpanProcessor(CloudTraceSpanExporter(project_id="your-gcp-project"))
)
trace.set_tracer_provider(provider)   # 设为全局 tracer provider

# 之后用标准 OTel API 打的 span 会自动进 Cloud Monitoring 的 Trace 列表
```

Google 的路线是"**把 agent 观测接进已有的云监控大盘**"，对已经在 GCP 上的企业最顺滑；但分析师也指出，其多 agent 深度状态关联、跨云可观测仍不成熟，复杂非确定性流程往往还要接第三方遥测。

### 7.3 Microsoft：参与定义 OTel agent 规范，主打"全栈关联"

微软在 Ignite 上把 Azure Monitor 和 AI Foundry 打通，专门为 GenAI 重做了可观测：

- **AI-Tailored Trace View**：把每次 AI 决策讲成"可读的故事"：plan 到 reasoning 到 tool calls 到 guardrail checks，几秒定位慢或危险的步骤，不用翻几千个 span。
- **AI-Aware Trace Search**：用 `model ID / grounding score / cost` 这类 GenAI 专属属性在百万级 run 里筛。
- **Foundry Agent Service 的 AgentOps（public preview）**：Tracing + Evaluation + Monitoring 一体，基于 OTel 兼容 trace，能可视化多 agent 工作流的执行路径、性能（时间戳 / 延迟 / token）、tool 调用日志（文件搜索、Bing、code interpreter、OpenAPI 等）、以及每个交互的 request / response 明细。
- **最关键的一条**：**微软在帮 OpenTelemetry 定义 agent 规范**，把多 agent 编排 trace、LLM reasoning 上下文、evaluation 信号都纳入，目标是让 Azure Monitor / AI Foundry 和 Datadog、Arize、W&B 这些伙伴工具互通。

在 Azure 上启用 AI 观测的接入：

```python
from azure.monitor.opentelemetry import configure_azure_monitor   # Azure Monitor 的 OTel 一键接入

# 一行接入，把 OTel trace 发到 Azure Monitor（connection_string 在 Azure 门户里拿）
configure_azure_monitor(
    connection_string="InstrumentationKey=...;IngestionEndpoint=...",
)
# 之后用标准 OTel API 打的 GenAI span 会出现在 AI Foundry 的 AI-Tailored Trace View
```

微软的路线是"**标准共建 + 全栈关联**"：agent 信号要和基础设施 KPI、应用遥测关联成统一运维视图，且强调开放标准避免 vendor lock-in。

### 7.4 AWS：CloudWatch GenAI Observability + AgentCore + ADOT

AWS 的路子是把 agent 观测收编进 CloudWatch：

- **Model Invocation Logging**：Bedrock 模型调用日志可落到 S3 / CloudWatch，能看每次请求的输入 prompt、用户问题、模型输出。
- **CloudWatch GenAI Observability（Preview）**：两个大盘：Model Invocations（调用数、token、错误率、单次请求的输入输出钻取）和 **Bedrock AgentCore**（所有 agent 的统一视图：session 数、invocation、错误、节流、runtime 指标如 vCPU / 内存，以及 **Trajectory Map 轨迹图**：把 agent 做出的所有选择可视化，比如"调了几次 Bedrock、几次子 agent、几个循环"）。
- **全程 OTel 兼容**：AgentCore 用标准化 OTel 格式吐遥测，配合 **ADOT（AWS Distro for OpenTelemetry）**，用 `opentelemetry-instrument` 包一下就能把相关 metrics / traces 发到 CloudWatch GenAI Observability。

用 ADOT 自动插桩的跑法（不改业务代码）：

```bash
# 用 ADOT 的 auto-instrumentation 包裹你的 Python 服务
opentelemetry-instrument \       # ADOT 提供的自动插桩入口
  --traces_exporter awsemf \     # trace 导出到 AWS Embedded Metric Format（进 CloudWatch）
  --metrics_exporter awsemf \    # 指标同样走 awsemf
  python your_agent_service.py    # 你的服务入口，其余代码一行不改
```

re:Invent 2025 的演示里，讲者把这套叫做 agent 的"golden signals"：调用数、延迟、token、以及每次请求的输入输出。

### 7.5 Anthropic：自己不做观测产品，靠生态和标准

Anthropic 这边要讲清楚一个事实：**Claude 官方没有第一方的可观测平台**。它的可观测性完全靠生态：

- 社区和第三方（Langfuse、Helicone、TuringPulse、Provectus 等）做 Anthropic SDK 的插桩。
- 前沿实践都指向**对齐 OpenTelemetry GenAI 语义约定**。一个跑了半年的实战备忘录把 Claude API 的 span 属性标准化成：

```typescript
// 最小但够用的 Claude API span 属性集（贴着 OTel GenAI 语义约定写，方便跨平台聚合）
"gen_ai.system"                    = "anthropic"                                  // 系统标识
"gen_ai.operation.name"            = "chat"                                       // 这是一次对话补全
"gen_ai.request.model"             = params.model                                 // 请求时指定的模型
"gen_ai.request.max_tokens"        = params.max_tokens                            // 最大输出 token
// 响应侧
"gen_ai.response.id"               = res.id                                        // 本次响应 ID
"gen_ai.response.model"            = res.model                                     // 实际服务的模型（可能和你请求的不同）
"gen_ai.response.finish_reasons"   = JSON.stringify([res.stop_reason])             // 结束原因（end_turn/max_tokens 等）
"gen_ai.usage.input_tokens"        = res.usage.input_tokens                        // 输入 token
"gen_ai.usage.output_tokens"       = res.usage.output_tokens                       // 输出 token
// Anthropic 专属（缓存不在约定里，加 vendor 前缀避免和官方键冲突）
"anthropic.usage.cache_creation_input_tokens" = res.usage.cache_creation_input_tokens ?? 0  // 新写缓存 token
"anthropic.usage.cache_read_input_tokens"     = res.usage.cache_read_input_tokens ?? 0      // 命中缓存 token
```

用 Python OTel SDK 把它包成一个可复用的 span 封装，这样你的 Claude 调用和 OpenAI 调用能进同一个 dashboard：

```python
from opentelemetry import trace
from opentelemetry.semconv._incubating.attributes.gen_ai_attributes import (
    GEN_AI_SYSTEM, GEN_AI_OPERATION_NAME, GEN_AI_REQUEST_MODEL,
    GEN_AI_RESPONSE_ID, GEN_AI_USAGE_INPUT_TOKENS, GEN_AI_USAGE_OUTPUT_TOKENS,
)

tracer = trace.get_tracer("anthropic-wrapper")   # 一个可复用的 tracer

def traced_claude(messages, model="claude-opus-4-20250514", max_tokens=1024):
    # 开一个以模型名命名的 span，作为当前上下文
    with tracer.start_as_current_span(f"chat {model}") as span:
        span.set_attribute(GEN_AI_SYSTEM, "anthropic")              # 系统标识
        span.set_attribute(GEN_AI_OPERATION_NAME, "chat")           # 操作类型
        span.set_attribute(GEN_AI_REQUEST_MODEL, model)             # 请求模型
        # 真正调用 Anthropic；anthropic_client 是事先初始化的 SDK 客户端
        resp = anthropic_client.messages.create(model=model, max_tokens=max_tokens, messages=messages)
        # 响应侧属性回填
        span.set_attribute(GEN_AI_RESPONSE_ID, resp.id)             # 响应 ID
        span.set_attribute(GEN_AI_USAGE_INPUT_TOKENS, resp.usage.input_tokens)     # 输入 token
        span.set_attribute(GEN_AI_USAGE_OUTPUT_TOKENS, resp.usage.output_tokens)   # 输出 token
        # 缓存字段不在通用约定里，用 vendor 前缀单独记
        span.set_attribute("anthropic.usage.cache_read_input_tokens", resp.usage.cache_read_input_tokens or 0)
        return resp
```

对齐约定的好处是：哪天你要混进 Bedrock 或 Vertex 的 Gemini，Grafana 的聚合查询基本不用改，只是多一个 `gen_ai.system` 值。

- Anthropic 自己产品侧（Claude Code）的遥测走 Statsig 和 Datadog，和给开发者的可观测是两回事，别混淆。

### 7.6 Datadog：把 MCP 客户端也纳入 trace

Datadog LLM Observability 的亮点之一是 **MCP client monitoring**：自动插桩 MCP Python client，把从 session 初始化、registry 发现（tools / list）到 tool 调用（call_tool）的每一步都做成 span，并**自动挂回发起 tool 请求的父 LLM span**，形成一条完整 agent 工作流 trace。它还能聚合出"每个 tool / MCP server 的 p95 延迟、错误率、重试率"，帮你判断是不是 registry 太大导致 LLM 解析 tool 描述时吃了 latency、是不是某个 MCP server 慢或不可靠。

开启方式（ddtrace 一行 patch）：

```python
from ddtrace import patch, tracer   # Datadog 的 Python 插桩库

patch(mcp=True)   # 开启 MCP 插桩：之后所有 tools/call、tools/list 都成为挂回父 LLM span 的 MCP span
# 其余业务代码不用改，Datadog 自动收集并关联
```

---

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-trace-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">落地瓶</span>
  </div>
  <p class="duang-whisper-body">先记成本、质量、延迟、安全各一两个。啥都记，会被自己淹死。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 八、工程落地：怎么动手才不踩坑

把上面所有东西落到你自己的系统，给一套可执行的建议，外加一段自建 collector 配置。

**1. 先用 OTel GenAI 约定打底，再选后端**

别一上来就锁定某个商业平台。按 `gen_ai.system / gen_ai.request.model / gen_ai.usage.* / gen_ai.tool.name` 这套属性标准来埋点，后端可以后面在 Langfuse / Phoenix / Datadog / 原生 OTLP 之间切换。你买的不是 lock-in，是 portable 的 trace。

**2. 内容录制分三档，生产环境用"外存 + 引用"**

prompt / completion 是最值钱也最敏感的数据。OTel 定义三种录制模式：

- 不录（默认）。
- 录在 span 属性上（方便，但大小受限、谁有 trace 权限谁都能看）。
- **外存 + span 引用**（生产推荐）：正文放 S3 / 数据库，span 只留一个引用 URL，IAM 和保留策略独立管。

很多插桩库用 `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true` 这种开关门控，默认关。生产上建议**默认关、按 trace 采样或按业务维度按需开**：

```bash
# 默认不录 message 正文，避免隐私数据全量落库
export OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false
# 只对 debug 租户或灰度比例开启
# 或在外层 proxy 里对命中采样的 trace 临时打开
```

**3. 从 3–4 个关键指标起步，别全量记**

社区那个老哥的原话很对：一开始啥都记，会被无用数据淹死。先抓"成本 / 质量 / 延迟 / 安全"各一两个指标，摸清楚模式再扩。全量记每个请求在商业平台会很贵。

**4. 多 agent 一定提前设计 trace_id 传播**

不要等出了跨 agent 的诡异 bug 才想"这俩 trace 怎么对不上"。主子 agent 共用 `trace_id`、MCP 客户端注入 W3C Trace Context，这两件事在架构评审时就定下来（见 6.2 和 6.3 的代码）。

**5. 评估闭环要有，哪怕是最小集**

至少接一个 score：用户反馈（赞 / 踩）、或一条程序化规则（输出是否含预期字段）、或一个 LLM-as-judge。没有 score，你永远不知道一次 prompt 改动是变好还是变坏，只能靠玄学。

**6. 长链路 agent 必须 checkpoint**

多步（比如 20 步）工作流，第 15 步挂掉的概率趋近于必然。每步持久化状态，崩溃从最近检查点续，而不是从头重跑 14 步：这是成本和生产可靠性的硬要求（见 6.5 的 PostgresSaver 示例）。

### 8.1 自建 OTel Collector：一份能同时喂 Langfuse 和 Jaeger 的配置

如果你不想被单一 SaaS 绑定，最干净的姿势是自建一个 OTel Collector，所有服务打标准 OTLP，collector 再扇出到多个后端：

```yaml
# otel-collector.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }   # gRPC 接收端口
      http: { endpoint: 0.0.0.0:4318 }    # HTTP 接收端口

processors:
  batch: {}                               # 批量处理，攒批发送
  # 按属性做采样：生产默认 10%，debug 租户 100%（全采）
  tail_sampling:
    policies:
      - name: debug-tenant                # 策略一：debug 租户全采
        type: attribute                   # 按属性匹配
        attribute: { key: "tenant_id", values: ["debug"] }
      - name: base                        # 策略二：其余按概率采样
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }

exporters:
  # 扇出 1：Langfuse（带 AI 语义的 dashboard）
  otlphttp/langfuse:
    endpoint: https://cloud.langfuse.com/api/public/otel
    headers:
      Authorization: "Basic <base64(project_id:secret_key)>"   # Langfuse 凭据
  # 扇出 2：本地 Jaeger，做通用 span 调试
  otlp/jaeger:
    endpoint: jaeger:4317
  debug:
    verbosity: normal                     # 控制台打印导出日志，排查用

service:
  pipelines:
    traces:
      receivers: [otlp]                              # 收 OTLP
      processors: [tail_sampling, batch]             # 先采样再批处理
      exporters: [otlphttp/langfuse, otlp/jaeger, debug]  # 扇出到多个后端
```

这样你的服务只依赖标准 OTel SDK，哪天想把 Langfuse 换成 Phoenix 或自托管，只改 collector 的 exporter，业务代码一行不动。

---

## 九、趋势研判：碎片化不会消失，但底座在收敛

把 2025–2026 的脉络拉直看：

- **底座收敛到 OTel GenAI 语义约定**：基础 trace（LLM 调用、tool 调用、agent span）已经可移植，这是好事。
- **但"AI 原生语义"和"通用 OTel"的张力会长期存在**：score、reasoning trace、质量信号仍是 vendor-extension。OpenInference 的 `LLM/tool/agent/chain` 和 OTel 官方约定还在磨合。不要相信"完全兼容"的宣传，看它具体支持到哪一层。
- **云平台全员下场做 agent 观测**：OpenAI 平台内闭环、Google 接 Cloud Monitoring、微软共建 OTel agent 规范、AWS 收编进 CloudWatch。自托管开源（Langfuse / Phoenix）和云厂商托管会形成"开源打底 + 云上增强"的双轨。
- **MCP 可观测是 2025–2026 最热也最乱的一块**：协议刚有 OTel 约定（v1.39），但 server 端插桩覆盖、跨进程上下文传播、dual-path 成本归因都还在早期，值得你现在就规划好 trace id 传播。
- **评估（eval）和 trace 正在合流**：光有 trace 不够，score + online / offline eval + LLM-as-judge 才是"可观测"走向"可改进"的钥匙。大厂（Google Agent Evaluation、微软 AgentOps、OpenAI Evals）都在把 eval 做进同一套观测体系。

一句话收尾：agent trace 的本质，是把" probabilistic、多步、会自己调工具"的系统，重新变成**可读、可归因、可回放、可评估**的东西。Langfuse 这类项目把第一性原理定下来了：一棵带 AI 语义的嵌套树；而 2026 年的竞争，已经从"能不能看到 trace"升级到"能不能跨云、跨 agent、跨协议地把整条因果链讲成一个故事"。

---

*参考资料（均为 2025–2026 公开资料）：Langfuse 官方文档与数据模型、OpenInference（Arize）spec 与插桩库、OpenTelemetry GenAI / MCP 语义约定、OpenAI Agents SDK 与 Responses API 公告、Google Vertex AI / Gemini Enterprise 与 Azure AI Foundry 公开博客、AWS CloudWatch GenAI Observability 与 Bedrock AgentCore 文档、Datadog MCP client monitoring、Novita / IntegrityStudio / Maxim 等 LLM 可观测工具横评。*
