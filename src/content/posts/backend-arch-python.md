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
from dataclasses import dataclass
from typing import Optional


@dataclass
class Order:
    id: Optional[int] = None
    user_id: int = 0
    amount: float = 0.0
    status: str = "created"


class OrderService:
    def __init__(self, repo):
        # 通过构造函数注入 Repository，不直接 import db，方便单测替换
        self.repo = repo

    def create_order(self, user_id: int, amount: float) -> Order:
        # ---- 业务校验：规则集中在这里，不散落在 handler 里 ----
        if amount <= 0:
            raise ValueError("金额必须大于零")
        if amount > 100_000:
            raise ValueError("单笔订单上限 100000")

        # ---- 编排用例：调用 DAL 取数据、写数据 ----
        user = self.repo.get_user(user_id)
        if user is None:
            raise ValueError("用户不存在")

        # 创建订单（事务边界在这里：repo 的写操作在 service 控制下成组提交）
        order = Order(user_id=user_id, amount=amount)
        saved = self.repo.create(order)

        # ---- 落实领域规则：新用户首单打九折 ----
        if user.is_new:
            saved.amount = round(saved.amount * 0.9, 2)
            self.repo.update(saved)

        return saved
```

而"薄路由"只做协议转换，把校验、规则都交给 service：

```python
from fastapi import APIRouter, Depends
from .order_service import OrderService
from .schemas import CreateOrderReq

router = APIRouter()


@router.post("/orders")
def create_order(body: CreateOrderReq, svc: OrderService = Depends()):
    # 这里没有 if 校验、没有 try/except、没有 SQL，只有一次调用
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
from sqlalchemy.orm import Session
from sqlalchemy import text

from sqlalchemy import Column, Integer, Float, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class OrderModel(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    status = Column(String(20), default="created")


class OrderRepository:
    def __init__(self, session: Session):
        # session 由外部创建和管理，自己不在内部 new 一个，方便单测替换
        self.db = session

    def get_user(self, user_id: int):
        """按 ID 查用户，返回 dict 或 None"""
        result = self.db.execute(
            text("SELECT id, is_new FROM users WHERE id = :uid"),
            {"uid": user_id},
        ).fetchone()
        if result is None:
            return None
        return {"id": result[0], "is_new": bool(result[1])}

    def create(self, order) -> "Order":
        """写入数据库，返回带自增 ID 的对象"""
        model = OrderModel(
            user_id=order.user_id,
            amount=order.amount,
            status=order.status,
        )
        self.db.add(model)
        self.db.commit()
        self.db.refresh(model)
        # 把 ORM 模型转回领域对象，不让 ORM 泄漏到上层
        order.id = model.id
        return order

    def update(self, order):
        """更新已有记录"""
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
import time
import uuid
import logging
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("order_service")


# ---- 1. 请求日志中间件：自动记录耗时和 trace id ----
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        trace_id = str(uuid.uuid4())[:8]
        request.state.trace_id = trace_id

        start = time.perf_counter()
        response = await call_next(request)
        duration = (time.perf_counter() - start) * 1000

        logger.info(
            "[%s] %s %s %d %.1fms",
            trace_id, request.method, request.url.path,
            response.status_code, duration,
        )
        response.headers["X-Trace-ID"] = trace_id
        return response


# ---- 2. 统一异常处理：不同错误类型对应不同状态码 ----
class BizError(Exception):
    def __init__(self, msg: str, status_code: int = 400):
        self.msg = msg
        self.status_code = status_code


async def biz_error_handler(request: Request, exc: BizError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.msg},
    )


# ---- 3. JWT 鉴权依赖：挂在需要登录的路由上即可 ----
from fastapi import Depends, HTTPException
from jose import jwt, JWTError


async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "未提供认证信息")
    token = auth[7:]
    try:
        payload = jwt.decode(token, "your-secret", algorithms=["HS256"])
        return {"user_id": payload["sub"]}
    except JWTError:
        raise HTTPException(401, "token 无效或已过期")
```

使用方式是在应用装配时挂上去，业务 handler 一行都不用写：

```python
from fastapi import FastAPI
from middleware import LoggingMiddleware, biz_error_handler, BizError, get_current_user

app = FastAPI()

# 全局中间件：每个请求都经过
app.add_middleware(LoggingMiddleware)
# 全局异常处理器：BizError 不再变成 500
app.add_exception_handler(BizError, biz_error_handler)


@app.post("/orders", dependencies=[Depends(get_current_user)])
def create_order(body: dict, current_user: dict = Depends(get_current_user)):
    # 这里完全不需要检查 token、不需要记录日志、不需要 try/except 包裹
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
users = session.query(User).all()
for u in users:
    print(u.orders)   # 每访问一次就打一次查 orders 的 SQL

# 正例：一次 JOIN 把关联数据取回来
from sqlalchemy.orm import joinedload
users = session.query(User).options(joinedload(User.orders)).all()
for u in users:
    print(u.orders)   # 不再额外打 SQL
```

## 连接池

建立数据库连接很贵（TCP 握手、鉴权、事务初始化）。每次请求都新建连接会拖垮数据库。连接池预先建好一批连接放在池子里，请求来了借一个、用完还回去复用。常用参数 pool_size（常驻连接数）和 max_overflow（高峰额外连接数）。

## 读写分离与主从延迟

主库负责写（INSERT/UPDATE/DELETE），从库负责读（SELECT），主从复制把写同步到从库，读压力分摊到多个从库。要注意主从延迟：刚写入的数据在从库可能还没同步到，读会拿到旧值。像刚下单立刻查订单这种关键读，要走主库或做一致性处理，不能用从库。

## 八、缓存架构：Redis 的角色与三个经典坑

缓存把热点数据放内存（Redis），读起来比查库快几个数量级。最常用的是旁路缓存（Cache-Aside）：读的时候先查缓存，命中直接返回；没命中才查库，并把结果写回缓存再返回。写的时候先更新数据库，再删除缓存（注意顺序，先删缓存再更库会有并发不一致风险）。

```python
import redis, json

cache = redis.Redis()

def get_user(user_id):
    key = f"user:{user_id}"
    data = cache.get(key)
    if data:                        # 命中缓存
        return json.loads(data)
    row = db.query_user(user_id)    # 未命中，查库
    cache.setex(key, 300, json.dumps(row))  # 回填，300 秒过期
    return row

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
from celery import Celery
app = Celery("demo", broker="redis://localhost:6379/0")

@app.task
def send_welcome_email(user_id: int):
    # 这里是耗时的邮件发送逻辑
    ...

# 在 Web 视图里只投任务，不等它跑完
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
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # env_file 指 .env；env_prefix 让变量以 APP_ 开头，避免和别的冲突
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_", extra="ignore")

    app_name: str = "order-service"
    db_url: str = "sqlite:///./app.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me"
    debug: bool = False

# 全局单例，别处直接 from app.core.config import settings
settings = Settings()
```

这样在代码里引用配置就是 settings.db_url，而不是散落的字符串。开发、测试、生产三套环境给不同的 .env 即可，代码一行不改。注意 .env 含有密钥，必须进 .gitignore，绝不可提交到版本库。

## 十六、数据模型层与序列化层分离

新手常犯的一个错是：让 API 直接返回数据库模型对象，或者让数据库模型同时承担出入参校验。这两件事职责不同，混在一起会有两个后果：一是内部字段（比如密码哈希、内部状态机字段）被不小心序列化成响应返回出去；二是数据库表结构一改，API 契约跟着抖。

所以工程上分两层。models 是数据库表的映射，描述"数据怎么存"；schemas 是 API 的出入参模型，描述"接口长什么样"。两者通过显式转换连接，互不直接耦合。

```python
from datetime import datetime
from sqlalchemy import String, Float, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(index=True)
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="created")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

```python
from datetime import datetime
from pydantic import BaseModel

# 入参：客户端传什么
class OrderCreate(BaseModel):
    user_id: int
    amount: float

# 出参：服务端返回什么（from_attributes 允许从 ORM 对象填充）
class OrderOut(BaseModel):
    id: int
    user_id: int
    amount: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

入参用 OrderCreate 做请求体校验（amount 必须是 float、user_id 必须是整数，类型不对 FastAPI 直接返回 422）；出参用 OrderOut 约束返回字段，数据库里多出来的内部列不会漏出去。Service 拿到 ORM 对象后，用 OrderOut.model_validate(order) 转成对外结构。

## 十七、数据访问层（Repository）：把数据库操作收口

Repository 的职责是：所有和数据库打交道的逻辑都封在这一层，向上只提供按业务语义命名的方法，比如 repo.get_order(order_id)、repo.create(...)。业务层根本不知道数据存在哪张表、用的什么 ORM、SQL 长什么样。哪天想从 SQLAlchemy 换成原生驱动，或者加一层缓存，只改 Repository，业务层一行不动。

先准备数据库引擎和 session 工厂。session 是和数据库的一次会话，Repository 不自己 new 引擎，而是从外部接收一个 session，这样事务边界能由上层统一控制。

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

engine = create_engine(settings.db_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False)

# 依赖注入工厂：每个请求一个新 session，用完关闭
def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

```python
from sqlalchemy.orm import Session
from app.models.order import Order

class OrderRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, order_id: int) -> Order | None:
        return self.session.get(Order, order_id)

    def create(self, user_id: int, amount: float) -> Order:
        order = Order(user_id=user_id, amount=amount)
        self.session.add(order)
        return order

    def commit(self) -> None:
        self.session.commit()
```

注意 Repository 里没有业务逻辑，只有"取数据""存数据"这类原子操作。它不关心金额是否合法、库存够不够——那是业务层的事。把查询和写入分开，也方便业务层在同一笔事务里编排多个 Repository 调用。

## 十八、业务逻辑层（Service）：事务与领域规则

Service 是系统的核心，所有业务规则、校验、事务边界、对下游的编排都在这层。它依赖 Repository 拿数据，但不碰 HTTP、不碰 SQL。把业务放这里而不是放路由里，有两个实在的好处：一是路由能保持极薄，只做协议转换；二是这段逻辑可以脱离 Web 单独跑单测，甚至被别的入口（比如定时任务、消息消费）复用。

```python
from app.repositories.order_repo import OrderRepository
from app.schemas.order import OrderCreate, OrderOut
from sqlalchemy.orm import Session

class OrderService:
    def __init__(self, session: Session):
        self.repo = OrderRepository(session)

    def create_order(self, data: OrderCreate) -> OrderOut:
        # 1. 业务校验：金额必须为正
        if data.amount <= 0:
            raise ValueError("amount must be positive")

        # 2. 业务校验：库存（真实场景调库存服务，这里简化为占位）
        if not self._has_stock(data.user_id, data.amount):
            raise ValueError("insufficient stock")

        # 3. 事务边界：下单动作在一个 session 提交内完成
        order = self.repo.create(user_id=data.user_id, amount=data.amount)
        self.repo.commit()

        # 4. 转成对外结构返回
        return OrderOut.model_validate(order)

    def _has_stock(self, user_id: int, amount: float) -> bool:
        # 真实项目里这里查库存服务或缓存，返回布尔
        return True
```

看这段代码，业务规则（金额校验、库存校验）、事务提交（repo.commit）、对外转换（OrderOut.model_validate）三件事都在 Service 里完成，而路由完全不需要知道这些。如果以后下单还要发消息、扣积分，也是在 Service 里继续编排，路由纹丝不动。

## 十九、接入层（API/Router）：只做协议转换

接入层唯一该干的事是：把 HTTP 请求解析成内部对象 → 调用 Service → 把 Service 结果组装成 HTTP 响应。它不该写业务规则，也不该直接操作数据库。FastAPI 里路由函数通过 Depends 拿到 Service 需要的 session，然后 new 一个 Service 把活交出去。

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.db import get_session
from app.services.order_service import OrderService
from app.schemas.order import OrderCreate, OrderOut

router = APIRouter(prefix="/orders", tags=["orders"])

@router.post("", response_model=OrderOut)
def create_order(
    data: OrderCreate,
    session: Session = Depends(get_session),
):
    # 只做协议转换：解析请求 → 调业务 → 返回响应
    service = OrderService(session)
    return service.create_order(data)
```

路由里没有一行校验、没有一行 SQL。因为所有脏活都在 Service 和 Repository 里了。这种薄路由的好处是：接口契约（参数、返回结构）一眼能看全，协议相关的逻辑（状态码、响应格式）也集中在这里。

## 二十、入口装配（main.py）：把零件拼成应用

前面每一层都是独立零件，main.py 是总装线：创建 FastAPI 实例、挂上路由、初始化数据库、注册中间件和异常处理器。把装配集中在一处，应用从哪里启动、装了哪些组件一目了然。

```python
from fastapi import FastAPI
from app.api.orders import router as orders_router
from app.core.db import engine
from app.models.order import Base

def create_app() -> FastAPI:
    app = FastAPI(title="order-service")
    # 挂路由
    app.include_router(orders_router)
    # 建表（生产环境用 Alembic migration 替代）
    Base.metadata.create_all(engine)
    return app

# 给 uvicorn 用的入口：app.main:app
app = create_app()
```

用 create_app() 工厂函数而不是直接在模块顶层写一堆副作用，是为了可测试：测试时能多次创建干净的应用实例，不会因为模块导入就触发建表等全局副作用。生产部署时用 uvicorn app.main:app 启动，gunicorn 加 uvicorn worker 做多进程并发（呼应前面讲的 GIL 与并发模型）。

## 二十一、横切关注点的代码化：异常、中间件、鉴权

日志、鉴权、统一异常处理这些事横穿所有请求，不该散落在每个路由里。工程做法是用框架的机制集中处理：异常用全局异常处理器，链路追踪用中间件，鉴权用依赖注入。这样业务代码里完全不出现这些噪音。

## 统一异常处理

Service 抛出的业务错误（比如 ValueError）如果直接冒泡，FastAPI 会返回 500。注册一个异常处理器，把它转成统一结构的 4xx 响应，前端也好解析。

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(ValueError)
async def handle_value_error(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"error": str(exc)},
    )
```

## 链路 ID 中间件

每个请求生成一个 trace_id，贯穿整条调用链，写日志时带上它，出问题时能把一次请求的所有日志串起来。中间件在请求前后插一脚，对业务代码零侵入。

```python
import uuid
from starlette.middleware.base import BaseHTTPMiddleware

class TraceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        trace_id = request.headers.get("X-Trace-Id") or uuid.uuid4().hex
        request.state.trace_id = trace_id
        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        return response
```

## 鉴权依赖

鉴权也做成依赖，路由声明要 current_user 就自动先走鉴权，拿不到合法 token 直接 401，业务代码里完全不用管"谁登录了"。

```python
from fastapi import Depends, Header, HTTPException

async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="missing token")
    # 真实场景用 jwt 解码并校验签名，这里简化为非空校验
    return {"user": authorization}
```

把这三件事从业务里抽出来后，路由函数签名上加个 Depends(get_current_user) 就能要登录态，加个中间件就能有全链路 trace_id，业务代码保持干净。这就是"横切关注点"在工程上的具体落地。

## 二十二、依赖注入与可测试性

前面反复用 Depends(get_session) 把 session 注入到路由。依赖注入不只是少写几行代码，它真正解决的是可测试性。因为 session 是从外部"注入"的，测试时就能把它替换成指向测试库的 session，业务代码一行不改，单测就能跑起来、还能不污染生产数据。

```python
from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal, get_session

def test_create_order():
    # 覆盖 get_session 依赖，指向测试库
    def fake_session():
        session = SessionLocal()   # 接测试库，而非生产库
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_session] = fake_session
    client = TestClient(app)
    resp = client.post("/orders", json={"user_id": 1, "amount": 9.9})
    assert resp.status_code == 200
    assert resp.json()["amount"] == 9.9
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

