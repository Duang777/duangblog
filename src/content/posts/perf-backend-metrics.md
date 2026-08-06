---
author: Duang
pubDatetime: 2026-08-06T16:45:00+08:00
title: 高性能后端实战（一）：什么是高性能，怎么度量它
featured: true
draft: false
tags:
  - 高性能后端实战
description: 把"快"拆成延迟、吞吐、并发、错误率和资源利用率，并用 Go / Python 微基准亲手量一次。
---

**系列说明**｜这是 [高性能后端实战](/posts/perf-backend/) 十四篇里的第一篇。文中同一思路的示例用 **Python / Go** 对照，代码块顶部可切换，默认 Python。

<aside class="series-nav-card" aria-label="系列总览导航">

> **系列总览导航**
>
> - 系列：高性能后端实战专题（共 14 篇，Go + Python 双示例对照）
> - 上一篇：无（本系列开篇）
> - 本篇：① 什么是高性能，怎么度量它
> - 下一篇：② CPU 缓存与内存层级

</aside>

duang：这是整个系列的开篇。一条主线：先解决"怎么才算快、怎么度量"，再往底层打（CPU 缓存、内存、并发、IO），最后落到存储、缓存、调优和架构权衡。本篇要回答的核心问题是：**性能到底是什么，以及怎么把它变成一组可比较、可验收的数字**。只有先把"度量"这件事钉死，后面每一篇谈优化才有依据，你不能优化一个你都量不出来的东西。

下一篇（② CPU 缓存与内存层级）的预告我先放这儿：我们会用 Go 结构体重排做真实前后对比，看为什么顺序遍历数组比随机访问能快一个数量级，以及"缓存行 64 字节"和"伪共享"到底在说什么。本篇先把"尺子"造好。

## 一、性能到底是什么：从"快"到一组可量化指标

性能不是单维度的"快"。一个接口 10ms 返回，看起来很快，但如果它只能串行处理、QPS 只有 50，那它在真实流量下就是慢的；反过来一个接口 200ms，但能稳定扛住每秒上万请求，对业务来说反而更"快"。所以性能是一组相互牵制的指标共同决定的系统能力，核心包括：**延迟、吞吐量、并发度、错误率、资源利用率、可扩展性**。


<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：六项指标</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 220" role="img" aria-label="延迟 吞吐量 并发度 错误率 资源利用率 可扩展性"><rect class="perf-chip" x="16" y="28" width="190" height="72" rx="6"/><text class="perf-chip-title" x="111" y="58" text-anchor="middle">延迟</text><text class="perf-chip-sub" x="111" y="78" text-anchor="middle">Latency · P99</text><rect class="perf-chip" x="225" y="28" width="190" height="72" rx="6"/><text class="perf-chip-title" x="320" y="58" text-anchor="middle">吞吐量</text><text class="perf-chip-sub" x="320" y="78" text-anchor="middle">QPS / TPS</text><rect class="perf-chip" x="434" y="28" width="190" height="72" rx="6"/><text class="perf-chip-title" x="529" y="58" text-anchor="middle">并发度</text><text class="perf-chip-sub" x="529" y="78" text-anchor="middle">活跃业务会话</text><rect class="perf-chip" x="16" y="120" width="190" height="72" rx="6"/><text class="perf-chip-title" x="111" y="150" text-anchor="middle">错误率</text><text class="perf-chip-sub" x="111" y="170" text-anchor="middle">Error Rate</text><rect class="perf-chip" x="225" y="120" width="190" height="72" rx="6"/><text class="perf-chip-title" x="320" y="150" text-anchor="middle">资源利用率</text><text class="perf-chip-sub" x="320" y="170" text-anchor="middle">CPU / 内存 / IO</text><rect class="perf-chip" x="434" y="120" width="190" height="72" rx="6"/><text class="perf-chip-title" x="529" y="150" text-anchor="middle">可扩展性</text><text class="perf-chip-sub" x="529" y="170" text-anchor="middle">Scalability</text></svg>
  </figure>
</section>

为什么不能只说"快"？因为"快"不可验收、不可对比、不可定 SLA。你说"优化后更快了"，别人没法判断快多少、在什么条件下快、用户感知到了没有。把性能拆成可量化指标，才能回答三个问题：优化前基线是多少、优化后提升多少、上线后怎么持续监控。

## 二、核心指标逐个拆

### 2.1 延迟（Latency）

延迟指单个请求从发出到收到完整响应的耗时，通常看往返时间（round-trip）。它衡量的是"单个用户体验到的速度"。

为什么不能只看平均值？因为平均值会掩盖长尾。想象 100 个请求里有 99 个 10ms 返回、1 个 500ms 才返回：平均值是 (99×10 + 500)/100 = 59ms，看着很健康，但那 1% 的用户实打实地等了半秒。在分布式系统里，长尾请求才是用户体验的杀手，你不会因为在 99 台机器上快而被投诉，会被投诉的是那 1% 卡住的请求。

于是有了百分位（percentile）。把所有请求的耗时从小到大排序，P99 就是排在 99% 位置的那个值：P99 = 100ms 意味着 99% 的请求都在 100ms 内完成，只有 1% 更慢。常见档位：

**P50（中位数）**：一半请求比它快，一半比它慢，反映"典型"体验。

**P95 / P99**：反映"绝大多数用户"的体验上限。

**P999**：极端长尾，金融、支付这类对错误零容忍的场景才需要盯。


<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：平均 59ms 与 P99</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 200" role="img" aria-label="99 个 10ms 与 1 个 500ms，平均 59ms，P99 500ms"><line class="perf-axis" x1="40" y1="150" x2="600" y2="150"/><rect class="perf-bar" x="48" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="74" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="100" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="126" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="152" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="178" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="204" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="230" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="256" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="282" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="308" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="334" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="360" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="386" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="412" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="438" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="464" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="490" y="120" width="18" height="30" rx="2"/><rect class="perf-bar" x="516" y="120" width="18" height="30" rx="2"/><rect class="perf-bar is-tail" x="542" y="30" width="18" height="120" rx="2"/><line class="perf-avg-line" x1="40" y1="108" x2="600" y2="108" stroke-dasharray="4 3"/><text class="perf-label" x="48" y="100">平均 59ms</text><text class="perf-label is-tail" x="470" y="24">P99 · 500ms</text><text class="perf-caption" x="48" y="178">示意：99×10ms + 1×500ms</text></svg>
  </figure>
</section>

怎么算？把一段时间内的所有响应时间收集起来排序，取第 ceil(n × p) 个。比如 1000 个样本算 P99，就是第 990 个样本的值。真实系统里你不会手算，Prometheus 的 histogram_quantile、JMeter 的聚合报告都会直接给你。

### 2.2 吞吐量（Throughput）：QPS 与 TPS

吞吐量指单位时间内系统成功处理的请求数，读场景常用 **QPS（Queries Per Second）**，写场景常用 **TPS（Transactions Per Second）**。一个 TPS 往往包含多个内部步骤，比如"下单"这个事务里可能有库存查询、创建订单、扣减账户、发消息，它代表一个完整业务动作，不是一个单纯查询。

为什么区分 QPS 和 TPS？因为它们的业务语义不同，优化方向也不同。读请求通常能靠缓存无限堆 QPS，写事务受数据库事务、锁、一致性约束的拖累，天花板低得多。面试里把"QPS"和"TPS"混为一谈，会被认为没分清读链路和写链路。

吞吐量和延迟是一对矛盾体，这是必须记住的点。**优化其中一个常常伤害另一个**，最典型的例子是批处理（batching）：

**不批处理**：每来一个写请求立刻落库。每个请求延迟低（立刻执行），但吞吐量受限于"每次只干一件事"的开销。

**批处理**：攒够 100 个写请求一起执行。吞吐量大幅上升（一次 IO 干 100 件的活），但每个用户要等批次攒满才被处理，单请求延迟从几毫秒变成几十毫秒。


<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：不批处理 vs 批处理</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 210" role="img" aria-label="不批处理延迟低吞吐受限；批处理吞吐升延迟升"><rect class="perf-panel" x="20" y="24" width="290" height="160" rx="8"/><text class="perf-panel-title" x="165" y="52" text-anchor="middle">不批处理</text><circle class="perf-dot" cx="70" cy="100" r="8"/><circle class="perf-dot" cx="120" cy="100" r="8"/><circle class="perf-dot" cx="170" cy="100" r="8"/><circle class="perf-dot" cx="220" cy="100" r="8"/><text class="perf-panel-sub" x="165" y="140" text-anchor="middle">延迟低 · 吞吐受限</text><rect class="perf-panel" x="330" y="24" width="290" height="160" rx="8"/><text class="perf-panel-title" x="475" y="52" text-anchor="middle">批处理</text><rect class="perf-batch" x="380" y="82" width="190" height="36" rx="6"/><text class="perf-panel-sub" x="475" y="105" text-anchor="middle">×100</text><text class="perf-panel-sub" x="475" y="140" text-anchor="middle">吞吐升 · 单请求延迟升</text></svg>
  </figure>
</section>

所以谈性能一定要同时看这两个维度，只追 QPS 不看延迟，可能把用户逼到"系统很能扛、但我每次都等很久"的境地。

### 2.3 并发度（Concurrency）

并发度是系统**同时服务的业务会话数**，不是"线程数"也不是"协程数"。你开 1000 个 goroutine，不代表有 1000 个用户同时在用，很可能 900 个 goroutine 都在等锁、等下游、等 IO。真正有意义的并发度是"同一时刻有多少请求在被处理"。


<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：goroutine 数 ≠ 并发度</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 180" role="img" aria-label="1000 goroutine 中多数在等待，少数在处理"><text class="perf-panel-title" x="160" y="36" text-anchor="middle">1000 goroutine</text><circle class="perf-dot is-wait" cx="40" cy="56" r="5"/><circle class="perf-dot is-wait" cx="64" cy="56" r="5"/><circle class="perf-dot is-wait" cx="88" cy="56" r="5"/><circle class="perf-dot is-wait" cx="112" cy="56" r="5"/><circle class="perf-dot is-wait" cx="136" cy="56" r="5"/><circle class="perf-dot is-wait" cx="160" cy="56" r="5"/><circle class="perf-dot is-wait" cx="184" cy="56" r="5"/><circle class="perf-dot is-wait" cx="208" cy="56" r="5"/><circle class="perf-dot is-wait" cx="232" cy="56" r="5"/><circle class="perf-dot is-wait" cx="256" cy="56" r="5"/><circle class="perf-dot is-wait" cx="40" cy="76" r="5"/><circle class="perf-dot is-wait" cx="64" cy="76" r="5"/><circle class="perf-dot is-wait" cx="88" cy="76" r="5"/><circle class="perf-dot is-wait" cx="112" cy="76" r="5"/><circle class="perf-dot is-wait" cx="136" cy="76" r="5"/><circle class="perf-dot is-live" cx="160" cy="76" r="5"/><circle class="perf-dot is-wait" cx="184" cy="76" r="5"/><circle class="perf-dot is-wait" cx="208" cy="76" r="5"/><circle class="perf-dot is-wait" cx="232" cy="76" r="5"/><circle class="perf-dot is-wait" cx="256" cy="76" r="5"/><circle class="perf-dot is-wait" cx="40" cy="96" r="5"/><circle class="perf-dot is-wait" cx="64" cy="96" r="5"/><circle class="perf-dot is-wait" cx="88" cy="96" r="5"/><circle class="perf-dot is-live" cx="112" cy="96" r="5"/><circle class="perf-dot is-live" cx="136" cy="96" r="5"/><circle class="perf-dot is-live" cx="160" cy="96" r="5"/><circle class="perf-dot is-wait" cx="184" cy="96" r="5"/><circle class="perf-dot is-wait" cx="208" cy="96" r="5"/><circle class="perf-dot is-wait" cx="232" cy="96" r="5"/><circle class="perf-dot is-wait" cx="256" cy="96" r="5"/><circle class="perf-dot is-wait" cx="40" cy="116" r="5"/><circle class="perf-dot is-wait" cx="64" cy="116" r="5"/><circle class="perf-dot is-wait" cx="88" cy="116" r="5"/><circle class="perf-dot is-wait" cx="112" cy="116" r="5"/><circle class="perf-dot is-live" cx="136" cy="116" r="5"/><circle class="perf-dot is-wait" cx="160" cy="116" r="5"/><circle class="perf-dot is-wait" cx="184" cy="116" r="5"/><circle class="perf-dot is-wait" cx="208" cy="116" r="5"/><circle class="perf-dot is-wait" cx="232" cy="116" r="5"/><circle class="perf-dot is-wait" cx="256" cy="116" r="5"/><circle class="perf-dot is-wait" cx="40" cy="136" r="5"/><circle class="perf-dot is-wait" cx="64" cy="136" r="5"/><circle class="perf-dot is-wait" cx="88" cy="136" r="5"/><circle class="perf-dot is-wait" cx="112" cy="136" r="5"/><circle class="perf-dot is-wait" cx="136" cy="136" r="5"/><circle class="perf-dot is-wait" cx="160" cy="136" r="5"/><circle class="perf-dot is-wait" cx="184" cy="136" r="5"/><circle class="perf-dot is-wait" cx="208" cy="136" r="5"/><circle class="perf-dot is-wait" cx="232" cy="136" r="5"/><circle class="perf-dot is-wait" cx="256" cy="136" r="5"/><text class="perf-caption" x="40" y="168"><tspan class="perf-swatch is-live">●</tspan> 在处理  <tspan class="perf-swatch is-wait">●</tspan> 等锁 / 等 IO</text><line class="perf-axis" x1="320" y1="40" x2="320" y2="150"/><text class="perf-panel-title" x="480" y="36" text-anchor="middle">并发度</text><text class="perf-chip-title" x="480" y="100" text-anchor="middle">同时在被处理的请求</text><text class="perf-panel-sub" x="480" y="128" text-anchor="middle">≠ 线程 / 协程数</text></svg>
  </figure>
</section>

为什么强调这点？因为压测工具（JMeter、wrk）里的"并发数"指的是施压线程/连接数，线上监控里的"并发"指的是活跃业务会话。两者不等，别拿压测的 1000 并发直接等同于线上 1000 用户。

### 2.4 错误率（Error Rate）

错误率是失败请求占总请求的比例。它必须和延迟、吞吐放在一起看，一个 QPS 很高但错误率 5% 的系统，比 QPS 低一半但零错误的系统更不可用。

国内生产环境有大致的红线（来自一线面试真题归纳）：**金钱链路错误率红线约 0.1%，非金钱链路约 1%**。另外要把"可重试的 5xx"和"不可重试的 4xx"分开讲，5xx 多是瞬时故障可以重试兜底，4xx 是参数/权限问题，重试也没用。面试里能把这两类拆开，会明显加分。

### 2.5 资源利用率

CPU、内存、IO、网络带宽的使用率，是定位瓶颈的入口。性能拐点往往出现在某项资源饱和时：CPU 跑满说明计算是瓶颈，内存涨不停说明有泄漏或缓存失控，磁盘 IO 打满说明读写没优化，网络带宽占满说明序列化/传输太重。

一个常见的经验线：云主机 CPU 超过 70% 就该考虑扩容或优化，因为再往上就是频繁上下文切换和调度抖动，边际收益骤降。

### 2.6 一张表收口

下面把关键指标汇总，方便你后续每篇都对着这张表想问题：

| 指标 | 定义 | 为什么不能只看平均 | 常见可接受参考（国内生产） | 典型命令/工具 |
|-|-|-|-|-|
| 延迟 P99 | 99% 请求耗时的上限 | 平均掩盖长尾，1% 用户可能等半秒 | ToC 读接口 ≤ 200ms；ToB 后台 ≤ 500ms；支付下单 ≤ 500ms | wrk --latency / Prometheus |
| QPS / TPS | 单位时间成功处理请求数 | 高吞吐但高延迟等于"能扛但慢" | 按业务定基线，如核心接口 ≥ 500 TPS | wrk -t -c -d |
| 并发度 | 同时服务的业务会话数 | 不等于线程/协程数 | 由连接池与下游决定 | 连接池监控 |
| 错误率 | 失败请求占比 | 高 QPS 配高错误率等于不可用 | 金钱链路 ≤ 0.1%，非金钱 ≤ 1% | 聚合报告 / 监控告警 |
| 资源利用率 | CPU/内存/IO/网络占用 | 单看某一项会误判瓶颈位置 | CPU 日常 < 70%，压测峰值可更高 | top / Grafana |

## 三、怎么亲手测：真实命令与输出

光说指标不够，得能自己量。下面两组微基准都是我在本机（Apple M5，Go 1.26.1，Python 3.13.12）真实跑出来的，不是编的。

### 3.1 Go 基准测试

先看一个经典误区：切片追加时"不预分配容量" vs "用 make([]int, 0, 1000) 预分配"。代码：

<div class="js-code-lang-tabs" data-default="python" data-langs="python,go"></div>

```python
import timeit

def no_cap():
    s = []
    for i in range(1000):
        s.append(i)
    return s

def with_cap():
    s = [0] * 1000
    for i in range(1000):
        s[i] = i
    return s

print("no_cap  :", round(timeit.timeit(no_cap, number=50000), 4), "s")
print("with_cap:", round(timeit.timeit(with_cap, number=50000), 4), "s")

```

```go
package perf

import "testing"

func BenchmarkAppendNoCap(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		var s []int
		for j := 0; j < 1000; j++ {
			s = append(s, j)
		}
	}
}

func BenchmarkAppendCap(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		s := make([]int, 0, 1000)
		for j := 0; j < 1000; j++ {
			s = append(s, j)
		}
	}
}

```


跑这条命令：
```bash
go test -bench=. -benchmem -run='^$'
```

-bench=. 跑所有基准，-benchmem 额外输出内存分配，-run='^$' 跳过普通单元测试只跑基准。真实输出：
```text
goos: darwin
goarch: arm64
pkg: perf
cpu: Apple M5
BenchmarkAppendNoCap-10    	  379443	      5955 ns/op	   25209 B/op	      12 allocs/op
BenchmarkAppendCap-10      	 2230862	       513.8 ns/op	       0 B/op	       0 allocs/op
PASS
ok  	perf	4.379s
```

怎么读这几列：

**ns/op**：每次操作纳秒数，越小越快。NoCap 是 5955，Cap 是 513.8，预分配快了约 11.6 倍。

**B/op**：每次操作分配了多少字节。NoCap 分配了 25209 字节，因为切片在增长过程中多次重新分配底层数组并拷贝；Cap 一次性分配够，0 字节。

**allocs/op**：每次操作的分配次数。NoCap 是 12 次（切片按 1→2→4→8… 翻倍增长，1000 个元素大约 growth 十几次），Cap 是 0 次。


<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：NoCap vs Cap（ns/op）</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 160" role="img" aria-label="NoCap 5955 ns/op，Cap 513.8 ns/op"><text class="perf-label" x="40" y="48">NoCap</text><rect class="perf-hbar is-tail" x="120" y="30" width="460" height="28" rx="4"/><text class="perf-label" x="590" y="50" text-anchor="end">5955</text><text class="perf-label" x="40" y="108">Cap</text><rect class="perf-hbar" x="120" y="90" width="40" height="28" rx="4"/><text class="perf-label" x="175" y="110">513.8</text><text class="perf-caption" x="40" y="148">单位 ns/op · 约 11.6 倍</text></svg>
  </figure>
</section>

结论很直接：**预分配把"反复扩容+拷贝"变成"一次分配"，既快又省内存**。这就是"怎么用指标"，bench 一跑，ns/op 和 allocs/op 同时告诉你问题在哪儿。

### 3.2 Python timeit

同样的逻辑用 Python 验证，看列表追加：

跑：
```bash
python3 pybench.py
```

真实输出：
```text
no_cap  : 0.8905 s
with_cap: 0.762 s
```

注意这里 Python 的差距只有约 17%，远没有 Go 那么夸张。原因是 **CPython 的 list 本身就已经做了超额预分配**（按大概 1.125 倍增长），所以即便你没手动预留，分摊下来扩容开销也很小。这点要如实说：同样"预分配"的思路，在不同运行时收益差别很大，不能把 Go 的结论直接套到 Python 上。timeit 本身会多次运行取最优值，所以它在压掉环境抖动这件事上比你自己写 time() 计时靠谱。

### 3.3 端到端压测（wrk）

微基准只能看单点，真实接口要端到端压。wrk 一条常用命令：
```bash
wrk -t12 -c400 -d30s http://localhost:8080/api
```

-t12 用 12 个线程，-c400 保持 400 个并发连接，-d30s 压 30 秒。它的输出大致长这样（字段含义，非本机实测）：
```text
Running 30s test @ http://localhost:8080/api
  12 threads and 400 connections
  Latency  12.34ms   p99 45.6ms
  Req/Sec   3,210.55
  1,154,000 requests in 30.00s
```

Latency 给平均和 P99 分布，Req/Sec 是每秒请求数（吞吐），最后一行是总请求数。想看更细的分位（P99.9）可以加 --latency 参数。

更严肃的做法来自一线大厂面经：用 **JMeter 施压 + Prometheus 采集指标 + Grafana 看板** 搭一套"性能基准体系"，而不是"跑个分报个数字"。重点是持续观测、剔除暖机数据、建立可对比的基线。

## 四、常见坑

**坑 1：只看平均值，被长尾骗。** 一定要看 P99 / P999。平均 59ms 可能藏着 1% 的 500ms 请求。

**坑 2：微基准自身的陷阱。** 这是最容易出的问题，至少四个：测试代码被编译器优化掉，如果循环里的计算没有任何外部副作用（比如结果没被使用），Go 编译器可能直接把整个循环删了，测出来是 0 ns/op，解决办法是把结果用 \_ = result 或 b.SetBytes 暴露出来；JIT / CPU 频率 / 节能模式波动，笔记本开着节能模式、CPU 被降频，数字会忽高忽低，跑基准前最好插电、关掉干扰程序，多跑几次取稳定值；GC 干扰，Go 的 GC 会在基准中途触发，某次迭代突然慢很多，用 -count=5 跑多次让结果平滑，别只信一次；暖机数据没剔除，JIT 语言（如 Java）前几秒还在编译热点，得丢掉。

**坑 3：吞吐和延迟混淆，用错指标定目标。** 追 QPS 时忘了延迟，用户感知是"越来越卡"；追延迟时忘了吞吐，系统一上量就崩。

**坑 4：压测环境当生产环境。** 压测库里 100 条数据，生产 1000 万条，索引命中率、缓存命中率、网络延迟全不一样，数字毫无参考性。面经里强调"建立基准体系"而不是"跑个分"，就是这个意思。

**坑 5：把 QPS 当唯一 KPI。** 忽视错误率和长尾，结果是"吞吐很高但一大片请求在报错或卡死"，本质上不可用。

**坑 6：过早优化。** Knuth 那句话大家都听过，"过早优化是万恶之源"。正确顺序是先度量、定位真正热点、再动手。凭直觉优化往往优化了个寂寞，还把代码搞复杂。

## 五、下一篇预告

② **CPU 缓存与内存层级**。我会用 Go 结构体重排做真实前后对比，回答这几个具体问题：

为什么顺序遍历一个数组，比随机访问数组元素能快一个数量级？

"缓存行 64 字节"到底意味着什么，为什么它会影响你写结构体字段的顺序？

伪共享（false sharing）是什么，它怎么在并发场景下悄悄拖慢你的程序？

用一次真实的结构体字段重排，看性能数字怎么变。

把这一篇的"尺子"带上，下一篇我们直接拿它量底层硬件的账。

## 六、面试高频考点清单

下面这些不是凭印象写的八股，是我交叉检索了多个真题来源后归纳的真实常考点：美团后端一面压测体系面经、cms365"性能指标核心指标与可接受区间"题、leetdezine 的 SDE 性能指标题、modb"系统高性能实现"题、techsarvam 性能测试题。

**1. 延迟和吞吐量的区别？为什么它们有时矛盾？** 延迟是单请求耗时，吞吐是单位时间处理量。矛盾点用 batching 说明：攒批提升吞吐，但单请求要等批填充，延迟上升。优化一个常伤另一个。

**2. 为什么用 P99 而不是平均值？** 给具体数字：99 个 10ms + 1 个 500ms，平均 59ms 看着健康，P99 却是 500ms，意味着 1% 用户遭罪。规模上来后（如日千万请求），那 1% 就是十万级的不好体验。平均值掩盖所有长尾。

**3. QPS 和 TPS 的区别？** QPS 是读场景每秒查询数，TPS 是写场景每秒事务数（一个事务含多步操作）。面试要分清读链路和写链路的天花板不同。

**4. 支付系统 vs 社交 feed，该盯哪个百分位？为什么？** 越关乎钱和信任，盯的百分位越高。支付盯 P99.9（哪怕千分之一慢也不可接受），社交 feed 盯 P95 即可（偶尔刷新慢能忍，性价比更高）。

**5. 你做过压测吗？怎么做的？** 别只报数字。标准答法是：选工具（JMeter 施压 + Prometheus/Grafana 观测），关注 P99 而非平均，剔除暖机数据，建立可对比的基准体系，最后给出优化前后对比。

**6. 压测发现 QPS 上不去但 CPU 不高，怎么排查？** 多半不是计算瓶颈，而是等：用 jstack 看线程是不是大量 WAITING（锁竞争），查数据库连接池是不是被打满（每个实例都开大连接池会压垮 DB），或者下游依赖拖后腿。

**7. 扩容能线性提升性能吗？** 不能。瓶颈常在共享资源：数据库连接池、全局锁、下游服务。加机器后 QPS 没涨，先查 DB 连接总数是否过载、是否锁竞争。

**8. 错误率和稳定性怎么定？** 金钱链路错误率红线约 0.1%、非金钱约 1%；稳定性要跑 SOAK（长时间压测看内存/句柄是否泄漏），金融类常跑 8\~24 小时；容量余量（Headroom）一般要求核心系统峰值余量 ≥ 30%。
