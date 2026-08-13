---
author: Duang
pubDatetime: 2026-08-12T08:30:00+08:00
title: 后端架构深度解析（Python 篇）：顺着一次请求看懂系统的每一层
featured: false
draft: false
tags:
  - 后端专栏
  - 后端架构深度解析
  - Python
description: 顺着一次 HTTP 请求从进门到出门的链路，把 Python 后端的分层、同步异步、并发、数据访问、缓存、异步任务逐个拆开。第三部分会落成真实目录和能跑的代码。
---

> 这篇是后端架构深度解析系列的 Python 篇。我会顺着一次 HTTP 请求从进门到出门的链路，把 Python 后端常见的架构分层、框架选择、同步与异步、并发模型、数据访问、缓存、异步任务这些决策逐个拆开。重点不是记结论，而是理解每个决策在解决什么真实问题、容易踩什么坑。第三章会把每一层"负责什么、不负责什么、工程上怎么落地、常见坑在哪"讲透，和后续 Part B 的工程代码一一对应。

## 一、先建立全局视角：后端架构到底在管什么

一个后端服务，本质上就是一个收请求、干点活、返回结果的程序。代码量小的时候，全写在一个函数里也能跑。但系统一长大会出问题：改一处容易带崩别处、某个模块要扩容却得整体跟着扩、数据库挂了整个应用一起躺。架构要解决的，就是把这些活拆成职责清晰、能各自替换和扩展的部分。

顺着一次请求，常见的链路长这样：

客户端 → 接入层（Nginx 等反向代理） → 应用服务（WSGI/ASGI Server） → 框架路由 → 业务逻辑层 → 数据访问层（ORM / 连接池） → 数据库 / 缓存 / 消息队列，此外还有横穿所有层的日志、鉴权、配置、可观测性。

```mermaid
flowchart LR
  Client["客户端<br/>Browser / App"]
  Nginx["接入层<br/>Nginx · TLS · 限流"]
  App["应用服务<br/>gunicorn / uvicorn"]
  Router["框架路由<br/>FastAPI · Flask"]
  Service["业务逻辑层<br/>Service · 事务边界"]
  DAL["数据访问层<br/>Repository · ORM"]
  DB[("数据库 / 缓存<br/>Postgres · Redis")]
  MQ["消息队列<br/>Celery · RabbitMQ"]

  Client --> Nginx --> App --> Router --> Service --> DAL --> DB
  Service -. 异步任务 .-> MQ

  classDef cross stroke-dasharray: 4 3
```


分层带来的好处很实在：一是解耦，改接入层不影响业务逻辑；二是各自演进，框架升级不用动数据层；三是故障隔离，数据库抖动不至于让整个进程崩溃；四是好测试，业务逻辑能脱离 HTTP 层单独跑单测。架构不是炫技，是为了让系统在大了之后还改得动、撑得住。

## 二、Python 在后端的定位与生态

Python 适合的是 IO 密集、业务逻辑复杂、需要快速迭代的后端：Web API、内部平台、数据/AI 服务。它的生态成熟，Web 有 Django/Flask/FastAPI，数据有 SQLAlchemy/Pandas，AI 有 PyTorch 等，招人和找轮子都容易。

但它的短板也明确：极致低延迟、重 CPU 计算的服务不是它的强项。这类活儿可以交给 Go/Rust/C++ 写的独立服务，或者用 C 扩展（比如 NumPy 底层）下沉计算。所以真实架构里 Python 常常负责编排和逻辑，把重计算甩给别的服务或扩展，而不是一个人扛全部。

## 三、分层架构：每一层到底干什么，代码长什么样

分层不是画在 PPT 上的框框，而是代码目录和 import 关系的真实约束。在逐层展开之前，先用一张表把"四层各自负责什么、不负责什么"钉死，这是后面所有代码的纪律：

| 分层 | 这一层负责什么 | 这一层不负责什么 |
|-|-|-|
| 接入层 | TLS 终止、负载均衡、静态资源、限流防刷、压缩、超时保护、把 HTTP 转成应用能处理的格式 | 不写业务逻辑、不碰数据库、不做领域规则 |
| 业务逻辑层 | 参数业务校验、用例编排、事务边界、落实领域规则、调用 DAL | 不拼 SQL、不碰 HTTP 请求/响应对象、不处理鉴权日志这类横切 |
| 数据访问层 | 收口所有 DB 操作、提供按业务语义取数的接口、管理 session 边界、结果映射 | 不写业务规则、不碰 HTTP、不在每个方法里各开各的事务 |
| 横切关注点 | 日志（带 trace id）、统一异常、鉴权、跨层通用能力 | 不写具体业务逻辑 |

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    分层的纪律全在依赖方向上：外层可以 import 内层，内层绝不能 import 外层。Repository 一旦 import 了 FastAPI 的 Request，分层就塌了。
  </div>
</details>


下面先把整个 order-service 项目的目录结构亮出来，让你一眼看清每层代码具体落在哪个目录；之后按"从外到内"的顺序逐层展开，每一块代码的落点你都对得上。这个结构在 Part B（第十三章起）会完整落地成真实文件，这里先把骨架和每层位置认准。

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
    <span class="duang-whisper-jar-note">分层瓶 · 四层各装各的</span>
  </div>
  <p class="duang-whisper-body">四层不是 PPT 上的框，是 import 关系的栅栏。哪层漏了，瓶子就漏了。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>


## 先看整体：order-service 项目结构总览

这是后面所有代码片段的实际载体。它不大，但每一层都待在独立目录里，目录名基本就等于分层名：

```text
order-service/
├── pyproject.toml          # 依赖与打包声明
├── .env                    # 环境配置，不进版本库
├── app/
│   ├── main.py             # 入口：把零件装配成 FastAPI 应用（接入层的装配端）
│   ├── api/                # 接入层：只做 HTTP 协议转换（路由函数）
│   │   └── orders.py       #   订单相关路由
│   ├── services/           # 业务逻辑层：规则、事务、编排（核心）
│   │   └── order_service.py
│   ├── repositories/       # 数据访问层：收口所有 DB 操作
│   │   └── order_repo.py
│   ├── models/             # 数据库表映射（SQLAlchemy ORM 模型）
│   │   └── order.py
│   ├── schemas/            # 出入参模型（Pydantic，API 契约）
│   │   └── order.py
│   └── core/              # 横切与基础设施
│       ├── config.py       #   配置
│       ├── db.py           #   数据库引擎与 session
│       ├── deps.py         #   依赖注入
│       └── security.py     #   鉴权
└── tests/                  # 单测，单独放最外层不混进 app
```

记住一条主线：请求从 api/ 进来，调用 services/ 里的业务，services/ 再调用 repositories/ 取数，repositories/ 操作 models/ 对应的表；core/ 里的配置、数据库、鉴权被各层共享，但 core 自己不依赖任何业务代码。依赖方向永远是 api → services → repositories → models，反向不通。下面逐层展开时，每段代码都会标明它属于上面这个树的哪个位置。

## 接入层（反向代理 + WSGI/ASGI 服务）

接入层的任务就一件事：让请求安全、高效地到达应用代码，同时把所有不该进 Python 进程的活挡在外面。它分两段——最外面是 Nginx/Caddy 这类反向代理，里面是 Python 的 WSGI 或 ASGI 应用服务器。

反向代理干的事不少。TLS 终止是最基本的：HTTPS 的加解密吃 CPU，放在 Nginx 上做一次解密，后面 Python 进程之间全走明文，省掉每个 worker 各做一遍的开销。静态资源（图片、JS、CSS）也直接由 Nginx 返回，不进 Python 进程，省掉一轮进程切换和 GIL 争用。负载均衡把流量分到多台机器或多个实例，单机挂了不影响整体。限流和防刷在代理层就能做——同一 IP 请求太频繁直接拦住，恶意流量到不了业务代码。压缩（gzip）省带宽，超时保护防止慢连接一直占着 worker 不放。最后，协议转换由 gunicorn/uvicorn 完成：它们把 HTTP 请求转成 Python 能处理的格式，并管理 worker 进程或协程的生命周期。

这一层不写业务逻辑、不碰数据库、不做领域规则。它的边界很清晰：只管"请求怎么进门"，不管"进门之后干什么"。

下面是一个典型的 Nginx 反代配置，把上面说的 TLS、静态资源、超时、限流全挡在外面：

```
# /etc/nginx/conf.d/order-service.conf
upstream backend {
    server 127.0.0.1:8000;  # gunicorn/uvicorn 监听地址，可列多台做负载均衡
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # 静态资源直接由 Nginx 返回，不进 Python 进程
    location /static/ {
        alias /var/www/order-service/static/;
        expires 30d;
    }

    # API 请求转发给 Python 应用
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 超时保护：客户端卡死时连接不会永久占用
        proxy_read_timeout 30s;
    }

    # 限流：同一 IP 每秒最多 10 个请求
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

<strong>代码讲解：</strong> TLS 在 Nginx 层就解密了，Python 进程只看到明文 HTTP；`location /static/` 把静态文件挡在 Python 外面；`proxy_read_timeout 30s` 防止慢连接占着 worker 不放；`limit_req` 做基础防刷。这些事如果放 Python 里自己做，要么多依赖中间件增加复杂度，要么自己写容易出错。

里面那层是应用服务器。gunicorn 是同步 WSGI 服务器，每个 worker 一个进程，靠多进程抗并发；uvicorn 是异步 ASGI 服务器，单进程内靠事件循环处理大量 IO 并发请求。启动方式：

```
# 4 个同步 worker，每个进程一把 GIL，靠多进程吃满多核
gunicorn app.main:app -w 4 -k gthread -b 127.0.0.1:8000 --timeout 30

# 异步场景用 uvicorn worker，单进程内并发处理 IO
gunicorn app.main:app -w 2 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000
```

<strong>常见坑：</strong>

<strong> 限流放错了位置。</strong> 如果把限流逻辑写在 Python 应用层而不是 Nginx 上，多实例部署时每个实例各自计数，根本拦不住——用户一秒打 100 个请求，分到 4 台机器上每台才 25 个，全漏过去了。Nginx 是全局唯一入口，在这里限流才能看到完整流量。简单说就是：能在外层解决的事别往里传。

<strong> 漏写了 proxy_set_header。</strong> 最常漏的是 `Host` 头。漏了之后应用拿到的 host 是 `127.0.0.1:8000`（upstream 内部地址），一旦代码里要生成绝对 URL、做 OAuth 回调、或者 302 重定向，地址就全错了。另外 `X-Real-IP` 和 `X-Forwarded-For` 也别忘了，否则日志里全是 Nginx 的地址，看不出真实用户是谁。

<strong> proxy_read_timeout 设得不合理。</strong> 设太长（比如 5 分钟），慢连接或恶意连接会把 worker 长期占着不放，正常请求排队等不到处理；设太短（比如 3 秒），大文件上传、复杂报表导出这类正常慢请求会被中途掐断，前端收到一个没头没尾的响应。一般 API 服务 30 秒是个比较安全的起点，再根据实际接口的 P99 耗时微调。

<strong> 静态资源没配缓存。</strong> Nginx 的 `location /static/` 如果不加 `expires` 指令，浏览器每次刷新页面都会回源问 Nginx "这个文件改了吗"，高并发时 Nginx 和后端一起被这些重复请求拖垮。加上 `expires 30d` 之后浏览器 30 天内不会再问，压力直接归零。

<strong> 并发模型选错。</strong> 用同步 gunicorn worker（gthread）却跑 async 代码，async 的优势完全发挥不出来，跟普通同步没区别；反过来用 uvicorn 跑同步重计算代码，一个计算密集的请求会卡住整个事件循环，所有 IO 并发全部阻塞。选模型之前先想清楚你的服务到底是 IO 密集还是 CPU 密集，前者用 async，后者用多进程。

## 应用层 / 业务逻辑层

这一层是整个系统的核心。它接收已经过接入层处理的请求、校验参数合法性、编排业务用例、管理事务边界、落实领域规则。说得更直白一点：如果一个功能算"业务"，那代码就该写在这。

具体来说，参数的业务校验归这里管——不是"字段是不是数字"这种格式检查（那是框架干的），而是"金额是不是合法"、"用户是否存在"、"库存够不够"这种带业务语义的判断。用例编排也归这里：一个下单动作可能涉及查用户、锁库存、写订单、记日志，这些步骤谁先谁后、哪几步必须原子地完成，由这层决定。事务边界也是这里圈的："扣款和出票必须同时成功或同时失败"这种约束，只有业务层知道哪些操作该绑在一起。领域规则同样集中在这里——"新用户首单打九折"这种策略，写在这一处而不是散落在下单、改单、退款各处。最后，数据访问通过 Repository 接口完成，不直接拼 SQL。

这一层不该做的事也很明确：不自己拼 SQL（那是 DAL 的事），不直接碰 Request/Response 对象（协议转换归 handler），不在里面处理鉴权、日志这类横切关注点。它只关心"这个业务要做什么"，其他的一概外包。

在 FastAPI 项目里，业务逻辑写在 service 模块里，handler（路由函数）只做薄薄的协议转换。下面是一个下单的业务逻辑，注意它完全不碰 HTTP，参数是普通 Python 类型，返回值也是纯领域对象：

```python
# dataclass 是 Python 3.7+ 引入的标准库装饰器，用于自动生成 __init__、__repr__ 等方法
# 用它来定义纯数据载体类，比普通 class 更简洁，且不可变（frozen=True）时可哈希
from dataclasses import dataclass
# Optional 用于类型标注，表示值可以是 None
# Python 3.10+ 也可以用 int | None，但 Optional 更显式
from typing import Optional


# @dataclass 自动根据类属性生成构造函数：Order(id=None, user_id=0, ...)
# 这里 Order 是领域对象（domain object），不是 ORM 模型，不绑定数据库 session
# 设计意图：用纯 Python 对象承载业务数据，与持久化框架解耦
@dataclass
class Order:
    # id 默认为 None，因为新建订单时还没有自增 ID，由 Repository 写入后回填
    id: Optional[int] = None
    # user_id 关联下单用户，默认值 0 是因为 dataclass 要求所有字段都有默认值
    user_id: int = 0
    # amount 金额，用 float 表示（真实项目中建议用 Decimal 避免浮点误差）
    amount: float = 0.0
    # status 订单状态机的初始状态，默认 "created"
    status: str = "created"


# Service 层是业务逻辑的核心，所有业务规则、校验、事务编排放这里
# 注意：Service 不 import 任何 HTTP 相关模块（如 FastAPI 的 Request/Response）
# 也不直接 import SQLAlchemy session，完全通过 Repository 接口访问数据
class OrderService:
    # 构造函数注入 Repository 依赖（依赖注入模式）
    # 好处：单测时可以传入内存实现的 FakeRepo，不需要真实数据库
    # 坏处几乎为零，这是解耦的标准做法
    def __init__(self, repo):
        # 通过构造函数注入 Repository，不直接 import db，方便单测替换
        self.repo = repo

    # 创建订单的业务方法：接收原始参数，返回领域对象 Order
    # 注意入参是简单类型（int, float），不是 HTTP 的 Body 对象
    # 这使得业务逻辑可以被 HTTP 接口、RPC 接口、定时任务等任何入口复用
    def create_order(self, user_id: int, amount: float) -> Order:
        # ---- 业务校验：规则集中在这里，不散落在 handler 里 ----
        # 这些是带业务语义的校验（不是格式校验）：金额是否合法是业务规则
        # 格式校验（比如 amount 是不是数字）由 FastAPI + Pydantic 在路由层自动完成
        if amount <= 0:
            raise ValueError("金额必须大于零")
        if amount > 100_000:
            raise ValueError("单笔订单上限 100000")

        # ---- 编排用例：调用 DAL 取数据、写数据 ----
        # 业务层不自己查 SQL，通过 Repository 接口获取用户信息
        # Repository 内部可能用 SQLAlchemy、原生 SQL、甚至缓存，对 Service 透明
        user = self.repo.get_user(user_id)
        if user is None:
            raise ValueError("用户不存在")

        # 创建订单（事务边界在这里：repo 的写操作在 service 控制下成组提交）
        # 先在内存中构造 Order 对象，交给 Repository 持久化
        order = Order(user_id=user_id, amount=amount)
        # repo.create() 返回写入后的 Order（带自增 ID）
        saved = self.repo.create(order)

        # ---- 落实领域规则：新用户首单打九折 ----
        # 这是典型的领域规则：折扣策略属于业务逻辑，不应散落在数据访问层
        # 如果将来折扣规则变化（比如改成八折、按会员等级分级），只改 Service 这一处
        if user.is_new:
            # round 保留两位小数，避免浮点精度问题
            saved.amount = round(saved.amount * 0.9, 2)
            # 折扣后需要更新数据库，再次调用 repo.update()
            self.repo.update(saved)

        return saved
```

而"薄路由"只做协议转换，把校验、规则都交给 service：

```python
# APIRouter 是 FastAPI 的路由组织器，用于将相关路由归为一组
# Depends 是 FastAPI 的依赖注入装饰器，用于声明函数参数由框架自动注入
from fastapi import APIRouter, Depends
# 从业务逻辑层引入 OrderService（注意：路由层不直接操作数据库）
from .order_service import OrderService
# 从 schemas 引入 Pydantic 模型，用于请求体解析和校验
from .schemas import CreateOrderReq

# 创建路由实例，可挂载到主 app 上
router = APIRouter()


# @router.post 声明这是一个 POST 接口，路径为 /orders
# body: CreateOrderReq 由 FastAPI 自动解析 JSON 请求体并校验类型
# svc: OrderService = Depends() 由 FastAPI 自动创建并注入 OrderService 实例
# 这里的 Depends() 没参数，FastAPI 会自动通过类型注解推断如何构造依赖
@router.post("/orders")
def create_order(body: CreateOrderReq, svc: OrderService = Depends()):
    # 这里没有 if 校验、没有 try/except、没有 SQL，只有一次调用
    # 路由层只做协议转换：HTTP 请求 → 业务调用 → 返回值
    # 业务逻辑（校验、规则、事务）全在 Service 层，保持路由极薄
    return svc.create_order(body.user_id, body.amount)
```

<strong>代码讲解：</strong> 校验集中在 service 里（handler 不重复判断）；通过 Repository 接口访问数据（不知道底层是 MySQL 还是别的）；领域规则（新用户折扣）写在业务流程正文中而不是散在各处。构造函数注入 `repo` 让单测能用内存实现替换真实数据库。将来要从同步改异步、或者换数据库，只要 Repository 接口不变，这层一行不用动。

<strong>常见坑：</strong>

<strong> 把业务校验写进了 handler。</strong> 最典型的做法是在路由函数里写一堆 `if amount <= 0: return {"error": ...}`。问题在于，同一个下单逻辑可能在 HTTP 接口、RPC 接口、定时任务、单元测试里各被调一次，校验逻辑也跟着复制了四份。某天产品说"金额上限从 10 万改成 50 万"，你改了 HTTP 接口的忘了改 RPC 的，两边行为就不一致了。正确做法是把校验收敛到 service，handler 只负责"拿到结果转成 JSON"。

<strong> service 里裸操作 db.session。</strong> 不通过 Repository，直接在 service 里写 `db.session.query(Order).filter(...)`。这样做的坏处一是事务边界模糊——service 里三个写操作，哪个该 commit、哪个该 rollback 变得不清楚；二是换数据库时要改 service 本身，违背了分层隔离的初衷。Repository 存在的意义就是把"怎么存"和"存什么"分开。

<strong> service 直接返回 JSONResponse。</strong> 有时候图方便，在 service 方法里写 `return JSONResponse({"order_id": 1})`。这就把 HTTP 协议耦合进了业务层——如果将来这个下单逻辑要被消息队列消费者调用、或者被 gRPC 服务复用，你发现 service 根本没法用，因为它返回的是 HTTP 响应而不是领域对象。service 应该永远返回纯 Python 对象，"转成什么格式"交给调用方决定。

<strong> 领域规则散落在各处。</strong>"新用户打九折"这个规则，如果下单方法里写一份、改单方法里又写一份、退款计算里再来一份，三份逻辑迟早会出现不一致。正确的做法是把折扣规则抽成一个独立方法（甚至独立的 DiscountService），所有需要的地方统一调用。

<strong> 依赖写死，不用接口注入。</strong> 直接 `from app.repositories.order_repo import OrderRepository` 然后在方法里 `OrderRepository().get_user(...)`。这样单测的时候没办法替换成内存实现，每次跑测试都得连真库——慢而且脆（数据库状态互相污染）。构造函数注入的成本很低，但收益很大：service 不知道自己用的是真库还是假库，这正是好的分层该有的样子。

## 数据访问层（DAL / Repository）

数据访问层的职责只有一个：隔离数据库实现细节，向上提供按业务语义取数的接口。ORM 通常落在这一层。

这一层收口了所有数据库操作。业务层只调 `repo.get_user(...)`、`repo.create(...)`，完全不知道数据存在哪张表、用的什么数据库、甚至不知道底层是 ORM 还是原生 SQL。它暴露的是"取用户"、"建订单"这种带业务语义的方法，而不是"执行这条 SQL"。session（数据库连接）由外部创建并传入，Repository 自己不在内部 new 一个连接，这样事务边界由调用方（service）控制，而不是每个方法各自为政。最后，结果要做映射：把数据库行或 ORM 对象转成上层能用的纯数据结构（比如 dict 或 dataclass），不让 ORM 实例泄漏到业务层——ORM 对象绑着 session，一旦上层误操作可能触发意外的懒加载查询或脏写回。

这一层不写业务规则（"满 100 减 10"不该出现在这里）、不碰 HTTP、不在每个方法里各开各的事务。它只回答"数据怎么存取"，不参与"存取意味着什么"。

下面用 SQLAlchemy 给出工程实现：基于 ORM 模型的 CRUD 操作，以及原生 SQL（适合复杂查询 ORM 表达不了的场景）。两种都被封装在同一个 Repository 接口后面，业务层无感知：

```python
# Session 是 SQLAlchemy 的会话对象，代表与数据库的一次会话
# 所有 ORM 操作（增删改查）都通过 Session 进行
from sqlalchemy.orm import Session
# text() 用于执行原生 SQL，适合复杂查询或 ORM 表达不了的场景
from sqlalchemy import text

# Column/Integer/Float/String 是 ORM 模型的列定义类型
# 用于 Python 类与数据库表字段的映射
from sqlalchemy import Column, Integer, Float, String
# declarative_base 是 SQLAlchemy 1.x 的声明式基类工厂
# 所有 ORM 模型类都继承自它，从而获得 ORM 能力
from sqlalchemy.ext.declarative import declarative_base

# 创建声明式基类，所有模型共享此 Base
Base = declarative_base()


# OrderModel 是 ORM 模型类，对应数据库中的 orders 表
# 注意：这是数据库模型，不是领域对象（Order dataclass）
# ORM 模型绑定了 Session，不应泄漏到业务层
class OrderModel(Base):
    # __tablename__ 指定对应的数据库表名
    __tablename__ = "orders"
    # Column 定义表字段：主键自增 ID
    id = Column(Integer, primary_key=True, autoincrement=True)
    # user_id 带索引，因为常用于按用户查询订单
    user_id = Column(Integer, nullable=False, index=True)
    # amount 金额，不允许为空
    amount = Column(Float, nullable=False)
    # status 默认值 "created"，最长 20 字符
    status = Column(String(20), default="created")


# OrderRepository 是数据访问层的核心，封装所有数据库操作
# 向上提供按业务语义命名的方法（如 get_user, create），而非暴露 SQL
# 业务层通过接口调用，不知道底层用的是 ORM 还是原生 SQL
class OrderRepository:
    # 构造函数接收外部创建的 Session
    # 设计意图：Session 生命周期由外部（依赖注入容器或框架）管理
    # 好处：事务边界由 Service 层统一控制，Repository 不自行 commit
    def __init__(self, session: Session):
        # session 由外部创建和管理，自己不在内部 new 一个，方便单测替换
        self.db = session

    # get_user 用原生 SQL 查询用户（示例）
    # 为什么用原生 SQL 而不是 ORM？因为简单查询原生 SQL 更直观
    # 返回 dict 或 None，dict 是纯数据结构，不会泄漏 ORM 语义
    def get_user(self, user_id: int):
        """按 ID 查用户，返回 dict 或 None"""
        # 使用参数化查询防止 SQL 注入
        # :uid 是命名参数，通过第二个参数字典传入
        result = self.db.execute(
            text("SELECT id, is_new FROM users WHERE id = :uid"),
            {"uid": user_id},
        ).fetchone()
        if result is None:
            return None
        # 把查询结果转成 dict，是纯数据结构，不暴露数据库细节
        return {"id": result[0], "is_new": bool(result[1])}

    # create 方法：将领域对象 Order 写入数据库
    # 接受领域对象（dataclass），内部转为 ORM 模型，再写库
    # 返回写入后的领域对象（带自增 ID），不让 ORM 实例泄漏到上层
    def create(self, order) -> "Order":
        """写入数据库，返回带自增 ID 的对象"""
        # 将领域对象的属性值拷贝到 ORM 模型
        model = OrderModel(
            user_id=order.user_id,
            amount=order.amount,
            status=order.status,
        )
        # add 将 ORM 模型加入 session 的待管理队列（不立即写库）
        self.db.add(model)
        # commit 触发事务提交，此时才真正执行 INSERT SQL
        # 注意：如果有多个写操作都在同一个 session 中，commit 一次即可
        self.db.commit()
        # refresh 从数据库重新加载模型，拿到自增 ID 等数据库生成的字段
        self.db.refresh(model)
        # 把 ORM 模型转回领域对象，不让 ORM 泄漏到上层
        # 只回填 ID，其他字段在 order 中已有值
        order.id = model.id
        return order

    # update 方法：按 ID 更新已有记录
    # 用 ORM 的 query + filter 定位记录，再用 update() 批量更新
    def update(self, order):
        """更新已有记录"""
        # filter 按主键定位记录，update 直接设置新的字段值
        # 这里只更新 amount 字段，真实场景可能更新更多字段
        self.db.query(OrderModel).filter(
            OrderModel.id == order.id
        ).update({"amount": order.amount})
        self.db.commit()
```

<strong> 代码讲解：</strong> Repository 的 `__init__` 接收外部创建的 `Session`（不在内部自己 new），单测可塞内存 SQLite session；`create` 最后把 ORM 模型转回领域对象再返回，上层拿到的是纯 Python 对象而非绑着 session 的 ORM 实例；简单 CRUD 用 ORM，复杂查询用 `text()` 写原生 SQL，二者混用在同一 Repository 里很正常。

<strong> 常见坑：</strong>

<strong> 在 DAL 里写了业务规则。</strong> 比如把"金额打九折"的逻辑写在 `repo.create()` 里面。乍一看挺方便——写库的时候顺便算好了。但问题是，折扣是业务策略，将来可能要改（改成八折、按会员等级打折），而 DAL 本该是稳定的数据访问层。业务规则一混进来，DAL 变成了"什么都往里放"的大杂烩，改一处牵一片。折扣归 service 管(repo 只管原价存取)，这是分层的底线。

<strong> 返回了 ORM 对象给上层。</strong> 如果 `create()` 直接返回 SQLAlchemy 的 `OrderModel` 实例而不是转成 dataclass，上层拿到的对象绑着 session 和数据库连接。一旦上层代码不小心改了某个属性（比如 `order.amount = 999`），下次 session flush 的时候这个改动会被自动写回数据库——静默脏写，没有任何显式调用来提醒你。而且绑着连接的对象如果不及时释放，连接池里的连接就一直还不上来，高并发时连接池被占满，新请求全部卡住等连接。所以 Repository 的出口一定要做一次映射，切断 ORM 的关联。

<strong> N+1 查询问题。</strong> 典型场景：查 100 个订单，每个订单都要显示用户名。如果先查订单列表（1 次 SQL），然后在循环里对每个订单调 `order.user.name`（触发 100 次懒加载），总共 101 次查询。数据量小的时候不明显，上了生产就是性能杀手。SQLAlchemy 的解法是用 `joinedload()` 或 `selectinload()` 在第一次查询时用 JOIN 或 IN 子查询把关联数据一次性带出来，保持始终只有 1-2 次 SQL。

<strong> 连接泄漏。</strong> 从连接池拿到 session 之后，如果正常路径忘了 commit/close、异常路径又没有 finally 回滚，这个连接就永远不会归还连接池。连接池大小通常就几十个，漏几个还好，漏多了新请求过来拿不到连接就只能等着——表现就是服务突然变慢然后彻底卡死。正确做法是用依赖注入框架（FastAPI 的 Depends）管理 session 生命周期，请求结束自动关闭；或者至少用 try/finally 保证异常时也 rollback 并关闭。

<strong> 每个方法各自提交事务。</strong> 如果在 Repository 的每个 write 方法里都调 `self.db.commit()`，那 service 层想做"写 A 再写 B 要么全成要么全败"就不可能了——A 写完已经 commit 了，B 失败时 A 也回不去了。正确做法是：Repository 的 write 方法只做 `add`/`update` 不 commit，commit 由 service 统一在用例结束时调用。事务边界必须由知道业务语义的那一层来控制。

## 横切关注点：日志、鉴权、异常统一处理

日志、鉴权、配置、可观测性这些东西横穿所有层。它们不该散落在每个 handler 里重复写，而是用中间件或装饰器统一处理，业务代码完全不感知。FastAPI 的 middleware 机制和 Depends 依赖注入系统就是干这个的。

具体来说，请求级日志要在每个请求自动记录方法、路径、状态码、耗时，并且带上一个 trace id 把同一条链路上的所有日志串起来——否则一次请求散了几十条日志，出问题时根本对不上。统一异常处理负责把业务抛出的各种错误（参数不对、权限不足、资源不存在）转成固定格式的 JSON 响应，不能让它们裸奔成 500 或者暴露堆栈信息。鉴权负责解析 token、识别当前用户身份，业务代码不应该自己去做"从 header 取 token → 解密 → 查用户"这套动作。此外还有 CORS、限流、链路追踪这些跨层能力，全局配置一处、处处生效。

这一层不写具体业务逻辑，也不决定某个接口的业务含义。它是基础设施，像水管电线一样铺好，业务代码直接用就行。

下面三个例子分别展示：请求级日志中间件、统一异常处理器、JWT 鉴权依赖：

```python
# time 模块用于计时，这里用来计算请求耗时
import time
# uuid 生成唯一 ID，这里用作 trace_id
import uuid
# logging 是 Python 标准库的日志模块
import logging
# Request/Response 是 FastAPI 的请求和响应对象类型
from fastapi import Request, Response
# JSONResponse 用于返回 JSON 格式的 HTTP 响应
from fastapi.responses import JSONResponse
# BaseHTTPMiddleware 是 Starlette 提供的中间件基类
# 继承它可以自定义请求处理逻辑，在请求前后插入横切行为
from starlette.middleware.base import BaseHTTPMiddleware

# 获取名为 "order_service" 的 logger，日志会带上这个名字用于过滤
# 在 logging 配置中可以针对该 logger 设置不同级别（INFO/DEBUG 等）
logger = logging.getLogger("order_service")


# ---- 1. 请求日志中间件：自动记录耗时和 trace id ----
# 中间件在每个请求进入应用前先执行，返回响应后再执行后半段
# 这样可以拦截所有请求，实现"对业务代码零侵入"的全局日志记录
class LoggingMiddleware(BaseHTTPMiddleware):
    # dispatch 是中间件的核心方法，request 是当前请求，call_next 是下一个处理器
    # 必须是 async def，因为 ASGI 框架（FastAPI/Starlette）基于异步 IO
    async def dispatch(self, request: Request, call_next):
        # 生成 8 位短 trace_id（完整 uuid 太长，日志里用短 ID 够用且更易读）
        # 用十六进制截断，保证 log 中的 trace_id 等宽
        trace_id = str(uuid.uuid4())[:8]
        # 把 trace_id 存到 request.state 中，后续任何依赖 request 的代码都能取到
        request.state.trace_id = trace_id

        # perf_counter 是高精度计时器，比 time.time() 更适合做耗时测量
        start = time.perf_counter()
        # call_next(request) 调用后续的路由处理链，返回 Response
        # 这是真正执行业务逻辑的地方，用 await 支持异步处理
        response = await call_next(request)
        # 计算耗时并转为毫秒
        duration = (time.perf_counter() - start) * 1000

        # 结构化日志记录：用 %s 占位符而非 f-string，因为 logging 的 %s 写法
        # 在日志级别被过滤时不会产生字符串拼接开销（性能优化）
        # 日志格式：[trace_id] 方法 路径 状态码 耗时ms
        logger.info(
            "[%s] %s %s %d %.1fms",
            trace_id, request.method, request.url.path,
            response.status_code, duration,
        )
        # 把 trace_id 写入响应 header，前端或下游服务可以从中获取 trace_id
        # 用于端到端的链路追踪（比如前端报错时上报 trace_id 方便排查）
        response.headers["X-Trace-ID"] = trace_id
        return response


# ---- 2. 统一异常处理：不同错误类型对应不同状态码 ----
# BizError 是自定义业务异常类，继承 Exception
# 它携带两个关键信息：错误消息 msg 和 HTTP 状态码 status_code
# 业务代码只需 raise BizError("金额必须大于零", 400)，框架自动转成 HTTP 响应
class BizError(Exception):
    def __init__(self, msg: str, status_code: int = 400):
        self.msg = msg
        self.status_code = status_code


# 全局异常处理器：捕获 BizError，转成统一格式的 JSON 响应
# 这意味着业务代码里 raise BizError 不会变成 500 或 HTML 错误页
# 前端收到的始终是 {"error": "xxx"} 格式，状态码正确
async def biz_error_handler(request: Request, exc: BizError):
    return JSONResponse(
        status_code=exc.status_code,
        # 统一错误响应结构：{"error": "错误描述"}
        # 前后端约定好这个格式，前端可以统一处理所有业务错误
        content={"error": exc.msg},
    )


# ---- 3. JWT 鉴权依赖：挂在需要登录的路由上即可 ----
# Depends 用于声明依赖注入，HTTPException 用于返回 HTTP 错误响应
from fastapi import Depends, HTTPException
# jose 库是 JWT 的 Python 实现，用于解析和验证 JWT token
from jose import jwt, JWTError


# get_current_user 是鉴权依赖函数
# 路由函数参数声明 current_user = Depends(get_current_user) 后
# FastAPI 会在执行路由前自动调用此函数，实现"未登录则 401"
# 业务代码完全不需要写 token 解析逻辑，保持干净
async def get_current_user(request: Request):
    # 从请求 header 中获取 Authorization 字段
    auth = request.headers.get("Authorization", "")
    # Bearer Token 是 OAuth 2.0 / JWT 的标准格式
    if not auth.startswith("Bearer "):
        # 401 Unauthorized 状态码表示未认证
        raise HTTPException(401, "未提供认证信息")
    # 去掉 "Bearer " 前缀，拿到纯 token 字符串
    token = auth[7:]
    try:
        # jwt.decode 解析并验证 JWT：校验签名、过期时间、算法
        # "your-secret" 是密钥（真实项目应从配置读取，不要硬编码）
        # algorithms 指定签名算法，必须与签发时一致，防止算法混淆攻击
        payload = jwt.decode(token, "your-secret", algorithms=["HS256"])
        # payload["sub"] 是 JWT 的 Subject 字段，通常存用户 ID
        # 返回包含 user_id 的 dict，路由函数通过 Depends 拿到
        return {"user_id": payload["sub"]}
    except JWTError:
        # JWTError 是所有 JWT 解析失败的统一异常（过期、签名错误、格式错误）
        raise HTTPException(401, "token 无效或已过期")
```

使用方式是在应用装配时挂上去，业务 handler 一行都不用写：

```python
# FastAPI 是主框架类，用于创建 Web 应用实例
from fastapi import FastAPI
# 从 middleware 模块导入之前定义的中间件和异常处理器
# 这些横切关注点（日志、异常、鉴权）被集中管理，不污染业务代码
from middleware import LoggingMiddleware, biz_error_handler, BizError, get_current_user

# 创建 FastAPI 应用实例，这是整个应用的入口
app = FastAPI()

# 全局中间件：每个请求都经过
# add_middleware 注册中间件，所有请求（包括未匹配路由的请求）都会经过
# FastAPI 中间件执行顺序是"后注册的先执行"（洋葱模型）
app.add_middleware(LoggingMiddleware)
# 全局异常处理器：BizError 不再变成 500
# add_exception_handler 注册自定义异常处理器，只处理指定异常类型
# 这里只处理 BizError，其他异常（如 ValueError、数据库异常）仍会走默认处理
app.add_exception_handler(BizError, biz_error_handler)


# @app.post 路由装饰器，声明 POST /orders 接口
# dependencies 参数声明该路由需要的依赖（在路由执行前自动完成鉴权）
# Depends(get_current_user) 会在执行 create_order 前先解析 JWT token
@app.post("/orders", dependencies=[Depends(get_current_user)])
def create_order(body: dict, current_user: dict = Depends(get_current_user)):
    # 这里完全不需要检查 token、不需要记录日志、不需要 try/except 包裹
    # 鉴权、日志、异常全由中间件和依赖注入在框架层面完成
    # 业务代码只剩纯业务逻辑调用
    return service.create_order(current_user["user_id"], body["amount"])
```

<strong>常见坑：</strong>

<strong> 在每个 handler 里各自 try/except。</strong> 最常见的新手做法：每个路由函数都包一层 try/except，然后 return 不同的错误格式。A 接口返回 `{"error": "xxx"}`，B 接口返回 `{"message": "xxx", "code": 500}`，C 接口直接 raise 让框架返回默认的 HTML 错误页。前端拿到三种格式，没法统一处理。正确做法是定义一种错误格式（比如上面的 BizError），全局一个 exception handler 统一转换，handler 里只管 raise 不管怎么响应。

<strong> trace id 没有透传。</strong> 日志中间件生成了 trace id 放进了 request.state，但如果后续的日志调用没把这个 id 传进去（比如 service 里 `logger.info("下单成功")` 而不是 `logger.info("[%s] 下单成功", trace_id)`），那这次请求的日志还是散的——几十条 log 里你分不清哪些属于同一次请求。更糟的情况是调用下游服务时没把 trace id 放进 HTTP header，下游服务的日志和你这边的日志也串不起来。trace id 必须贯穿整条链路：入请求的 header、日志每条都带、调下游也传过去。

<strong> 鉴权逻辑散落到每个 handler。</strong> 有的接口记得加 `@auth_required`，有的忘了。漏掉的那个接口就成了越权入口——用户没登录也能调。正确做法是把鉴权做成全局依赖或中间件，白名单模式（默认全部需要登录，个别公开接口单独标记例外），而不是黑名单模式（每个接口自己去记要不要校验）。人总会忘事，别靠记忆去保证安全。

<strong> 中间件顺序搞反了。</strong> FastAPI 中间件的执行顺序是"注册顺序的逆序"（后注册的先执行）。如果把鉴权中间件放在日志中间件之前注册，那么未授权请求在被鉴权中间件拦截时，日志中间件还没执行过，这条请求就没有 trace id，对应的日志就是断链的。另外，自定义异常处理器如果没覆盖框架内置的 Exception 类型，遇到意料之外的报错（比如数据库连不上抛 OperationalError），照样裸奔成 500 加堆栈信息。所以除了处理自己的 BizError 之外，最好再加一个兜底的通用异常处理器，至少保证不泄露内部细节。

<strong> 异常处理器只接了已知异常类型。</strong> 只给 BizError 注册了 handler，但代码里可能还会抛 ValueError、KeyError、数据库异常等各种意外。这些异常没人处理，框架就会返回默认的 500 HTML 页面，有时还会带上完整的堆栈信息——这对前端不友好，对安全也不友好（内部实现细节暴露了）。兜底方案是加一个捕获 Exception 的 handler，返回统一的错误格式但不暴露详情，同时把原始异常和 trace id 记到日志里供排查。

到这里，第三章把四层各自负责什么、工程上怎么落地、常见坑在哪都讲透了。第四章看框架怎么选，第十三章起把这个 order-service 完整落地成可运行工程。

## 五、同步 vs 异步：WSGI 与 ASGI

WSGI（Django/Flask 的传统跑法）是同步模型：一个请求进来，占用一个 worker（线程或进程），从头执行到返回，期间这个 worker 不能被别的请求用。遇到等数据库、等外部 API 时，worker 干等，资源被占着。并发能力基本等于 worker 数乘每 worker 线程数，要扛高并发只能堆进程或线程，内存开销大。

ASGI（FastAPI/Starlette）是异步模型：一个进程里用事件循环，多个请求并发；某个请求在 await 等 IO 时，事件循环转去跑别的就绪请求。所以少量进程就能扛大量正在等的连接，单进程轻松管成百上千条链接。

为什么异步对后端重要：后端大量时间花在等（查库、调下游、读缓存），真正算的时间少。异步把等的时间腾出来服务别人，吞吐就上去了。一个具体的数字感：WSGI 一个线程通常吃 1 到 2MB 内存，上万并发要十几 GB；asyncio 一个协程只几 KB 栈，一万协程才几十 MB。

asyncio 事件循环一句话原理：一个线程里维护任务队列，遇到 await 就把当前协程挂起、切到别的就绪协程，等 IO 好了再回来接着跑。代价是写异步代码要避开阻塞调用（比如 time.sleep、同步重库调用），否则会卡住整个事件循环，让所有请求一起慢。

## 六、并发模型与 GIL：为什么 Python Web 爱多进程

GIL（全局解释器锁）规定：同一进程内，同一时刻只有一个线程能执行 Python 字节码。所以多线程做 CPU 密集任务无法真正并行，反而因锁竞争更慢。这就是 Python 的著名约束。

对 Web 服务的影响很直接：纯靠多线程想利用多核行不通，所以常起多个进程（gunicorn/uWSGI 的多个 worker），每个 worker 一个进程、各有一把 GIL，多进程才能真正并行吃满多核。

<section class="article-embed-note">
  <p class="article-embed-note-title">单进程能跑多少个并发单元（Python 视角）</p>
  <p class="article-embed-note-lead">GIL 锁死线程并行，所以 Python Web 常用多进程吃满多核，IO 场景用协程。1 tick = 5 万，方便和 Go 篇对照。</p>
  <figure class="lieflat-scene">
    <svg class="lieflat-svg" viewBox="0 0 760 320" role="img" aria-label="Python 并发单元容量对比" style="font-family: Inter, system-ui, sans-serif;"><rect x="0" y="0" width="760" height="320" rx="16" fill="#F0EFEB" /><text x="28" y="34" font-size="15" font-weight="700" fill="#1C1C1A">单进程能跑多少个并发单元（Python 视角）</text><text x="28" y="54" font-size="11" fill="#8F8E88">1 tick = 5 万 · 空心圈 = 低于 1 tick · 线程被 GIL 卡死</text><text x="104" y="92" font-size="9.5" font-weight="700" fill="#6A6963" text-anchor="end" letter-spacing="0.06em">协程 / ASYNC</text><line x1="114" y1="100" x2="614" y2="100" stroke="#DEDDD6" stroke-width="0.6" /><line x1="114" y1="100" x2="114" y2="86" stroke="#1C1C1A" stroke-width="0.9" opacity="0.7" /><line x1="159" y1="100" x2="159" y2="86" stroke="#1C1C1A" stroke-width="0.9" opacity="0.7" /><line x1="204" y1="100" x2="204" y2="83" stroke="#1C1C1A" stroke-width="0.9" opacity="0.65" /><line x1="249" y1="100" x2="249" y2="87" stroke="#1C1C1A" stroke-width="0.9" opacity="0.75" /><line x1="294" y1="100" x2="294" y2="82" stroke="#1C1C1A" stroke-width="0.9" opacity="0.6" /><circle cx="294" cy="104" r="1.2" fill="#C6C5BF" /><line x1="339" y1="100" x2="339" y2="85" stroke="#1C1C1A" stroke-width="0.9" opacity="0.7" /><line x1="384" y1="100" x2="384" y2="83" stroke="#1C1C1A" stroke-width="0.9" opacity="0.65" /><line x1="429" y1="100" x2="429" y2="87" stroke="#1C1C1A" stroke-width="0.9" opacity="0.75" /><line x1="474" y1="100" x2="474" y2="82" stroke="#1C1C1A" stroke-width="0.9" opacity="0.6" /><line x1="519" y1="100" x2="519" y2="86" stroke="#1C1C1A" stroke-width="0.9" opacity="0.7" /><circle cx="519" cy="104" r="1.2" fill="#C6C5BF" /><line x1="564" y1="100" x2="564" y2="83" stroke="#1C1C1A" stroke-width="0.9" opacity="0.65" /><text x="624" y="94" font-size="14" font-weight="800" fill="#1C1C1A">≈50 万</text><text x="104" y="138" font-size="9.5" font-weight="700" fill="#6A6963" text-anchor="end" letter-spacing="0.06em">线程（GIL）</text><line x1="114" y1="146" x2="614" y2="146" stroke="#DEDDD6" stroke-width="0.6" /><circle cx="120" cy="146" r="2.4" fill="none" stroke="#8F8E88" stroke-width="0.8" /><text x="130" y="143" font-size="9" fill="#8F8E88">＜1 TICK · 同一时刻只有 1 个在跑</text><text x="624" y="140" font-size="12" font-weight="700" fill="#8F8E88">1</text><text x="104" y="184" font-size="9.5" font-weight="700" fill="#6A6963" text-anchor="end" letter-spacing="0.06em">进程 / GUNICORN WORKER</text><line x1="114" y1="192" x2="614" y2="192" stroke="#DEDDD6" stroke-width="0.6" /><line x1="118" y1="192" x2="118" y2="182" stroke="#1C1C1A" stroke-width="0.9" opacity="0.7" /><line x1="146" y1="192" x2="146" y2="180" stroke="#1C1C1A" stroke-width="0.9" opacity="0.65" /><line x1="174" y1="192" x2="174" y2="184" stroke="#1C1C1A" stroke-width="0.9" opacity="0.75" /><text x="184" y="189" font-size="9" fill="#8F8E88">CPU 核数 · 典型 4-8</text><text x="624" y="186" font-size="12" font-weight="700" fill="#8F8E88">4-8</text><line x1="28" y1="220" x2="732" y2="220" stroke="#DEDDD6" stroke-width="0.5" /><text x="380" y="240" font-size="8" font-weight="600" fill="#C6C5BF" text-anchor="middle" letter-spacing="0.1em">1 TICK = 5 万并发单元 · 线程被 GIL 锁死 · 协程单进程内无锁并发 · 进程按核数分配</text><text x="28" y="258" font-size="8" font-weight="500" fill="#C6C5BF" letter-spacing="0.08em">SOURCE · 后端架构深度解析（PYTHON 篇）第六章 · GIL 限制线程并行 · asyncio 单进程协程</text></svg>
  </figure>
</section>

IO 密集和 CPU 密集要分开看：IO 密集（等网络、等库）用协程（asyncio）在一个进程内并发最高效；CPU 密集（计算）用多进程，或把计算交给会释放 GIL 的 C 扩展（如 NumPy）。ASGI 的 event loop 一旦碰到 CPU 重活也会被卡住、切不动别的任务，所以重计算要下沉到 Celery 或多进程。

典型部署形态：Nginx（接入） → gunicorn（起 N 个 worker 进程，每个跑应用） → 应用（内部可能再用 asyncio）。水平扩容就是加机器或加 worker 数。

```bash
# 4 个同步 worker 进程，各自独立、各吃一个核
gunicorn main:app -w 4 -b 0.0.0.0:8000

# FastAPI/ASGI：用 uvicorn worker，单进程内再靠事件循环并发
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

## 七、数据访问层架构：ORM、连接池、读写分离

## ORM 与 N+1 陷阱

ORM 把数据库表和 Python 对象映射起来，你写 user.orders 而不是拼 SQL。少写 SQL、类型安全、换数据库改配置即可。代价是你得懂它生成的 SQL，最经典的坑是 N+1 查询：遍历 N 个对象，每个又去查一次关联表，结果变成 1（查主表）加 N（查关联）次 SQL，数据量大时直接拖垮数据库。

```python
# 反例：循环里逐个触发关联查询，产生 N+1 次 SQL
# 1 次查 users 表，N 次按每个 user 查 orders 表，总共 N+1 次
# 数据量大时（如 10000 用户）会产生 10001 次 SQL，严重拖垮数据库
users = session.query(User).all()
for u in users:
    # 每访问一次 u.orders 就触发一次查 orders 的 SQL（懒加载）
    # 这是因为 SQLAlchemy 默认使用懒加载，只有访问关联属性时才查数据库
    print(u.orders)

# 正例：一次 JOIN 把关联数据取回来
# joinedload 使用 LEFT JOIN 在第一次查询时就把 orders 一起带回来
# 无论多少用户，始终只有 1 次 SQL（或 1 次 JOIN + 1 次额外查询）
from sqlalchemy.orm import joinedload
# options(joinedload(User.orders)) 告诉 SQLAlchemy：加载 User 时一并加载 orders
# 这样后续访问 u.orders 时直接从已加载的数据中取，不再触发额外 SQL
users = session.query(User).options(joinedload(User.orders)).all()
for u in users:
    # 不再额外打 SQL，orders 已经在第一次查询时通过 JOIN 加载到内存
    print(u.orders)
```

## 连接池

建立数据库连接很贵（TCP 握手、鉴权、事务初始化）。每次请求都新建连接会拖垮数据库。连接池预先建好一批连接放在池子里，请求来了借一个、用完还回去复用。常用参数 pool_size（常驻连接数）和 max_overflow（高峰额外连接数）。

## 读写分离与主从延迟

主库负责写（INSERT/UPDATE/DELETE），从库负责读（SELECT），主从复制把写同步到从库，读压力分摊到多个从库。要注意主从延迟：刚写入的数据在从库可能还没同步到，读会拿到旧值。像刚下单立刻查订单这种关键读，要走主库或做一致性处理，不能用从库。

## 八、缓存架构：Redis 的角色与三个经典坑

缓存把热点数据放内存（Redis），读起来比查库快几个数量级。最常用的是旁路缓存（Cache-Aside）：读的时候先查缓存，命中直接返回；没命中才查库，并把结果写回缓存再返回。写的时候先更新数据库，再删除缓存（注意顺序，先删缓存再更库会有并发不一致风险）。

```python
# redis 是 Redis 的官方 Python 客户端库
import redis, json

# 创建 Redis 连接，默认连 localhost:6379
# 生产环境应从配置读取 Redis 地址，这里用默认参数简化
cache = redis.Redis()

# 旁路缓存模式（Cache-Aside）的读取流程
# 读路径：先查缓存 → 命中直接返回 → 未命中查库 → 回填缓存
def get_user(user_id):
    # 构造缓存 key，使用 "user:{user_id}" 格式
    # 冒号分隔是 Redis key 的常见命名约定，便于管理和搜索
    key = f"user:{user_id}"
    # cache.get 从 Redis 获取字符串值
    data = cache.get(key)
    if data:                        # 命中缓存
        # 命中时直接反序列化 JSON 并返回，速度比查库快 1-2 个数量级
        return json.loads(data)
    # 未命中缓存，回源查数据库
    row = db.query_user(user_id)    # 未命中，查库
    # setex 设置带过期时间的缓存，300 秒（5 分钟）后自动过期
    # 过期时间不是越长越好：太长会导致数据不一致，太短会导致频繁回源
    cache.setex(key, 300, json.dumps(row))  # 回填，300 秒过期
    return row

# 旁路缓存模式的写流程
# 写路径：先更新数据库 → 再删除缓存（注意顺序！）
# 为什么是"删缓存"而不是"更新缓存"？
# 因为删缓存后，下次读请求会自动回源查库并回填，保证数据一致性
# 如果先删缓存再更库，并发场景下可能有其他请求在缓存删除后、DB 更新前查库，读到旧值
def update_user(user_id, name):
    db.update_user(user_id, name)   # 先更库
    cache.delete(f"user:{user_id}") # 再删缓存
```

三个经典坑：

- 缓存穿透：查一个根本不存在的 key，缓存没有、每次都打到库。解决：缓存空值（短过期）或用布隆过滤器拦掉不存在的 id。
- 缓存击穿：某个热点 key 突然过期，瞬间大量请求同时击穿到库。解决：互斥锁（只放一个请求去查库、其他等结果）或热点 key 逻辑过期。
- 缓存雪崩：大量 key 在同一时刻集中过期，或 Redis 挂了，请求全压到库。解决：过期时间加随机抖动；Redis 做高可用（主从加哨兵或集群）。

## 九、异步任务与解耦：Celery + 消息队列

请求应该尽快返回（几百毫秒级），但有些活很重、很慢，发邮件、生成报表、调第三方 API、视频转码。把这些塞进请求里会让用户干等，还占着 worker。做法是：Web 进程只把任务投进消息队列就返回，后台的 worker 进程慢慢消费执行。生产者和消费者各自独立伸缩，这就是解耦。

Celery 由四部分组成：任务（你写的 Python 函数，加 @app.task 装饰）、Broker（消息队列，Redis 或 RabbitMQ，存待执行任务）、Worker（真正执行任务的进程，可多台）、Backend（存任务结果，可选）。

```python
# tasks.py
# Celery 是 Python 生态最流行的异步任务队列框架
# 它由四部分组成：Task（任务）、Broker（消息队列）、Worker（执行者）、Backend（结果存储）
from celery import Celery

# 创建 Celery 应用实例
# "demo" 是当前应用的名字（用于在多个 Celery 应用中区分）
# broker 指定消息队列（Broker）的连接地址，这里用 Redis 作为消息中间件
# Redis 不是 Celery 的唯一选择，RabbitMQ 也是常见的 Broker
app = Celery("demo", broker="redis://localhost:6379/0")

# @app.task 装饰器将函数注册为 Celery 任务
# 注册后，该函数可以被 Worker 进程异步执行，而不是在 Web 请求中同步执行
# 这样 Web 请求只需将任务投到 Broker 就立刻返回，由 Worker 后台慢慢处理
@app.task
def send_welcome_email(user_id: int):
    # 这里是耗时的邮件发送逻辑（调 SMTP 服务、拼接邮件内容等）
    # 这些操作可能耗时几百毫秒到几秒，放在 HTTP 请求里会让用户干等
    # 所以放到 Celery Worker 中异步执行，用户提交后立即收到响应
    ...

# 在 Web 视图里只投任务，不等它跑完
# .delay() 将任务序列化后投到 Redis Broker，立即返回一个 AsyncResult 对象
# 这个调用几乎不耗时（只是写 Redis），不会阻塞 HTTP 请求
# Worker 进程在后台从 Redis 取出任务并执行
send_welcome_email.delay(user_id=123)
```

注意两点：任务里不能依赖请求上下文（比如用户的登录态），需要的数据要作为任务参数传进去；任务要尽量幂等（重复执行不产生坏结果），因为网络抖动它可能重试。

## 十、从单体到服务化：什么时候该拆

单体不是原罪。早期一个应用包所有功能，开发部署最简单，最快验证业务。很多人一上来就微服务，结果大部分时间花在治微服务带来的分布式问题上。拆的触发信号：团队变大、多人改同一份代码冲突多、发布互相阻塞；模块间耦合重，改一处牵一片；某部分负载特性差异大（报表很吃 CPU、API 很吃 IO），需要分别扩缩容；技术栈要分叉（一部分用 Python、一部分用 Go）。

代价也要算清：服务间要通信（网络、序列化）、分布式一致性难、链路变长难排查、运维复杂度陡增。所以先单体、后按需拆是更稳的路径。容器化（Docker 把应用加依赖打包成镜像，环境一致、随处可跑）配合 gunicorn 加 nginx 反代，水平扩容就是多跑几个容器、前面加负载均衡。

## 十一、可观测性：日志、指标、链路追踪

线上出问题不能靠猜，要有三件套。日志要结构化（JSON 格式），每条带 trace_id，把一次请求经过的所有服务串起来，别满屏 print。指标（Metrics）看 QPS、P99 延迟、错误率、CPU/内存、连接池占用，用 Prometheus 采集、Grafana 看板，用于看趋势和告警。链路追踪（Tracing）针对一次请求跨多个服务或组件（网关到 API 到 DB 到缓存），用 trace_id 把各段耗时串成一条调用链（OpenTelemetry 加 Jaeger），专门定位到底哪一段慢。

## 十二、面试高频考点清单

- WSGI 与 ASGI 的区别：同步一请求占一线程或进程，异步事件循环单进程并发；ASGI 原生支持 WebSocket、HTTP2、SSE，WSGI 只 HTTP/1 短连接。
- GIL 对并发的影响：同一进程多线程无法并行执行 Python 字节码；CPU 密集靠多进程，IO 密集靠协程。
- Django、Flask、FastAPI 选型：全家桶快速交付、微核灵活、类型驱动异步 API。
- ORM 的 N+1 问题及解决：循环查关联触发 1 加 N 次 SQL，用 joinedload、select_related、prefetch 一次性取回。
- 数据库连接池的作用：复用连接、避免每次握手开销，参数 pool_size 与 max_overflow。
- 缓存穿透、击穿、雪崩：不存在的 key 打库、热点 key 过期击穿、大量 key 同时过期；对应空值或布隆过滤器、互斥锁、随机过期加高可用。
- 读写分离与主从延迟：主写从读分摊压力，注意刚写的数据从库可能还没同步。
- Celery 架构：任务加 Broker（消息队列）加 Worker 加 Backend（结果），把重活和请求解耦。
- 单体与微服务：单体简单但难扩展，微服务独立伸缩但部署运维重，按需拆。
- 并发与并行区别：并发是交替推进（单核也能），并行是同时执行（多核）；asyncio 是并发不是并行。
- 高并发架构手段：缓存、异步任务、水平扩容、限流、降级、连接池。

> 前面十二章顺着一次请求把每一层讲清了：接入层、业务逻辑层、数据访问层、缓存、异步任务、可观测性。从这一章开始，我们把这些概念落成磁盘上真实的目录、文件和能跑的代码。这一 Part 的目标不是再讲一遍概念，而是让你看懂一个 Python 后端项目在真实工程里到底长什么样、每一层用什么文件承载、依赖朝哪个方向走。

## 十三、为什么需要工程化代码架构

前面所有图都是逻辑分层。逻辑分层和工程代码之间差着一条鸿沟：逻辑上"数据访问层"存在，但代码里它可能是 app.py 里一行 raw SQL；逻辑上"业务层"存在，但代码里它可能就写在路由函数中间，边拼响应边查库。这种写法在 Demo 阶段没问题，规模一上来就崩。

"能跑"和"工程化"的差距，体现在四件事上：第一，改一个功能不能带崩别处，这就需要单一职责，每个文件只干一类事；第二，新人接手不头大，目录看名字就知道东西放哪；第三，能写单测，业务逻辑能脱离 HTTP 和数据库单独测；第四，组件能替换，哪天想把 MySQL 换成 Postgres，或者把 FastAPI 换成别的框架，只动局部不动全局。

工程代码架构里最关键的一条是依赖方向规则：代码的依赖只能向内，外层依赖内层，内层绝不反向依赖外层。具体落到分层上，依赖方向是 接入层 → 业务逻辑层 → 数据访问层 → 模型层。路由（接入层）可以 import 业务层，业务层可以 import 数据访问层，但反过来不行——数据访问层不能 import 业务层，业务层不认识 HTTP 是什么。好处是：哪天换 Web 框架，只改接入层；哪天换数据库，只改数据访问层，中间的业务逻辑一行不用动。

另一条是避免循环依赖。如果 A 依赖 B、B 又依赖 A，模块加载时就会初始化失败，而且根本没法单独写单测。打破循环依赖的办法是引入内层抽象：让两边都依赖一个接口/协议，而不是互相依赖具体实现。

## 十四、一个可落地的项目目录结构

下面这个 order-service 是后面所有代码的实际载体。它不大，但每一层都在独立目录里，能直接照着搭你自己的项目。

```text
order-service/
├── pyproject.toml          # 依赖与打包声明
├── .env                    # 环境配置，不进版本库
├── app/
│   ├── __init__.py
│   ├── main.py             # 入口：把零件装配成 FastAPI 应用
│   ├── api/                # 接入层：只做 HTTP 协议转换
│   │   ├── __init__.py
│   │   └── orders.py       # 订单相关路由
│   ├── services/           # 业务逻辑层：规则、事务、编排
│   │   ├── __init__.py
│   │   └── order_service.py
│   ├── repositories/       # 数据访问层：收口所有 DB 操作
│   │   ├── __init__.py
│   │   └── order_repo.py
│   ├── models/             # 数据库表映射（SQLAlchemy）
│   │   ├── __init__.py
│   │   └── order.py
│   ├── schemas/            # 出入参模型（Pydantic）
│   │   ├── __init__.py
│   │   └── order.py
│   └── core/               # 横切与基础设施
│       ├── __init__.py
│       ├── config.py       # 配置
│       ├── db.py           # 数据库引擎与 session
│       ├── deps.py         # 依赖注入
│       └── security.py     # 鉴权
└── tests/
    └── test_order_service.py
```

各目录的依赖关系是单向的：api 依赖 services，services 依赖 repositories，repositories 依赖 models；core 里的 config/db/deps/security 被各层共享，但 core 自身不依赖任何业务代码。tests 单独放最外层，不混进 app 内部。

## 十五、配置层：环境隔离与类型校验

配置最容易写成到处 os.getenv("DB_URL")，结果配置从哪来、叫什么名、是什么类型全靠记忆，环境一多就乱。工程做法是集中到一个 Settings 类，用 pydantic-settings 从环境变量或 .env 文件读取，并且带类型校验：启动时类型不对直接报错，而不是跑到一半才发现 db_url 是 None。

```python
# pydantic_settings 是 Pydantic 的配置管理扩展
# BaseSettings 提供从环境变量/.env 文件自动读取配置的能力
# SettingsConfigDict 用于配置 Settings 类的行为（如环境文件路径、前缀等）
from pydantic_settings import BaseSettings, SettingsConfigDict

# Settings 类集中管理所有配置项，带类型校验和默认值
# 好处：配置不再散落在各处 os.getenv()，一处定义处处使用
# 启动时如果类型不对（比如 db_url 写了个数字），Pydantic 会直接报错
class Settings(BaseSettings):
    # model_config 配置 Settings 的行为：
    # env_file=".env" 表示从项目根目录的 .env 文件读取环境变量
    # env_prefix="APP_" 表示只读取以 APP_ 开头的环境变量，避免与系统变量冲突
    # extra="ignore" 表示忽略 .env 中存在但 Settings 类未定义的字段
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_", extra="ignore")

    # 每个配置项都是一个带类型和默认值的类属性
    # Pydantic 会自动从环境变量或 .env 文件读取对应的值
    # 例如 .env 中写 APP_DB_URL=postgres://user:pass@localhost/db
    # 就会自动赋值给 db_url 字段
    app_name: str = "order-service"
    db_url: str = "sqlite:///./app.db"
    redis_url: str = "redis://localhost:6379/0"
    # jwt_secret 是 JWT 签名密钥，生产环境必须改！
    jwt_secret: str = "change-me"
    # debug 控制是否开启调试模式，布尔类型自动转换
    debug: bool = False

# 全局单例，别处直接 from app.core.config import settings 即可使用
# Settings() 会在首次导入时从 .env 和环境变量读取并校验所有配置
settings = Settings()
```

这样在代码里引用配置就是 settings.db_url，而不是散落的字符串。开发、测试、生产三套环境给不同的 .env 即可，代码一行不改。注意 .env 含有密钥，必须进 .gitignore，绝不可提交到版本库。

## 十六、数据模型层与序列化层分离

新手常犯的一个错是：让 API 直接返回数据库模型对象，或者让数据库模型同时承担出入参校验。这两件事职责不同，混在一起会有两个后果：一是内部字段（比如密码哈希、内部状态机字段）被不小心序列化成响应返回出去；二是数据库表结构一改，API 契约跟着抖。

所以工程上分两层。models 是数据库表的映射，描述"数据怎么存"；schemas 是 API 的出入参模型，描述"接口长什么样"。两者通过显式转换连接，互不直接耦合。

```python
# datetime 模块提供时间类型，用于映射数据库的时间戳列
from datetime import datetime
# sqlalchemy 的类型定义：String, Float 对应数据库的 VARCHAR 和 FLOAT 类型
# func 是 SQL 函数集合，func.now() 对应数据库的 CURRENT_TIMESTAMP
from sqlalchemy import String, Float, func
# DeclarativeBase 是 SQLAlchemy 2.x 风格的声明式基类
# Mapped 和 mapped_column 是 2.x 推荐的类型映射方式（比 1.x 的 Column 更简洁）
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Base 类继承 DeclarativeBase，所有 ORM 模型都继承自它
# 这是 SQLAlchemy 2.x 的推荐写法（1.x 用 declarative_base()）
class Base(DeclarativeBase):
    pass

# Order 是 ORM 模型类，映射数据库中的 orders 表
# 注意：这不是领域对象，它绑定了 SQLAlchemy session，
# 会有懒加载、脏写回等 ORM 特性，不应泄漏到业务层
class Order(Base):
    # 指定对应的数据库表名
    __tablename__ = "orders"

    # Mapped[int] 是 2.x 的类型注解方式，mapped_column 定义列属性
    # primary_key=True 表示主键，数据库会自动自增
    id: Mapped[int] = mapped_column(primary_key=True)
    # index=True 为该列创建索引，加速按 user_id 查询订单的速度
    user_id: Mapped[int] = mapped_column(index=True)
    # Float 类型映射数据库的浮点数列
    amount: Mapped[float] = mapped_column(Float)
    # String(20) 限制字符串长度为 20，default="created" 是 Python 端的默认值
    status: Mapped[str] = mapped_column(String(20), default="created")
    # server_default=func.now() 是数据库端的默认值，由数据库服务器生成当前时间戳
    # 这意味着即使 Python 不传 created_at，MySQL/Postgres 也会自动填入
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

```python
# datetime 用于出参模型中的时间字段类型标注
from datetime import datetime
# BaseModel 是 Pydantic 的基类，用于定义数据模型并自动做类型校验
from pydantic import BaseModel

# 入参模型：定义客户端需要传什么字段、什么类型
# FastAPI 会自动将 JSON 请求体解析为 OrderCreate 实例
# 如果类型不对（比如 amount 传了字符串 "abc"），FastAPI 自动返回 422 错误
class OrderCreate(BaseModel):
    user_id: int
    amount: float

# 出参模型：定义服务端返回给客户端的字段
# 注意：这里不包含任何 ORM 特性，是纯数据结构
# 数据库里的内部字段（如内部状态标记）不会被暴露出去
class OrderOut(BaseModel):
    id: int
    user_id: int
    amount: float
    status: str
    created_at: datetime

    # model_config = {"from_attributes": True} 允许从 ORM 对象直接填充
    # 这意味着可以直接用 OrderOut.model_validate(orm_order) 将 ORM 对象转出参
    # 不需要手动逐个字段赋值，Pydantic 会自动读取 ORM 对象的属性
    model_config = {"from_attributes": True}
```

入参用 OrderCreate 做请求体校验（amount 必须是 float、user_id 必须是整数，类型不对 FastAPI 直接返回 422）；出参用 OrderOut 约束返回字段，数据库里多出来的内部列不会漏出去。Service 拿到 ORM 对象后，用 OrderOut.model_validate(order) 转成对外结构。

## 十七、数据访问层（Repository）：把数据库操作收口

Repository 的职责是：所有和数据库打交道的逻辑都封在这一层，向上只提供按业务语义命名的方法，比如 repo.get_order(order_id)、repo.create(...)。业务层根本不知道数据存在哪张表、用的什么 ORM、SQL 长什么样。哪天想从 SQLAlchemy 换成原生驱动，或者加一层缓存，只改 Repository，业务层一行不动。

先准备数据库引擎和 session 工厂。session 是和数据库的一次会话，Repository 不自己 new 引擎，而是从外部接收一个 session，这样事务边界能由上层统一控制。

```python
# create_engine 创建数据库引擎，是 SQLAlchemy 的核心入口
# 引擎管理连接池、SQL 执行、事务等底层操作
from sqlalchemy import create_engine
# sessionmaker 创建 Session 工厂，Session 是与数据库的一次会话
# Session 提供 ORM 的增删改查接口
from sqlalchemy.orm import sessionmaker, Session
# 从配置模块读取 db_url，不硬编码数据库地址
from app.core.config import settings

# 创建引擎：settings.db_url 是数据库连接字符串
# 如 "postgresql://user:pass@localhost/mydb" 或 "sqlite:///app.db"
# 引擎创建后不会立即连接数据库，而是延迟到第一次使用时
engine = create_engine(settings.db_url)

# 创建 Session 工厂：bind=engine 绑定到引擎，autoflush=False 关闭自动 flush
# autoflush=False 的好处：不会在查询前自动 flush 未提交的变更
# 避免意外的脏写，显式控制 flush/commit 时机更安全
SessionLocal = sessionmaker(bind=engine, autoflush=False)

# 依赖注入工厂：每个请求一个新 session，用完关闭
# 使用 Python 生成器模式：yield session 给业务使用，finally 块保证 session 关闭
# 这是 FastAPI 推荐的 session 生命周期管理方式
def get_session() -> Session:
    # 从工厂创建一个新的 Session
    session = SessionLocal()
    try:
        # yield 暂停执行，将 session 交给 FastAPI 依赖注入系统
        # FastAPI 会将此 session 注入到路由函数的参数中
        yield session
    finally:
        # 请求结束后（无论成功或异常）都会执行 finally 块
        # 确保 session 被关闭，连接归还连接池，避免连接泄漏
        session.close()
```

```python
# Session 是 SQLAlchemy 的会话类型，用于类型注解
from sqlalchemy.orm import Session
# 导入 ORM 模型 Order（注意：这是 ORM 模型，不是领域对象）
from app.models.order import Order

# OrderRepository 是数据访问层的实现，封装所有数据库操作
# 设计原则：Repository 不写业务规则，只做"存取数据"的原子操作
# 事务边界由 Service 层控制（通过 commit 方法暴露给 Service）
class OrderRepository:
    # 构造函数接收外部注入的 Session，不自行创建
    # 好处：Service 可以在同一个 Session 中编排多个 Repository 操作
    def __init__(self, session: Session):
        self.session = session

    # get 方法：按主键查询单个订单
    # Session.get() 是 SQLAlchemy 2.x 推荐的主键查询方式
    # 返回 ORM 模型实例或 None（不存在时）
    def get(self, order_id: int) -> Order | None:
        return self.session.get(Order, order_id)

    # create 方法：创建新订单（不提交事务）
    # 注意：这里只 add 不 commit！commit 由 Service 统一控制
    # 这样 Service 可以在一个事务中编排多个写操作
    def create(self, user_id: int, amount: float) -> Order:
        order = Order(user_id=user_id, amount=amount)
        self.session.add(order)
        return order

    # commit 方法：提交当前事务
    # 由 Service 调用，因为 Service 知道哪些操作应该在同一个事务中
    # 设计意图：把事务控制权交给业务逻辑层，而不是每个 Repository 方法各自提交
    def commit(self) -> None:
        self.session.commit()
```

注意 Repository 里没有业务逻辑，只有"取数据""存数据"这类原子操作。它不关心金额是否合法、库存够不够——那是业务层的事。把查询和写入分开，也方便业务层在同一笔事务里编排多个 Repository 调用。

## 十八、业务逻辑层（Service）：事务与领域规则

Service 是系统的核心，所有业务规则、校验、事务边界、对下游的编排都在这层。它依赖 Repository 拿数据，但不碰 HTTP、不碰 SQL。把业务放这里而不是放路由里，有两个实在的好处：一是路由能保持极薄，只做协议转换；二是这段逻辑可以脱离 Web 单独跑单测，甚至被别的入口（比如定时任务、消息消费）复用。

```python
# 从数据访问层导入 OrderRepository，Service 通过它操作数据库
from app.repositories.order_repo import OrderRepository
# 从 schemas 层导入 Pydantic 模型，用于接收入参和构造出参
from app.schemas.order import OrderCreate, OrderOut
# Session 类型注解，Service 通过 Session 创建 Repository
from sqlalchemy.orm import Session

# OrderService 是业务逻辑层的核心类
# 它的职责：编排业务用例、管理事务边界、落实领域规则
# 注意：Service 不直接 import HTTP 相关模块，不拼 SQL，不碰 ORM session
class OrderService:
    # 构造函数接收 Session，内部创建 OrderRepository
    # 为什么不在 Service 中直接操作 Session？因为 Repository 封装了数据访问细节
    # 如果将来换数据库或加缓存，只改 Repository，Service 不需要动
    def __init__(self, session: Session):
        self.repo = OrderRepository(session)

    # create_order 是下单用例的编排入口
    # 接收 Pydantic 入参模型，返回 Pydantic 出参模型
    # 方法内部按顺序执行：校验 → 编排 → 事务提交 → 出参转换
    def create_order(self, data: OrderCreate) -> OrderOut:
        # 1. 业务校验：金额必须为正
        # 业务校验与格式校验的区别：格式校验由 Pydantic/FastAPI 在路由层完成
        # 业务校验是带业务语义的判断（如金额不能为负、不能超过上限）
        if data.amount <= 0:
            raise ValueError("amount must be positive")

        # 2. 业务校验：库存（真实场景调库存服务，这里简化为占位）
        # 库存检查可能涉及调用下游服务或查缓存，属于业务编排范畴
        if not self._has_stock(data.user_id, data.amount):
            raise ValueError("insufficient stock")

        # 3. 事务边界：下单动作在一个 session 提交内完成
        # repo.create() 只 add 不 commit，repo.commit() 统一提交
        # 这样如果后续再加扣积分、发消息等操作，都可以放进同一个事务
        order = self.repo.create(user_id=data.user_id, amount=data.amount)
        self.repo.commit()

        # 4. 转成对外结构返回
        # OrderOut.model_validate(order) 将 ORM 对象转为 Pydantic 出参模型
        # 这一步切断了 ORM 与 API 的耦合，返回的是纯数据结构
        return OrderOut.model_validate(order)

    # _has_stock 是私有方法（以 _ 开头），封装库存检查逻辑
    # 私有方法不对外暴露，只在 Service 内部使用
    # 真实项目中这里可能查缓存、调库存服务、或查数据库
    def _has_stock(self, user_id: int, amount: float) -> bool:
        # 真实项目里这里查库存服务或缓存，返回布尔
        return True
```

看这段代码，业务规则（金额校验、库存校验）、事务提交（repo.commit）、对外转换（OrderOut.model_validate）三件事都在 Service 里完成，而路由完全不需要知道这些。如果以后下单还要发消息、扣积分，也是在 Service 里继续编排，路由纹丝不动。

## 十九、接入层（API/Router）：只做协议转换

接入层唯一该干的事是：把 HTTP 请求解析成内部对象 → 调用 Service → 把 Service 结果组装成 HTTP 响应。它不该写业务规则，也不该直接操作数据库。FastAPI 里路由函数通过 Depends 拿到 Service 需要的 session，然后 new 一个 Service 把活交出去。

```python
# APIRouter 用于创建路由组，Depends 用于依赖注入
from fastapi import APIRouter, Depends
# Session 类型注解，FastAPI 会通过 Depends 注入 session 实例
from sqlalchemy.orm import Session
# get_session 是前面定义的 session 工厂生成器（生成器依赖）
# FastAPI 会自动调用它获取 session，并在请求结束后关闭
from app.core.db import get_session
# OrderService 业务逻辑层，路由通过它执行业务
from app.services.order_service import OrderService
# 入参和出参的 Pydantic 模型
from app.schemas.order import OrderCreate, OrderOut

# 创建路由组：prefix="/orders" 所有路由自动加上 /orders 前缀
# tags=["orders"] 用于 OpenAPI 文档分组显示
router = APIRouter(prefix="/orders", tags=["orders"])

# @router.post 声明 POST 接口，response_model 指定出参模型
# response_model=OrderOut 让 FastAPI 自动用 OrderOut 序列化响应
@router.post("", response_model=OrderOut)
def create_order(
    # data: OrderCreate 自动解析 JSON 请求体并校验类型
    data: OrderCreate,
    # session: Session = Depends(get_session) 通过依赖注入获取 session
    # FastAPI 会调用 get_session() 生成器，yield session 给这里使用
    # 请求结束后自动回到 get_session 的 finally 块关闭 session
    session: Session = Depends(get_session),
):
    # 只做协议转换：解析请求 → 调业务 → 返回响应
    # 路由层不写任何业务逻辑，不直接操作数据库
    # Service 在路由内部实例化，接收 session 完成数据库操作
    service = OrderService(session)
    return service.create_order(data)
```

路由里没有一行校验、没有一行 SQL。因为所有脏活都在 Service 和 Repository 里了。这种薄路由的好处是：接口契约（参数、返回结构）一眼能看全，协议相关的逻辑（状态码、响应格式）也集中在这里。

## 二十、入口装配（main.py）：把零件拼成应用

前面每一层都是独立零件，main.py 是总装线：创建 FastAPI 实例、挂上路由、初始化数据库、注册中间件和异常处理器。把装配集中在一处，应用从哪里启动、装了哪些组件一目了然。

```python
# FastAPI 主框架
from fastapi import FastAPI
# 从路由模块导入路由实例，并重命名为 orders_router 避免命名冲突
from app.api.orders import router as orders_router
# 从数据库模块导入 engine（用于建表）
from app.core.db import engine
# 从模型模块导入 Base，Base.metadata 包含所有 ORM 模型的表结构信息
from app.models.order import Base

# create_app 是应用工厂函数（Factory Pattern）
# 设计意图：不在模块顶层直接创建 app 实例并执行副作用
# 好处：测试时可以多次调用 create_app() 创建干净的实例，互不影响
# 如果在模块顶层直接执行建表等操作，import 模块就会触发副作用，测试困难
def create_app() -> FastAPI:
    # 创建 FastAPI 实例，title 会显示在 OpenAPI 文档页面
    app = FastAPI(title="order-service")
    # include_router 将路由组挂载到主应用
    # 可以多次调用，将不同模块的路由组织在一起
    app.include_router(orders_router)
    # Base.metadata.create_all(engine) 根据 ORM 模型自动建表
    # 注意：这只适合开发/测试环境，生产环境应使用 Alembic 等迁移工具
    # create_all 只会创建不存在的表，不会修改已有表的结构
    Base.metadata.create_all(engine)
    return app

# 给 uvicorn/gunicorn 用的入口：app.main:app
# 这一行是模块级别的变量，ASGI 服务器会 import 它
app = create_app()
```

用 create_app() 工厂函数而不是直接在模块顶层写一堆副作用，是为了可测试：测试时能多次创建干净的应用实例，不会因为模块导入就触发建表等全局副作用。生产部署时用 uvicorn app.main:app 启动，gunicorn 加 uvicorn worker 做多进程并发（呼应前面讲的 GIL 与并发模型）。

## 二十一、横切关注点的代码化：异常、中间件、鉴权

日志、鉴权、统一异常处理这些事横穿所有请求，不该散落在每个路由里。工程做法是用框架的机制集中处理：异常用全局异常处理器，链路追踪用中间件，鉴权用依赖注入。这样业务代码里完全不出现这些噪音。

## 统一异常处理

Service 抛出的业务错误（比如 ValueError）如果直接冒泡，FastAPI 会返回 500。注册一个异常处理器，把它转成统一结构的 4xx 响应，前端也好解析。

```python
# Request 是 FastAPI 的请求对象类型，用于异常处理器的参数类型注解
from fastapi import Request
# JSONResponse 用于构造 JSON 格式的 HTTP 响应
from fastapi.responses import JSONResponse

# @app.exception_handler 注册全局异常处理器
# 捕获指定类型的异常（这里是 ValueError），将其转换为统一的 JSON 响应
# 这样业务代码 raise ValueError 不会变成默认的 500 HTML 错误页
# 注意：这里的 app 必须是已创建的 FastAPI 实例，所以这段代码应该在 create_app 之后执行
@app.exception_handler(ValueError)
async def handle_value_error(request: Request, exc: ValueError):
    # 返回 400 状态码（表示客户端请求有误）和统一格式的错误信息
    # exc 是被捕获的异常实例，str(exc) 即业务代码传入的错误消息
    return JSONResponse(
        status_code=400,
        content={"error": str(exc)},
    )
```

## 链路 ID 中间件

每个请求生成一个 trace_id，贯穿整条调用链，写日志时带上它，出问题时能把一次请求的所有日志串起来。中间件在请求前后插一脚，对业务代码零侵入。

```python
# uuid 用于生成唯一 trace_id
import uuid
# BaseHTTPMiddleware 是 Starlette 中间件基类
# 继承它可以自定义请求前后的拦截逻辑
from starlette.middleware.base import BaseHTTPMiddleware

# TraceMiddleware 是链路追踪中间件
# 职责：为每个请求分配 trace_id，透传在 request.state 和响应 header 中
# 设计意图：对业务代码零侵入，业务代码不需要感知 trace_id 的存在
# 但日志、下游服务调用都可以从中取到同一个 trace_id，串起整条链路
class TraceMiddleware(BaseHTTPMiddleware):
    # dispatch 是中间件的入口方法，必须是 async def
    # request 是 ASGI 的请求对象，call_next 是下一个处理链
    async def dispatch(self, request, call_next):
        # 优先从请求 header 获取上游传来的 X-Trace-Id
        # 如果上游（如网关）已分配 trace_id，就沿用它，保证全链路 ID 一致
        # 如果没有，则生成新的 uuid.hex（32 位无短横线格式，更紧凑）
        trace_id = request.headers.get("X-Trace-Id") or uuid.uuid4().hex
        # 将 trace_id 存入 request.state，后续中间件/路由/服务层都可以取到
        # request.state 是 Starlette 提供的请求级状态存储，生命周期与请求一致
        request.state.trace_id = trace_id
        # call_next(request) 执行后续的中间件和路由处理
        # await 等待响应返回后，再将 trace_id 写入响应 header
        response = await call_next(request)
        # 将 trace_id 写入响应 header，前端或下游服务可以读取
        # 即使出错，trace_id 也会出现在响应中，方便排查
        response.headers["X-Trace-Id"] = trace_id
        return response
```

## 鉴权依赖

鉴权也做成依赖，路由声明要 current_user 就自动先走鉴权，拿不到合法 token 直接 401，业务代码里完全不用管"谁登录了"。

```python
# Depends 用于声明依赖注入，Header 用于从 HTTP header 提取参数
# HTTPException 用于返回 HTTP 错误响应（如 401）
from fastapi import Depends, Header, HTTPException

# get_current_user 是鉴权依赖函数
# 路由声明 current_user = Depends(get_current_user) 后
# FastAPI 在执行路由前自动调用此函数，完成 token 校验
# 如果校验失败，直接返回 401，路由函数不会执行
async def get_current_user(authorization: str = Header(None)) -> dict:
    # Header(None) 从请求的 Authorization header 取值，默认 None
    # 如果没带 Authorization header，值为 None
    if not authorization:
        # 401 表示未认证，detail 是错误描述
        raise HTTPException(status_code=401, detail="missing token")
    # 真实场景用 jwt 解码并校验签名、过期时间
    # 这里简化为非空校验，只演示鉴权依赖的架构思路
    # 真实项目应使用 jose.jwt.decode() 完整校验 JWT
    return {"user": authorization}
```

把这三件事从业务里抽出来后，路由函数签名上加个 Depends(get_current_user) 就能要登录态，加个中间件就能有全链路 trace_id，业务代码保持干净。这就是"横切关注点"在工程上的具体落地。

## 二十二、依赖注入与可测试性

前面反复用 Depends(get_session) 把 session 注入到路由。依赖注入不只是少写几行代码，它真正解决的是可测试性。因为 session 是从外部"注入"的，测试时就能把它替换成指向测试库的 session，业务代码一行不改，单测就能跑起来、还能不污染生产数据。

```python
# TestClient 是 FastAPI/Starlette 提供的测试客户端
# 它模拟 HTTP 请求，不需要真正启动 ASGI 服务器
from fastapi.testclient import TestClient
# 导入已创建的 app 实例
from app.main import app
# 从数据库模块导入 SessionLocal（测试用的 session 工厂）和 get_session（生产用的依赖）
from app.core.db import SessionLocal, get_session

def test_create_order():
    # 覆盖 get_session 依赖，指向测试库
    # dependency_overrides 是 FastAPI 的依赖覆盖机制
    # 当路由请求 get_session 时，FastAPI 会用 fake_session 替代原实现
    # 这使得测试可以指向独立的测试数据库，不污染生产数据
    def fake_session():
        # SessionLocal 默认连配置中的 db_url，测试环境应配置为 SQLite 内存库
        # 真实项目中测试配置应指向独立的测试数据库
        session = SessionLocal()   # 接测试库，而非生产库
        try:
            yield session
        finally:
            session.close()

    # 将 get_session 的依赖替换为 fake_session
    # 这样整个请求链（路由→Service→Repository）都用测试库的 session
    app.dependency_overrides[get_session] = fake_session
    # 创建测试客户端，模拟 HTTP 请求
    client = TestClient(app)
    # 发送 POST 请求到 /orders，用 JSON 作为请求体
    resp = client.post("/orders", json={"user_id": 1, "amount": 9.9})
    # 断言响应状态码为 200（请求成功）
    assert resp.status_code == 200
    # 断言响应体中的金额字段
    assert resp.json()["amount"] == 9.9
    # 清理依赖覆盖，避免影响后续测试
    # 实际项目中建议用 pytest 的 fixture 自动处理
    app.dependency_overrides.clear()
```

这里用 TestClient 直接打整个 HTTP 栈，但 session 被换成了测试库的，所以既测了端到端流程，又不碰生产数据。也可以更单元化：直接 new OrderService(test_session) 测业务逻辑，完全不碰 HTTP。两种粒度都能写，前提是依赖是注入进来的，而不是在代码里硬 new。

## 二十三、工程化收尾：打包、容器化、12-factor

代码写完好跑之后，还要能稳定地交付和部署。三个工程化收尾动作：

第一，依赖声明进 pyproject.toml 或 requirements.txt，用虚拟环境隔离，别把包装到系统 Python 里，避免不同项目互相污染。

第二，容器化。把应用和依赖打包成镜像，环境一致、随处可跑，配合前面的 gunicorn 加 nginx 反代就能水平扩容。

```dockerfile
FROM python:3.12-slim AS build
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

FROM python:3.12-slim
WORKDIR /app
COPY --from=build /app /app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

第三，遵循 12-factor 原则，最关键的几条：配置走环境变量（而不是写死在代码里）、把后端服务（数据库、缓存、队列）当成可附加的资源、把构建/发布/运行三阶段分开、把日志当事件流打到标准输出由平台收集。前面用 pydantic-settings 读 APP\_ 前缀的环境变量，已经在走 12-factor 的路子了。

## 二十四、面试高频考点清单（工程代码架构篇）

- 依赖方向规则：代码依赖只能向内，接入层依赖业务层、业务层依赖数据访问层，反过来禁止；好处是换框架或换数据库只动局部。
- 为什么分层 / 三层架构职责：接入层做协议转换、业务层管规则和事务、数据访问层收口 DB 操作；各层可独立替换和测试。
- Repository 模式解决了什么：把 SQL 和数据库细节从业务里剥离，业务层只调语义化方法，换存储只改 Repository。
- 为什么把 models 和 schemas 分开：models 是数据库映射、schemas 是 API 出入参；混在一起会把内部字段泄露成响应，且表结构一改接口就抖。
- 事务边界放哪：事务由业务逻辑层（Service）控制，Repository 只做原子读写，不在路由里开事务。
- 依赖注入的作用：通过 Depends 把 session、配置、鉴权从外部注入，业务代码不硬 new 依赖，从而能单独写单测、能替换实现。
- 统一异常处理与中间件：业务错误转成统一结构的响应、trace_id 用中间件贯穿全链路、鉴权做成依赖，都不污染业务代码。
- 配置管理 12-factor：配置走环境变量、不写死代码、.env 不进版本库，用带类型的 Settings 集中管理。
- 为什么用 create_app 工厂而不是顶层副作用：测试能多次创建干净实例，避免导入模块就触发建表等全局副作用。
- 容器化与水平扩容：应用加依赖打包成镜像，配合 gunicorn 多进程加 nginx 反代实现水平扩容。

到这里，后端架构深度解析的 Python 篇就完整了：前面十二章讲清"每一层在解决什么、怎么选、踩什么坑"，这一 Part 把那些分层落成真实目录和能跑的代码。下一篇（Go 篇）可以用同一套分层思想对照着看——只是 Go 没有 GIL、用 goroutine 而非 asyncio，框架换成 Gin/echo，依赖注入和 Repository 的写法也会带上 Go 自己的味道。

<details class="marginalia" open>
  <summary></summary>
  <div class="marginalia-body">
    这是「后端架构深度解析」系列的第一篇（Python 篇）。Go 篇和 TypeScript 篇会用同一套分层骨架对照写：Go 没有 GIL、用 goroutine、Gin/echo 取代 FastAPI；TS 端走 NestJS 那一套。三篇共用一个标签 <code>后端架构深度解析</code>，方便横向对照。
  </div>
</details>

