---
author: Duang
pubDatetime: 2026-08-10T15:00:00+08:00
title: 高性能后端实战（二）：CPU 缓存与内存层级
featured: true
draft: false
tags:
  - 高性能后端实战
description: 用真实基准测出数组顺序、随机、链表 chasing 的数量级差，讲透缓存行、伪共享、MESI 协议、结构体重排和 perf 工具。
---

**系列说明**｜这是 [高性能后端实战](/posts/perf-backend/) 十四篇里的第二篇。文中同一思路的示例用 **Python / Go** 对照，代码块顶部可切换，默认 Python。

<aside class="series-nav-card" aria-label="系列总览导航">

> **系列总览导航**
>
> - 系列：高性能后端实战专题（共 14 篇，Go + Python 双示例对照）
> - 上一篇：① 什么是高性能，怎么度量它
> - 本篇：② CPU 缓存与内存层级
> - 下一篇：③ 并发模型：线程、协程、锁与原子操作

</aside>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-cache-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">缓存金字塔瓶</span>
  </div>
  <p class="duang-whisper-body">第 1 篇把尺子造好了，这篇直接拿尺子去量硬件底层的账。瓶里四层：L3 最宽，越往上越小越快。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

第 1 篇我们把"尺子"造好了，延迟、吞吐、P99 这些指标。这一篇直接拿这把尺子去量硬件底层的账。上一篇结尾我抛了四个具体问题，这里先逐一接住：

**顺序遍历数组为啥比随机访问快？** 快，是因为硬件的"预取器 + 缓存行 + 空间局部性"三者配合；但我在 M5 上实测，纯数组的"乱序下标"只比顺序慢 1.62 倍（6.34ms vs 10.27ms），远没到"一个数量级"。真正慢到数量级的是 **链表指针 chasing**，它比数组顺序慢了 133 倍（414ms vs 3.09ms）。所以准确说法是：数组乱序只伤一点，链表乱跳才要命。

**"缓存行 64 字节"意味着什么？** 它意味着 CPU 和内存之间不是一个字节一个字节搬，而是一次搬一整行。你改一个 int，硬件会把包含它的整个 64 字节（或 Apple 芯片的 128 字节）整块搬进缓存。这直接影响你怎么排结构体的字段。

**伪共享是什么？** 两个 CPU 核心各自修改"同一个缓存行里"的不同变量，一致性协议会逼着这个缓存行在核心之间反复失效、反复同步。我在 M5 上用多核计数器复现，伪共享版比填充分隔版慢了 2.81 倍（228.79ms vs 81.47ms）。

**结构体重排后数字怎么变？** 把 bool / int64 / bool 重排成 bool / bool / int64，一个结构体实例从 24 字节缩到 16 字节，更省内存，也更可能塞进一个缓存行。

本篇就把这几件事拆开讲透。

## 一、为什么 CPU 不直接读内存：性能鸿沟与金字塔

CPU 和内存之间存在着巨大的速度差。现代 CPU 的主频是 GHz 级别，一条简单指令大约 0.3 纳秒就能执行完；而主存（DRAM）的访问延迟在 100 纳秒上下。也就是说，**CPU 访问一次内存的时间，够它执行几百条指令**。如果每次取数都直接怼内存，CPU 绝大多数时间会在"等数据"里空转。

为了填这个坑，硬件在 CPU 和内存之间塞了几层 SRAM 高速缓存，按离核心由近到远分成 L1、L2、L3，加上寄存器，形成一座金字塔：

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：存储层级金字塔 · 越近越快越小</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 500" role="img" aria-label="寄存器 L1 L2 L3 DRAM 磁盘 六层金字塔 越下越慢越大"><line x1="20" y1="28" x2="20" y2="460" stroke="none"/><rect class="perf-chip" x="255" y="16" width="130" height="70" rx="8"/><text class="perf-chip-title" x="320" y="48" text-anchor="middle">寄存器</text><text class="perf-chip-sub" x="320" y="70" text-anchor="middle">~0.1 ns · 几百 B</text><rect class="perf-chip" x="215" y="96" width="210" height="70" rx="8"/><text class="perf-chip-title" x="320" y="128" text-anchor="middle">L1 缓存</text><text class="perf-chip-sub" x="320" y="150" text-anchor="middle">~1–2 ns · 32–64 KB</text><rect class="perf-chip" x="175" y="176" width="290" height="70" rx="8"/><text class="perf-chip-title" x="320" y="208" text-anchor="middle">L2 缓存</text><text class="perf-chip-sub" x="320" y="230" text-anchor="middle">~5–10 ns · 256 KB–1 MB</text><rect class="perf-chip" x="125" y="256" width="390" height="70" rx="8"/><text class="perf-chip-title" x="320" y="288" text-anchor="middle">L3 缓存</text><text class="perf-chip-sub" x="320" y="310" text-anchor="middle">~30–50 ns · 数 MB–数十 MB</text><rect class="perf-chip" x="75" y="336" width="490" height="70" rx="8"/><text class="perf-chip-title" x="320" y="368" text-anchor="middle">主存 DRAM</text><text class="perf-chip-sub" x="320" y="390" text-anchor="middle">~100–200 ns · GB 级</text><rect class="perf-chip is-tail" x="20" y="416" width="600" height="70" rx="8"/><text class="perf-chip-title" x="320" y="448" text-anchor="middle">磁盘 SSD/HDD</text><text class="perf-chip-sub" x="320" y="470" text-anchor="middle">~ms 级 · TB 级</text></svg>
  </figure>
</section>

| 层级 | 位置 | 典型容量 | 典型访问延迟（量级） |
|-|-|-|-|
| 寄存器 | CPU 核心内 | 几十到几百字节 | ~0.1 ns |
| L1 缓存 | 每核私有（分指令/数据） | 32–64 KB | ~1–2 ns |
| L2 缓存 | 每核私有 | 256 KB–1 MB | ~5–10 ns |
| L3 缓存 | 多核共享 | 数 MB–数十 MB | ~30–50 ns |
| 主存 DRAM | 芯片外 | GB 级 | ~100–200 ns |
| 磁盘 | 外部存储 | TB 级 | ~ms 级 |

具体数字随 CPU 型号浮动很大，但量级关系稳定：**L1 比主存快两个数量级，L3 比主存快几倍到十几倍**。延迟数字上每个"跨一级"差不多是 5–10 倍的跃升，这正是一级级缓存存在的意义，把"最近大概率要用"的数据放在离核心最近的地方。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    别拿"内存"当很快的东西。对 CPU 而言，主存比 L1 慢 100 倍不止，相当于走路去隔一条街买东西——缓存优化就是想办法让货都堆在桌上。
  </div>
</details>

**常见坑**：很多人直觉里把"内存"当成很快的东西。对 CPU 而言，主存其实慢得离谱，比 L1 慢 100 倍都不止。所有"缓存优化"的本质，都是想办法让数据命中上层缓存、少碰主存。

## 二、缓存行（Cache Line）：64 还是 128 字节，这是个平台问题

缓存和内存之间交换数据的单位 **不是字节，也不是单个变量，而是缓存行（cache line）**。当前主流 x86-64 和绝大多数 ARM64 的缓存行是 **64 字节**；但要注意，**Apple Silicon（M1/M2/M3/M5 全系）的缓存行是 128 字节**。你这台机器就是 M5，所以下面凡是涉及"填充消除伪共享"的写法，我都是按 128 字节设计的，如果用 64 字节的填充去跑在 M5 上，反而没跨过缓存行，伪共享照样发生。

这意味着：当你读一个 int（4 字节）时，硬件会把包含它的整块 64（或 128）字节一起搬进 L1，顺带把"邻居"也加载进来。这个机制本身是好事，它赌你马上会访问邻近的数据（空间局部性，见第三节）；但它也带来一个反直觉的点：**你以为只改了一个字段，其实动的是整个缓存行**。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    x86 填 64 字节跨一行，Apple 要填 128。写死一个数字，自家机器跑得好好的，上了别的环境伪共享照样发生。用常量按架构定义。
  </div>
</details>

看 Go 里这段代码，用 unsafe.Sizeof 能直观看到字段在内存里的真实排布：

```go
package main

import (
	"fmt"
	"unsafe"
)

type Bad struct {
	a bool  // 1 字节
	b int64 // 8 字节
	c bool  // 1 字节
}

type Good struct {
	a bool
	c bool
	b int64
}

func main() {
	fmt.Println(unsafe.Sizeof(Bad{}))  // 24
	fmt.Println(unsafe.Sizeof(Good{})) // 16
}
```

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：Bad 24B vs Good 16B · 结构体重排省了三分之一</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 260" role="img" aria-label="Bad 结构体 bool-int64-bool 膨胀到 24 字节；Good 紧凑到 16 字节"><rect class="perf-panel" x="20" y="24" width="290" height="220" rx="8"/><text class="perf-panel-title" x="165" y="52" text-anchor="middle">Bad · bool · int64 · bool</text><rect class="perf-bar" x="40" y="84" width="24" height="50" rx="3"/><text class="perf-label" x="52" y="114" text-anchor="middle">a 1B</text><rect class="perf-bar is-tail" x="64" y="84" width="140" height="50" rx="3" fill-opacity="0.15"/><text class="perf-caption" x="134" y="114" text-anchor="middle">填充 7B</text><rect class="perf-bar" x="204" y="84" width="92" height="50" rx="3"/><text class="perf-label" x="250" y="114" text-anchor="middle">b 8B</text><rect class="perf-bar" x="40" y="148" width="24" height="50" rx="3"/><text class="perf-label" x="52" y="178" text-anchor="middle">c 1B</text><rect class="perf-bar is-tail" x="64" y="148" width="232" height="50" rx="3" fill-opacity="0.15"/><text class="perf-caption" x="180" y="178" text-anchor="middle">尾填充 7B</text><text class="perf-chip-title" x="165" y="224" text-anchor="middle">合计 24 字节</text><rect class="perf-panel" x="330" y="24" width="290" height="220" rx="8"/><text class="perf-panel-title" x="475" y="52" text-anchor="middle">Good · bool · bool · int64</text><rect class="perf-bar" x="350" y="100" width="24" height="50" rx="3"/><text class="perf-label" x="362" y="130" text-anchor="middle">a 1B</text><rect class="perf-bar" x="374" y="100" width="24" height="50" rx="3"/><text class="perf-label" x="386" y="130" text-anchor="middle">c 1B</text><rect class="perf-bar is-tail" x="398" y="100" width="54" height="50" rx="3" fill-opacity="0.15"/><text class="perf-caption" x="425" y="130" text-anchor="middle">填 6B</text><rect class="perf-bar" x="452" y="100" width="148" height="50" rx="3"/><text class="perf-label" x="526" y="130" text-anchor="middle">b 8B</text><text class="perf-chip-title" x="475" y="224" text-anchor="middle">合计 16 字节</text></svg>
  </figure>
</section>

Bad 里 a 占了 1 字节，但 b 是 int64，必须对齐到 8 字节边界，于是编译器在 a 后面塞了 7 字节填充；c 又在 b 后面占了 1 字节，再加 7 字节尾填充凑整。结果一个本该 10 字节的结构体膨胀到 **24 字节**。Good 把两个 bool 挤到一起，只需要在最后补 6 字节让 b 对齐，总共 **16 字节**。这是字段重排直接省内存的例子，第六节还会讲它和缓存的关系。

**常见坑**：

**跨平台填充位数要对。** 在 x86 上填 64 字节就够跨一行，在 M 系列上要填 128 字节，否则"消除伪共享"的代码在自己机器上跑得好好的，上到别的环境可能反而没生效。别写死一个数字，最好用 CACHE_LINE_SIZE 这类常量按架构定义。

**不要以为"改一个字段只动那个字段"。** 该字段所在的整个缓存行都被牵动，这也是伪共享的根源（第五节）。

**字段对齐不是越小越好。** 紧凑排列省内存，但如果有并发写，紧凑反而容易把多个热点字段挤进同一缓存行，引发伪共享。内存布局和并发布局要分开权衡。

## 三、局部性原理：硬件为什么偏爱"连续"

缓存行之所以按"块"搬，背后是两条被反复验证的规律，统称 **局部性原理**：

**时间局部性**：一个数据被访问后，短期内很可能再次被访问。比如循环变量、热点配置。所以把它留在缓存里，下次直接命中。

**空间局部性**：一个数据被访问后，它 **相邻地址** 的数据很可能很快也要用。比如遍历数组时，访问了 arr[0]，arr[1]、arr[2] 马上就来。

硬件据此做了一个关键的加速部件，**预取器（prefetcher）**。当 CPU 发现你在按顺序访问内存，它会"猜"你下一个要读的缓存行，提前把它从主存搬进 L2/L1。等你的代码真的读到那里时，数据已经在缓存里了，几乎零延迟。

这就是为什么"顺序访问数组"天然快：预取器能精准预测，缓存命中率极高。而一旦访问模式杂乱（跳着读、顺着指针跳），预测失效，每次都是 cache miss，老老实实去主存取，速度就崩了。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    链表是缓存的死敌——节点堆上分散，顺着 next 跳每下都是一次 cache miss。热点路径要遍历，数组永远优先。
  </div>
</details>

**常见坑**：

**链表是缓存的死敌。** 链表的节点在堆上分散分配，顺着 next 指针跳，每次跳转到的内存地址几乎不可预测，预取器完全失效，每读一个节点都是一次 cache miss。第四节会用真实数字把这个点钉死。

**不要为了"看起来优雅"把数据用链表/散列表串起来然后高频遍历。** 如果遍历是热点路径，数组（或数组里的下标索引）几乎总是比链表快一个数量级。

## 四、真实基准一：顺序、随机、链表 chasing 三种访问模式

下面三组都在你的 M5（Go 1.26.1）上真实跑出，不是编的。先说代码逻辑，再给数字。

**数组顺序 vs 数组随机访问**（遍历 1600 万个 int，约 64MB，远超 L3）：

```go
const arrSize = 16 << 20

var sequential = make([]int, arrSize)
var randomIdx []int // 预先用 Fisher-Yates 打乱过的随机下标排列

func BenchmarkSequentialAccess(b *testing.B) {
	for n := 0; n < b.N; n++ {
		sum := 0
		for i := 0; i < arrSize; i++ {
			sum += sequential[i] // 下标 i 连续
		}
		_ = sum
	}
}

func BenchmarkRandomAccess(b *testing.B) {
	for n := 0; n < b.N; n++ {
		sum := 0
		for i := 0; i < arrSize; i++ {
			sum += sequential[randomIdx[i]] // 下标跳跃
		}
		_ = sum
	}
}
```

真实输出（节选）：

```
BenchmarkSequentialAccess-10   	     193	  6339696 ns/op
BenchmarkRandomAccess-10       	     127	 10269525 ns/op
```

顺序 **6.34 ms/op**，随机 **10.27 ms/op**，随机只慢 **1.62 倍**。原因是：虽然随机下标让预取器失灵，但数组整体仍在一段连续内存里，缓存行依旧能部分利用（一次 miss 进来的 64/128 字节里可能包含了随后要访问的若干元素）。所以纯数组乱序，没那么惨。

**链表指针 chasing vs 数组顺序**（都是 400 万个元素）：

```go
type node struct {
	val  int
	next *node
}
// 把 400 万个节点按随机顺序串成链表，顺着 next 跳

// 链表 chasing
for p := head; p != nil; p = p.next {
	sum += p.val
}
// 数组顺序
for i := 0; i < n; i++ {
	asum += arr[i]
}
```

真实输出：

```
linked list chase : 414.016584ms
array sequential : 3.093666ms
list slower by   : 133.83x
```

链表比数组顺序慢了 **133 倍**。这才是上一节说的"数量级差距"的真正场景：每个节点在堆上随机坐落，next 一跳就是一次 cache miss，预取器彻底没用武之地。

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：三种访问模式耗时对比（M5 实测）</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 230" role="img" aria-label="数组顺序 6.34ms，数组随机 10.27ms，链表 chasing 414ms"><line class="perf-axis" x1="140" y1="36" x2="600" y2="36"/><line class="perf-axis" x1="140" y1="86" x2="600" y2="86"/><line class="perf-axis" x1="140" y1="136" x2="600" y2="136"/><text class="perf-chip-sub" x="140" y="22">基准轴（数组顺序 = 1×）</text><text class="perf-label" x="30" y="56">数组顺序</text><rect class="perf-hbar" x="140" y="42" width="10" height="28" rx="3"/><text class="perf-chip-sub" x="160" y="60">6.34 ms</text><text class="perf-label" x="30" y="106">数组随机</text><rect class="perf-hbar" x="140" y="92" width="16" height="28" rx="3"/><text class="perf-chip-sub" x="168" y="110">10.27 ms · 1.62×</text><text class="perf-label" x="30" y="156">链表 chasing</text><rect class="perf-hbar is-tail" x="140" y="142" width="440" height="28" rx="3"/><text class="perf-chip-sub" x="586" y="160" text-anchor="end">414 ms · 65×</text><text class="perf-caption" x="30" y="204">结论要讲准：数组乱序是小伤，链表乱跳才是重创</text></svg>
  </figure>
</section>

把三者的差距摆在一起看：数组顺序 6.34ms → 数组随机 10.27ms（1.62x）→ 链表 chasing 414ms（相对数组顺序 65x，相对数组随机 40x）。**结论要讲准**：数组乱序只是"小伤"，链表/指针跳跃才是"重创"。写代码时，如果热点路径要遍历，优先数组；实在要用链表，考虑 nodes 池化到连续内存（比如用切片存节点、用下标当"指针"）。

## 五、伪共享（False Sharing）：多核下的隐形刺客

前面几节都是单线程视角的缓存。一旦上多核，缓存就引出第二个大坑，**伪共享**。

**是什么**：现代多核 CPU 里，每个核心有自己的 L1/L2，但内存只有一份。为了保证"所有核心看到同一块内存的值是一致的"，硬件用 **MESI 协议**维护缓存一致性。MESI 给每个缓存行标记四种状态之一：

**M（Modified，已修改）**：这行被本核改过，和内存不一致，本核独占。

**E（Exclusive，独占）**：这行和内存一致，且只有本核持有。

**S（Shared，共享）**：这行和内存一致，可能被多个核心同时持有。

**I（Invalid，失效）**：这行数据作废，不能用。

一致性协议的操作粒度是 **缓存行，不是变量**。于是出现一个诡异的情况：核心 A 改了缓存行里的变量 X，核心 B 改了 **同一个缓存行** 里的变量 Y，X 和 Y 逻辑上毫无关系，但因为同处一行，核心 A 的写入会让核心 B 那行的状态从 S 变 I（失效），核心 B 再写就得先重新把整行拉回来；反过来 B 写又让 A 的失效。两个核心就在"互相让对方缓存行失效"这件事上空转，真正干活的时间被大量吃掉。这就是伪共享。

<section class="article-embed-note perf-figure">
  <p class="article-embed-note-title">图解：伪共享 · 两个变量 X/Y 挤在同一个缓存行</p>
  <figure class="perf-scene">
<svg class="perf-svg" viewBox="0 0 640 330" role="img" aria-label="核心 A 写 X 导致核心 B 整行失效，核心 B 写 Y 又让 A 失效，2.81倍慢"><text class="perf-panel-title" x="320" y="30" text-anchor="middle">同一个缓存行 · 128 字节</text><rect class="perf-panel" x="50" y="48" width="540" height="70" rx="8"/><rect class="perf-bar" x="80" y="64" width="190" height="38" rx="4"/><text class="perf-label" x="175" y="88" text-anchor="middle">X · 核心 A 写</text><rect class="perf-bar" x="420" y="64" width="140" height="38" rx="4"/><text class="perf-label" x="490" y="88" text-anchor="middle">Y · 核心 B 写</text><rect class="perf-chip" x="50" y="140" width="250" height="72" rx="8"/><text class="perf-chip-title" x="175" y="170" text-anchor="middle">核心 A L1</text><text class="perf-chip-sub" x="175" y="192" text-anchor="middle">写 X → 广播失效</text><rect class="perf-chip" x="340" y="140" width="250" height="72" rx="8"/><text class="perf-chip-title" x="465" y="170" text-anchor="middle">核心 B L1</text><text class="perf-chip-sub" x="465" y="192" text-anchor="middle">行从 S → I，重载</text><line class="perf-axis" x1="300" y1="204" x2="340" y2="204" stroke-dasharray="4 3"/><text class="perf-caption" x="320" y="228" text-anchor="middle">互相让对方失效 → 真正干活的时间被空转吃掉</text><rect class="perf-chip" x="120" y="252" width="190" height="62" rx="6"/><text class="perf-chip-title" x="215" y="280" text-anchor="middle">shared 版</text><text class="perf-chip-sub" x="215" y="300" text-anchor="middle">228.79 ms</text><rect class="perf-chip" x="330" y="252" width="190" height="62" rx="6"/><text class="perf-chip-title" x="425" y="280" text-anchor="middle">padded 版</text><text class="perf-chip-sub" x="425" y="300" text-anchor="middle">81.47 ms · 快 2.81×</text></svg>
  </figure>
</section>

**怎么验证（真实数字）**：我在 M5 上起 runtime.NumCPU() 个 goroutine，每个疯狂递增自己的计数器。版本一所有计数器紧挨在一个切片里（大概率同处一个 128 字节缓存行）；版本二每个计数器间隔 128 字节（独占一行）。

```go
n := runtime.NumCPU()
shared := make([]int64, n)     // 紧挨，大概率同缓存行
padded := make([]int64, n*16)  // 每个间隔 128 字节，独占缓存行

// 每个 goroutine 只改 shared[id] 或 padded[id*16]
```

真实输出：

```
shared  (false sharing) : 228.785042ms
padded  (no false share): 81.468917ms
slowdown               : 2.81x
```

伪共享让多核计数器慢了 **2.81 倍**。注意这还是在计数器只有 n 个、竞争不极端的情况下；字段越多、写越频繁，恶化越明显。

**怎么解决**：把会被不同线程写的变量，用填充隔开，让它们各占一个缓存行。

```go
// 在 a 和 b 之间垫 16 个 int64（128 字节），跨过 M5 的缓存行
type noFalseShare struct {
	a   int64
	pad [16]int64
	b   int64
}
```

其他语言里对应的是：Java 用 @Contended 注解（或手动填充 long），C/C++ 用 alignas(64)（x86）或 alignas(128)（Apple）。**关键是填充量必须等于目标平台的缓存行大小**。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    伪共享是"写才会广播失效、读不会"。永远只有同一行里被不同线程写的字段需要填充，别的字段垫一行纯属浪费缓存容量。
  </div>
</details>

**常见坑**：

**只给"被不同线程写"的字段填充。** 如果两个字段永远被同一个线程访问，它们共享一个缓存行不会触发伪共享（一致性协议只在写入时才广播失效，读不失效）。盲目给每个字段都垫一行，纯属浪费缓存容量和带宽。

**过度填充适得其反。** 一个结构体本来能塞进一个缓存行，你给每个字段都垫 128 字节，结果一个结构体占了几 KB，缓存根本装不下几个，cache miss 反而更多。

**别靠猜，用工具定位。** Linux 下 perf c2c 专门分析缓存行在核间来回搬运，能直接告诉你哪一行有跨核争用；perf stat -e cache-misses,cache-references 看整体命中率。在容器/虚拟机里 perf 可能受限，需要在宿主机或用带权限的方式跑。

**缓存行大小因平台而异。** 再次强调：x86/ARM64 多为 64 字节，Apple Silicon 是 128 字节。你在这台 M5 上验证过的填充值，换到别的环境未必够。

## 六、结构体重排：从"省内存"到"缓存友好"

第二节那个 Bad / Good 例子，除了省内存，还顺带影响缓存。我们复习一下数字：

```go
fmt.Println(unsafe.Sizeof(Bad{}))  // 24
fmt.Println(unsafe.Sizeof(Good{})) // 16
```

Bad 因为字段顺序导致编译器插入 14 字节填充，膨胀到 24；Good 重排后只有 16。这个差异在单实例上不起眼，但如果是"每秒创建百万个对象"的热点结构体，24 vs 16 意味着：

同样大小的缓存行（128 字节），Bad 只能放 5 个，Good 能放 8 个，遍历或批量处理时，Good 的缓存命中率更高，cache miss 更少。

同样的内存带宽下，Good 能装下更多实例，GC 扫描和拷贝的压力也更小。

重排的原则很直接：**把大对齐字段（int64、int32、指针）尽量往前放，小字段（bool、byte）往后或聚在一起**，减少编译器被迫插入的填充。更进一步的做法是按"被一起访问的字段"聚簇，让一个缓存行里装的都是同一次操作会用到的数据，这就是 CPU 缓存友好的数据结构设计思路。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    重排和伪共享在某些场景方向相反——热点结构体挤紧了省缓存，但如果多核并发写不同字段，反而应该拉开。先定位瓶颈再动手。
  </div>
</details>

**常见坑**：

**不要无脑重排所有结构体。** 只有热点路径上、被高频创建/访问/并发读写的结构体才值得折腾。给一个只在启动时读一次的 config 结构体做字段对齐优化，纯粹是自找麻烦还降低可读性。

**重排要和伪共享权衡。** 如果结构体实例会被多核并发写不同字段，重排把字段挤到一起反而制造伪共享；这种场景应该"拉开"（填充）而不是"挤紧"。省内存和避伪共享在某些情况下是相反的方向，看你的瓶颈在哪。

**用 unsafe.Sizeof / reflect 自检。** 字段顺序改完，跑一下 unsafe.Sizeof 确认体量符合预期，别凭感觉。

## 七、怎么量缓存：perf 工具

前面所有结论，最好都能用工具复现，而不是靠猜。在 Linux x86/ARM64 上，perf 是最直接的武器：

```bash
# 看整体缓存命中率
perf stat -e cache-misses,cache-references ./your_program

# 专门抓伪共享：分析哪些缓存行在核间反复搬运
perf c2c record ./your_program
perf c2c report
```

cache-misses / cache-references 的比值越低越好；perf c2c 的 report 里会列出"跨核传输"最凶的缓存行和对应的代码位置，是定位伪共享的利器。

**常见坑**：

**容器/虚拟机里 perf 常受限。** 很多云环境默认禁止 perf_event_paranoid 的底层访问，跑出来全是 0 或报错，需要在宿主机或有 CAP_SYS_ADMIN 的容器里跑。

**cache miss 高不等于一定慢。** 有些工作负载本来就是内存带宽密集（如大数据扫描），高 miss 是业务本质，优化方向是"批量/向量化/压缩"而不是"减少 miss"。先看第 1 篇的尺子（延迟、吞吐、是否真成了瓶颈），再决定要不要死磕缓存。

**不要用微基准的结论硬套生产。** 微基准里省下的几纳秒，放到有锁竞争、有 IO、有 GC 的真实服务里可能完全被淹没。缓存优化是"最后那一把精细活"，前提是你已经用第 1 篇的方法定位到它真是热点。

## 八、下一篇预告

③ **并发模型：线程、协程、锁与原子操作**。这一篇我们从"硬件缓存"下沉到"软件并发"，会回答这些具体问题：

进程、线程、协程到底差在哪？上下文切换的成本为什么能吃掉性能？

Go 的 GMP 调度怎么让几万个 goroutine 跑在少量系统线程上？Python 的 GIL 又为什么让多线程在 CPU 密集任务上"假并行"？

锁、原子操作（atomic）、CAS 各自适合什么场景？死锁、锁粒度、内存序这些坑怎么避？

你会看到：这一篇讲的"锁竞争"，本质上是上一节"伪共享"在软件层的对应物，伪共享是缓存一致性层面的无谓争用，锁竞争是逻辑层面的无谓争用，两者都让多核空转。

把这篇的"缓存账"带上，下一篇我们看软件怎么和硬件的这些特性打交道。

## 九、面试高频考点清单

下面这些不是凭印象写的八股，是我交叉检索了多源真题后归纳的真实常考点：CSDN《CPU 缓存为什么分 L3 三级》题、geekcoder《MESI 缓存一致性协议》、jamhihi《伪共享底层原理与 @Contended》、geekworkbench《Cache & Buffer Management》、technologynova《交易系统中的伪共享陷阱》、juejin《多级缓存实现及问题》、interview_tc《深入理解 CPU 缓存面试常考》。

**1. 为什么 CPU 要分 L1/L2/L3 三级，各自怎么配合？** 核心答案：CPU 和内存有数量级的速度差，单级缓存容量做不大（贵、占面积），所以用"小而快的核心私有 L1/L2 + 大而慢的共享 L3"分层，越近核心越快越小。L1 分指令/数据，L2 每核私有做 L1 和 L3 之间的缓冲，L3 多核共享并承担核间数据传递。

**2. 缓存行多大？为什么是 64（或 128）字节？** x86-64 和多数 ARM64 是 64 字节，Apple Silicon 是 128 字节。原因是按"块"搬能利用空间局部性，一次把邻近数据都搬进来比逐字节搬高效得多。面试要能说出"操作单位是缓存行不是变量"，以及填充伪共享时必须按平台缓存行大小来。

**3. 什么是伪共享？怎么解决？** 两个核心各改同一缓存行里的不同变量，MESI 协议让该行在核间反复失效同步，多核空转。解法：把被不同线程写的变量用填充隔开，各占一个缓存行（Java @Contended、C++ alignas、Go 手动 pad）。强调只给"不同线程写"的字段填充，且填充量要等于缓存行大小。

**4. MESI 协议四个状态？写共享行时怎么处理？** M/E/S/I 四态。核心要对一个 S 态（多核共享、干净）的缓存行写时，必须先广播"失效"让其他核心的副本变 I，自己再转 M 写。正是这一步的广播+重载，构成了伪共享的开销。

**5. 局部性原理是什么？为什么数组比链表缓存友好？** 时间局部性（短期会再访问）+ 空间局部性（邻近会再访问）。数组内存连续，预取器能精准预取，缓存命中高；链表节点堆上分散，顺着 next 跳每次几乎都是 cache miss。本题可顺势抛出"链表 chasing 比数组顺序慢一个数量级"这种实测结论加分。

**6. 怎么降低 cache miss？实际优化手段有哪些？** 优化访问顺序（顺序而非跳跃）、结构体字段合并/重排减少 padding、用数组代替链表、分块（loop tiling）让工作集拟合缓存、多线程数据本地化（每核用自己本地副本，最后再合并，避免伪共享）。

**7. 缓存一致性的根源是什么？总线锁和缓存锁区别？** 多核各自有缓存，同一地址可能多份副本，需协议保证一致。早期用总线锁（锁住总线，其他核全阻塞）代价大，后来演进到缓存锁（只锁对应的缓存行，粒度更细）。这是理解锁、原子操作底层成本的铺垫。

**8. 怎么用工具检测缓存问题？** perf stat -e cache-misses,cache-references 看整体命中；perf c2c 专门定位伪共享（缓存行跨核传输）；Valgrind cachegrind 做函数/行级 cache miss 分析。注意容器/虚拟机里 perf 常受权限限制。
