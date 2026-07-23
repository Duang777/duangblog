---
author: Duang
pubDatetime: 2026-07-24T02:30:00+08:00
modDatetime: 2026-07-24T02:45:00+08:00
title: 拆 Orloj：多智能体怎么被当成基础设施跑起来
featured: true
draft: false
tags:
  - Agent
  - 拆解
  - Orloj
description: 从 YAML 资源、orlojd、Worker 租约到策略审批，细拆 Orloj 怎么把多智能体从脚本变成可运维系统。
---

仓库在这里：[OrlojHQ/orloj](https://github.com/OrlojHQ/orloj)

README 第一句写得很直：Agents are infrastructure。我读完仓库结构和文档后，觉得这不是营销口号，而是整套设计的出发点。Orloj 要做的事，不是再给你一个 chat 循环模板，而是把多智能体当成能声明、能调度、能审计、能扩容的运行时来管。

项目还在活跃开发，1.0 之前 API 和 schema 可能变。这不影响拆：拆的是它的问题意识、资源切法和执行模型。下面按我实际读代码和文档的顺序写。

## 先说它针对的痛

多数人做过的 Agent demo，形态都很像：一段 system prompt，一个 while，几次 tool call，本地跑通就算成功。真要挂到业务上，缺的东西会一起冒出来。

模型不是写死在代码里就完事，还要换提供商、做 fallback、管密钥和预算。工具不是函数列表就完事，还要鉴权、超时、重试、高风险操作等人点头。多个 Agent 协作时，交接顺序、分支汇合、委托审核，如果埋在控制流里，事后几乎没法查。更麻烦的是所有权：这个任务现在谁在跑？进程挂了会不会双跑？失败是进死信还是假装成功？

这些东西如果继续散落在脚本、环境变量和口头约定里，系统会越来越难运维。Orloj 的回答很明确：把它们提升成版本化资源，有期望状态，有控制器去推，有 Worker 去认领，有策略在调用时裁决，有轨迹把过程留下来。

所以它不是给只想验证一句 prompt 的人用的。它更像给已经觉得 demo 撑不住、开始要 owner 和边界的团队准备的。

## 仓库里你先会碰到谁

从进程视角看，三个名字会反复出现。

`orlojd` 是控制面加可选执行面。它起 REST API、Web 控制台、资源存储、watch 和事件、各类 controller，以及调度逻辑。本地开发时，它还可以内嵌一个 worker，省得你一上来就搭分布式。

`orlojworker` 是干活的。它认领 Task，续租约，跑 AgentSystem 图，调模型，调工具，消费消息驱动模式下的 inbox，然后把阶段、消息、轨迹写回去。

`orlojctl` 是操作入口。apply 清单、脚手架、创建密钥、跑任务、盯资源、处理审批、看日志和指标，基本都从这里进。

存储上，本地可以内存态；生产倾向 Postgres，用来扛资源状态、任务认领和租约。消息面上，简单场景可以顺序执行；要分布式交接时，再上 NATS JetStream 一类后端。Orloj 想保住的是：你换底座，资源语义尽量别换。

## 资源怎么切：节点和图分开

这是我读 Orloj 时最想先钉住的一点。

`Agent` 描述单个角色怎么工作：引用哪个 `ModelEndpoint`，用什么 prompt，能碰哪些工具，步数和超时怎么限。它不负责整条业务拓扑。

`AgentSystem` 才是拓扑。它把多个 Agent 放进一张图，边怎么连、条件怎么拐、哪里 fan-out、哪里 fan-in、哪里要人审，都写在 system 上。任务执行时绑定的是 system，不是某个孤立 agent。

这样做的直接好处是：改流程不等于改每个角色的 prompt；查一次跑偏，可以对照图，而不是在代码里搜 if。

一个很常见的最小例子是研究写作流水线。先定义研究角色：

```yaml
apiVersion: orloj.dev/v1
kind: Agent
metadata:
  name: research-agent
spec:
  model_ref: openai-default
  prompt: |
    You are the research stage.
    Produce concise, verifiable findings for the writer.
  tools:
    - web_search
  allowed_tools:
    - web_search
  limits:
    max_steps: 6
    timeout: 30s
```

模型不写死在 Agent 里，而是引用 endpoint：

```yaml
apiVersion: orloj.dev/v1
kind: ModelEndpoint
metadata:
  name: openai-default
spec:
  provider: openai
  base_url: https://api.openai.com/v1
  default_model: gpt-4o
  auth:
    secretRef: openai-api-key
```

然后把策划、研究、写作串成 system：

```yaml
apiVersion: orloj.dev/v1
kind: AgentSystem
metadata:
  name: report-system
spec:
  agents:
    - planner-agent
    - research-agent
    - writer-agent
  graph:
    planner-agent:
      edges:
        - to: research-agent
    research-agent:
      edges:
        - to: writer-agent
```

最后用 `Task` 跑一次：

```yaml
apiVersion: orloj.dev/v1
kind: Task
metadata:
  name: weekly-report
spec:
  system: report-system
  input:
    topic: enterprise AI copilots
  retry:
    max_attempts: 2
    backoff: 2s
```

Task 上还会带 phase、output、attempt、lease、消息、join、委托、trace、history、blocker 这些状态。你可以把它理解成：一次多智能体作业的运行记录，而不只是请求响应。

周围还有一圈配套资源，读的时候别当成装饰。

`ContextAdapter` 会在 system 启动前清洗或改写原始输入。`Memory` 管任务级或持久记忆，后端可以是内存、pgvector 或 HTTP。`Secret` 和 `SealedSecret` 管运行时凭证，后者偏向 git 友好的加密清单。`McpServer` 用来接外部 MCP，并把发现到的工具物化进系统。`TaskSchedule` 和 `TaskWebhook` 负责定时和带签名校验的事件触发，顺带处理并发和幂等。`EvalDataset` 与 `EvalRun` 用黄金数据压测 system。`Worker` 声明容量、区域、支持的模型、GPU、心跳和当前负载。

资源面确实大。好处是边界清楚；坏处是你得先接受自己在学一个平台，而不只是抄一个示例仓库。

## 一次任务到底怎么跑起来

我按时间顺序把主路径说清楚。

你先用 `orlojctl` 或 API 把 YAML apply 进去。controller 做校验，写 status，发现 MCP 工具，维护调度相关状态。然后创建一个指向某个 `AgentSystem` 的 Task。调度器按 Worker 容量和要求把任务派出去。

Worker 不是被动挨打。它要 claim 任务，拿到租约，并持续 heartbeat。租约过期，别的 Worker 可以接管。这比 fire-and-forget 的脚本现实得多：进程没了，系统至少知道所有权失效了，而不是永远显示 running。

认领之后进入执行。顺序模式适合本地；消息驱动模式适合分布式交接。图上的节点按边推进，模型调用走 `ModelEndpoint`，工具调用走 Tool 运行时，记忆按声明读写。每一步都可能触发策略检查。高风险工具或关键节点可以生成 `ToolApproval` / `TaskApproval`，把任务卡住等人处理，而不是让模型自行决定硬闯。

执行过程中，Task 持续积累消息、分支汇合信息、委托记录和 trace。失败会按重试策略退避；仍然不行就进入可见失败态，而不是静默消失。idempotency key 用来抑制重复副作用，这在 webhook 和重试场景尤其重要。

如果把角色再说人话一点：`orlojd` 负责让世界状态正确；`orlojworker` 负责在有租约的前提下把图跑完；策略和审批负责在关键调用处拦一下；观测数据负责事后还能讲清楚发生过什么。

## 工具层：调用本身就是受控动作

Orloj 支持的工具形态很多：HTTP、外部服务、gRPC、webhook 回调、MCP、CLI、WASM、A2A 互操作。重点不在清单有多长，而在每次调用都会经过统一的运行时外壳：鉴权、隔离、超时、重试、权限规则，必要时审批。

这和把工具函数直接塞进 agent 进程里调用，体感完全不同。后者快，前者可审计。Orloj 选的是后者。

`McpServer` 资源值得单独提一句。外部 MCP 不是手工抄工具名，而是连接后发现、再物化。工具集合会变，系统仍然有机会保持一致视图。当然，发现失败、工具漂移、权限映射，这些都是你落地时要额外盯的运维点。

## 治理：写进运行时，而不是写进 prompt

很多项目把别乱调工具写进 system prompt。模型偶尔听话，但那不是保证。

Orloj 把治理做成执行期求值。`AgentPolicy` 约束可用模型、屏蔽工具、token 预算、子任务深度和能否派生子任务。`AgentRole` 给角色挂权限名。`ToolPermission` 规定某次工具调用需要满足什么规则。`ToolApproval` 让风险工具在批准前停住。`TaskApproval` 让图上的关键节点或最终输出进入人工循环：通过、拒绝、或要求修改后再来。

未授权默认拒绝，并且进 trace。这句话很关键。它意味着安全模型是 fail closed，不是 fail open 再靠日志补救。

代价也很实在。资源种类变多，新人要先搞懂一堆 kind。审批会拉长端到端时延。如果你的场景几乎没有副作用工具，这套会显得重。如果工具能改库、能发消息、能动外部账号，这套突然就变得合理。

## 可观测性：你要的是可解释的一跳

多智能体难查，通常不是日志太少，而是缺少结构化的一跳一跳。为什么从 research 到了 writer？这次 tool call 花了多少 token？审批卡在哪？重试第几次？

Orloj 把模型调用、工具调用、错误、token、延迟、审批、重试、消息生命周期收进 Task 轨迹和历史，再叠 Prometheus、OpenTelemetry 和控制台。调试时你追的是 Task，而不是五六个互不相关的日志流。

这套如果做得扎实，后期排障成本会明显下降。它现在仍在快速迭代，字段和 UI 完整度我会保持观察，但方向是对的。

## 本地到分布式，它想保住什么

Orloj 反复强调一条升级路径：先单进程把资源模型和业务图跑顺，再换 Postgres，再上消息中间件和多 Worker，必要时走 Kubernetes 和 CRD GitOps。

值不值得信，取决于它是否真能做到资源语义稳定。如果本地用一套对象，上生产又换一套概念，那只是两个产品缝在一起。如果 Task、AgentSystem、lease、policy 在两种部署形态里仍是同一套，那才叫基础设施。从文档和目录看，它在往第二个目标走。Go 写的 runtime、控制器、worker，外加 charts 和 compose，也都符合这个定位。

## 我认可的地方

第一，问题定义准。它盯住的是 demo 之后那批脏活，而不是再发明一种 prompt 写法。

第二，节点和图分离。Agent 管角色能力，AgentSystem 管协作结构，Task 管一次运行。这三层拆开后，系统才像能运维的东西。

第三，Worker 租约和失败可见。所有权和死信一旦成为一等概念，很多半吊子编排会立刻显得不完整。

第四，治理落在调用路径上。审批和权限不是附录，是执行中的门。

## 我暂时不会全盘押上的地方

资源面太全。控制台、CRD、评测、WASM、A2A 都堆上来以后，维护成本和心智成本都不低。小团队很容易陷入先学平台、后写业务。

版本风险真实存在。活跃开发加 1.0 前可变 schema，意味着你要有跟版本的预算，不能把它当已经冻住的内核。

不是所有业务都需要这层厚度。若你只是单 Agent、工具少、失败可重跑、没有强审计，上 Orloj 可能过重。更合理的用法，是先确认你已经反复撞上交接不可见、工具越权、任务双跑这类问题，再引入。

## 收尾

读 Orloj，我建议按基础设施的标准读，而不是按示例 App 的标准读。先搞清 Agent、AgentSystem、Task 三层，再搞清 Worker 如何 claim 和续租，再看工具调用如何被策略拦住，最后才看控制台和周边集成。

它想证明的事其实就一句：多智能体一旦离开 demo，就该有声明、有调度、有边界、有痕迹。这句我认同。至于你现在要不要把它用到自己的系统里，取决于你缺的是编排内核，还是已经缺一整张控制面。
