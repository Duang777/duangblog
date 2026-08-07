---
author: Duang
pubDatetime: 2026-08-07T13:25:00+08:00
title: 进程、线程、协程详解（Go 视角）
featured: true
draft: false
tags:
  - 易混专栏
  - 进程
description: 只聊 Go 里的进程、线程、协程：os/exec、M 与 goroutine、channel / sync / context，以及怎么选。
---

**系列说明**｜这是 [易混专栏](/posts/dont-mix/) 里 [进程](/tags/进程/) 主题下的一篇。同主题另有 [Python 视角](/posts/process-thread-coroutine-python/)，可以单独看，也可以对照读。

这篇文章只聊 Go 一门语言里的进程、线程、协程：Go 怎么看待它们、具体怎么写、开销差多少、什么时候该用哪个。

> Go 的并发哲学和 Python 恰好相反：goroutine（协程）是语言的一等公民，创建成本极低，默认就鼓励"随手开一堆并发去干活"；而 Python 那种"多线程不能并行"的枷锁在 Go 里不存在。所以读本文时先放下 Python 的思维，Go 的并发是另一套世界观。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-jar-swarm.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">瓶里在挤 goroutine</span>
  </div>
  <p class="duang-whisper-body">别先想锁。先想数据从谁手里传到谁手里。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 一、Go 的并发哲学

Go 官方有句名言值得记住：不要通过共享内存来通信，而要通过通信来共享内存。这不是一句口号，而是整门语言并发设计的基调。

在这条基调下，goroutine 被设计得极轻，你可以轻松开几十万甚至上百万个，几乎不需要为"开太多了怎么办"而犹豫。goroutine 之间主要靠 channel 来传数据，而不是直接去读写同一块共享变量——数据从生产者通过 channel 流向消费者，所有权随消息一起转移，天然就避免了"谁在改、改到一半被别人读"这种问题。真要共享变量也不是不行，用 sync 包的锁或者 atomic 原子操作，但要当作例外而不是默认。在此之上，Go 的运行时会自动在"少量 OS 线程"和"海量 goroutine"之间做多路复用，让你写并发程序变得很便宜：你只管写个 go，剩下的调度、映射、负载均衡全是运行时替你做完。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：别抢内存，走管道</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="共享内存要抢锁；channel 把所有权随消息转移"><rect class="mixup-panel is-soft" x="12" y="12" width="616" height="186" rx="14"/><rect class="mixup-panel" x="28" y="28" width="278" height="154" rx="10"/><text class="mixup-title" x="167" y="54" text-anchor="middle">共享内存</text><circle class="mixup-dot is-wait" cx="94" cy="104" r="8"/><circle class="mixup-dot is-wait" cx="167" cy="104" r="8"/><circle class="mixup-dot is-live" cx="240" cy="104" r="8"/><path class="mixup-lock" d="M 155 132 h24 v18 h-24 z M 160 132 v-9 a6 6 0 0 1 12 0 v9"/><text class="mixup-sub" x="167" y="170" text-anchor="middle">多人改同一块 · 先抢锁</text><rect class="mixup-panel is-accent" x="334" y="28" width="278" height="154" rx="10"/><text class="mixup-title" x="473" y="54" text-anchor="middle">channel</text><circle class="mixup-dot is-live" cx="390" cy="104" r="8"/><rect class="mixup-pipe" x="420" y="92" width="106" height="24" rx="10"/><circle class="mixup-dot is-live" cx="556" cy="104" r="8"/><path class="mixup-arrow" d="M 430 104 h86"/><text class="mixup-sub" x="473" y="170" text-anchor="middle">数据带着所有权走</text></svg>
  </figure>
</section>

## 二、进程：os/exec

Go 自己很少去"开进程"，因为 goroutine 已经够轻够快，绝大多数并发需求在进程内部就能解决。但有些事必须靠外部进程：调用 shell 命令或者别的语言写的程序、需要强隔离（崩了不影响主程序）、或者需要借助操作系统级别的能力时，进程就是绕不开的。

os/exec 的用法分几个层次。exec.Command 构造一条命令，.Output() 一次性执行并拿到标准输出的全部内容，.Run() 只执行不关心输出，.Start() 加 .Wait() 把启动和等待分开，方便你边干别的边等它结束。如果要做流式交互（比如像管道一样一行行读写），用 StdinPipe / StdoutPipe / StderrPipe 拿到读写器自己操作。工程上最该记住的是用 context 控制超时和取消：一个卡死的子进程如果不设截止时间，会一直挂着占资源，context 能让你在超时之后干净地杀掉它。

```go
package main

import (
    "fmt"
    "os/exec"
)

func main() {
    out, err := exec.Command("echo", "hello").Output()
    if err != nil {
        panic(err)
    }
    fmt.Println(string(out))
}
```

本机实测启动一个 /bin/true 这样的空进程大约 2.6 毫秒——比 goroutine 贵了好几个数量级。所以进程在 Go 里只用于"不得不隔离 / 调外部"的场景，不是常规并发手段；真正的高并发永远在 goroutine 这一层解决。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：贵到便宜，差几个数量级</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 220" role="img" aria-label="进程约 2.6ms，OS 线程数十微秒，goroutine 约 187ns"><rect class="mixup-panel is-soft" x="24" y="24" width="592" height="168" rx="12"/><text class="mixup-title" x="48" y="56">创建开销（本机量级）</text><circle class="mixup-fill is-warm" cx="120" cy="130" r="48"/><circle class="mixup-ring" cx="120" cy="130" r="48"/><text class="mixup-title" x="120" y="126" text-anchor="middle">进程</text><text class="mixup-sub" x="120" y="146" text-anchor="middle">~2.6ms</text><circle class="mixup-fill" cx="320" cy="130" r="28"/><circle class="mixup-ring" cx="320" cy="130" r="28"/><text class="mixup-title" x="320" y="126" text-anchor="middle">M</text><text class="mixup-sub" x="320" y="146" text-anchor="middle">数十 us</text><circle class="mixup-fill" cx="500" cy="130" r="14"/><circle class="mixup-ring" cx="500" cy="130" r="14"/><text class="mixup-sub" x="500" y="168" text-anchor="middle">G ~187ns</text><path class="mixup-arrow" d="M 178 130 H 282"/><path class="mixup-arrow" d="M 358 130 H 476"/><text class="mixup-caption" x="320" y="198" text-anchor="middle">圆越小越便宜。日常并发站在最右边。</text></svg>
  </figure>
</section>

## 三、线程：Go 与 OS 线程的关系

Go 里几乎不直接操作 OS 线程，因为运行时替你管了。那个"OS 线程"在 Go 的调度模型里叫 M（machine），而你日常写的 go func() 创建的是 goroutine（G），并不是 OS 线程。

运行时会把海量的 G 多路复用到少量的 M 上去跑。M 的数量默认等于 GOMAXPROCS（也就是机器核数），需要更多 M 时运行时自动加。那么什么情况下才会真正用到 OS 线程？最常见的是阻塞的系统调用：当你在 goroutine 里做读写文件、某些网络 syscall 这类会卡住系统调用的操作时，当前这个 M 会被阻塞调用占住，运行时就会把这个 M 暂时脱离调度、再开一个新的 M 顶上来继续跑别的 G，核不会浪费。其次是 cgo，C 代码直接跑在 OS 线程上，不受 Go 调度器控制。最后是 runtime.LockOSThread，它把一个 goroutine 钉死在某个 OS 线程上，只在少数场景需要——比如 cgo 的回调函数要求在同一线程执行，或者某些依赖线程本地状态的系统调用。所以准确地说，"Go 的线程"是运行时托管的 OS 线程池，日常开发基本不用管，理解它的存在是为了看懂调度，而不是为了直接操作它。

```go
runtime.LockOSThread()
defer runtime.UnlockOSThread()
// 必须绑定 OS 线程的场景：cgo 回调、某些依赖线程本地状态的系统调用
```

## 四、协程：goroutine + channel + sync + context

这是 Go 并发的核心，占了你日常 90% 的并发代码。它不是一个单一概念，而是一组配合使用的原语，逐个讲清楚。

### goroutine

用 go 关键字就能启动一个 goroutine：go func() { ... }()，调用瞬间返回，函数体在另一个 goroutine 里并发跑。它最反直觉也最强大的一点是初始栈只有 2KB，并且能按需翻倍增长（2KB 到 4KB 到 8KB …），上限大约 1GB，所以你开几十万个 goroutine 也不用担心内存爆炸——绝大多数 goroutine 实际只用到几 KB 到几十 KB 栈。另一个要记牢的约束是：goroutine 没有 ID，也不能被"从外面强制杀死"，只能靠自己退出（函数 return）或者靠 channel / context 通知它退。这意味着"取消"在 Go 里是协作式的——你发信号，goroutine 自己决定何时收尾。

### channel

channel 是 goroutine 之间传数据的管道，也是 Go"通过通信共享内存"哲学的载体。无缓冲 channel 的发送和接收必须同时就绪，否则双方都阻塞——这种"会合"特性让它天然成为一个同步点，常用于等待一个 goroutine 真正启动或完成。有缓冲 channel 则是缓冲满才阻塞发送、空才阻塞接收，相当于一个内置的有限队列，常用来解耦生产者和消费者。close 表示"发送方不再有值"，接收方可以用逗号 ok 判断通道是否已经关闭；对已关闭的 channel 再发送会直接 panic，所以 close 的责任要归属清楚（通常发送方关）。select 是 channel 的多路复用器，能同时等待多个 channel，配合 time.After 做超时、配合 default 做非阻塞尝试，是 Go 并发控制里出现频率最高的语法。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-channel-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">管道瓶过水</span>
  </div>
  <p class="duang-whisper-body">close 是发送方的事。接收方负责读完，别抢着关闸门。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

```go
func worker(id int, jobs <-chan int, wg *sync.WaitGroup) {
    defer wg.Done()
    for j := range jobs {
        fmt.Printf("worker %d job %d\n", id, j)
    }
}

func main() {
    jobs := make(chan int, 10)
    var wg sync.WaitGroup
    for i := 1; i <= 3; i++ {
        wg.Add(1)
        go worker(i, jobs, &wg)
    }
    for j := 1; j <= 9; j++ {
        jobs <- j
    }
    close(jobs)
    wg.Wait()
}
```

超时也可以直接写在 `select` 里：

```go
select {
case res := <-ch:
    fmt.Println(res)
case <-time.After(100 * time.Millisecond):
    fmt.Println("timeout")
}
```

### sync 与原子操作

当你确实要共享变量时，sync 包是标准工具。sync.Mutex / RWMutex 是最常用的互斥锁，RWMutex 适合读多写少——多个读可以并发，写独占总锁。sync.WaitGroup 用来等一组 goroutine 全干完，是"主 goroutine 等工人们收工"的标配。sync.Once 保证某段初始化逻辑只执行一次，sync.Map 是读多写少的高并发映射、免去外部加锁，sync.Pool 复用临时对象、减轻 GC 压力。实在不想上锁的高频计数 / 标志位，用 atomic 包做无锁操作，比 Mutex 快得多——本机实测同等自增量下 Mutex 512 毫秒对原子 62.5 毫秒，差大约 8 倍。一般原则是：能用 channel 传数据就别用锁；必须共享时用 Mutex；纯计数标志用 atomic。

### context

context 用来在 goroutine 树之间传递取消信号、超时和请求范围的值。它解决的是一个很实际的问题：一个请求可能派生出十几个 goroutine（查数据库、调下游、算结果），当请求被取消或者超时时，这些派生出来的 goroutine 怎么一起停下来？答案是每个长生命周期的 goroutine 都把 ctx 作为第一个参数一路传下去，父 ctx 取消时，所有派生的子 ctx 都能收到信号，goroutine 在合适的检查点主动退出，从而彻底避免泄漏。几乎每个长生命周期的 goroutine 都该带 ctx。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：父取消，整棵树一起收</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 230" role="img" aria-label="根 context 取消后，子 goroutine 一并收到信号退出"><rect class="mixup-chip is-accent" x="250" y="18" width="140" height="40" rx="8"/><text class="mixup-title" x="320" y="44" text-anchor="middle">ctx 根</text><path class="mixup-arrow" d="M 320 60 v22"/><path class="mixup-guide" d="M 120 92 H 520"/><path class="mixup-arrow" d="M 160 92 v20"/><path class="mixup-arrow" d="M 320 92 v20"/><path class="mixup-arrow" d="M 480 92 v20"/><rect class="mixup-lane" x="95" y="116" width="130" height="44" rx="8"/><rect class="mixup-lane" x="255" y="116" width="130" height="44" rx="8"/><rect class="mixup-lane" x="415" y="116" width="130" height="44" rx="8"/><text class="mixup-sub" x="160" y="143" text-anchor="middle">查库</text><text class="mixup-sub" x="320" y="143" text-anchor="middle">调下游</text><text class="mixup-sub" x="480" y="143" text-anchor="middle">算结果</text><path class="mixup-arrow" d="M 160 162 v18"/><path class="mixup-arrow" d="M 320 162 v18"/><path class="mixup-arrow" d="M 480 162 v18"/><circle class="mixup-dot is-io" cx="160" cy="196" r="7"/><circle class="mixup-dot is-io" cx="320" cy="196" r="7"/><circle class="mixup-dot is-io" cx="480" cy="196" r="7"/><text class="mixup-caption" x="320" y="222" text-anchor="middle">cancel 一次，子树都该有退出路径</text></svg>
  </figure>
</section>

## 五、三者横向对比（Go 视角）

| 维度 | 进程 os/exec | 线程（M，runtime 托管） | goroutine |
|-|-|-|-|
| 创建成本 | \~2.6ms/个 | 内核级，数十 us 级 | \~187ns/个 |
| 初始栈 | 独立地址空间 | 数 MB（固定） | 2KB，动态增到 1GB |
| 切换成本 | 内核级，最重 | 1–10us，刷 TLB | \~64ns（channel 乒乓） |
| 能否并行 | 能（独立地址空间） | 能（多核） | 能（多路复用到多核） |
| 通信 | stdin/stdout/信号 | 共享内存 | channel / sync |
| 典型场景 | 调外部命令、强隔离 | runtime 内部托管，日常不直接用 | 几乎所有并发任务 |

## 六、本机实测基准

下面这些数字来自本机实测（Apple M5 / Go 1.26.1，热身后的稳定值）：

| 对象 | 指标 | 数值 |
|-|-|-|
| goroutine | 创建 + 等待 | \~187ns/个 |
| goroutine | 单个初始栈 | \~2KB（StackSys 实测 2031 字节） |
| channel 乒乓 | 一次切换 | \~64ns |
| 进程 /bin/true | 启动 | \~2.6ms |
| sync.Mutex vs atomic | 等量自增 | 512ms vs 62.5ms（约 8 倍） |

> 关键结论：goroutine 比 OS 线程创建便宜约 270 倍、切换快约 100 到 300 倍。这就是 Go 敢"随手开几万 goroutine"的底气，也是和 Python 多线程（受 GIL 限制）最本质的区别。

## 七、调度模型深挖：GMP

Go 调度器叫 GMP，三个字母各代表一类实体，理解它才能看懂前面那些"运行时自动帮你做"的事到底是怎么发生的。G（goroutine）是轻量执行流，初始栈 2KB，携带自己的执行上下文。M（machine）是 OS 线程，是真正执行 G 的载体，但它不能单独跑 G，必须绑定一个 P 才能取 G 来跑。P（processor）是逻辑处理器，数量等于 GOMAXPROCS（默认就是核数），它持有本地 G 队列（上限 256 个），是整个调度的中枢。

这套设计的核心机制值得逐条看清。每个 P 有自己的本地运行队列，M 绑定 P 之后从本地取 G 跑，跑完再取下一个；当本地空了，M 会先去全局队列找，再不行就去别的 P 那里"偷"一半过来（这个过程叫 work-stealing，工作窃取），保证所有核都不会闲着。当某个 G 阻塞在系统调用上时，和它绑定的 M 会一起被卡住，这时 P 会被 handoff（交接）给另一个空闲的 M 继续跑别的 G，被卡住的 M 等系统调用返回后变成空闲待命——这一手保证了"一个慢 syscall 不会拖垮一整个核"。sysmon 是运行时的后台监控线程，它对运行过久的 G 做抢占，防止某个 goroutine 死循环霸占 P。最后是网络 I/O：goroutine 等网络时走 netpoller（基于 epoll / kqueue），它直接把 G 挂起、不占用 M，所以高并发网络服务用极少的线程就能扛海量连接。这就是为什么 Go 写网络服务器那么省线程——大部分 goroutine 在等网络时根本不占 OS 线程。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：GMP 一层层往下接</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 230" role="img" aria-label="海量 G 经 P 本地队列复用到少量 M，再落到 CPU 核"><text class="mixup-title" x="320" y="28" text-anchor="middle">G · goroutine 海量</text><circle class="mixup-dot is-wait" cx="120" cy="52" r="5"/><circle class="mixup-dot is-live" cx="150" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="180" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="210" cy="52" r="5"/><circle class="mixup-dot is-live" cx="240" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="270" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="300" cy="52" r="5"/><circle class="mixup-dot is-live" cx="330" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="360" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="390" cy="52" r="5"/><circle class="mixup-dot is-live" cx="420" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="450" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="480" cy="52" r="5"/><circle class="mixup-dot is-wait" cx="510" cy="52" r="5"/><path class="mixup-arrow" d="M 320 62 v16"/><rect class="mixup-lane is-accent" x="70" y="86" width="150" height="44" rx="8"/><rect class="mixup-lane is-accent" x="245" y="86" width="150" height="44" rx="8"/><rect class="mixup-lane is-accent" x="420" y="86" width="150" height="44" rx="8"/><text class="mixup-sub" x="145" y="113" text-anchor="middle">P0 本地队列</text><text class="mixup-sub" x="320" y="113" text-anchor="middle">P1 本地队列</text><text class="mixup-sub" x="495" y="113" text-anchor="middle">P2 本地队列</text><path class="mixup-arrow" d="M 145 132 v16"/><path class="mixup-arrow" d="M 320 132 v16"/><path class="mixup-arrow" d="M 495 132 v16"/><rect class="mixup-chip" x="95" y="156" width="100" height="34" rx="6"/><rect class="mixup-chip" x="270" y="156" width="100" height="34" rx="6"/><rect class="mixup-chip" x="445" y="156" width="100" height="34" rx="6"/><text class="mixup-sub" x="145" y="178" text-anchor="middle">M0</text><text class="mixup-sub" x="320" y="178" text-anchor="middle">M1</text><text class="mixup-sub" x="495" y="178" text-anchor="middle">M2</text><text class="mixup-caption" x="320" y="214" text-anchor="middle">本地空了就去全局找，再不行就偷邻居的一半</text></svg>
  </figure>
</section>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-runtime-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">调度瓶在跑</span>
  </div>
  <p class="duang-whisper-body">你写 go，运行时写 GMP。慢 syscall 卡住时，P 会换人，核不该跟着闲。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 八、选型指南

Go 的选型比 Python 简单得多，因为 goroutine 又轻又真并行，不需要为"能不能并行"而分叉。绝大多数并发需求，直接开 goroutine 加 channel 通信就行，别犹豫——这就是 Go 的主场，运行时会把它们分布到多核。需要共享状态时，先用 channel 传递数据，实在不适合用 channel 的（比如频繁改一个全局缓存）再用 sync.Mutex，高频计数用 atomic。限制并发度也很常见：用带缓冲的 channel 当信号量，或者用固定 N 个 goroutine 的 worker pool 从 jobs channel 取活，防止无上限开 goroutine 打爆内存。只有调外部程序或者需要强隔离时，才用 os/exec 起子进程并配 context 管超时。CPU 密集任务在 Go 里不用特意处理——goroutine 天然被运行时分布到多核并行，不像 Python 那样得上多进程。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：默认走 goroutine，例外才开进程</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 200" role="img" aria-label="日常并发用 goroutine 加 channel；共享用锁或原子；隔离才用进程"><rect class="mixup-panel is-accent" x="30" y="28" width="200" height="140" rx="8"/><text class="mixup-title" x="130" y="68" text-anchor="middle">默认</text><text class="mixup-sub" x="130" y="98" text-anchor="middle">go + channel</text><text class="mixup-caption" x="130" y="128" text-anchor="middle">九成并发在这里</text><rect class="mixup-panel" x="250" y="28" width="170" height="140" rx="8"/><text class="mixup-title" x="335" y="68" text-anchor="middle">例外共享</text><text class="mixup-sub" x="335" y="98" text-anchor="middle">Mutex / atomic</text><text class="mixup-caption" x="335" y="128" text-anchor="middle">传不动再上锁</text><rect class="mixup-panel" x="440" y="28" width="170" height="140" rx="8"/><text class="mixup-title" x="525" y="68" text-anchor="middle">强隔离</text><text class="mixup-sub" x="525" y="98" text-anchor="middle">os/exec</text><text class="mixup-caption" x="525" y="128" text-anchor="middle">外部命令才用</text></svg>
  </figure>
</section>

## 九、常见坑

goroutine 泄漏是最隐蔽的一类：一个 goroutine 阻塞在没人往里写的 channel 上，或者卡在没有退出条件的 for 循环里，会永远驻留、内存慢慢涨。破解方法是给每个 goroutine 一个明确的退出路径——用 context 取消信号，或者 close 一个 done channel 通知它退。channel 死锁则是所有 goroutine 都在等 channel、没人推进，运行时直接报 fatal error: all goroutines are asleep - deadlock，这种通常是一端忘了启动或者忘了 close。向已关闭的 channel 发送会直接 panic，所以 close 的责任要归属清楚（通常发送方关，多个发送者时用 sync.Once 或者专门的收尾 goroutine 统一关）。context 没往下传是最常见的泄漏根源：子 goroutine 收不到取消信号，照样泄漏，所以 ctx 要作为第一个参数贯穿整条调用链。锁粒度太粗会把并发退化成串行——一个大 Mutex 包住整段逻辑，其他人全在等，锁只该保护真正共享的那几行。伪共享（false sharing）是更底层的坑：多个 goroutine 频繁写同一缓存行上不同变量，CPU 缓存反复失效、性能暴跌，结构体里用 padding 隔开就能缓解。最后是 for 循环变量捕获：Go 1.22 之前 for i := range 的 i 是同一个变量，goroutine 里用到会拿到错误值；1.22 起已按迭代独立，但老代码仍要小心。

## 十、面试高频考点（Go 视角）

### Q1. 进程、线程、协程的区别？

在 Go 语境下：进程是独立地址空间（os/exec 起），线程是运行时托管的 OS 线程（M），协程是 goroutine（G）。goroutine 初始栈 2KB、创建约 187 纳秒、切换约 64 纳秒，比 OS 线程便宜约 270 倍；且由 GMP 调度器多路复用到多核，能真正并行。

### Q2. GMP 模型是什么？

G 是 goroutine，M 是 OS 线程（执行载体，必须绑 P 才能跑 G），P 是逻辑处理器（数量等于 GOMAXPROCS，持有本地队列）。M 绑 P 后从本地取 G 跑，本地空了去全局队列或其它 P 偷（work-stealing）；G 阻塞系统调用时 P 被 handoff 给别的 M；sysmon 做抢占；网络 I/O 走 netpoller 不占 M。

### Q3. goroutine 和线程开销差多少？

创建约 187 纳秒对线程数十微秒（约 270 倍）；初始栈 2KB 对数 MB；切换约 64 纳秒对 1 到 10 微秒（100 到 300 倍）。原因：goroutine 调度全程用户态、不进内核、不刷 TLB，只保存少量寄存器。

### Q4. goroutine 为什么快？本质区别？

快在用户态调度、不进内核、协作式让出、栈极小可增长。本质区别：线程是内核调度实体（1:1 映射、抢占式），goroutine 是用户态抽象、由运行时以 M:N 多路复用；Go 的 goroutine 切换是用户态抢占与协作混合，不用像 Python asyncio 那样依赖主动 await。

### Q5. channel 该谁负责 close？

原则：发送方负责 close，且只关一次（重复 close 会 panic）。多个发送者时，用一个额外的 done channel 加一个专门的 goroutine 在所有发送者完成后统一 close，或者用 sync.Once 保护。接收方用逗号 ok 判断通道是否已空已关。

### Q6. context 是干什么的？

在 goroutine 树之间传递取消信号、超时、请求范围的值。父取消时派生出的子 goroutine 都能收到，避免泄漏；还能量化控制超时（context.WithTimeout）。是管理长生命周期 goroutine 的标准手段，几乎每个长 goroutine 都该把它作为第一个参数。

### Q7. Go 的调度是抢占式还是协作式？

用户态层面运行时能做抢占（sysmon 对运行过久的 G 做 preempt），不用像 Python asyncio 那样依赖协程主动 await；同时 goroutine 在 channel 操作、系统调用、GC 等点也会让出。所以 Go 既不会因某个 goroutine 死循环卡死整个线程，又不像纯协作式那样脆弱。

### Q8. 怎么限制 goroutine 数量？

两种常见法：worker pool（固定 N 个 goroutine 从 jobs channel 取活，任务多就排队）；或用带缓冲 channel 当信号量，进临界区前 ch <- struct{}{}，出来后 <-ch，缓冲大小即并发上限。无上限地 go func() 会打爆内存。

### Q9. Go 常见并发 bug 有哪些？

死锁（全员等 channel）、竞态（裸共享变量没加锁，race detector 能抓）、goroutine 泄漏（阻塞在无接收的 channel）、向已关 channel 发送 panic、context 未传播导致泄漏、锁粒度太粗退化串行。写并发代码时把"退出路径"和"共享保护"想清楚。

## 相关阅读

本文是 Go 视角的独立文章。若要对照 Python 视角，见同主题 [进程、线程、协程详解（Python 视角）](/posts/process-thread-coroutine-python/)。继续深入并发与性能，可看 [高性能后端实战](/posts/perf-backend/)。
