---
author: Duang
pubDatetime: 2026-07-24T02:30:00+08:00
modDatetime: 2026-07-24T03:10:00+08:00
title: 拆 Orloj：Agent 运行时、控制面和嵌入式控制台
featured: true
draft: false
tags:
  - Agent
  - 拆解
  - Orloj
  - 全栈
description: 细拆 Orloj 的单 Agent 循环、多 Agent 图路由、工具与治理，以及 Go 控制面、Postgres 租约和 React 控制台怎么接上同一套资源。
---

仓库：[OrlojHQ/orloj](https://github.com/OrlojHQ/orloj)。README 第一句是 Agents are infrastructure。我按 main 上的代码、`docs/pages/concepts/architecture.md` 和 `execution-model.md` 读完后，拆三块：Agent 技术本身怎么跑，后端控制面和 Worker 怎么托管这套运行时，前端控制台怎么订阅同一份状态。

项目还在活跃开发，1.0 前 schema 会变。下面按仓库现状写。

## 它要解决什么

常见 Agent demo 是一段 prompt 加一个循环。业务里真正烦人的是另一批问题：模型要换提供商和做 fallback；工具要鉴权、超时、重试，高风险调用还要人批；多 Agent 交接如果埋在控制流里，事后几乎没法对照；任务所有权不清楚时，进程挂了可能双跑，也可能假装还在跑。

Orloj 的做法是把这些提成版本化资源，有期望状态、controller、Worker 租约、执行期策略和轨迹。本地可以单进程；生产可以 Postgres 加多 Worker。资源语义尽量不变，换的是底座。

它偏重。如果你还在验证一句 prompt，这套会显得吵。如果你已经撞过交接不可见、工具越权、任务双跑，它的问题意识就对上了。

## 仓库里的进程切分

后端是 Go，模块路径 `github.com/OrlojHQ/orloj`，`go.mod` 里写的是 Go 1.26.5。入口在 `cmd/`：

`orlojd`（`cmd/orlojd/main.go`）是控制面。它拉起 REST API、资源 store、各类 controller、任务调度、控制面 event bus、可选的 agent message bus，以及默认挂在 `/` 的 Web 控制台。本地可以加 `--embedded-worker`，把执行也塞进同一个进程。

`orlojworker`（`cmd/orlojworker/main.go`）认领 Task、续租、跑 AgentSystem 图、调模型和工具，消息驱动模式下消费 agent inbox，再把 phase、消息、trace 写回 store。它也可以跑 `--single-agent` 的 Job 形态，那是另一条部署路径。

`orlojctl`（`cmd/orlojctl/main.go`）几乎只是壳，真正逻辑在 `cli/`：apply、校验、脚手架、密钥、跑任务、审批、日志和指标。

另外还有可选的 `orloj-operator`（`cmd/orloj-operator/main.go`）。它不替代 `orlojd`，只是把一部分 Kubernetes CRD 同步进同一个 Postgres store，方便 GitOps。CRD 覆盖面比 REST 资源面窄，目前主要是 Agent、AgentSystem、Tool、McpServer、ModelEndpoint、Memory、AgentPolicy、Secret 这几类。

依赖上能看出定位：`pgx` 管 Postgres，`nats.go` 管消息，`prometheus` 和 OpenTelemetry 管观测，`wazero` 跑 WASM 工具，`controller-runtime` 给 operator 用，Bedrock SDK 给模型路由用。Agent 循环本身在 `runtime/`，包名是 `agentruntime`。

## Agent 技术：单个 Agent 一回合怎么跑

文档在 `docs/pages/concepts/agents/agent.md`，实现核心是 `runtime/agent_worker.go` 里的 `AgentWorker`。

`Agent` 资源声明的是角色能力，不是整条业务图。关键字段大致是：

- `model_ref`：指向 `ModelEndpoint`，模型不写死在 Agent 里
- `prompt`：system 指令
- `tools`：候选工具名列表；真正调哪些由模型在每一步选出
- `roles`：绑定 `AgentRole`，角色带着权限去过 `ToolPermission`
- `memory.ref` / `memory.allow`：挂记忆后端，并可限制内置记忆操作（`read` / `write` / `search` / `list` / `ingest`）
- `limits.max_steps` / `limits.timeout`：单次激活的步数和墙钟上限；`max_steps` 默认文档写的是 10

运行时激活一个 Agent 时，顺序大致是：

1. 用 system prompt 和当前任务上下文初始化对话历史。
2. 若配置了 memory，把 memory store 接进 worker；若设了 `memory.allow`，只把允许的记忆操作暴露成工具。
3. 经 Model Gateway（`runtime/model_gateway_router.go`）把完整 history 发给模型。
4. 模型若返回 tool calls，先过治理（`AgentPolicy`、`AgentRole`、`ToolPermission`），再执行授权工具。记忆类工具走内部实现，不额外打网络。工具结果按提供商原生协议回灌（OpenAI 的 `role: "tool"` + `tool_call_id`，Anthropic 的 `tool_result` content block）。
5. 结果追加进 history，再问模型下一步。结束条件是：模型给出纯文本且不再要工具，或触达 `max_steps` / `timeout`。已经调用过的工具会从可用列表里拿掉，降低同一步重复打同一工具的概率。

这就是常见的 ReAct 式循环，只是边界被资源化和强制执行了：步数、超时、工具候选集、权限、策略都在声明里，而不是散落在脚本变量里。`AgentWorker` 还支持 checkpoint / resume（`SetCheckpointing`），长跑或中断后可以接着历史往下走，而不是整段重开。

工具选择模型在 `execution-model.md` 写得很直：`tools[]` 是候选；模型每步选出具体调用；只有被选中且授权的才会执行；未授权直接 fail closed，错误名是 `tool_permission_denied`。

## Agent 技术：多 Agent 图怎么走

单 Agent 循环解决“一个角色怎么想和怎么调工具”。协作拓扑在 `AgentSystem.spec.graph`。

边有两种写法：旧的 `next` 单边，以及现在更推荐的 `edges[]`（可带 label / policy 元数据）。条件路由挂在 `edges[]` 的 `condition` 上，对着刚完成的那个 Agent 的 output 求值。支持字符串类条件（`output_contains`、`output_not_contains`、`output_matches`）和 JSON path 类（`output_json_path` 配 `equals` / `contains` / 比较算子）。JSON path 通常跟 Agent 上的 `output_schema` 一起用，让结构化输出成为路由输入。没有条件的边无条件开火；条件都不中时，`default: true` 的边做兜底。文档明确写了：条件路由要求 message-driven 执行模式。

Fan-out 是一个节点打出多条下游边；条件路由开启时，只打匹配到的那些。Fan-in 是下游 join：`wait_for_all`，或 `quorum`（按个数或百分比）。条件路由少派了上游时，join 会自动下调期望分支数。join 状态落在 `Task.status.join_states`。

Delegation 是另一套两阶段：节点除了 `edges` 还可以声明 `delegates`。先执行自己，按条件把工作派给 delegates（消息带 `delegate_of`）；delegation gate 按 `wait_for_all` / `quorum` 收齐；原节点带着 `inbox.delegation.*` 再跑一轮 review；然后才走正常 `edges`。子分支走到没有出边时会自动回到委托方，`delegate_of` 可以跨多跳。状态在 `Task.status.delegation_states`。

读到这里就能分清三层：

- `Agent`：一个角色的循环与工具边界
- `AgentSystem`：角色如何连成图、何时分支汇合、何时委托审核
- `Task`：某一次跑图的运行记录（phase、lease、messages、join、delegation、trace、history、blocker）

最小例子还是研究写作流水线：

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

## Agent 技术：交接消息、执行模式、工具与记忆

图上的一次 handoff，在 message-driven 模式下就是一条可持久化的消息。`Task.status.messages` 里能看到生命周期：`queued`、`running`、`retrypending`、`waitingapproval`、`succeeded`、`deadletter`；还有 `attempts` / `max_attempts` / `next_attempt_at`，以及 `worker`、`branch_id`、`parent_branch_id`、`trace_id` 等。撞上人工审核点时，当前消息进 `waitingapproval`，直到关联的 `TaskApproval` 通过、拒绝、过期，或走 `request_changes`。

执行模式有两种，资源定义可共用：

- `sequential`：整图在进程内推，适合本地和单 Agent，不需要 message bus。
- `message-driven`：每个 agent step 进队列，带投递、重试、死信；适合并行 fan-out 和水平扩展。条件路由也挂在这个模式上。

两种模式产出同一套 task trace / history / output。本地 sequential 跑顺，再切 message-driven 上生产，是它想保住的升级路径。

工具层重点不在“支持多少种协议”，而在每次调用都过统一外壳。实现散在 `runtime/tool_runtime_*.go`、`tool_runtime_governed.go`、`tool_authorizer.go`：HTTP、gRPC、external、CLI、container、Kubernetes、WASM（`wazero`）、MCP、A2A。隔离模式、超时、带上限的指数退避加抖动、鉴权注入（含 OAuth2）、审批授权，都在 governed 路径上。`McpServer` 资源连接外部 MCP 后发现工具并物化，工具集合会变时系统仍试图维持一致视图；发现失败和权限映射是落地时要盯的运维点。

记忆方面，文档把 `Memory` 资源接到 Agent 上；后端可以是进程内、pgvector 或 HTTP。`runtime/memory_manager.go` 里有一份偏短生命周期的 `MemoryManager`（键值快照），更完整的 chunk / 检索链路在 `memory_chunker.go` 和管理器扩展里。Agent 侧真正暴露给模型的，仍是 `memory.allow` 收过界的那组内置操作。

模型路由集中在 `ModelEndpoint`：OpenAI、Anthropic、Azure、Bedrock、Ollama、mock、OpenAI-compatible。密钥走 `Secret` / `SealedSecret`。换提供商改 endpoint，而不是改每个 Agent 的硬编码 URL。

## Agent 技术：治理求值顺序

治理不是独立进程，是 worker 执行时的 inline 检查。`runtime/policy_enforcement.go` 里，`EnforcePoliciesForAgent` 在同步和消息驱动两条路径上、Agent 开跑前都要过：按匹配到的 `AgentPolicy` 检查有效模型是否在 `allowed_models`，声明工具是否落在 `blocked_tools`。策略可用 global / scoped，按 task / system / target_agents 收窄。token 预算有整次 run 的下限聚合（`MinimumTokenBudget`），也有按 agent 的预算。

工具调用前再过 `AgentRole` + `ToolPermission`。高风险工具可生成 `ToolApproval`；图上关键节点或最终输出可走 `TaskApproval`。未授权默认拒绝并进 trace。这是 fail closed。

代价也实在：kind 变多，新人要先搞懂一堆资源；审批拉长端到端时延。副作用工具多时合理；几乎没副作用时会显得重。

## 后端：API、store、调度怎么托管 Agent 运行时

HTTP 不用 Gin/Echo，路由集中在 `api/server.go`，标准库 `http.ServeMux`。资源 CRUD 在 `/v1/...`：agents、agent-systems、tasks、sessions、model-endpoints、tools、memories、secrets、policies、approvals、workers、MCP、eval、auth 等。任务和事件有 watch，前端靠它们实时刷新。

并发控制走 `resourceVersion` / `If-Match`。命名空间用 query 收窄。认证在 `api/auth_mode.go`：`off` 和 `native`；SSO 在当前发行说明里还不可用。native 登录在 `api/auth_handlers.go`，鉴权审计在 `api/authz.go`。

OpenAPI 是开发合约（`openapi/openapi.yaml` + `openapi/schemas/`），运行时不以文档站形式挂出。读实现以 `api/server.go` 为准更稳。`/metrics` 走 Prometheus；OTLP 在设了 `OTEL_EXPORTER_OTLP_ENDPOINT` 时才真正导出。

存储装配在 `startup/stores.go`。本地常用 `memory`；生产用 `postgres`。任务认领在 `store/sql_backend.go` 用 `FOR UPDATE SKIP LOCKED`。lease 接口在 `store/resource_stores.go` 一带：`ClaimNextDue`、`ClaimIfDue`、`RenewLease`。所有权是行状态，不是进程内存布尔值。

Controller 在 `controllers/`。真正负责任务派发的是 `TaskSchedulerController`（`controllers/task_scheduler_controller.go`）：看 worker 心跳是否过期，再按 region、GPU、supported model、并发容量挑负载低的。名义分配之后，执行侧还要靠 claim/lease 变成可执行所有权。只有 `Task.status.claimedBy` 对应的 worker 能处理该任务相关消息。

一次任务的主路径：apply 资源；controller 校验并写 status（MCP 做发现）；创建指向 `AgentSystem` 的 Task；调度派工；worker claim 并续租；按 sequential 或 message-driven 推进图上的 `AgentWorker` 循环；失败退避，耗尽进 DeadLetter；idempotency key 挡重放。

## 后端：两路消息，别混

控制面 event bus 在 `eventbus/`。NATS 实现默认 subject 类似 `orloj.controlplane.events`，服务 API watch、scheduler、worker controller。

运行时 agent message bus 在 `runtime/agent_message_bus*.go`，JetStream 实现是 `runtime/agent_message_bus_nats.go`，默认 stream `ORLOJ_AGENT_MESSAGES`。它负责图内 agent 交接、ack/nack、延迟重试，以及消费端跟 lease heartbeat 的配合。

`docker-compose.yml` 把生产形态写得很直白：Postgres、带 `-js` 的 NATS、一个 `orlojd`、两个 `orlojworker`。读 compose 比读一堆 flag 更快建立心智模型。

## 前端：技术栈和打包方式

控制台在 `frontend/`。React 19 + TypeScript + Vite 8，包管理是 Bun。主要依赖：`react-router-dom`、`@tanstack/react-query`、`zustand`（API base / namespace / 主题 / 侧栏；token 不进 persist）、`@xyflow/react` + `@dagrejs/dagre`（画 AgentSystem / 任务图）、`@monaco-editor/react`（YAML）、`@tanstack/react-virtual`。样式是手写 CSS，不是 Tailwind。

生产形态：Dockerfile 多阶段用 Bun build 出 `frontend/dist`，`frontend/embed.go` 用 `//go:embed dist` 打进二进制。`api/server.go` 把 UI 挂到 `--ui-path`（默认 `/`），SPA 回退 `index.html`。子路径部署时注入 `window.__ORLOJ_UI_BASE`。控制台通常由 `orlojd` 伺候；`orlojworker` 不带 UI。本地可用 `bun run dev`，Vite 代理 `/v1` 到 `127.0.0.1:8080`。

## 前端：页面和实时订阅怎么对上 Agent 状态

路由在 `frontend/src/App.tsx`。native auth 下先 setup / login。页面基本与资源一对一：AgentSystems / Agents、Tasks / Sessions、Schedules / Webhooks、Workers、Tools / MCP、ModelEndpoints / Memories、Policies / Roles / Permissions、Approvals、Eval、A2A 等。

Task 详情摊开 phase、消息、trace、审批 blocker。图用 `GraphView.tsx`，轨迹用 `TraceView.tsx` / `TaskTraceTimeline.tsx`，YAML 用 `YamlEditor.tsx`。CRD 托管资源有 `CrdManagedBadge`，对应后端 `orloj.dev/managed-by: crd-sync`。

REST 在 `frontend/src/api/client.ts`：`fetch` `/v1/*`，带 namespace 和可选 Bearer。实时在 `api/watch.ts`：`EventSource` 订 `tasks/watch`、`agents/watch`、schedules/webhooks/events 的 watch；断线退避重连，并 invalidate React Query。保存 YAML 会跟 `resourceVersion` 较劲（`hooks/saveDetailYamlWithFreshRv.ts`），和后端 `If-Match` 是同一件事的两端。

你在 UI 批一个 `ToolApproval`，改的是后端那份审批资源；worker 侧消息才能离开 `waitingapproval` 继续跑 Agent 循环。前端不是另一套编排引擎，它是资源状态的操作面和观察面。

## 周围资源

`ContextAdapter` 在 system 启动前改输入。`TaskSchedule` / `TaskWebhook` 管定时和带签名校验的事件触发。`EvalDataset` / `EvalRun` 用黄金数据压 system。`Worker` 声明容量、区域、模型、GPU、心跳和负载。`Session` 是并列的对话式路径，有单独的 `sessionStream.ts`；拆主链路时先盯 Task 即可。

资源面大，学习成本也大。好处是 CLI、REST、UI、（部分）CRD 说的是同一套对象。

## 可观测性

调试多智能体，缺的通常不是日志行数，而是结构化的一跳一跳。Orloj 把模型调用、工具调用、错误、token、延迟、审批、重试、消息生命周期收进 Task 的 trace/history，再叠 Prometheus、可选 OTel，以及控制台 Trace / Timeline / LogViewer。排障入口盯 Task 名更划算。字段和 UI 完整度还在迭代。

## 我认可的，和暂时不押的

认可的点很具体。单 Agent 循环把步数、工具候选、权限和策略做成声明；多 Agent 用图边、条件、join、delegation 表达协作，而不是把 if 埋进业务代码；Worker 租约加 `SKIP LOCKED`，所有权是数据库语义；治理在调用路径上 fail closed；前端用 Query + SSE watch + embed，跟控制面同进程交付。

暂时不押的也具体。资源面和 UI 面都很全，小团队容易先学平台再写业务。1.0 前 schema 会动。单 Agent、工具少、失败可重跑、没有强审计时可能过重。条件路由绑在 message-driven 上，本地 sequential 调试条件和生产行为不完全同构，这点要心里有数。CRD 只覆盖部分 kind，GitOps 路径和 REST 全量资源并不完全同构。

## 收尾

读 Orloj，我会按这个顺序：先搞清 `AgentWorker` 一回合怎么结束，再搞清 `AgentSystem` 图如何分支、汇合、委托，再看消息生命周期和两种执行模式；然后才看 `orlojd` / worker 的租约与双路 NATS，最后对照前端的 `client.ts` / `watch.ts` 看控制台如何订阅同一份 Task 状态。

它想做的是：多智能体离开 demo 之后，有声明、有调度、有边界、有痕迹，并且 Agent 运行时、控制面、控制台共用同一套资源合同。你现在要不要用，取决于缺的是编排内核，还是已经缺一整张带治理和控制台的控制面。
