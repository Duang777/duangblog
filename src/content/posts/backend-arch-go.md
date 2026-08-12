---
author: Duang
pubDatetime: 2026-08-12T07:00:00+08:00
title: 后端架构深度解析（Go 篇）：用 goroutine 和接口把高并发写进骨架
featured: false
draft: false
tags:
  - 后端专栏
  - 后端架构深度解析
  - Go
description: 用 Go 重走一次 HTTP 请求链路，重点讲和 Python 不一样的地方：没有 GIL、原生 goroutine、接口驱动的分层、单一二进制部署。
---

后端架构深度解析（Go 篇）：用 goroutine 和接口把高并发写进骨架

> 这篇是后端架构深度解析系列的 Go 篇，承接前面已经写完的 Python 篇。我会用 Go 重走一次 HTTP 请求的完整链路，重点讲 Go 和 Python 不一样的地方：它没有 GIL、原生支持 goroutine，所以并发模型是它最大的不同；框架、数据访问、依赖注入的写法也带着 Go 自己的味道。结构还是"概念决策 + 工程代码落地"双 Part，第三章会把每一层"负责什么、不负责什么、工程上怎么落地、常见坑在哪"讲透，方便你直接对照 Python 篇看差异。

## 一、先建立全局视角：后端架构在管什么

一个后端服务，本质上就是收请求、干点活、返回结果的程序。规模小的时候全写在一个函数里也能跑，但系统一长大会出问题：改一处容易带崩别处、某个模块要扩容却得整体跟着扩、数据库挂了整个应用一起躺。架构要解决的，就是把这些活拆成职责清晰、能各自替换和扩展的部分。

顺着一次请求，常见的链路长这样：

客户端 → 接入层（Nginx 等反向代理） → 应用服务（Go 编译出的二进制进程） → 路由 → 业务逻辑层 → 数据访问层（SQL 驱动 / ORM / 连接池） → 数据库 / 缓存 / 消息队列，此外还有横穿所有层的日志、鉴权、配置、可观测性。

```mermaid
flowchart LR
  Client["客户端<br/>Browser / App"]
  Nginx["接入层<br/>Nginx · TLS · 限流"]
  GoBin["Go 二进制<br/>net/http Server"]
  Router["路由<br/>Gin · Echo · Chi"]
  Service["业务逻辑层<br/>Service · 事务边界"]
  DAL["数据访问层<br/>Repository · database/sql"]
  DB[("数据库 / 缓存<br/>Postgres · Redis")]
  MQ["消息队列<br/>asynq · Redis"]

  Client --> Nginx --> GoBin --> Router --> Service --> DAL --> DB
  Service -. 异步任务 .-> MQ

  classDef cross stroke-dasharray: 4 3
```

分层带来的好处很实在：解耦（改接入层不影响业务）、各自演进（框架升级不带动数据层）、故障隔离、好测试。对 Go 来说还有一层额外意义：Go 没有框架强制你分层，全靠目录约定（internal/、pkg/）和接口来约束，所以"工程代码架构"在 Go 项目里比在 Django 里更依赖你自觉搭好骨架。

## 二、Go 在后端的定位与生态

Go 适合高并发、低延迟、需要稳定长时间运行的服务：API 网关、微服务、消息中间件、各类基础设施。事实上 Docker、Kubernetes、etcd、Prometheus 都是 Go 写的，足见它在基础设施领域的统治力。它的生态成熟：标准库 net/http 原生就能起一个生产级 HTTP 服务；Web 框架有 Gin、Echo、Fiber；ORM 有 GORM、以及更轻的 sqlx；RPC 有 gRPC；异步任务有 asynq、消息队列有 NATS。

它的短板也明确：表达力相对弱，泛型来得晚（1.18 才稳定）、错误处理啰嗦（满屏 if err != nil），不适合重数值计算或带界面的前端。所以真实架构里，Go 常常负责高并发的 API 和基础设施，把重计算或复杂业务编排交给 Python 或其他语言的服务，而不是一个人扛全部。

## 三、分层架构：每一层到底干什么

分层的概念和 Python 篇一致，只是 Go 项目里没有框架替你定好目录，需要靠约定自己落实。先用一张表把"四层各自负责什么、不负责什么"钉死，这是后面所有 Go 代码的纪律：

| 分层 | 这一层负责什么 | 这一层不负责什么 |
|-|-|-|
| 接入层 | TLS 终止、负载均衡、静态资源、限流防刷、压缩、超时保护、把请求交给 Go 二进制 | 不写业务逻辑、不碰数据库、不做领域规则 |
| 业务逻辑层 | 参数校验、用例编排、事务边界、领域规则、调用 repository 接口 | 不拼 SQL、不直接读 \*http.Request、不处理鉴权日志横切 |
| 数据访问层 | 收口 DB 操作、用接口暴露业务语义方法、管理连接池、结果映射 | 不写业务规则、不碰 HTTP、不在每个方法里各开各的事务 |
| 横切关注点 | 日志（带 trace id）、统一 recover、JWT 鉴权、跨层通用能力 | 不写具体业务逻辑 |

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    Go 的接口让分层比 Python 更硬：Repository 接口在编译期就定死了，Service 想直接碰 SQL 编译都过不了。Python 靠自律，Go 靠编译器。
  </div>
</details>


<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-layered-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">分层瓶 · Go 编译器守栅栏</span>
  </div>
  <p class="duang-whisper-body">goroutine 把并发做进骨架，分层把职责做进栅栏。Go 的栅栏是编译器在守，不是靠人记。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>


下面先把整个 order-service 的目录结构亮出来，让你一眼看清每层代码具体落在哪个目录；然后按从外到内逐层说明每层的职责，每一块的落点你都对得上：

## 先看整体：order-service 项目结构总览

这是后面所有 Go 代码片段的实际载体。Go 用目录表达依赖方向，最关键的是 cmd/（唯一入口）、internal/（仅本服务可用）、pkg/（可复用公共代码）三层划分：

```
order-service/
├── cmd/
│   └── order-service/
│       └── main.go            # 程序唯一入口：装配依赖、启动 HTTP 服务
├── internal/                  # 仅本服务可用，外部无法 import
│   ├── config/
│   │   └── config.go          # 配置加载
│   ├── domain/
│   │   └── order.go           # 领域模型（纯业务结构，不含框架）
│   ├── repository/
│   │   ├── order.go           # OrderRepository 接口
│   │   └── order_mysql.go     # 基于 MySQL 的实现
│   ├── service/
│   │   └── order.go           # 业务逻辑层
│   ├── handler/
│   │   └── order.go           # HTTP 接入层（薄）
│   └── middleware/
│       ├── recover.go         # panic 恢复
│       ├── logging.go         # 请求日志 + trace id
│       └── auth.go            # JWT 鉴权
├── pkg/                       # 可被其他服务复用的公共代码（可选）
│   └── response/
│       └── response.go        # 统一返回结构
├── go.mod
├── go.sum
├── Dockerfile
└── .env.example
```

记住一条主线：main.go 认识所有人（它 new 出 repository、service、handler 并串起来）；handler 依赖 service，service 依赖 repository 接口，repository 依赖 domain；domain 最底层，不依赖任何上层。依赖方向永远向内指，谁都不回头。下面逐层展开时，每段说明都会标明它属于上面这个树的哪个位置。

## 接入层（反向代理 + Go 二进制服务）

接入层分两段：最外面是 Nginx/Caddy 这类反向代理，里面是 Go 编译出的二进制进程（net/http 或 Gin）。它们干的都是"和具体业务无关、但人人都需要"的事——把请求安全高效地接进来，顺手把脏活挡在业务代码之外。

反向代理要管的事挺多。TLS 终止放在 Nginx 上做一次解密，Go 进程内部走明文，省掉每个连接各自做加解密的 CPU 开销。负载均衡把流量分到多个 Go 实例，单机挂了整体照常服务。静态资源（图片、JS）直接由 Nginx 返回，不进 Go 进程，不占宝贵的 goroutine。限流和防刷在代理层直接拦，恶意流量根本到不了业务代码。压缩省带宽，超时保护掐掉卡死的慢连接。最后，Go 的 http.Server（或 Gin）负责把 HTTP 请求转成 handler 能处理的参数——这一步是"应用服务器"该干的，不是你业务代码该操心的。

这一层不写业务逻辑、不碰数据库、不落实领域规则，它的边界很清晰：只管"请求怎么进门"，不管"进门之后干什么"。

下面是一个典型的 Nginx 反代配置，把 TLS 终止、静态资源、超时、限流都挡在外面，后端指向 Go 二进制：

```
# /etc/nginx/conf.d/order-service.conf
upstream go_backend {
    server 127.0.0.1:8080;  # Go 二进制监听地址，可列多台做负载均衡
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location /static/ {
        alias /var/www/order-service/static/;
        expires 30d;
    }

    location / {
        proxy_pass http://go_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://go_backend;
    }
}
```

<strong>代码讲解：</strong>和 Python 篇的接入层一模一样，TLS、静态、超时、限流都在 Nginx 解决，Go 二进制作为 upstream 被代理转发。注意一个 Go 特有的点：Go 这边自己的 http.Server 也要配 `ReadTimeout`/`WriteTimeout`（见第十四章 main.go）。Nginx 的 `proxy_read_timeout` 只管"Nginx 到 Go"这一段，如果 Go 自己没设超时，单个慢 handler 仍然能把连接占满——代理和 Go 两侧的超时是两套独立的东西，得分别配。

<strong>常见坑：</strong>

<strong>限流放错位置。</strong>和 Python 一样，把限流写在应用层而不是 Nginx，多实例部署时每个 Go 进程各自数自己的，根本拦不住。Nginx 是全局唯一入口，在这里限流才能看到完整流量。

<strong>漏写 proxy_set_header Host。</strong>Go 拿到的 `r.Host` 会变成 upstream 内部地址（比如 `127.0.0.1:8080`），一旦代码里要生成回调 URL 或做 302 重定向，地址全错。顺带 `X-Real-IP` / `X-Forwarded-For` 也别忘了，否则日志里看到的都是 Nginx 的地址，真实用户 IP 丢失，排查问题时无从下手。

<strong>Go 的 http.Server 没配超时。</strong>这是 Go 特有的高频坑。Nginx 的 `proxy_read_timeout` 只管到 Go 这一段，Go 自己如果没设 `ReadTimeout`/`WriteTimeout`，一个慢客户端或慢依赖（比如下游服务卡住）就能把 goroutine 和连接长期占着不放，连接池耗尽后整个服务不可用。Go 不像 Python 框架那样有默认兜底，Server 超时必须自己显式配置。

<strong>静态资源没配 expires。</strong>Nginx 的 `location /static/` 不加 `expires` 指令，浏览器每次刷新都回源问 Nginx "这文件改了吗"，高并发时 Nginx 和 Go 后端一起被重复请求拖垮。加上 `expires 30d` 后浏览器 30 天内不再回源，压力直接归零。

<strong>应用层限流配置写死、没留突发。</strong>即使把限流留在了 Nginx，`limit_req` 如果只配了 `rate=10r/s` 没配 `burst`，正常的瞬时小高峰（用户双击、重试）也会被硬拒，体验很差。一般要留一个 `burst` 缓冲带，把平滑的突发放进来、只拦真正的洪峰。

## 应用层 / 业务逻辑层

这一层是整个系统的核心。它接收已经过接入层处理的请求、校验参数合法性、编排业务用例、管理事务边界、落实领域规则。一句话：凡是算"业务"的，代码就写在这。

具体来说，参数的业务校验归这里管——不是"字段是不是数字"这种格式检查（那是框架干的），而是"金额是否合法"、"用户是否存在"、"库存够不够"这种带业务语义的判断。用例编排也归这里：一个下单动作可能涉及查用户、写订单、写明细，这些步骤谁先谁后、哪几步必须原子地完成，由这层决定。事务边界也是这里圈的："扣款和出票必须同时成功或失败"这种约束，只有业务层知道哪些操作该绑在一起。领域规则同样集中在这里——"新用户首单打九折"这种策略写在这一处，而不是散落在下单、改单、退款各处。最后，数据访问通过 Repository 接口完成，不直接拼 SQL。

这一层不该做的事：不拼 SQL（那是 DAL 的事）、不直接读 `*http.Request`（那归 handler 管）、不处理鉴权日志这类横切。它只关心"这个业务要做什么"，其他一概外包。

在 Go 里，业务逻辑写在 service 包里，通过构造函数注入 Repository 接口（而不是具体实现），这样换数据库、做单测都只需换实现：

```go
package service

import (
    "context"
    "errors"
    "order-service/internal/domain"
    "order-service/internal/repository"
)

// ErrInvalidAmount 是业务层自定义的错误，handler 据此决定返回 400
var ErrInvalidAmount = errors.New("金额不合法")

type OrderService struct {
    repo repository.OrderRepository
}

// NewOrderService 通过接口注入，不依赖具体 MySQL 实现
func NewOrderService(repo repository.OrderRepository) *OrderService {
    return &OrderService{repo: repo}
}

func (s *OrderService) CreateOrder(ctx context.Context, userID int64, amount float64) (*domain.Order, error) {
    // ---- 业务校验：规则集中在这里 ----
    if amount <= 0 {
        return nil, ErrInvalidAmount
    }
    if amount > 100000 {
        return nil, errors.New("单笔订单上限 100000")
    }

    // ---- 编排用例：调用 DAL 取数据、写数据 ----
    user, err := s.repo.GetUser(ctx, userID)
    if err != nil {
        return nil, err
    }
    if user == nil {
        return nil, errors.New("用户不存在")
    }

    order := &domain.Order{UserID: userID, Amount: amount, Status: "CREATED"}
    saved, err := s.repo.Create(ctx, order)
    if err != nil {
        return nil, err
    }

    // ---- 落实领域规则：新用户首单打九折 ----
    if user.IsNew {
        saved.Amount = round(saved.Amount*0.9, 2)
        saved, err = s.repo.Update(ctx, saved)
        if err != nil {
            return nil, err
        }
    }
    return saved, nil
}

func round(v float64, places int) float64 {
    // 简单四舍五入，生产可用 math.Round
    shift := float64(1)
    for i := 0; i < places; i++ {
        shift *= 10
    }
    return float64(int(v*shift+0.5)) / shift
}
```

<strong>代码讲解：</strong>校验逻辑集中在 service（handler 不重复判断）；通过 `repository.OrderRepository` 接口访问数据（不知道底层是 MySQL 还是别的）；领域规则（新用户折扣）写在业务流程里。`NewOrderService` 用接口注入，单测传一个内存假实现即可，不用连真库。所有数据库调用都透传 `ctx`，方便超时和取消一路往下传。将来换数据库时只要 Repository 实现不变，这层一行不用改。

<strong>常见坑：</strong>

<strong>把校验和业务写在 handler 里。</strong>Go 里 handler（Gin 的 `func(c *gin.Context)`）直接写一堆 `if amount <= 0 { c.JSON(400, ...) }` 很常见。问题在于同一段下单逻辑可能在 HTTP 接口、RPC 接口、消息消费里各被调一次，校验也跟着复制了几份。某天规则改了，你改了 HTTP 接口忘了改 RPC 的，两边行为就不一致了。正确做法是把校验和编排收敛到 service，handler 只管"接参数、调 service、转响应"。

<strong>service 里直接拿 \*sql.DB 写 SQL。</strong>绕过 Repository，在 service 里直接 `db.Exec("INSERT ...")`。坏处一是 DAL 的收口被破坏，service 既管业务又管存取细节，换存储（比如从 MySQL 换 Postgres）时要改业务层；二是事务边界不清，多个写操作该不该绑在一起变得说不清。Repository 的意义就是把"怎么存"和"存什么"分开。

<strong>不用接口、直接 new 具体实现。</strong>在 service 里直接 `repo := &repository.orderMySQL{db: db}`，把具体类型写死。这样单测时必须连真库，且没法模拟"数据库报错"这种异常分支（你想测 service 在数据库失败时的行为，结果是连不上真库根本测不了）。构造函数注入 Repository 接口的成本极低，但让单测可以传一个内存假实现，既快又覆盖异常路径。

<strong>service 里直接写 http.ResponseWriter。</strong>图方便在 service 里 `w.Write([]byte(...))` 返回响应，把 HTTP 协议耦合进了业务层。将来这个下单逻辑要被消息队列消费者调用、或被 gRPC 复用，你会发现 service 根本没法用，因为它返回的是 HTTP 响应。service 应该永远返回领域对象或 error，"转成什么格式"交给调用方。

<strong>在 service 里无节制 go func() 起 goroutine。</strong>有时候为了"快"在 service 里 `go func(){ ... }()` 异步做点事（比如发通知），但既不传 ctx 也不控制生命周期。如果上游请求已经结束了，goroutine 还在跑、还在用已经关闭的连接，就会 goroutine 泄漏——内存和连接慢慢涨满，服务越来越慢直到 OOM。异步任务应走专门的消息队列或明确带取消信号的 goroutine 管理，而不是随手起。

## 数据访问层（DAL / Repository）

数据访问层的职责只有一个：隔离数据库的实现细节，向上提供按业务语义取数据的接口。Go 里通常用一个接口定义方法，再用 MySQL/Postgres 的具体结构体去实现它——这样业务层只依赖接口，不知道背后是哪种数据库。

这一层收口了所有数据库操作。业务层只调 `repo.GetUser(ctx, ...)`、`repo.Create(ctx, ...)`，完全不知道数据存在哪张表、用的什么数据库。它暴露的是"取用户""建订单"这种带业务语义的方法，而不是"执行这条 SQL"。连接池由这一层（在 main 注入时）统一配置——最大连接数、空闲连接、超时都在一个地方设好，不让连接泄漏。结果要做映射：把数据库行转成领域对象（`domain.Order`）返回，不让 `*sql.Rows` 这类底层类型泄漏到上层。

这一层不写业务规则、不碰 HTTP、不在每个方法里各开各的事务。事务边界由 service 圈定，DAL 提供原子操作即可。

先定义接口，再给 MySQL 实现。接口让业务层只依赖抽象：

```go
package repository

import (
    "context"
    "order-service/internal/domain"
)

// OrderRepository 接口：业务层只依赖它，不关心背后是 MySQL 还是别的
type OrderRepository interface {
    GetUser(ctx context.Context, userID int64) (*domain.User, error)
    Create(ctx context.Context, order *domain.Order) (*domain.Order, error)
    Update(ctx context.Context, order *domain.Order) (*domain.Order, error)
}
```

```go
package repository

import (
    "context"
    "database/sql"
    "order-service/internal/domain"
)

type orderMySQL struct {
    db *sql.DB // 由 main 注入，连接池在 main 里配好
}

func NewOrderMySQL(db *sql.DB) OrderRepository {
    return &orderMySQL{db: db}
}

func (r *orderMySQL) GetUser(ctx context.Context, userID int64) (*domain.User, error) {
    var u domain.User
    // 用 ctx 控制查询超时，避免慢查询拖死连接
    err := r.db.QueryRowContext(ctx,
        "SELECT id, is_new FROM users WHERE id = ?", userID,
    ).Scan(&u.ID, &u.IsNew)
    if err == sql.ErrNoRows {
        return nil, nil // 查不到返回 nil，不是错误
    }
    if err != nil {
        return nil, err
    }
    return &u, nil
}

func (r *orderMySQL) Create(ctx context.Context, o *domain.Order) (*domain.Order, error) {
    res, err := r.db.ExecContext(ctx,
        "INSERT INTO orders (user_id, amount, status) VALUES (?, ?, ?)",
        o.UserID, o.Amount, o.Status,
    )
    if err != nil {
        return nil, err
    }
    id, _ := res.LastInsertId()
    o.ID = id
    return o, nil
}

func (r *orderMySQL) Update(ctx context.Context, o *domain.Order) (*domain.Order, error) {
    _, err := r.db.ExecContext(ctx,
        "UPDATE orders SET amount = ? WHERE id = ?", o.Amount, o.ID,
    )
    return o, err
}
```

<strong>代码讲解：</strong>接口和实现分离，main 把 `*sql.DB` 注入进实现，业务层只认接口；所有方法透传 `ctx`，`QueryRowContext` / `ExecContext` 把超时一路往下传；`GetUser` 查不到时返回 `(nil, nil)` 而非错误，让 service 决定"用户不存在"该怎么处理（而不是把"没查到"当成系统错误）；连接池在 main 里用 `db.SetMaxOpenConns` 等统一配置，不在每个方法里开关。

<strong>常见坑：</strong>

<strong>在 DAL 写业务规则。</strong>比如把"满 100 减 10"的逻辑写进 `repo.Create`。DAL 本该是稳定的数据访问层，业务规则一混进来，改折扣要去改数据层，边界模糊、规则难追溯。折扣归 service 管，repo 只管原价存取，这是分层的底线。

<strong>返回 \*sql.Rows 给上层却不关。</strong>如果在 DAL 里 `rows, _ := db.Query(...)` 然后把 `rows` 直接返回给业务层，而忘了 `defer rows.Close()`，这个连接会一直被占着不归还连接池。高并发时连接池被占满，新请求拿不到连接就只能干等——表现就是服务突然卡死。正确做法是 DAL 内部把 rows 读完、映射成领域对象后立即关闭，只把纯对象返回出去。

<strong>没配连接池上限。</strong>`database/sql` 的连接池默认是"无限"（`SetMaxOpenConns(0)`），意味着并发多少就开多少连接，数据库分分钟被打挂；但如果设得过小（比如 5），高并发时又会让请求排队饿死。一般按数据库能承受的连接数设一个合理上限（比如 `SetMaxOpenConns(50)`），再把 `SetMaxIdleConns` 和 `SetConnMaxLifetime` 配好，让空闲连接能回收、长连接能定期重建。

<strong>N+1 查询。</strong>查 100 个订单，每个要显示用户名，如果先查订单列表（1 次 SQL）再在循环里对每个订单调一次用户查询（触发 100 次查询），总共 101 次。数据量小看不出，上了生产就是性能杀手。解法是用 JOIN 或批量 `WHERE id IN (...)` 一次把关联数据带出来。

<strong>在 DAL 每个方法里各开各的事务。</strong>如果 `Create` 内部 `tx, _ := db.Begin(); tx.Exec(...); tx.Commit()` 自己提交了，那 service 想做"写 A 再写 B 要么全成要么全败"就不可能了——A 已经提交，B 失败也回不去。正确做法是 Repository 的写方法只做 Exec 不提交，事务由 service 用 `db.BeginTx(ctx, ...)` 统一在用例结束时提交或回滚。

## 横切关注点：日志、recover、鉴权中间件

日志、鉴权、recover 这些横穿所有层。在 Go（尤其 Gin）里用中间件统一处理，而不是散落在每个 handler——业务 handler 应该是干净的，不该自己去做"记日志、解析 token、兜 panic"。

具体来说，请求级日志要在每个请求自动记录方法、路径、状态码、耗时，并带一个 trace id 把同一条链路上的日志串起来，否则一次请求散出几十条日志对不上号。统一 recover 负责兜住 handler 里的 panic——Go 不像 Python 有框架兜底，一个 goroutine panic 没被 recover 会直接带着整个进程退出，所以中间件必须 recover 之后返回 500 而不是让进程挂掉。JWT 鉴权负责解析 token、识别当前用户，业务 handler 不用自己查"谁登录了"。此外 CORS、限流这些跨层能力，全局一处配置、处处生效。

这一层不写具体业务逻辑，它是基础设施，像水管电线一样铺好业务代码直接用。

```go
package middleware

import (
    "time"
    "github.com/gin-gonic/gin"
)

// Logging 记录耗时和 trace id
func Logging() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        c.Next() // 执行后续 handler
        latency := time.Since(start)
        // 真实项目里写到日志组件，这里用 print 示意
        println(c.Request.Method, c.Request.URL.Path,
            c.Writer.Status(), latency.Milliseconds(), "ms")
    }
}

// Recover 兜住 panic，避免整个进程挂掉
func Recover() gin.HandlerFunc {
    return func(c *gin.Context) {
        defer func() {
            if err := recover(); err != nil {
                c.AbortWithStatusJSON(500, gin.H{"error": "internal error"})
            }
        }()
        c.Next()
    }
}
```

```go
func JWTAuth() gin.HandlerFunc {
    return func(c *gin.Context) {
        auth := c.GetHeader("Authorization")
        if len(auth) < 7 || auth[:7] != "Bearer " {
            c.AbortWithStatusJSON(401, gin.H{"error": "未提供认证信息"})
            return
        }
        token := auth[7:]
        claims, err := parseJWT(token) // 内部用 jwt 库解析并校验签名
        if err != nil {
            c.AbortWithStatusJSON(401, gin.H{"error": "token 无效或已过期"})
            return
        }
        c.Set("user_id", claims.Sub) // 把用户身份放进 context，handler 取用
        c.Next()
    }
}
```

<strong>常见坑：</strong>

<strong>忘了挂 Recover。</strong>这是 Go 特有的致命坑。Python 的 Web 框架一般有全局异常兜底，一个请求出错不会拖垮进程；但 Go 的 goroutine 一旦 panic 又没人 recover，整个进程直接退出。如果只挂了业务路由忘了挂 Recover 中间件，一个意料外的 nil 指针就能让线上服务全挂。Recover 必须放在中间件链最外层、最先执行。

<strong>trace id 没透传。</strong>日志中间件生成了 trace id 放进 `c.Set("trace_id", ...)`，但后续代码（service、DAL）记日志时没把这个 id 带进去，那这次请求的日志还是散的——几十条 log 里分不清哪些属于同一次请求。更要命的是调下游服务时没把 trace id 放进 HTTP header，你这边的日志和下游对不上。trace id 必须贯穿整条链路：入请求的 header、每条日志、调下游都带上。

<strong>鉴权散落每个 handler。</strong>有的接口记得在 handler 里查 token，有的忘了。漏掉的那个就成了越权入口——用户没登录也能调。正确做法是用全局鉴权中间件（白名单模式：默认全部要登录，个别公开接口单独放行），而不是靠每个 handler 自觉去校验。人总会忘事，别靠记忆去保证安全。

<strong>中间件顺序搞反了。</strong>Gin 中间件的执行顺序是"注册顺序的逆序"（后注册的先执行）。如果把鉴权中间件放在日志中间件之前注册，未授权请求在被鉴权拦截时，日志中间件还没执行过，这条请求就没有 trace id，对应日志断链。另外 Recover 必须排在最外层最先执行，否则它后面的中间件 panic 了它也兜不住。顺序错了，看似都挂了，实际的是"有的请求没被照顾到"。

<strong>在中间件里做重活。</strong>中间件是每个请求都走的，如果鉴权中间件里每次都去数据库查用户、而且没缓存，那它就成了性能瓶颈——每个请求都要多打一次库，QPS 上不去。鉴权应该只解析 JWT（本地验签名，不查库），需要用户信息时从 token 的 claim 里取，而不是每请求查库。

到这里，第三章把 Go 的四层各自负责什么、工程上怎么落地、常见坑都讲透了。第四章起我们看框架怎么选，第十三章起会把这个 order-service 完整落地成可运行的 Go 工程，每一层都能在目录里对上号。

## 四、Web 框架的架构哲学：net/http / Gin / Echo / Fiber

Go 的特别之处在于标准库 net/http 已经足够强，很多人直接用它起服务，不引入框架。框架的价值在于帮你少写样板代码：路由分组、中间件、参数绑定、序列化。

| 方案 | 核心定位 | 适合场景 |
|-|-|-|
| net/http | 标准库，零依赖 | 极简服务、要完全掌控 |
| Gin | 轻量、生态最大 | 大多数 API 服务 |
| Echo | 轻量、API 整洁 | 中间件友好的 API |
| Fiber | 受 Express 启发，基于 fasthttp | 习惯 Node 风格、要极致吞吐 |

```go
package main

import (
    "fmt"
    "net/http"
)

func hello(w http.ResponseWriter, r *http.Request) {
    // 直接操作 ResponseWriter 和 Request，没有框架包装
    fmt.Fprintf(w, `{"msg":"hello"}`)
}

func main() {
    http.HandleFunc("/hello", hello)
    http.ListenAndServe(":8080", nil)
}
```

```go
package main

import "github.com/gin-gonic/gin"

func main() {
    r := gin.Default()
    r.GET("/users/:id", func(c *gin.Context) {
        id := c.Param("id")
        // c.JSON 自动序列化并设 Content-Type
        c.JSON(200, gin.H{"id": id, "name": "duang"})
    })
    r.Run(":8080")
}
```

怎么选：想要零依赖、完全掌控就裸用 net/http；想省样板、生态成熟就 Gin；Fiber 底层是 fasthttp 而非标准库 net/http，性能极致但和周边库（很多基于 net/http 接口）兼容性要留意。没有最好，只有最贴合场景。

## 五、Go 的并发模型：goroutine 与 channel

Python 篇里我们花了两章讲 WSGI/ASGI 和 GIL，因为那正是 Python 并发的痛点。Go 在这里几乎不需要纠结：它从语言层面把"高并发"做成了一件普通的事。核心是两个东西：goroutine 和 channel。

goroutine 是 Go 运行时管理的轻量协程，你写 \`go func()\` 就起一个，初始栈只有几 KB，由 runtime 在多个操作系统线程上多路复用。一个进程轻松跑几十万个 goroutine，而 Python 一个线程就要占几 MB 且受 GIL 限制。channel 是 goroutine 之间传数据和同步的管道，用"不要通过共享内存来通信，而要通过通信来共享内存"的思想替代锁。

## 六、为什么 Go 没有 GIL 问题，以及怎么用

Python 的 GIL 让同一进程内的多线程无法真正并行执行字节码，所以 CPU 密集靠多进程、IO 密集靠协程。Go 没有 GIL，多个 goroutine 可以被调度到多个 CPU 核上真正并行。这意味着你不需要像 Python 那样为了并发去拼多进程（gunicorn 多 worker）加事件循环（asyncio），一个 Go 二进制进程本身就高并发。

但"容易并发"也意味着"容易写错并发"。下面这个例子并发处理一批任务，用 WaitGroup 等所有 goroutine 结束，用 channel 收集结果，避免直接共享变量：

```go
func processAll(ids []int64) []string {
    results := make(chan string, len(ids))
    var wg sync.WaitGroup
    for _, id := range ids {
        wg.Add(1)
        go func(id int64) {
            defer wg.Done()
            // 每个 id 并发处理，结果发到 channel
            results <- fmt.Sprintf("done-%d", id)
        }(id)
    }
    wg.Wait()
    close(results)

    out := make([]string, 0, len(ids))
    for r := range results {
        out = append(out, r)
    }
    return out
}
```

注意两个常见坑：一是循环变量在老版本 Go 里要在闭包里传参（上面用 \`go func(id int64)\` 显式传入，避免所有 goroutine 共享同一个循环变量）；二是 goroutine 里如果访问共享变量要用 channel 或 sync 原语保护，否则会有数据竞争，可以用 \`go test -race\` 跑竞态检测。

## 七、数据访问层：database/sql、sqlx 与 GORM

Go 访问数据库有两套思路。一套是标准库 database/sql 加 sqlx：你写 SQL，sqlx 帮你把行扫进 struct，控制力强、贴合 SQL；另一套是 GORM：全功能 ORM，用链式调用拼查询、自动建表迁移、关联预加载，开发快但抽象重、复杂查询时性能与可控性要留意。

连接池是必配项。database/sql 自带连接池，但要显式设置上限，否则默认无限制会拖垮数据库：

```go
db, err := sql.Open("mysql", dsn)
if err != nil {
    log.Fatal(err)
}
db.SetMaxOpenConns(50)        // 最大打开连接数
db.SetMaxIdleConns(10)        // 最大空闲连接数
db.SetConnMaxLifetime(time.Hour) // 连接最大存活时间，避免用到被服务端关掉的旧连接
```

用 sqlx 把行扫进 struct：

```go
type Order struct {
    ID     int64   `db:"id"`
    UserID int64   `db:"user_id"`
    Amount float64 `db:"amount"`
}

var orders []Order
// 结构体字段用 db tag 映射到列名
err := dbc.Select(&orders, "SELECT id, user_id, amount FROM orders WHERE user_id = ?", uid)
```

N+1 问题在 Go 里一样存在：循环查每个订单的关联项会触发 1 加 N 次 SQL。用 GORM 时靠 Preload 一次性把关联取回：

```go
var orders []Order
// Preload 先查订单、再按 id 批量查关联项，而不是循环里逐个查
db.Preload("Items").Find(&orders)
```

读写分离、主从延迟的处理思路和 Python 篇一致：主库写、从库读分摊压力，注意刚写的数据从库可能还没同步，强一致要求的读要走主库。

## 八、缓存架构：Redis 与三个经典坑

缓存把热点数据放内存（Redis），读起来比查库快几个数量级。最常用的是旁路缓存（Cache-Aside）：读的时候先查缓存，命中直接返回；没命中才查库，并把结果写回缓存再返回。写的时候先更新数据库，再删除缓存（注意顺序，先删缓存再更库会有并发不一致风险）。

```go
func getOrder(ctx context.Context, orderID int64) (*Order, error) {
    key := fmt.Sprintf("order:%d", orderID)
    val, err := rdb.Get(ctx, key).Result()
    if err == redis.Nil {
        // 缓存未命中，查库
        row, qerr := queryOrder(orderID)
        if qerr != nil {
            return nil, qerr
        }
        // 回填缓存，5 分钟过期
        rdb.Set(ctx, key, row, 5*time.Minute)
        return row, nil
    }
    if err != nil {
        return nil, err
    }
    return decode(val), nil
}
```

三个经典坑和 Python 篇一致：缓存穿透（查不存在的 key，每次打库，解决用空值或布隆过滤器）、缓存击穿（热点 key 过期瞬间大量请求击穿到库，解决用互斥锁或逻辑过期）、缓存雪崩（大量 key 同时过期或 Redis 挂，解决用过期时间加随机抖动、Redis 做高可用）。

## 九、异步任务与解耦：asynq + 消息队列

请求应该尽快返回，但发邮件、生成报表、调第三方这类重活不能塞进请求里让用户干等。做法是 Web 进程把任务投进消息队列就返回，后台 worker 慢慢消费。Python 里用 Celery，Go 里常用 asynq（基于 Redis 的延迟队列）或成熟的 NATS。

```go
// 1. 定义任务
type OrderPayload struct {
    OrderID int64 `json:"order_id"`
}
task := asynq.NewTask("send_email", mustJson(OrderPayload{OrderID: 123}))

// 2. 在 Web  handler 里只入队，不等执行
client := asynq.NewClient(asynq.RedisClientOpt{Addr: "localhost:6379"})
client.Enqueue(task)

// 3. worker 进程消费执行
srv := asynq.NewServer(asynq.RedisClientOpt{Addr: "localhost:6379"}, asynq.Config{Concurrency: 10})
srv.Run(asynq.HandlerFunc(func(ctx context.Context, t *asynq.Task) error {
    // 这里执行真正的重活，失败可重试
    return sendEmail(t)
}))
```

和 Celery 一样注意：任务里不能依赖请求上下文，需要的数据作为任务参数传进去；任务要尽量幂等，因为网络抖动它可能重试。

## 十、从单体到服务化：什么时候该拆

单体不是原罪。早期一个二进制包所有功能，开发部署最简单。很多人一上来就微服务，结果大部分时间花在治分布式问题上。拆的触发信号：团队变大、多人改同一份代码冲突多；模块间耦合重，改一处牵一片；某部分负载特性差异大，需要分别扩缩容；技术栈要分叉。

Go 在这件事上有天然优势：编译出一个静态二进制，容器化极轻（镜像可以小到几 MB），启动快，水平扩容就是多跑几个容器前面加负载均衡。代价也要算清：服务间要通信、分布式一致性难、链路变长难排查、运维复杂度陡增。先单体、后按需拆更稳。

## 十一、可观测性：日志、指标、链路追踪

线上出问题不能靠猜，三件套和 Python 篇一致。日志要结构化（JSON），每条带 trace_id 串起一次请求；指标（Metrics）看 QPS、P99、错误率、连接池占用，用 Prometheus 采集、Grafana 看板；链路追踪（Tracing）用 trace_id 把一次请求跨服务各段耗时串成调用链（OpenTelemetry 加 Jaeger）。Go 生态里 zap 是高性能结构化日志库、prometheus/client_golang 是官方指标客户端，都是事实标准。

## 十二、面试高频考点清单

- goroutine 与线程区别：goroutine 是用户态轻量协程，初始栈几 KB、由 runtime 多路复用，单进程可跑数十万；线程由 OS 调度、占 MB 级。
- Go 没有 GIL：多 goroutine 可真正并行到多核，不同于 Python 受 GIL 限制。
- channel 的作用与方向：goroutine 间通信与同步，遵循"通过通信共享内存"；带缓冲与不带缓冲语义不同。
- net/http 与 Gin/Echo 选型：标准库零依赖、完全掌控；框架省样板、生态成熟。
- database/sql 连接池参数：SetMaxOpenConns、SetMaxIdleConns、SetConnMaxLifetime；不设置会拖垮数据库。
- N+1 问题与 Preload：循环查关联触发 1 加 N 次 SQL，GORM 用 Preload 批量取回。
- 缓存穿透、击穿、雪崩：与 Python 篇同解法（空值/布隆过滤器、互斥锁、随机过期加高可用）。
- asynq 架构：任务加 Redis 队列加 worker，把重活和请求解耦，类似 Celery。
- 单体与微服务：Go 二进制容器化极轻，扩容容易，但拆了要解决分布式复杂度。
- 并发与并行区别：并发是交替推进，并行是同时执行；goroutine 既能并发也能并行。
- 数据竞争与 -race：多 goroutine 共享变量要用 channel 或 sync 保护，go test -race 检测。

## 十三、为什么 Go 项目更需要明确的工程结构

Python 篇我们已经把"为什么要工程化"讲清楚了：避免循环依赖、让分层可测试。Go 在这件事上更尖锐，因为它在语言层面几乎不强制任何目录约定——你可以把所有代码塞进一个 package main，编译器照样过。这种自由是小项目蜜糖、大项目毒药：一旦多人协作、业务变多，没有约定的 Go 代码会迅速长成一团互相 import 的乱麻。

Go 社区后来收敛出一套事实标准，叫 Standard Project Layout。它的核心思想是用目录表达依赖方向，而不是靠文件摆放的随意约定。和 Python 一样，关键规则只有一条：依赖只能向内指，不能回头。具体来说，main 包负责把一切拼起来（装配），internal 里的代码按"领域模型 ← 数据访问 ← 业务逻辑 ← 接入层"的顺序依赖，谁都不能反向 import，pkg 放可以被外部复用的公共代码。这样每一层都能用接口替换掉下层，单测时塞个假的 Repository 进去就行。

> Go 没有 Python 那样的 import 循环报错宽容度——Go 编译器直接禁止循环导入（import cycle not allowed）。这其实是好事：它逼你在设计阶段就把依赖方向理清，而不是等运行时才爆。internal 目录还有一个额外好处：Go 规定 internal 下的包只能被它父目录之内的代码引用，天然防止了"内部实现被外部误用"。

## 十四、可落地的 Go 项目目录结构

下面这个 order-service 的目录，是 Go 后端服务最常见的落地形态。它把"能跑的入口"和"业务逻辑"分开，把"对外暴露的"和"内部实现的"分开：

```
order-service/
├── cmd/
│   └── order-service/
│       └── main.go            # 程序唯一入口：装配依赖、启动 HTTP 服务
├── internal/                  # 仅本服务可用，外部无法 import
│   ├── config/
│   │   └── config.go          # 配置加载
│   ├── domain/
│   │   └── order.go           # 领域模型（纯业务结构，不含框架）
│   ├── repository/
│   │   ├── order.go           # OrderRepository 接口
│   │   └── order_mysql.go     # 基于 MySQL 的实现
│   ├── service/
│   │   └── order.go           # 业务逻辑层
│   ├── handler/
│   │   └── order.go           # HTTP 接入层（薄）
│   └── middleware/
│       ├── recover.go         # panic 恢复
│       ├── logging.go         # 请求日志 + trace id
│       └── auth.go            # JWT 鉴权
├── pkg/                       # 可被其他服务复用的公共代码（可选）
│   └── response/
│       └── response.go        # 统一返回结构
├── go.mod
├── go.sum
├── Dockerfile
└── .env.example
```

注意依赖方向：main.go 认识所有人（它 new 出 repository、service、handler 并串起来）；handler 依赖 service；service 依赖 repository 接口；repository 依赖 domain。domain 是最底层，不依赖任何上层。任何一层都看不到 HTTP 框架细节之外的东西，service 里不出现 gin.Context，repository 接口也不绑定具体数据库——这就给单测留好了口子。

## 十五、配置层：集中、带类型、可覆盖

配置不要散落在代码里写死。Go 里最省事的惯用法是用一个 Config 结构体把所有配置项收口，启动时一次性加载，然后以值或指针的形式传给需要的层。下面用 viper 从环境变量读取，给默认值，既支持 12-factor 的"配置来自环境"，也方便本地用 .env 调试。

```go
package config

import "github.com/spf13/viper"

type Config struct {
    HTTPPort  string
    DSN       string // MySQL 连接串
    RedisAddr string
    JWTSecret string
}

func Load() *Config {
    viper.SetDefault("HTTP_PORT", "8080")
    viper.AutomaticEnv() // 自动读取环境变量
    return &Config{
        HTTPPort:  viper.GetString("HTTP_PORT"),
        DSN:       viper.GetString("DB_DSN"),
        RedisAddr: viper.GetString("REDIS_ADDR"),
        JWTSecret: viper.GetString("JWT_SECRET"),
    }
}
```

这样所有层都从同一个 Config 取值，改端口、换数据库不用翻代码。生产环境用环境变量注入，本地用 .env.example 写上样例，配合 godotenv 读 .env 文件即可。

## 十六、领域模型与传输层分离

Python 篇强调过 models 和 schemas 要分两层，Go 里同理，而且更强调"领域层不依赖任何 Web 框架"。领域模型是纯业务对象，可以带自己的业务方法；对外传输的 DTO 只负责 JSON 编解码。两者分开，改接口不影响业务，业务加了规则也不污染协议。

```go
package domain

import "time"

type Order struct {
    ID     int64
    UserID int64
    Amount float64
    Status string
    CreatedAt time.Time
}

// 状态流转的规则留在领域里，而不是散在 service 各处
func (o *Order) CanCancel() bool {
    return o.Status == "created" || o.Status == "paid"
}
```

```go
package handler

// 入参：只描述"客户端要传什么"
type OrderCreateRequest struct {
    UserID int64   `json:"user_id"`
    Amount float64 `json:"amount"`
}

// 出参：只描述"返回给客户端什么"，字段可以比领域模型少
type OrderResponse struct {
    ID     int64   `json:"id"`
    UserID int64   `json:"user_id"`
    Amount float64 `json:"amount"`
    Status string  `json:"status"`
}
```

为什么不直接把 domain.Order 返回给前端？因为领域模型里可能有内部字段、敏感字段，而且不同接口要的字段集合不同。DTO 就是"对外视图"，由 handler 在 domain 和 JSON 之间做转换，service 永远只认 domain。

## 十七、数据访问层 Repository：用接口收口数据库操作

和 Python 篇一样，数据访问层要把"怎么存"和"业务怎么用"切开。Go 里最地道的方式是定义一个 Repository 接口，业务层只依赖接口，不依赖具体数据库；MySQL 实现另外写。这样单测时换一个内存假实现就能跑，不用连真库。Part A 已经讲过连接池配置，这里直接给出带池的 DB 和 Repository。

```go
package repository

import (
    "context"
    "yourmodule/internal/domain"
)

// 业务层只依赖这个接口，不关心背后是 MySQL 还是别的
type OrderRepository interface {
    Create(ctx context.Context, o *domain.Order) error
    GetByID(ctx context.Context, id int64) (*domain.Order, error)
    ListByUser(ctx context.Context, userID int64) ([]domain.Order, error)
}
```

```go
package repository

import (
    "context"
    "database/sql"
    "yourmodule/internal/domain"
)

type orderMySQL struct {
    db *sql.DB
}

func NewOrderMySQL(db *sql.DB) OrderRepository {
    return &orderMySQL{db: db}
}

func (r *orderMySQL) Create(ctx context.Context, o *domain.Order) error {
    _, err := r.db.ExecContext(ctx,
        "INSERT INTO orders (user_id, amount, status) VALUES (?, ?, ?)",
        o.UserID, o.Amount, o.Status)
    return err
}

func (r *orderMySQL) GetByID(ctx context.Context, id int64) (*domain.Order, error) {
    var o domain.Order
    err := r.db.QueryRowContext(ctx,
        "SELECT id, user_id, amount, status FROM orders WHERE id = ?", id).
        Scan(&o.ID, &o.UserID, &o.Amount, &o.Status)
    if err != nil {
        return nil, err
    }
    return &o, nil
}
```

注意方法签名里都带了 context.Context：这让调用方（HTTP handler）能传递超时和取消信号，请求被客户端断开时，底层的数据库查询也能跟着停，不会白白占连接。这是 Go 后端非常关键的一个习惯，比 Python 的显式超时更内建。

## 十八、业务逻辑层 Service：规则都在这，框架碰不到

Service 层只关心业务，不碰 HTTP、不碰 SQL 细节。它依赖 Repository 接口，通过构造函数把实现注入进来。下单的金额校验、状态初始化都写在这里，handler 调用时不必再重复判断。

```go
package service

import (
    "context"
    "errors"
    "yourmodule/internal/domain"
    "yourmodule/internal/repository"
)

var ErrInvalidAmount = errors.New("amount must be positive")

type OrderService struct {
    repo repository.OrderRepository
}

func NewOrderService(repo repository.OrderRepository) *OrderService {
    return &OrderService{repo: repo}
}

func (s *OrderService) CreateOrder(ctx context.Context, userID int64, amount float64) (*domain.Order, error) {
    // 业务校验：金额必须为正
    if amount <= 0 {
        return nil, ErrInvalidAmount
    }
    o := &domain.Order{
        UserID: userID,
        Amount: amount,
        Status: "created",
    }
    if err := s.repo.Create(ctx, o); err != nil {
        return nil, err
    }
    return o, nil
}
```

把校验放在 service 而不是 handler，好处是无论请求从 HTTP、RPC 还是定时任务进来，下单规则都只有这一份。handler 只负责把协议数据喂进来、把结果转出去。

## 十九、接入层 API 路由：越薄越好

Go 主流路由框架有 Gin、Echo、Fiber。无论用哪个，接入层的职责只有三件：解析请求、调用 service、组装返回。下面用 Gin 演示一个薄 handler：

```go
package handler

import (
    "net/http"
    "github.com/gin-gonic/gin"
    "yourmodule/internal/service"
)

type OrderHandler struct {
    svc *service.OrderService
}

func NewOrderHandler(svc *service.OrderService) *OrderHandler {
    return &OrderHandler{svc: svc}
}

func (h *OrderHandler) Create(c *gin.Context) {
    var req OrderCreateRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    o, err := h.svc.CreateOrder(c.Request.Context(), req.UserID, req.Amount)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, OrderResponse{
        ID: o.ID, UserID: o.UserID, Amount: o.Amount, Status: o.Status,
    })
}
```

这里每个方法都很短：绑定 → 调 service → 返回。没有业务判断、没有 SQL。协议细节（JSON 字段名、状态码）留在 handler，领域对象不泄露到响应里，由 handler 做 DTO 转换。

## 二十、入口装配 main.go：所有依赖在这里拼起来

Go 没有 Spring 那种自动装配容器，也不强依赖 Wire 之类的代码生成工具（小项目手写也完全 OK）。main 包的职责就是"按依赖顺序 new 出来，再串成 HTTP 服务"。这正好体现了依赖方向：底层先建，上层后建，最后由路由把 handler 挂上。

```go
package main

import (
    "database/sql"
    "log"
    "yourmodule/internal/config"
    "yourmodule/internal/handler"
    "yourmodule/internal/middleware"
    "yourmodule/internal/repository"
    "yourmodule/internal/service"
    "github.com/gin-gonic/gin"
    _ "github.com/go-sql-driver/mysql"
)

func main() {
    cfg := config.Load()

    db, err := sql.Open("mysql", cfg.DSN)
    if err != nil { log.Fatal(err) }
    db.SetMaxOpenConns(50)
    db.SetMaxIdleConns(10)

    repo := repository.NewOrderMySQL(db)
    svc := service.NewOrderService(repo)
    h := handler.NewOrderHandler(svc)

    r := gin.New()
    r.Use(middleware.Recover(), middleware.Logging(), middleware.JWTAuth(cfg.JWTSecret))
    r.POST("/orders", h.Create)

    log.Printf("listening on :%s", cfg.HTTPPort)
    if err := r.Run(":" + cfg.HTTPPort); err != nil {
        log.Fatal(err)
    }
}
```

把装配集中在 main，有一个直接好处：依赖关系一眼可见，谁先谁后、谁依赖谁全都写在函数调用顺序里。测试时你完全可以绕过 main，自己 new 一个假的 repo 注入 service 直接测。

## 二十一、横切关注点代码化：recover、日志、鉴权

错误恢复、请求日志、鉴权这三件事和具体业务无关，但每个请求都要过，最适合做成中间件（middleware），在路由层统一挂上。下面三个是常见的 Go 实现。

```go
package middleware

import (
    "log"
    "net/http"
    "github.com/gin-gonic/gin"
)

func Recover() gin.HandlerFunc {
    return func(c *gin.Context) {
        defer func() {
            if err := recover(); err != nil {
                log.Printf("panic recovered: %v", err)
                c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
            }
        }()
        c.Next()
    }
}
```

```go
package middleware

import (
    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
)

func Logging() gin.HandlerFunc {
    return func(c *gin.Context) {
        traceID := uuid.NewString()
        c.Set("trace_id", traceID) // 后续日志带上它就能串起一次请求
        c.Next()
    }
}
```

```go
package middleware

import (
    "net/http"
    "strings"
    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

func JWTAuth(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        hdr := c.GetHeader("Authorization")
        tokenStr := strings.TrimPrefix(hdr, "Bearer ")
        _, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
            return []byte(secret), nil
        })
        if err != nil {
            c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
            return
        }
        c.Next()
    }
}
```

## 二十二、依赖注入与可测试性：接口让单测不连真库

前面让 service 依赖 Repository 接口，回报就在这里。单测时不需要起 MySQL，写一个假实现塞进去即可，只验证业务逻辑对不对。Go 的标准测试库加一个轻量断言就够用，不需要重框架。

```go
package service_test

import (
    "context"
    "errors"
    "testing"
    "yourmodule/internal/domain"
    "yourmodule/internal/service"
)

// 假实现：只记录被调用时收到的订单，不碰数据库
type fakeRepo struct {
    saved *domain.Order
}

func (f *fakeRepo) Create(ctx context.Context, o *domain.Order) error {
    f.saved = o
    return nil
}
func (f *fakeRepo) GetByID(ctx context.Context, id int64) (*domain.Order, error) {
    return nil, nil
}
func (f *fakeRepo) ListByUser(ctx context.Context, userID int64) ([]domain.Order, error) {
    return nil, nil
}

func TestCreateOrder_OK(t *testing.T) {
    repo := &fakeRepo{}
    svc := service.NewOrderService(repo)
    o, err := svc.CreateOrder(context.Background(), 1, 9.9)
    if err != nil {
        t.Fatal(err)
    }
    if o.Status != "created" {
        t.Fatalf("want created, got %s", o.Status)
    }
    if repo.saved == nil {
        t.Fatal("repo.Create not called")
    }
}

func TestCreateOrder_InvalidAmount(t *testing.T) {
    repo := &fakeRepo{}
    svc := service.NewOrderService(repo)
    _, err := svc.CreateOrder(context.Background(), 1, -1)
    if !errors.Is(err, service.ErrInvalidAmount) {
        t.Fatalf("want ErrInvalidAmount, got %v", err)
    }
}
```

这就是依赖注入的威力：Repository 接口像插座，假实现和真 MySQL 实现都是插头，测试时换插头，业务代码一行不用改。复杂项目可以用 google/wire 做编译期依赖图生成，等价于手写 new 但更不容易漏。

## 二十三、打包、容器化与 12-factor

Go 编译出来是单一静态二进制，部署极其简单，这是它比 Python 部署舒服最多的地方——不需要在目标机器装解释器和一堆依赖。配合多阶段 Dockerfile，最终镜像可以小到只有几 MB。

```dockerfile
# 构建阶段
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/order-service ./cmd/order-service

# 运行阶段：用最简基础镜像，没有 shell 也行
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/order-service /order-service
EXPOSE 8080
ENTRYPOINT ["/order-service"]
```

12-factor 在这套结构里自然满足：配置来自环境变量（第十五章的 viper）、进程无状态（订单存在数据库）、日志打到标准输出（第十五章用 log 默认就是 stdout）、依赖显式声明在 go.mod。容器里只跑一个进程，挂了由编排平台重启，不需要 supervisord 那套。

## 二十四、工程架构篇面试高频考点

这一章把 Go 工程化里最容易在面试被追问的点列出来，建议对照 Python 篇的面试清单一起看，很多是"同样的问题、不同的语言答案"。

- <strong>为什么 Go 禁止循环导入，怎么避免？</strong> 编译器直接报错 import cycle not allowed。靠"依赖向内、main 装配"的目录分层解决：底层 domain 不依赖上层，所有 new 和串联放在 main，从根上杜绝环。
- <strong>为什么业务层要依赖接口而不是直接用 \*sql.DB？</strong> 为了让单测能注入假实现、不连真库；也让换数据库实现（MySQL 换 Postgres）时业务代码零改动。接口由使用方定义，这是 Go 的一个反直觉但好用的习惯。
- <strong>context.Context 在分层里怎么传？</strong> 从 handler 的 gin.Context 取出 request context，一路透传给 service、repository、数据库调用。作用是传递取消信号和超时：客户端断开时底层查询跟着停，避免空耗连接。
- <strong>Go 的 error 和异常有什么区别，中间件怎么统一处理 panic？</strong> Go 没有 try/except，错误是返回值，业务错误正常返回 error；真正的崩溃（数组越界、nil 解引用）才会 panic。用 recover 中间件把 panic 拦成 500，避免单个请求拖垮整个进程。
- <strong>goroutine 泄漏和 data race 怎么防？</strong> 起 goroutine 一定要想清楚它怎么结束（用 context 取消或 channel 关闭）；共享变量用 channel 或 sync 保护，CI 里加 go test -race 跑竞态检测。
- <strong>为什么说 Go 部署比 Python 简单？</strong> 编译成单一静态二进制，无解释器、无依赖环境；多阶段 Dockerfile 出极小镜像，12-factor 的"配置在环境、进程无状态、日志到 stdout"天然好落。
- <strong>和 Python 篇对照，最大的架构差异在哪？</strong> 并发模型（goroutine 原生高并发 vs GIL + 多进程/asyncio）、依赖注入（构造函数手写 vs FastAPI Depends）、目录约定（Standard Layout vs 相对自由）、部署形态（二进制 vs 解释器 + 依赖）。架构要解决的问题两者完全一致，只是 Go 把"并发"和"部署"从痛点变成了优势。

> 到这篇，后端架构深度解析系列的 Python 篇和 Go 篇都写完了，都是"概念决策 + 工程代码落地"双 Part 的完整形态。如果你还想继续，可以挑 Java（Spring 那套强 IoC 容器、注解驱动，和 Go 手写注入、Python 装饰器注入是三种不同哲学）或 Node（单线程事件循环 + TypeScript 工程化）往下写，对照着看差异最直观。


<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    这是「后端架构深度解析」系列的第二篇（Go 篇）。Python 篇已发，TS 篇待写。三篇共用标签 <code>后端架构深度解析</code>，对照着看差异最直观：并发模型（goroutine vs GIL + asyncio）、依赖注入（构造函数手写 vs FastAPI Depends）、部署形态（二进制 vs 解释器 + 依赖）。
  </div>
</details>

