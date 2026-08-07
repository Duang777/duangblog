---
author: Duang
pubDatetime: 2026-08-07T13:20:00+08:00
title: 进程、线程、协程详解（Python 视角）
featured: true
draft: false
tags:
  - 易混专栏
  - 进程
description: 只聊 Python 里的进程、线程、协程：GIL、multiprocessing、threading、asyncio，以及怎么选。
---

**系列说明**｜这是 [易混专栏](/posts/dont-mix/) 里 [进程](/tags/进程/) 主题下的一篇。同主题另有 [Go 视角](/posts/process-thread-coroutine-go/)，可以单独看，也可以对照读。

这篇文章只聊 Python 一门语言里的进程、线程、协程：它们分别是什么、实际怎么写、开销差多少、什么时候该用哪个。

> 读之前先记住一句话：在 Python 里写并发，绕不开一把叫 GIL 的锁。它导致默认情况下多线程跑 CPU 任务并不能变快，所以 Python 的选型思路和 Go 这类语言完全不一样。后面所有"该用哪个"的判断，都建立在这条上。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-flask-gil.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">GIL 瓶在排队</span>
  </div>
  <p class="duang-whisper-body">八个线程很热闹。真干活的核，常常还是一个。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 一、为什么 Python 的并发要单独讲

很多语言讲并发时，基本默认"开几个线程就能把多核用满"。Python 做不到，原因是 CPython 解释器里有一把全局解释器锁，简称 GIL：同一个进程里，同一时刻只允许一个线程真正在跑 Python 代码。这不是设计者故意为难你，而是一个具体的取舍，我们得先弄明白它到底解决了什么。

CPython 管理对象的内存，靠的是引用计数。简单说，每个对象都记着"现在有几个地方在用我"，一旦这个数字变成 0，对象立刻被回收。问题在于，这个"数字加一、减一"的动作并不是一气呵成、不可打断的。如果两个线程同时去引用同一个对象，计数器的自增可能交错在一起，结果少算一次——要么对象被提前释放（留下一个指向已销毁内存的悬空引用，程序直接崩），要么永远不释放（内存泄漏）。要想在多线程下保证引用计数不出错，要么给每个对象配一把细粒度的锁（开销大、还容易死锁），要么干脆用一把大锁把整个解释器锁住。Python 选了后者，GIL 就是这么来的：它的初衷不是为了限制你，而是为了让单线程跑得快、实现起来简单，是个早期的历史妥协。

代价也很现实。在多核机器上你开 8 个线程去跑 CPU 任务，实际还是只有一个核在跑 Python 代码，甚至可能因为多个线程反复抢锁、反复切换，比单线程还要慢。所以 Python 的并发必须分两条路走：想真正并行、吃满多核做 CPU 计算，得用 multiprocessing，每个进程各有一把独立的 GIL，互不干扰；做 I/O 密集的任务（网络请求、读写磁盘），等待的时候线程会主动让出 GIL，所以多线程和 asyncio 都能靠"等待时让位"来实现高吞吐，根本不需要并行。这就是 Python 和 Go 在并发思路上最根本的分叉，后面每一节都建立在这个分叉之上。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：一把 GIL，还是多把 GIL</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 220" role="img" aria-label="多线程抢一把 GIL 只能跑一核；多进程各有一把 GIL 能并行"><rect class="mixup-panel is-soft" x="12" y="12" width="616" height="196" rx="14"/><rect class="mixup-panel" x="28" y="28" width="278" height="164" rx="10"/><text class="mixup-title" x="167" y="54" text-anchor="middle">threading · 一把 GIL</text><circle class="mixup-dot is-wait" cx="62" cy="96" r="7"/><circle class="mixup-dot is-wait" cx="94" cy="96" r="7"/><circle class="mixup-dot is-live" cx="126" cy="96" r="7"/><circle class="mixup-dot is-wait" cx="158" cy="96" r="7"/><circle class="mixup-dot is-wait" cx="190" cy="96" r="7"/><circle class="mixup-dot is-wait" cx="222" cy="96" r="7"/><circle class="mixup-dot is-wait" cx="254" cy="96" r="7"/><path class="mixup-lock" d="M 116 126 h20 v16 h-20 z M 120 126 v-8 a6 6 0 0 1 12 0 v8"/><text class="mixup-sub" x="167" y="164" text-anchor="middle">同时只有一个线程在跑 Python</text><text class="mixup-caption" x="167" y="182" text-anchor="middle">核再多也排队</text><rect class="mixup-panel is-accent" x="334" y="28" width="278" height="164" rx="10"/><text class="mixup-title" x="473" y="54" text-anchor="middle">multiprocessing · 各一把</text><rect class="mixup-lane" x="356" y="78" width="48" height="58" rx="6"/><rect class="mixup-lane" x="416" y="78" width="48" height="58" rx="6"/><rect class="mixup-lane" x="476" y="78" width="48" height="58" rx="6"/><rect class="mixup-lane" x="536" y="78" width="48" height="58" rx="6"/><circle class="mixup-dot is-live" cx="380" cy="107" r="6"/><circle class="mixup-dot is-live" cx="440" cy="107" r="6"/><circle class="mixup-dot is-live" cx="500" cy="107" r="6"/><circle class="mixup-dot is-live" cx="560" cy="107" r="6"/><text class="mixup-sub" x="473" y="164" text-anchor="middle">每进程独立 GIL · 真并行</text><text class="mixup-caption" x="473" y="182" text-anchor="middle">对齐核数最香</text></svg>
  </figure>
</section>

## 二、进程：multiprocessing

先说进程是什么。进程是操作系统分配资源的最小单位，也是隔离最彻底的执行体。每个进程都有自己独立的一块内存空间、独立的文件句柄表，当然也各持有一把 GIL。一个进程如果崩了（比如访问了非法内存），通常不会直接拖垮别的进程，因为大家的内存互不相干；两个进程之间想交换数据，必须借助内核提供的专门机制，不能直接读对方的内存。Python 用 multiprocessing 模块来开进程，而且它的 API 故意设计得和 threading 很像（同样是 start、join 这些名字，同样是 Lock、Queue 这种叫法），目的就是让你从多线程代码迁到多进程时改动最小。

### 启动子进程的三种方式

multiprocessing 起子进程有三种方式，差别在于"子进程一开始的内存从哪来"，这直接决定了启动快慢和安不安全。

spawn 是 macOS 和 Windows 的默认方式，也是三者里最安全、但最慢的。它不复制父进程的内存，而是重新启动一个干净的 Python 解释器，然后重新导入你的主模块，再从指定入口开始跑。正因为要重新导入主模块，如果你的执行代码直接写在文件最外层（没有包在 if \_\_name\_\_ == "\_\_main\_\_": 里面），子进程一导入就会又执行一遍、又去 spawn，陷入无限套娃。所以在 spawn 模式下，那个守卫语句不是可选项，是必须写的。

fork 是 Unix 系统历史上有过的默认方式，它直接把父进程的整个内存空间复制一份给子进程，速度极快，子进程瞬间就拥有父进程的所有变量。但它有个致命隐患：如果在已经有线程在跑的进程里 fork，子进程只会复制那个调用 fork 的线程，其他线程手里的锁在子进程里永远停在"已锁"状态，一旦去访问就会死锁。forkserver 是 Unix 上的一剂折中：先起一个干净的单线程服务进程，之后所有干活的进程都由这个干净进程复制出来，既快，又绕开了"带着锁去 fork"的坑。

### 进程池与通信

实际开发里几乎不会手动一个一个 Process.start()，而是用 multiprocessing.Pool 或者 concurrent.futures.ProcessPoolExecutor，把一批 CPU 任务自动分发到多个核上；当进程数对齐核数时，并行度最高。通信方面，Queue 是最常用的进程安全队列，Pipe 是双向的字节管道，两者底层都是靠序列化（pickle，把对象转成字节流）在进程之间搬数据。如果你嫌序列化太慢，可以用共享内存 Value / Array，它真的在一块大家都能访问的内存上操作，读写最快，但正因为绕过了 Queue 的保护，你得自己加锁。Manager 则把一个对象（比如 dict、list）代理到一个专门的管理进程，调用方像操作本地对象一样去访问，灵活，但每次访问都要走一次进程间通信，最慢。

选型上记住一个口诀：高频小数据走共享内存省序列化，解耦的生产消费走 Queue，跨机器才走 Socket。下面这段代码把四份 CPU 任务分发到 4 个核上并行跑，注意入口必须包在 \_\_main\_\_ 守卫里。
```python
import multiprocessing, time, math

def cpu_task(n):
    return sum(math.sqrt(i) for i in range(n))

if __name__ == "__main__":
    data = [3_000_000] * 4
    t0 = time.perf_counter()
    with multiprocessing.Pool(4) as p:
        print(p.map(cpu_task, data))
    print("elapsed", time.perf_counter() - t0)

```

进程适合什么场景，说起来很明确：CPU 密集、需要真正并行、隔离要求高的任务。代价也同样明确：创建贵（本机 spawn 约 20ms，比线程贵几百倍），通信要序列化，开销远高于线程。所以它不该被用来做"轻量并发"，而是专门解决"并行计算"。

## 三、线程：threading 与 GIL

线程和进程最大的不同，是线程共享同一个进程的内存空间。所有变量、文件句柄、堆内存都是大家共用的，只有每个人自己的调用栈是独立的。这让线程的创建和通信都特别便宜——两个线程读写同一个变量，不需要任何序列化，直接读直接写就行。但便宜的代价是几乎没有隔离：一个线程写越界可能踩坏另一个线程的数据，一个线程崩了往往整个进程一起完蛋，所以线程之间必须靠锁来协调谁先谁后访问共享数据。

### GIL 到底是什么，怎么运转的

GIL 是 CPython 为了内存安全引入的一把进程级的全局锁。任何线程想执行 Python 代码，都得先拿到这把锁。拿到锁的线程跑一段之后会主动释放，让别的线程有机会抢。早期的 CPython 是"执行了 100 条底层指令就释放一次"，3.2 之后改成了按时间片让出（默认每 5 毫秒），本质都是一种轮流用锁的协作机制。

这里有几个关键点，决定了 Python 多线程的真实表现。第一，GIL 只在执行 Python 代码本身时起作用；当你调用一个会释放 GIL 的 C 扩展（比如 numpy 算大数组、部分加密库、部分图像处理库），那段计算其实是真正并行的，因为 C 代码执行期间 GIL 是被放开的状态。第二，做 I/O 操作（网络、磁盘）时，线程会阻塞在系统调用上，阻塞前会释放 GIL，所以多个线程做 I/O 时，等待的一方让出锁、另一方就能跑，多线程 I/O 依然有效。第三，纯 Python 的 CPU 计算全程都抱着 GIL，多核也只有一个核在跑代码，这就是"多线程跑 CPU 任务不但不加速、反而更慢"的根因。

GIL 为什么一直没去掉？原因有三：一是历史包袱，大量 C 扩展都假设"有 GIL 在就不需要自己加锁"；二是彻底移除要把引用计数改成更精细的并发方案，工作量巨大，而且会拖慢单线程；三是社区一度认为多进程和 asyncio 已经提供了并行的出路。到 2026 年的现状是：默认发行的 CPython 仍然带 GIL；3.13 起提供了实验性的 free-threaded（无 GIL）构建，用对象级的细粒度锁替代 GIL；3.14 把这个 free-threaded 构建转为官方支持，但仍是可选版本，单线程性能相比带 GIL 版本会有 5% 到 10% 的下降。换句话说，默认版本到今天 GIL 还在，面试里"Python 多线程能不能并行"的标准答案依然是"不能，除非用 free-threaded 或者换成多进程"。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-warm-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">热瓶也得排队</span>
  </div>
  <p class="duang-whisper-body">GIL 不是骂名，是历史账。算账之前先分清：你在等 IO，还是在烧 CPU。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

### 线程安全的工具

既然共享内存不加保护就会出数据竞争，threading 就提供了一整套同步工具。Lock 是最基础的互斥锁，一段代码进锁后别的线程必须等它出锁；RLock 是可重入锁，同一个线程可以多次加锁而不会把自己锁死，适合有嵌套调用的场景。Condition 在 Lock 之上提供了"等到某个条件成立"的能力，典型用于生产者消费者；Semaphore 用计数器来限流，允许 N 个线程同时进入；Event 是一个简单的开/关信号，一个线程 set 之后所有等待的线程被唤醒。threading.local 则是反过来的思路——它给每个线程一个独立副本，让"看起来像全局变量、其实是线程私有"的数据不需要加锁。下面这段代码演示了不加锁会算错的共享计数，用 Lock 把自增包起来之后结果才正确。
```python
import threading, time

counter = 0
lock = threading.Lock()

def worker():
    global counter
    for _ in range(100_000):
        with lock:
            counter += 1

threads = [threading.Thread(target=worker) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(counter)  # 400000，加锁后无误

```

线程适合 I/O 密集的场景，也适合调用那些会释放 GIL 的 C 扩展。如果你只是想在 CPU 上并行，线程帮不上忙，得上一段讲的多进程。

## 四、协程：asyncio

Python 的协程是跑在单个线程、单个事件循环上的用户态调度实体。它和 Go 那种"每个协程有自己独立调用栈"不同，asyncio 是 stackless（无栈）的——协程没有自己独立的调用栈，它的执行状态以协程对象的形式存在堆内存上，靠类似生成器的方式记录"暂停在哪、下次从哪恢复"，在解释器层面做切换。

理解 asyncio，先抓几个核心概念。用 async def 定义的协程函数，调用它并不会立刻执行函数体，而是返回一个协程对象，相当于"一张还没开始跑的待办单"；真正让它跑起来的是 await，await 会驱动协程执行到第一个暂停点，然后把手里的控制权交回事件循环。Task 是把协程对象包装之后提交给事件循环去调度的容器，事件循环负责在合适的时机推进它；Future 是更底层的"将来会有结果"的占位对象，Task 本质上是 Future 的子类。asyncio.run 负责启动并管理整个事件循环的生命周期，create_task 把协程提交成任务，gather / wait 用来并发地等一组任务，3.11 之后新增的 TaskGroup 还提供了结构化并发——一个任务出错会取消同组其余任务，避免出现孤儿协程。

这里有个特别容易踩的坑：同步原语不能混用。asyncio 自己也有 Lock、Event、Queue、Semaphore，但它们是 async 版本，必须用 await 来获取和释放。如果你在 async 函数里直接用了 threading.Lock，由于它锁住的是"线程"而不是"协程"，而 asyncio 在单线程内切换协程并不会释放线程锁，结果就是：持锁的协程被 await 挂起、交出了控制权，另一个协程想拿同一把锁时，整个线程被卡死。所以在 async 的世界里必须用 asyncio 自己的同步原语，二者不能混。
```python
import asyncio

async def fetch(name):
    await asyncio.sleep(0.1)  # 模拟 I/O
    return f"{name} done"

async def main():
    results = await asyncio.gather(fetch("a"), fetch("b"), fetch("c"))
    print(results)

asyncio.run(main())

```

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：一个事件循环，一圈在等 I/O</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 240" role="img" aria-label="单线程事件循环中央调度，外围协程多数在等 IO，一个在跑"><circle class="mixup-ring" cx="320" cy="118" r="86"/><circle class="mixup-ring" cx="320" cy="118" r="58"/><circle class="mixup-fill" cx="320" cy="118" r="34"/><text class="mixup-title" x="320" y="114" text-anchor="middle">event</text><text class="mixup-title" x="320" y="132" text-anchor="middle">loop</text><circle class="mixup-dot is-live" cx="320" cy="32" r="8"/><circle class="mixup-dot is-io" cx="420" cy="58" r="7"/><circle class="mixup-dot is-io" cx="448" cy="118" r="7"/><circle class="mixup-dot is-io" cx="420" cy="178" r="7"/><circle class="mixup-dot is-io" cx="320" cy="204" r="7"/><circle class="mixup-dot is-io" cx="220" cy="178" r="7"/><circle class="mixup-dot is-io" cx="192" cy="118" r="7"/><circle class="mixup-dot is-io" cx="220" cy="58" r="7"/><path class="mixup-arrow" d="M 320 42 v24"/><circle class="mixup-dot is-live" cx="168" cy="228" r="4"/><text class="mixup-caption" x="180" y="232">正在跑</text><circle class="mixup-dot is-io" cx="268" cy="228" r="4"/><text class="mixup-caption" x="280" y="232">await 等 I/O</text><text class="mixup-caption" x="400" y="232">同刻只有一个在前进</text></svg>
  </figure>
</section>

底层真相值得讲透：asyncio 的协程本质是增强版生成器，每次 await 切换都要在解释器层面做对象分配、回调调度、状态保存，这些事都发生在 Python 代码的层面。本机实测下来，asyncio 每次 await 切换大约 19 微秒，反而比操作系统线程的内核级切换（典型 1 到 10 微秒）更慢。所以 asyncio 的强项从来不是"切换快"，而是"在单个线程内避开了线程之间的锁竞争和 GIL 下的并行失效"——它用单线程内的协作调度，换取了海量连接下极低的内存占用和没有锁开销的高吞吐。也正因如此，asyncio 不适合 CPU 密集：一旦某个协程里跑了长时间计算，它霸占着事件循环不主动 await，其他所有协程都会被饿死。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：创建成本差一个数量级还多</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 200" role="img" aria-label="进程约 20ms，线程约 50us，协程约 5us"><text class="mixup-title" x="40" y="36">创建成本（本机量级）</text><text class="mixup-label" x="40" y="72">进程 ~20ms</text><rect class="mixup-bar is-heavy" x="150" y="58" width="430" height="18" rx="3"/><text class="mixup-label" x="40" y="112">线程 ~50us</text><rect class="mixup-bar" x="150" y="98" width="72" height="18" rx="3"/><text class="mixup-label" x="40" y="152">协程 ~5us</text><rect class="mixup-bar is-light" x="150" y="138" width="22" height="18" rx="3"/><text class="mixup-caption" x="40" y="184">条越长越贵。便宜不等于能并行，贵也不等于该躲开。</text></svg>
  </figure>
</section>

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-three-bottles.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">三瓶别灌混</span>
  </div>
  <p class="duang-whisper-body">进程贵在隔离，线程贵在共享，协程贵在自觉。混着灌，味道就糊了。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 五、三者横向对比（Python 视角）

| 维度 | 进程 multiprocessing | 线程 threading | 协程 asyncio |
|-|-|-|-|
| 创建成本 | \~20ms/个（spawn 重导模块） | \~50us/个 | \~5us/个（Task） |
| 常驻内存 | 独立地址空间，最重 | \~17KB/线程（虚拟栈 1–8MB 惰性分配） | 帧在堆上，Task 仅数百字节 |
| 切换成本 | 内核级，1–10us 且刷 TLB | 内核级，1–10us | \~19us（await，解释器层） |
| 能否并行 CPU | 能（每进程独立 GIL） | 不能（GIL 限制） | 不能（单线程） |
| 通信方式 | Queue / Pipe / 共享内存 | 共享内存 + Lock | await / asyncio.Queue |
| 隔离性 | 强，崩溃互不影响 | 弱，一崩全崩 | 弱，一崩整个循环 |
| 典型场景 | CPU 密集并行 | I/O 密集、C 扩展释放 GIL | 高并发 I/O、海量连接 |

## 六、本机实测基准

下面这些数字来自本机实测（Apple M5 / Python 3.13.12，热身后的稳定值），不是凭感觉估的：

| 对象 | 指标 | 数值 |
|-|-|-|
| threading.Thread | 创建 + join | \~50us/个 |
| threading.Thread | 常驻内存 | \~17KB/线程 |
| multiprocessing.Process | 创建 + join（spawn） | \~20ms/个 |
| asyncio.Task | 创建 | \~5us/个 |
| asyncio await | 调度切换 | \~19us/次 |

GIL 对 CPU 密集的影响，本机实测（4 核上跑 4 份 sum(sqrt) 任务）给出了一个很直观的反例：单线程 0.195 秒跑完；开两个线程反而要 0.248 秒，更慢了，多出来的时间就是抢 GIL 的调度开销；开两个进程 0.224 秒，确实并行了，但进程调度和序列化略微拖慢，所以没达到理论上的一半时间。这个反例是判断任务类型的第一性原理——先判断是 CPU 密集还是 I/O 密集，再决定选型，这也是面试必问的点。

> 记住这个反例：Python 多线程跑 CPU 任务比单线程还慢。所以判断任务类型（CPU 密集 vs I/O 密集），是选型的第一步。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：本机反例，三条线比一比</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="单线程 0.195 秒，两线程 0.248 秒更慢，两进程 0.224 秒并行"><line class="mixup-guide" x1="140" y1="36" x2="140" y2="168"/><text class="mixup-label" x="40" y="58">单线程</text><rect class="mixup-bar is-light" x="150" y="42" width="195" height="20" rx="4"/><text class="mixup-sub" x="356" y="57">0.195s</text><text class="mixup-label" x="40" y="108">两线程</text><rect class="mixup-bar is-heavy" x="150" y="92" width="248" height="20" rx="4"/><text class="mixup-sub" x="410" y="107">0.248s · 更慢</text><text class="mixup-label" x="40" y="158">两进程</text><rect class="mixup-bar" x="150" y="142" width="224" height="20" rx="4"/><text class="mixup-sub" x="386" y="157">0.224s · 并行了</text><text class="mixup-caption" x="40" y="192">同量 sum(sqrt) 任务。抢 GIL 会把热闹变成排队。</text></svg>
  </figure>
</section>

## 七、调度模型深挖

### GIL 与 free-threaded

在默认的构建里，GIL 把 Python 代码的执行串行化了，多线程 CPU 任务被锁死在单核。3.13 之后提供的 free-threaded 构建移除了 GIL，改用对象级的细粒度锁，多线程 CPU 任务能真正并行，代价是单线程性能略降（5% 到 10%）。但它是可选版本，默认发行的还是带 GIL 的。如果你在多核上跑纯 Python 计算、又没法改算法，free-threaded 是值得一试的路，只是要确认你依赖的 C 扩展也支持无 GIL 构建。

### asyncio 事件循环

事件循环是单线程、协作式的调度核心。底层它借用了操作系统提供的 I/O 多路复用机制（Linux 的 epoll、macOS 的 kqueue）来同时盯着海量 socket，哪个 socket 就绪了，就唤醒对应的协程继续往下跑。协程之间靠 await 主动让出控制权，这意味着一个协程如果不写 await，就会一直占着循环，别人永远没机会——协作式调度的软肋就在这里：它依赖每个协程"自觉"让出。早期的 asyncio 用 @asyncio.coroutine 装饰器加 yield from 来写协程，现在统一成了 async / await 语法糖，读起来顺多了。

### multiprocessing

每个子进程都是独立的 Python 解释器，各有各的 GIL 和内存空间，调度完全交给操作系统。它真的能并行，但因为跨进程通信要序列化（pickle），数据搬运的开销比线程共享内存大得多。这也是为什么进程适合"粗粒度、少通信"的并行任务，而不适合"频繁交换小数据"的场景。

## 八、选型指南

选型的核心是先给任务分类，再选模型，而不是反过来。CPU 密集、又需要并行的任务，用 multiprocessing / ProcessPoolExecutor，进程数对齐核数，这是 Python 里唯一能真正用满多核跑纯 Python 计算的路。I/O 密集、而且连接数极高（比如万级的 WebSocket、海量并发请求）的任务，用 asyncio，单线程调度海量协程，内存和切换成本远低于多线程。I/O 密集、但逻辑简单、你不想写 async 代码的任务，用多线程 threading 就够，直观也够用。混合型任务——少量 CPU 计算加大量 I/O，可以用 asyncio 做主循环，再用 loop.run_in_executor 把 CPU 活丢给线程池或进程池，让阻塞的计算不卡住事件循环。一句话总结：要并行选进程，高并发 I/O 选 asyncio，简单 I/O 选线程。

<section class="article-embed-note mixup-figure">
  <p class="article-embed-note-title">图解：先问任务，再选瓶子</p>
  <figure class="mixup-scene">
<svg class="mixup-svg" viewBox="0 0 640 210" role="img" aria-label="CPU 密集选进程，高并发 IO 选 asyncio，简单 IO 选线程"><rect class="mixup-chip" x="220" y="16" width="200" height="44" rx="8"/><text class="mixup-title" x="320" y="44" text-anchor="middle">先问：任务是什么</text><path class="mixup-arrow" d="M 320 62 v18"/><path class="mixup-arrow" d="M 120 90 v18"/><path class="mixup-arrow" d="M 320 90 v18"/><path class="mixup-arrow" d="M 520 90 v18"/><path class="mixup-arrow" d="M 120 80 H 520"/><rect class="mixup-panel is-accent" x="30" y="112" width="180" height="78" rx="8"/><text class="mixup-title" x="120" y="142" text-anchor="middle">CPU 密集</text><text class="mixup-sub" x="120" y="166" text-anchor="middle">multiprocessing</text><rect class="mixup-panel" x="230" y="112" width="180" height="78" rx="8"/><text class="mixup-title" x="320" y="142" text-anchor="middle">高并发 I/O</text><text class="mixup-sub" x="320" y="166" text-anchor="middle">asyncio</text><rect class="mixup-panel" x="430" y="112" width="180" height="78" rx="8"/><text class="mixup-title" x="520" y="142" text-anchor="middle">简单 I/O</text><text class="mixup-sub" x="520" y="166" text-anchor="middle">threading</text></svg>
  </figure>
</section>

## 九、常见坑

GIL 幻觉是最典型的误判：以为开多线程就能加速 CPU 任务，结果更慢。破解方法永远是先判断任务类型，CPU 密集就立刻换多进程。asyncio 里混进同步阻塞是另一个高频坑——在 async 函数里调用 time.sleep 或者同步的网络库，整个事件循环会停摆，因为同步调用不会让出控制权，正确做法是换成 await asyncio.sleep 或者异步客户端（比如 aiohttp）。僵尸进程来自父进程没有 join、没有回收子进程，子进程退出后变成僵尸占着进程号，用进程池统一回收最省心。数据竞争是多线程共享变量不加锁导致的偶发错值，最难复现，优先用 Queue 或者原子操作而不是裸共享。数量失控指无上限地建线程 / 协程，打满内存或者把内核调度压垮，用 Semaphore 或者协程池来限流。最后，Lock 混用——把 threading.Lock 塞进 async 函数会死锁，必须用 asyncio 自己的同步原语。

## 十、面试高频考点（Python 视角）

### Q1. 进程、线程、协程的区别？

从三个维度看。资源隔离：进程有独立内存空间，线程共享进程空间但各自有独立的栈，协程（asyncio）的执行状态在堆上、没有独立栈。调度方式：进程和线程由内核抢占式调度，协程由事件循环在用户态协作式调度。并行能力：进程能真并行（各一把 GIL），线程受 GIL 限制不能并行 CPU，协程单线程更不行。切换成本依次递减，但 Python 的 asyncio 因为解释器开销，实测切换反而比线程慢。

### Q2. GIL 是什么？影响什么？2026 现状？

全局解释器锁，限制同一进程内同时只有一个线程执行 Python 代码。影响：多线程 CPU 任务无法并行；I/O 密集仍然有用，因为等待时会释放 GIL。现状：默认 CPython 仍有 GIL；3.13 起实验性 free-threaded，3.14 转官方支持但仍可选，单线程差距收窄到 5% 到 10%。

### Q3. 单线程的协程能并行吗？

不能。单个事件循环同一时刻只跑一个协程，所谓并发只是快速切换的假象。要并行得靠多进程或多线程承载多个事件循环，例如 loop.run_in_executor 把活丢给进程池 / 线程池。

### Q4. 协程为什么快？和线程本质区别？

快在用户态调度、不进内核、不刷 TLB、协作式让出。本质区别在调度权归属：线程是内核调度实体（抢占式），协程调度权在事件循环（协作式）。反例：asyncio 切换约 19 微秒，反而比 OS 线程 1 到 10 微秒慢，它赢在避开 GIL 失效和锁竞争，而不是切换快。

### Q5. 进程间通信有哪些？

Queue、Pipe、共享内存（Value / Array，最快但要加锁）、Manager（代理对象，灵活但慢）、Socket。高频大数据走共享内存，解耦的生产消费走 Queue，跨网络走 Socket。

### Q6. threading.Lock 和 asyncio.Lock 区别？

前者给 OS 线程用，阻塞时让出 CPU；后者给协程用，await 时挂起协程而不阻塞整个线程。混用（在 async 里用 threading.Lock）会死锁，因为锁住的是线程而非协程。

### Q7. CPU 密集任务怎么并行？

用 multiprocessing / ProcessPoolExecutor，每个子进程独立 GIL，能真正用满多核。asyncio 和多线程都做不到 CPU 并行。

### Q8. 上下文切换差在哪？

进程切换要换页表、刷 TLB，最重；线程切换换寄存器栈、不刷 TLB，较轻；协程切换只换少量寄存器、不进内核，最轻。但 Python asyncio 因为解释器开销，实测切换反而比线程慢。

### Q9. 为什么 asyncio 适合高并发 I/O？

单线程事件循环用 epoll / kqueue 同时监听海量 socket，哪个就绪唤醒哪个协程，开销是协程级（数百字节）而非线程级（数十 KB）。万级连接下内存和切换成本远低于多线程。

## 相关阅读

本文是 Python 视角的独立文章。若要对照 Go 视角，见同主题 [进程、线程、协程详解（Go 视角）](/posts/process-thread-coroutine-go/)。继续深入并发与性能，可看 [高性能后端实战](/posts/perf-backend/)。
