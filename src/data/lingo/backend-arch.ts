import type { LingoTerm } from "./types";

/** 后端架构深度解析 domain pack — Python / Go 通用概念 + 各自特有概念。 */
export const BACKEND_ARCH_LINGO: LingoTerm[] = [
  // ── 通用后端架构概念 ──
  {
    id: "repository-pattern",
    title: "Repository Pattern",
    subtitle: "仓储模式",
    definition:
      "把所有数据库操作收口到一个接口后面，向上只暴露按业务语义命名的方法（如 get_user、create_order），不暴露 SQL 细节。业务层依赖接口而非具体实现，换数据库或做单测时只需替换实现，业务代码一行不改。\n\n事务边界由调用方（Service 层）控制，Repository 自身不在每个方法里各自提交事务。",
    aliases: ["Repository", "Repository Pattern", "仓储模式", "仓储"],
  },
  {
    id: "service-layer",
    title: "Service Layer",
    subtitle: "业务逻辑层",
    definition:
      "系统的核心层，负责参数业务校验、用例编排、事务边界和领域规则。它依赖 Repository 取数据，但不碰 HTTP、不拼 SQL。把业务放这里而不是放路由里，路由能保持极薄，且这段逻辑可以脱离 Web 单独跑单测或被别的入口（定时任务、消息消费）复用。",
    aliases: ["Service Layer", "业务逻辑层", "Service", "service layer"],
  },
  {
    id: "thin-controller",
    title: "Thin Controller",
    subtitle: "薄路由 / 薄 handler",
    definition:
      "接入层的路由函数只做协议转换：把 HTTP 请求解析成内部对象，调用 Service，把结果组装成 HTTP 响应。不写校验、不拼 SQL、不开事务。这样接口契约一眼能看全，协议相关逻辑也集中在一处。",
    aliases: ["薄路由", "薄 handler", "Thin Controller", "thin controller", "thin route"],
  },
  {
    id: "dependency-injection",
    title: "Dependency Injection",
    subtitle: "依赖注入",
    definition:
      "不 在代码内部硬 new 依赖，而是从外部（构造函数参数或框架机制）传入。好处是业务代码不绑死具体实现，单测时能替换成内存假实现或测试库。FastAPI 用 Depends 系统、Go 用构造函数注入，效果一样。",
    aliases: ["依赖注入", "Dependency Injection", "DI", "Depends"],
  },
  {
    id: "cache-aside",
    title: "Cache-Aside",
    subtitle: "旁路缓存",
    definition:
      "最常用的缓存模式。读的时候先查缓存，命中直接返回；没命中才查库，并把结果写回缓存再返回。写的时候先更新数据库，再删除缓存（不是更新缓存，避免并发写不一致）。过期时间兜底最终一致性。",
    aliases: ["Cache-Aside", "旁路缓存", "cache aside", "Cache Aside"],
  },
  {
    id: "cache-penetration",
    title: "Cache Penetration",
    subtitle: "缓存穿透",
    definition:
      "查一个根本不存在的 key，缓存没有、每次都打到库。恶意攻击或 bug 可能制造大量不存在的 id 请求。解决：缓存空值（短过期）或用布隆过滤器在缓存层之前拦掉不存在的 id。",
    aliases: ["缓存穿透", "Cache Penetration", "cache penetration"],
  },
  {
    id: "cache-breakdown",
    title: "Cache Breakdown",
    subtitle: "缓存击穿",
    definition:
      "某个热点 key 突然过期，瞬间大量请求同时击穿到库。和雪崩的区别是击穿只涉及单个 key。解决：互斥锁（只放一个请求去查库、其他等结果）或热点 key 逻辑过期（不设 TTL，后台异步刷新）。",
    aliases: ["缓存击穿", "Cache Breakdown", "cache breakdown"],
  },
  {
    id: "cache-avalanche",
    title: "Cache Avalanche",
    subtitle: "缓存雪崩",
    definition:
      "大量 key 在同一时刻集中过期，或 Redis 整体挂了，请求全压到库。解决：过期时间加随机抖动避免同时失效；Redis 做高可用（主从加哨兵或集群）避免单点。",
    aliases: ["缓存雪崩", "Cache Avalanche", "cache avalanche"],
  },
  {
    id: "n-plus-1",
    title: "N+1 Query",
    subtitle: "N+1 查询问题",
    definition:
      "查 N 个对象，每个又去查一次关联表，结果变成 1（查主表）加 N（查关联）次 SQL。数据量小不明显，上生产就是性能杀手。解法：用 JOIN 或批量 WHERE IN 一次性把关联数据带出来。SQLAlchemy 用 joinedload/selectinload，GORM 用 Preload。",
    aliases: ["N+1", "N+1 查询", "N+1 query", "N+1 问题"],
  },
  {
    id: "connection-pool",
    title: "Connection Pool",
    subtitle: "连接池",
    definition:
      "预先建好一批数据库连接放在池子里，请求来了借一个、用完还回去复用，避免每次请求都走 TCP 握手和鉴权。关键参数：最大连接数（上限不能超数据库承受力）、空闲连接数、连接最大存活时间。不配上限会打挂数据库，配太小会饿死请求。",
    aliases: ["连接池", "Connection Pool", "connection pool", "pool_size"],
  },
  {
    id: "read-write-split",
    title: "Read-Write Split",
    subtitle: "读写分离",
    definition:
      "主库负责写（INSERT/UPDATE/DELETE），从库负责读（SELECT），主从复制把写同步到从库，读压力分摊到多个从库。注意主从延迟：刚写入的数据在从库可能还没同步到，强一致要求的读要走主库。",
    aliases: ["读写分离", "Read-Write Split", "read write split", "主从延迟"],
  },
  {
    id: "trace-id",
    title: "Trace ID",
    subtitle: "链路追踪 ID",
    definition:
      "每个请求生成一个唯一 ID，贯穿整条调用链：入请求的 header、日志每条都带、调下游也传过去。出问题时能把一次请求经过所有服务、所有组件的日志串成一条线。没有 trace id，几十条日志里你分不清哪些属于同一次请求。",
    aliases: ["trace id", "Trace ID", "trace_id", "链路追踪", "X-Trace-Id"],
  },
  {
    id: "12-factor",
    title: "12-Factor App",
    subtitle: "十二要素应用",
    definition:
      "SaaS 应用的工程方法论。最关键的几条：配置走环境变量不写死代码、把后端服务当可附加资源、构建/发布/运行三阶段分开、日志当事件流打标准输出由平台收集。",
    aliases: ["12-factor", "12 factor", "十二要素", "12 factor app"],
    source: {
      label: "Wikipedia: Twelve-Factor App",
      url: "https://en.wikipedia.org/wiki/Twelve-Factor_App",
    },
  },

  // ── Python 特有概念 ──
  {
    id: "gil-backend",
    title: "GIL",
    subtitle: "Global Interpreter Lock · 全局解释器锁",
    definition:
      "CPython 的实现细节：同一进程内，同一时刻只有一个线程能执行 Python 字节码。所以多线程做 CPU 密集任务无法真正并行，反而因锁竞争更慢。Python Web 靠多进程（gunicorn 多 worker）吃满多核，IO 密集用协程绕开 GIL。Go 没有这个问题。",
    aliases: [],
  },
  {
    id: "wsgi",
    title: "WSGI",
    subtitle: "Web Server Gateway Interface",
    definition:
      "Python 的同步 Web 服务器接口规范（PEP 3333）。一个请求进来，占用一个 worker（线程或进程），从头执行到返回，期间 worker 不能被别的请求用。Django/Flask 的传统跑法就是 WSGI。并发能力基本等于 worker 数乘每 worker 线程数。",
    aliases: ["WSGI", "wsgi"],
    source: {
      label: "Wikipedia: Web Server Gateway Interface",
      url: "https://en.wikipedia.org/wiki/Web_Server_Gateway_Interface",
    },
  },
  {
    id: "asgi",
    title: "ASGI",
    subtitle: "Asynchronous Server Gateway Interface",
    definition:
      "WSGI 的异步继任者。一个进程里用事件循环，多个请求并发；某个请求在 await 等 IO 时，事件循环转去跑别的就绪请求。少量进程就能扛大量正在等的连接。FastAPI/Starlette 跑在 ASGI 上，原生支持 WebSocket、HTTP/2、SSE。",
    aliases: ["ASGI", "asgi", "uvicorn", "Uvicorn"],
  },
  {
    id: "asyncio-backend",
    title: "asyncio",
    subtitle: "Python 异步 IO 事件循环",
    definition:
      "Python 3.4+ 内置的异步 IO 框架。一个线程里维护任务队列，遇到 await 就把当前协程挂起、切到别的就绪协程，等 IO 好了再回来接着跑。一个协程只几 KB 栈，单进程能管成百上千条连接。代价是写异步代码要避开阻塞调用，否则会卡住整个事件循环。",
    aliases: [],
  },
  {
    id: "celery",
    title: "Celery",
    subtitle: "Python 异步任务队列",
    definition:
      "Python 生态最常用的异步任务框架。由四部分组成：任务（加 @app.task 装饰的 Python 函数）、Broker（消息队列，Redis 或 RabbitMQ，存待执行任务）、Worker（执行任务的进程，可多台）、Backend（存任务结果，可选）。Web 进程只把任务投进队列就返回，worker 慢慢消费，实现解耦。",
    aliases: ["Celery", "celery", "Celery worker"],
  },
  {
    id: "sqlalchemy",
    title: "SQLAlchemy",
    subtitle: "Python ORM",
    definition:
      "Python 生态最成熟的 ORM。支持声明式模型映射（class 继承 Base，字段用 Column 定义）和链式查询。2.x 风格用 Mapped/mapped_column 做类型注解。关键能力：joinedload/selectinload 解决 N+1、session 管理事务边界、连接池内建。",
    aliases: ["SQLAlchemy", "sqlalchemy", "joinedload", "selectinload", "sessionmaker"],
  },

  // ── Go 特有概念 ──
  {
    id: "goroutine-backend",
    title: "Goroutine",
    subtitle: "Go 轻量协程",
    definition:
      "Go 运行时管理的轻量协程。go func() 就起一个，初始栈只有几 KB，由 runtime 在多个操作系统线程上多路复用（GMP 调度）。一个进程轻松跑几十万个 goroutine，而 Python 一个线程就要占几 MB 且受 GIL 限制。这是 Go 高并发的根基。",
    aliases: [],
    source: {
      label: "Wikipedia: Goroutine",
      url: "https://en.wikipedia.org/wiki/Go_(programming_language)#Goroutines",
    },
  },
  {
    id: "channel-backend",
    title: "Channel",
    subtitle: "Go 通道",
    definition:
      "goroutine 之间传数据和同步的管道。核心思想：不要通过共享内存来通信，而要通过通信来共享内存。channel 是有类型的，可以用 make 创建带缓冲或无缓冲的。无缓冲 channel 强制收发双方同步握手；带缓冲的在缓冲区满之前发方不阻塞。",
    aliases: [],
    source: {
      label: "Wikipedia: Channel (Go)",
      url: "https://en.wikipedia.org/wiki/Go_(programming_language)#Channels",
    },
  },
  {
    id: "go-context-backend",
    title: "context.Context",
    subtitle: "Go 上下文传播",
    definition:
      "Go 标准库的上下文接口，在函数调用链中传递超时、取消信号和请求范围的值。所有数据库调用、HTTP 请求都应该透传 ctx，这样上游取消或超时时，下游的 IO 操作会立即中止，避免 goroutine 泄漏。不传 ctx 的 goroutine 一旦启动就失控，是 Go 并发最常见的坑。",
    aliases: [],
  },
  {
    id: "go-interface",
    title: "Go Interface",
    subtitle: "Go 接口",
    definition:
      "Go 的接口是隐式的：结构体只要实现了接口定义的全部方法，就算实现了这个接口，不需要显式声明 implements。这让 Go 的分层比 Python 更硬：Repository 接口在编译期就定死了，Service 想直接碰 SQL 编译都过不了。Python 靠自律，Go 靠编译器。",
    aliases: ["Go interface", "Go 接口", "interface", "隐式接口"],
  },
  {
    id: "go-defer",
    title: "defer",
    subtitle: "Go 延迟执行",
    definition:
      "Go 的 defer 语句在函数返回前执行，常用于资源清理（关文件、关 rows、释放锁）。多个 defer 按 LIFO 顺序执行。最典型的用法：db.Query 后立即 defer rows.Close()，确保连接归还连接池，即使中间 panic 也不会泄漏。",
    aliases: ["defer", "Go defer", "defer rows.Close"],
  },
  {
    id: "go-recover",
    title: "recover",
    subtitle: "Go panic 恢复",
    definition:
      "Go 不像 Python 有框架兜底异常。一个 goroutine 里 panic 如果没人 recover，整个进程直接退出。所以中间件必须用 defer + recover 兜住 panic，返回 500 而不是让进程挂掉。Recover 只能在 deferred 函数里调用才有效。",
    aliases: ["recover", "Go recover", "panic recover", "defer recover"],
  },
  {
    id: "go-errors",
    title: "Go Error Handling",
    subtitle: "Go 错误处理",
    definition:
      "Go 不用 try/except，函数同时返回值和 error：result, err := doSomething()，调用方必须检查 if err != nil。虽然啰嗦，但错误路径是显式的、可审计的。哨兵错误（var ErrNotFound = errors.New(...)）配合 errors.Is 做错误匹配，是 Go 的惯用模式。",
    aliases: ["if err != nil", "Go error", "errors.New", "errors.Is", "哨兵错误", "sentinel error"],
  },
  {
    id: "gorm",
    title: "GORM",
    subtitle: "Go ORM",
    definition:
      "Go 生态最流行的全功能 ORM。用链式调用拼查询（db.Where(...).Find(&orders)），自动建表迁移，关联预加载用 Preload 一次性取回关联数据避免 N+1。开发快但抽象重，复杂查询时性能与可控性要留意。更轻的选择是 sqlx，只帮你把行扫进 struct，SQL 自己写。",
    aliases: ["GORM", "gorm", "Preload"],
  },
  {
    id: "asynq",
    title: "asynq",
    subtitle: "Go 异步任务队列",
    definition:
      "Go 生态基于 Redis 的延迟任务队列库。对应 Python 的 Celery：定义任务（asynq.NewTask）、入队（client.Enqueue）、worker 消费（asynq.NewServer + mux.Handle）。比 Celery 轻，不带结果 Backend，但够用。",
    aliases: ["asynq", "Asynq", "Go asynq"],
  },
  {
    id: "go-binary-deploy",
    title: "Single Binary Deploy",
    subtitle: "Go 单一二进制部署",
    definition:
      "Go 编译出的是一个静态链接的二进制文件，没有外部依赖（不像 Python 要带 venv 和一堆包）。容器化极轻（镜像可以小到几 MB），启动快，水平扩容就是多跑几个容器前面加负载均衡。这是 Go 在基础设施领域统治力的来源之一。",
    aliases: ["单一二进制", "Single Binary", "Go binary", "静态链接"],
  },
  {
    id: "gin-framework",
    title: "Gin",
    subtitle: "Go Web 框架",
    definition:
      "Go 生态最流行的 Web 框架。基于 net/http（标准库），提供路由分组、中间件链、JSON 序列化（c.JSON）、参数绑定等便利。比裸用 net/http 省样板，又比 Django 轻。同类选择有 Echo、Chi、Fiber（Fiber 底层是 fasthttp 而非 net/http，性能极致但兼容性要留意）。",
    aliases: ["Gin", "gin", "Gin framework", "gin-gonic"],
  },
  {
    id: "gmp-scheduler",
    title: "GMP 调度",
    subtitle: "Go runtime 调度模型",
    definition:
      "Go 运行时把 goroutine 调度到操作系统线程上跑的模型。G 是 goroutine，M 是操作系统线程，P 是逻辑处理器（持有可运行 G 的本地队列）。一个 M 只有绑了一个 P 才能执行 G。P 的数量由 GOMAXPROCS 控制，默认等于 CPU 核数。当某个 P 的队列空了，会从别的 P 偷一半 G 过来跑（work stealing），保证所有核都不闲着。",
    aliases: ["GMP 调度", "Goroutine 调度"],
  },
  {
    id: "go-select",
    title: "select",
    subtitle: "Go 多路复用",
    definition:
      "Go 的 select 语句让一个 goroutine 同时等待多个 channel 操作。哪个 case 先就绪就执行哪个，都就绪则随机选一个（避免饥饿）。带 default 分支的 select 是非阻塞收发。select 是 Go 并发编排的核心：超时控制（select + time.After）、退出信号（select + ctx.Done）、多路 fan-in 全靠它。",
    aliases: ["select", "Go select", "select case", "time.After", "ctx.Done"],
  },
  {
    id: "sync-waitgroup",
    title: "sync.WaitGroup",
    subtitle: "Go 协程同步",
    definition:
      "Go 标准库的计数信号量，用来等一组 goroutine 全部完成。主 goroutine 调 Add(n) 加 n，每个子 goroutine 完成时调 Done()（内部就是 Add(-1)），最后 Wait() 阻塞到计数归零。常见坑：Add 必须在启动 goroutine 之前调，Done 要 defer 调确保 panic 时也执行，否则 Wait 永远等不到。",
    aliases: ["wg.Add", "wg.Done"],
  },
  {
    id: "sync-mutex-backend",
    title: "sync.Mutex",
    subtitle: "Go 互斥锁",
    definition:
      "Go 标准库的互斥锁。Lock 加锁、Unlock 解锁，同一时刻只有一个 goroutine 能持有。保护共享状态（计数器、map 并发写）时用。Go 风格推荐优先用 channel 通信而不是共享内存加锁，但有些场景（比如缓存 map）锁更直接。RWMutex 允许多读单写，读多写少的场景比 Mutex 性能好。defer Unlock 是基本操作。",
    aliases: [],
  },
  {
    id: "go-module",
    title: "Go Module",
    subtitle: "go.mod 依赖管理",
    definition:
      "Go 1.11+ 的依赖管理方案。一个 go.mod 文件声明 module 路径和依赖版本，go.sum 记录每个依赖的哈希保证可复现构建。go get 添加/升级依赖，go mod tidy 清理未用依赖。和 Python 的 requirements.txt + venv 比，Go module 是语言内置的，不需要额外工具，且编译时把依赖打进二进制，运行时不再需要依赖文件。",
    aliases: ["go.mod", "go.sum", "go module", "Go Module", "go get", "go mod tidy"],
  },
  {
    id: "graceful-shutdown",
    title: "Graceful Shutdown",
    subtitle: "优雅关闭",
    definition:
      "进程收到停止信号（SIGTERM）时不立刻断连，而是：1) 停止接受新请求；2) 等正在处理的请求跑完；3) 超时强制杀。Go 里用 http.Server.Shutdown(ctx)，Python 里 gunicorn 用 --graceful-timeout。K8s 滚动更新时，没有优雅关闭会导致正在处理的请求被中途掐断，用户看到 502。",
    aliases: ["优雅关闭", "Graceful Shutdown", "graceful shutdown", "Shutdown", "SIGTERM"],
  },
  {
    id: "idempotency",
    title: "Idempotency",
    subtitle: "幂等性",
    definition:
      "同一个操作执行一次和执行多次效果一样。HTTP 里 GET/PUT/DELETE 天然幂等，POST 不幂等。支付、扣库存这类操作必须做成幂等的：用唯一请求 id（idempotency key）去重，第二次同样的请求直接返回第一次的结果而不是再扣一次。消息消费也要幂等，因为消息至少投递一次（at-least-once）。",
    aliases: ["幂等", "幂等性", "Idempotency", "idempotent", "idempotency key"],
  },
  {
    id: "rate-limit",
    title: "Rate Limiting",
    subtitle: "限流",
    definition:
      "控制单位时间内的请求数量，防止下游被打爆或被恶意刷。常见算法：令牌桶（按固定速率发令牌，桶满了丢弃，允许突发）、漏桶（请求匀速流出，超量排队或拒绝）。实现位置：网关层（Nginx limit_req）、应用层（Redis 计数器）、客户端层。限流要返回 429 并带 Retry-After header，让客户端知道等多久重试。",
    aliases: ["限流", "Rate Limiting", "rate limit", "令牌桶", "token bucket", "漏桶", "429"],
  },
  {
    id: "circuit-breaker",
    title: "Circuit Breaker",
    subtitle: "熔断器",
    definition:
      "下游服务出错率超阈值时，熔断器跳闸，后续请求直接快速失败不再调下游，给它喘息恢复的时间。三态：Closed（正常调用）、Open（熔断，直接报错）、Half-Open（放一个探测请求试探是否恢复）。没有熔断器，一个慢下游会把上游所有线程拖住，级联雪崩。Python 用 pybreaker，Go 用 sony/gobreaker。",
    aliases: ["熔断", "熔断器", "Circuit Breaker", "circuit breaker", "Half-Open", "gobreaker"],
  },
  {
    id: "health-check",
    title: "Health Check",
    subtitle: "健康检查",
    definition:
      "一个轻量端点（/health 或 /healthz）让平台探探服务是否活着。K8s 分两种探针：liveness（活了吗，不活就重启容器）、readiness（ ready 吗，没 ready 就从负载均衡摘掉）。健康检查要轻（不查库不查下游，只看进程是否正常），否则探针本身把服务拖垮。深度检查（/health?deep=true）才查依赖。",
    aliases: ["健康检查", "Health Check", "healthz", "liveness", "readiness", "K8s 探针"],
  },

  // ── Python 补充概念 ──
  {
    id: "fastapi",
    title: "FastAPI",
    subtitle: "Python 异步 Web 框架",
    definition:
      "Python 生态最现代的 Web 框架。基于 Starlette（ASGI）和 Pydantic（类型校验），原生 async/await，自动生成 OpenAPI 文档。依赖注入用 Depends，比 Flask 的全局 g 干净。因为跑在 ASGI 上，单进程能扛大量并发连接；但注意：同步阻塞调用（requests.get、同步 ORM）会卡住事件循环，必须换异步版本（httpx、asyncpg）。",
    aliases: ["FastAPI", "fastapi", "Starlette"],
  },
  {
    id: "pydantic",
    title: "Pydantic",
    subtitle: "Python 数据校验",
    definition:
      "Python 的数据校验和序列化库，FastAPI 的底座。继承 BaseModel 定义 schema，字段带类型注解，实例化时自动校验类型和约束（gt=0、max_length 等）。校验失败抛 ValidationError，框架兜住后返回 422。Pydantic v2 用 Rust 写核心，比 v1 快 5-50 倍。和 Go struct tag 校验（binding:\"required\"）是同一类东西。",
    aliases: ["Pydantic", "pydantic", "BaseModel", "ValidationError", "422"],
  },
  {
    id: "gunicorn",
    title: "gunicorn",
    subtitle: "Python WSGI 服务器",
    definition:
      "Python 生态最常用的 WSGI 服务器。用 pre-fork 模型：一个 master 进程管 N 个 worker 进程，每个 worker 进程同步处理一个请求。worker 数一般设 CPU 核数的 2-4 倍。配合 gevent 或 uvicorn.workers.UvicornWorker 可以在 WSGI 框架下跑协程。master 挂了 worker 会跟着重启，比裸跑 python app.py 可靠得多。",
    aliases: ["gunicorn", "Gunicorn", "pre-fork", "worker", "gevent"],
  },
  {
    id: "decorator",
    title: "装饰器",
    subtitle: "Python Decorator",
    definition:
      "Python 的高阶语法糖。@decorator 写在函数定义上面，等价于 func = decorator(func)。本质是一个接收函数返回函数的高阶函数。Web 框架里到处用：@app.route 注册路由、@app.task 注册 Celery 任务、@cached 加缓存。带参数的装饰器要套三层函数，functools.wraps 保住原函数元信息。Go 没有装饰器语法，靠中间件链实现类似效果。",
    aliases: ["装饰器", "decorator", "@", "functools.wraps", "@app.route"],
  },
  {
    id: "type-hints",
    title: "Type Hints",
    subtitle: "Python 类型注解",
    definition:
      "Python 3.5+ 的可选类型注解。def get_user(id: int) -> User 这种写法，运行时不强制，但 mypy / pyright 能静态检查。现代 Python 项目（FastAPI、Pydantic）把类型注解当一等公民用：框架靠它做校验和序列化，IDE 靠它做补全。Go 是编译期强制类型，Python 是运行时不挡但工具链挡，两者哲学不同。",
    aliases: ["类型注解", "Type Hints", "type hints", "mypy", "pyright", "->"],
  },
  {
    id: "venv",
    title: "venv",
    subtitle: "Python 虚拟环境",
    definition:
      "Python 内置的虚拟环境工具。python -m venv .venv 创建一个独立目录，里面的 python 和 pip 和系统隔离。激活后装的包只在这个环境里，不污染全局。生产部署用 venv 或更轻的 pip install --user。Go 不需要 venv，因为 go.mod 已经把依赖隔离在 module 内，且编译成单一二进制后运行时不需要任何包环境。",
    aliases: ["venv", "virtualenv", "虚拟环境", ".venv", "pip install"],
  },

  // ── Go 补充概念 ──
  {
    id: "go-pprof",
    title: "pprof",
    subtitle: "Go 性能分析",
    definition:
      "Go 标准库的性能分析工具。runtime/pprof 给 CLI 程序用（CPU profile、heap profile、goroutine profile），net/http/pprof 给常驻服务用（暴露 /debug/pprof 端点，go tool pprof http://... 在线采样）。火焰图（go tool pprof -http）是定位 CPU 热点和内存分配的利器。Python 没有内置等价物，要靠 cProfile + snakeviz 或 py-spy。",
    aliases: ["pprof", "go pprof", "net/http/pprof", "go tool pprof", "火焰图"],
  },
  {
    id: "go-wire",
    title: "wire",
    subtitle: "Go 依赖注入代码生成",
    definition:
      "Google 出的 Go 依赖注入工具，靠代码生成而不是反射。你写 Provider 函数（怎么构造一个类型）和 Injector 函数（需要哪些类型），wire generate 生成具体的组装代码。编译期就能发现依赖缺失，不像 Python 运行时才报错。适合大型 Go 项目管理复杂依赖图，小项目用构造函数手写更直接。",
    aliases: ["wire", "go wire", "google/wire", "Provider", "Injector"],
  },
  {
    id: "go-test",
    title: "go test",
    subtitle: "Go 内置测试",
    definition:
      "Go 语言内置的测试工具，不需要额外框架。写一个 xxx_test.go 文件，函数签名 func TestXxx(t *testing.T) 就是测试用例。go test ./... 跑全部，-run 过滤，-bench 跑基准，-race 开竞态检测。和 Python 的 pytest 比：Go 测试是语言内置的，pytest 是第三方但更灵活（fixture、参数化、插件生态）。",
    aliases: ["go test", "testing.T", "_test.go", "-race", "go bench"],
  },
  {
    id: "go-middleware",
    title: "Go Middleware",
    subtitle: "Go 中间件链",
    definition:
      "Go Web 里把多个 handler 包成洋葱模型的机制。中间件是一个 func(http.Handler) http.Handler，接收下游 handler 返回包装后的 handler。日志、鉴权、限流、recover、trace id 全写成中间件，用 gorilla/mux 或 chi 的 Use() 串起来。和 Python 装饰器是同一个思路，但 Go 靠嵌套函数、Python 靠 @ 语法糖。",
    aliases: ["Go 中间件", "middleware", "func(http.Handler) http.Handler", "Use", "洋葱模型"],
  },
  {
    id: "go-sql-db",
    title: "database/sql",
    subtitle: "Go 标准库数据库接口",
    definition:
      "Go 标准库的数据库抽象层。定义了 *sql.DB（连接池管理）和 *sql.Rows（查询结果集）等接口，具体数据库驱动（如 lib/pq、go-sql-driver/mysql）实现 driver.Driver 接口。database/sql 内建连接池，SetMaxOpenConns / SetMaxIdleConns 调池子大小。sqlx 在它基础上加了 struct 扫描便利；GORM 是更上层的全功能 ORM。",
    aliases: ["database/sql", "sql.DB", "sql.Rows", "SetMaxOpenConns", "SetMaxIdleConns", "sqlx"],
  },
];
