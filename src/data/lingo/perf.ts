import type { LingoTerm } from "./types";

/** 高性能后端实战 domain pack (Go / Python dual-track series). */
export const PERF_LINGO: LingoTerm[] = [
  {
    id: "latency",
    title: "Latency",
    subtitle: "延迟",
    definition:
      "单个请求从发出到收到完整响应的耗时，通常看往返时间（round-trip）。它衡量的是单个用户体验到的速度，而不是系统整体能扛多少量。\n\n在软件系统里，只报平均值或中位数容易被少数极慢请求带偏；工程上更常盯高百分位（如 P99），把长尾暴露出来。",
    aliases: ["Latency", "latency", "延迟"],
    source: {
      label: "Wikipedia: Latency (engineering)",
      url: "https://en.wikipedia.org/wiki/Latency_(engineering)",
    },
  },
  {
    id: "throughput",
    title: "Throughput",
    subtitle: "吞吐量",
    definition:
      "单位时间内系统成功处理的请求或事务数量。读场景常用 QPS，写场景常用 TPS。它回答的是“系统能扛多少”，不是“单个用户要等多久”。\n\n吞吐和延迟常相互牵制：批处理一类手段可以抬高吞吐，却往往拉高单请求等待时间。谈性能时两个维度要一起看。",
    aliases: ["Throughput", "throughput", "吞吐量", "吞吐"],
    source: {
      label: "Wikipedia: Throughput",
      url: "https://en.wikipedia.org/wiki/Throughput",
    },
  },
  {
    id: "qps",
    title: "QPS",
    subtitle: "Queries Per Second",
    definition:
      "每秒查询数，用来度量读链路在单位时间内成功处理了多少查询请求。缓存命中率高时，QPS 往往可以堆得很高。\n\n它和 TPS 业务语义不同：QPS 偏查询，TPS 偏完整写事务。面试或压测报告里把二者混称，容易掩盖读写天花板的差异。",
    aliases: ["QPS", "Queries Per Second"],
  },
  {
    id: "tps",
    title: "TPS",
    subtitle: "Transactions Per Second",
    definition:
      "每秒事务数，用来度量写链路在单位时间内完成了多少完整业务事务。一个 TPS 往往包含多步内部操作，例如下单里的查库存、建单、扣款、发消息。\n\n写事务受数据库事务、锁和一致性约束拖累，天花板通常低于可缓存的读 QPS。",
    aliases: ["TPS", "Transactions Per Second"],
  },
  {
    id: "percentile",
    title: "Percentile",
    subtitle: "百分位 · P50 / P95 / P99",
    definition:
      "把一段时间内的响应时间从小到大排序后，取排在某一比例位置上的值。P50 是中位数；P95 / P99 描述绝大多数请求的上限；P999 盯极端长尾。\n\n例如 P99 = 100ms 表示 99% 的请求在 100ms 内完成，只有 1% 更慢。高百分位常用来刻画 tail latency，避免平均值把长尾藏起来。",
    aliases: [
      "Percentile",
      "percentile",
      "百分位",
      "P50",
      "P95",
      "P99",
      "P999",
      "P99.9",
    ],
    source: {
      label: "Wikipedia: Tail latency",
      url: "https://en.wikipedia.org/wiki/Tail_latency",
    },
  },
  {
    id: "tail-latency",
    title: "Tail latency",
    subtitle: "长尾延迟",
    definition:
      "分布中高百分位（常见 P95 / P99 / P99.9）对应的那截慢请求。平均延迟下降，并不保证长尾也跟着下降。\n\n分布式系统里，一次用户操作常会扇出到多台机器；任意一跳变慢，整次体验就变慢。所以长尾往往比平均值更能决定真实体验。",
    aliases: ["Tail latency", "tail latency", "长尾", "长尾延迟", "长尾请求"],
    source: {
      label: "Wikipedia: Tail latency",
      url: "https://en.wikipedia.org/wiki/Tail_latency",
    },
  },
  {
    id: "concurrency",
    title: "Concurrency",
    subtitle: "并发度",
    definition:
      "同一时刻系统正在服务的业务会话数，也就是“同时有多少请求在被处理”。它不等于线程数，也不等于 goroutine / 协程数。\n\n压测工具里的并发数通常指施压侧线程或连接数；线上监控里的并发更接近活跃业务会话。两者不能直接划等号。",
    aliases: ["Concurrency", "concurrency", "并发度", "并发"],
  },
  {
    id: "error-rate",
    title: "Error rate",
    subtitle: "错误率",
    definition:
      "失败请求占总请求的比例。它必须和延迟、吞吐放在一起看：QPS 很高但错误率不低，系统对用户来说仍不可用。\n\n工程上常把可重试的 5xx 与不可重试的 4xx 分开看。金钱链路对错误率更敏感，非金钱链路的红线通常宽松一些。",
    aliases: ["Error Rate", "Error rate", "error rate", "错误率"],
  },
  {
    id: "sla",
    title: "SLA",
    subtitle: "Service-level agreement",
    definition:
      "服务水平协议：服务提供方与使用方之间，关于可用性、延迟、错误率等可验收指标的约定。没有可量化指标，就很难谈“优化后更快了”是否达标。\n\n线上常见做法是把 SLA 拆成可监控的 SLO，再用告警和容量规划去守住。",
    aliases: ["SLA", "sla"],
    source: {
      label: "Wikipedia: Service-level agreement",
      url: "https://en.wikipedia.org/wiki/Service-level_agreement",
    },
  },
  {
    id: "batching",
    title: "Batching",
    subtitle: "批处理",
    definition:
      "把多笔请求攒成一批再执行，用一次 IO 或一次调度摊掉固定开销。吞吐往往会升，但单笔请求要等批次凑齐，延迟也可能升。\n\n它是吞吐与延迟相互牵制的典型例子：优化其中一个，常常会伤害另一个。",
    aliases: ["Batching", "batching", "批处理", "攒批"],
  },
  {
    id: "microbenchmark",
    title: "Microbenchmark",
    subtitle: "微基准",
    definition:
      "针对很小一段代码路径做的计时测量，例如 Go 的 testing.B 或 Python 的 timeit。适合比较局部实现差异，不能单独代表端到端接口表现。\n\n常见陷阱包括：被编译器优化掉、机器频率波动、GC 插入、以及 JIT 暖机数据没剔除。微基准之外，还要用端到端压测建立可对比基线。",
    aliases: ["Microbenchmark", "microbenchmark", "微基准", "基准测试"],
  },
  {
    id: "wrk",
    title: "wrk",
    subtitle: "HTTP 压测工具",
    definition:
      "常用的 HTTP 端到端压测工具。可指定线程数、并发连接数和持续时间，输出延迟分布与每秒请求数等指标。\n\n微基准看单点，wrk 一类工具看整条接口路径。更完整的基准体系还会配合指标采集与看板，而不是只跑一次报个数。",
    aliases: ["wrk"],
  },
  {
    id: "garbage-collection",
    title: "Garbage collection",
    subtitle: "GC · 垃圾回收",
    definition:
      "自动内存管理里回收不再使用的对象的过程。Go、Java 等运行时会在程序执行中穿插 GC；基准测试中途若触发 GC，某次迭代可能突然变慢。\n\n跑微基准时常用多次重复（如 Go 的 -count）平滑结果，并避免把单次毛刺当成结论。",
    aliases: ["Garbage collection", "garbage collection", "GC", "垃圾回收"],
    source: {
      label: "Wikipedia: Garbage collection",
      url: "https://en.wikipedia.org/wiki/Garbage_collection_(computer_science)",
    },
  },
  {
    id: "jit",
    title: "JIT",
    subtitle: "Just-in-time compilation",
    definition:
      "运行时把热点代码编译成本地机器码的技术。Java 等 JIT 语言在刚启动的前几秒常仍在编译热点，这时测到的数字不能代表稳态性能。\n\n压测或基准前通常要暖机，并丢掉暖机阶段的数据，再采信后续结果。",
    aliases: ["JIT", "Just-in-time", "即时编译"],
    source: {
      label: "Wikipedia: Just-in-time compilation",
      url: "https://en.wikipedia.org/wiki/Just-in-time_compilation",
    },
  },
  {
    id: "soak-test",
    title: "Soak test",
    subtitle: "SOAK · 长时间压测",
    definition:
      "在代表性负载下持续跑很长时间，观察内存、句柄、连接等是否缓慢泄漏或退化。短时压测可能看不出这类问题。\n\n金融等对稳定性要求高的场景，常会跑数小时到一天量级的 soak，而不只看峰值 QPS。",
    aliases: ["Soak", "SOAK", "soak", "Soak test", "长时间压测"],
  },
  {
    id: "headroom",
    title: "Headroom",
    subtitle: "容量余量",
    definition:
      "系统在峰值负载之上还留出的可用容量比例。核心链路通常要求一定 headroom，避免流量稍有波动就贴着资源天花板抖动。\n\n余量不足时，延迟长尾和错误率往往会先于“平均 CPU 看起来还行”暴露出来。",
    aliases: ["Headroom", "headroom", "容量余量"],
  },
];
