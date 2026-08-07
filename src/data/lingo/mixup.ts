import type { LingoTerm } from "./types";

/** 易混专栏 · 进程 / 线程 / 协程 domain pack. */
export const MIXUP_LINGO: LingoTerm[] = [
  {
    id: "process",
    title: "Process",
    subtitle: "进程",
    definition:
      "操作系统分配资源的基本单位：独立的地址空间、文件句柄表，以及各自的运行状态。一个进程崩了，通常不会直接拖垮别的进程，因为内存互不相干。\n\n进程之间要交换数据，必须走内核提供的机制（管道、队列、共享内存、套接字等），不能直接读写对方内存。创建和切换成本通常高于线程。",
    aliases: ["Process", "process", "进程", "子进程", "操作系统进程"],
    source: {
      label: "Wikipedia: Process (computing)",
      url: "https://en.wikipedia.org/wiki/Process_(computing)",
    },
  },
  {
    id: "thread",
    title: "Thread",
    subtitle: "线程",
    definition:
      "进程内部的执行流。同一进程里的线程共享地址空间和大多数资源，各自保留独立的调用栈。创建和通信通常比进程便宜，但隔离弱：一个线程踩内存，常常拖垮整个进程。\n\n线程一般由操作系统调度（抢占式）。多个线程可以并发；在多核上能否真正并行，还取决于语言运行时是否加了全局锁之类的限制。",
    aliases: ["Thread", "thread", "线程", "OS 线程", "操作系统线程"],
    source: {
      label: "Wikipedia: Thread (computing)",
      url: "https://en.wikipedia.org/wiki/Thread_(computing)",
    },
  },
  {
    id: "coroutine",
    title: "Coroutine",
    subtitle: "协程",
    definition:
      "可在用户态暂停并稍后恢复的执行体。调度权通常在语言运行时或事件循环，而不是每次都进内核做线程切换。\n\n协程提供并发（交错推进），本身不保证并行（同一时刻多核同时算）。Python asyncio 的协程偏无栈、靠 await 协作让出；Go 的 goroutine 更接近可增长栈的轻量执行流，并由运行时做 M:N 调度。",
    aliases: ["Coroutine", "coroutine", "协程"],
    source: {
      label: "Wikipedia: Coroutine",
      url: "https://en.wikipedia.org/wiki/Coroutine",
    },
  },
  {
    id: "gil",
    title: "GIL",
    subtitle: "Global Interpreter Lock",
    definition:
      "CPython 进程里的一把全局互斥锁：同一时刻通常只允许一个线程执行 Python 字节码。它最初是为了简化内存管理（尤其是引用计数）和 C 扩展的线程安全假设。\n\n后果是：纯 Python 的 CPU 密集任务，多线程往往吃不满多核；做阻塞 I/O 或释放 GIL 的 C 扩展时，其他线程仍有机会推进。想并行算 CPU，常见出路是多进程，或使用可选的 free-threaded 构建。",
    aliases: ["GIL", "gil", "全局解释器锁", "Global Interpreter Lock"],
    source: {
      label: "Wikipedia: Global interpreter lock",
      url: "https://en.wikipedia.org/wiki/Global_interpreter_lock",
    },
  },
  {
    id: "free-threaded",
    title: "free-threaded",
    subtitle: "无 GIL 构建 · PEP 703",
    definition:
      "CPython 从 3.13 起提供的可选构建：去掉默认的全局解释器锁，改用更细粒度的对象保护，让多线程 CPU 任务有机会真正并行。\n\n它不是默认发行形态；单线程路径可能变慢一点，且依赖的 C 扩展需要适配。到 3.14 起官方支持度更高，但生产选型仍要按发行版与扩展生态核实。",
    aliases: [
      "free-threaded",
      "free threaded",
      "无 GIL",
      "无 GIL 构建",
      "PEP 703",
    ],
  },
  {
    id: "reference-counting",
    title: "Reference counting",
    subtitle: "引用计数",
    definition:
      "一种对象生命周期管理方式：每个对象记录有多少引用指向它；计数变为 0 就立刻回收。CPython 默认就靠这套，再辅以循环引用检测。\n\n计数的加减本身不是原子操作。多线程同时改同一对象的引用计数时，若没有保护就会少算或多算，进而导致过早释放或泄漏。GIL 的历史动机之一，就是把这类更新串行化。",
    aliases: ["引用计数", "Reference counting", "reference counting", "引用计数器"],
    source: {
      label: "Wikipedia: Reference counting",
      url: "https://en.wikipedia.org/wiki/Reference_counting",
    },
  },
  {
    id: "multiprocessing",
    title: "multiprocessing",
    subtitle: "Python 多进程",
    definition:
      "Python 标准库里用操作系统进程做并行的模块。每个子进程有独立的解释器和独立的 GIL，所以能把纯 Python 的 CPU 任务真正摊到多核上。\n\n代价是启动更贵、进程间通信常常要序列化。常见入口还有 concurrent.futures.ProcessPoolExecutor。在 spawn 启动方式下，入口逻辑通常要放进 if __name__ == \"__main__\" 守卫里。",
    aliases: [
      "multiprocessing",
      "ProcessPoolExecutor",
      "多进程",
      "进程池",
    ],
  },
  {
    id: "threading-module",
    title: "threading",
    subtitle: "Python 多线程",
    definition:
      "Python 标准库的线程模块，封装操作系统线程。线程共享进程内存，适合 I/O 等待、或会释放 GIL 的本地扩展计算。\n\n在默认带 GIL 的 CPython 里，多线程跑纯 Python CPU 任务通常无法并行，有时还会因抢锁更慢。共享可变状态时要用 Lock 等同步原语，或改走队列传递数据。",
    aliases: ["threading", "threading.Thread", "多线程", "ThreadPoolExecutor"],
  },
  {
    id: "asyncio",
    title: "asyncio",
    subtitle: "Python 异步 I/O",
    definition:
      "Python 标准库的异步框架：在单个线程里用事件循环调度大量协程。协程在 await 处让出，循环去推进别的就绪任务，并用 epoll / kqueue 一类机制盯海量套接字。\n\n它擅长高并发 I/O，不擅长在事件循环里塞长时间 CPU 计算。同步阻塞（如 time.sleep、同步客户端）会卡住整个循环；异步代码里要用 asyncio 自己的锁和队列，不能混用 threading.Lock。",
    aliases: ["asyncio", "asyncio.Task", "asyncio.run", "async / await", "async/await"],
  },
  {
    id: "event-loop",
    title: "Event loop",
    subtitle: "事件循环",
    definition:
      "异步运行时的调度核心：反复取出就绪的回调或协程步，推进一小段，再把控制权交给下一个就绪项。asyncio 默认就是单线程事件循环。\n\n协作式调度依赖任务主动在 await 点让出。某个协程若长时间不 await，其他任务会被饿死。",
    aliases: ["事件循环", "Event loop", "event loop", "事件循环调度"],
    source: {
      label: "Wikipedia: Event loop",
      url: "https://en.wikipedia.org/wiki/Event_loop",
    },
  },
  {
    id: "structured-concurrency",
    title: "Structured concurrency",
    subtitle: "结构化并发 · TaskGroup",
    definition:
      "一种组织并发任务的方式：子任务的生命周期绑在明确的作用域里，作用域退出前要等子任务收尾；其中一个失败时，同组其余任务常被一并取消，避免孤儿任务继续跑。\n\nPython 3.11 的 asyncio.TaskGroup 是这一思路在 asyncio 里的代表写法。",
    aliases: [
      "结构化并发",
      "Structured concurrency",
      "TaskGroup",
      "asyncio.TaskGroup",
    ],
    source: {
      label: "Wikipedia: Structured concurrency",
      url: "https://en.wikipedia.org/wiki/Structured_concurrency",
    },
  },
  {
    id: "shared-memory",
    title: "Shared memory",
    subtitle: "共享内存",
    definition:
      "多条执行流直接读写同一块内存区域。线程天然共享进程堆；进程之间则要由操作系统映射出显式的共享段。\n\n读写快，但没有天然边界：并发写必须加锁或用原子操作，否则会出现数据竞争。Python multiprocessing 里的 Value / Array 属于进程间共享内存；Go 里更推荐先用 channel 传所有权，共享变量当作例外。",
    aliases: ["共享内存", "Shared memory", "shared memory", "Value / Array"],
    source: {
      label: "Wikipedia: Shared memory",
      url: "https://en.wikipedia.org/wiki/Shared_memory",
    },
  },
  {
    id: "user-space",
    title: "User space",
    subtitle: "用户态",
    definition:
      "应用程序运行的权限与地址空间层级，相对于内核态而言。用户态里的调度和切换不必每次都陷入内核，所以可以做得更轻。\n\n协程切换、Go 的 goroutine 调度，大量工作发生在用户态；进程/线程的创建与阻塞式系统调用，则会进入内核态，成本更高。",
    aliases: ["用户态", "User space", "user space", "用户态调度"],
    source: {
      label: "Wikipedia: User space",
      url: "https://en.wikipedia.org/wiki/User_space_and_kernel_space",
    },
  },
  {
    id: "preemptive-scheduling",
    title: "Preemptive scheduling",
    subtitle: "抢占式调度",
    definition:
      "调度器可以强制打断正在运行的任务，把 CPU 分给别的任务，不依赖任务自己主动让出。操作系统线程调度通常是抢占式的。\n\nGo 运行时也会对运行过久的 goroutine 做用户态抢占，降低死循环饿死别人的风险。",
    aliases: ["抢占式", "抢占", "Preemptive", "preemptive", "抢占式调度"],
    source: {
      label: "Wikipedia: Preemption (computing)",
      url: "https://en.wikipedia.org/wiki/Preemption_(computing)",
    },
  },
  {
    id: "cooperative-scheduling",
    title: "Cooperative scheduling",
    subtitle: "协作式调度",
    definition:
      "任务只在自己选择的让出点（如 await、yield、阻塞在 channel）把控制权交回调度器。实现简单，切换开销可以很低，但若有任务长时间不让出，其他任务就会饿死。\n\nasyncio 的事件循环本质是协作式；Go 的 goroutine 在 channel、系统调用等点也会让出，同时又有运行时抢占兜底。",
    aliases: ["协作式", "协作式调度", "Cooperative", "cooperative", "协作让出"],
    source: {
      label: "Wikipedia: Cooperative multitasking",
      url: "https://en.wikipedia.org/wiki/Cooperative_multitasking",
    },
  },
  {
    id: "epoll",
    title: "epoll",
    subtitle: "Linux I/O 多路复用",
    definition:
      "Linux 上高效监视大量文件描述符是否可读可写的机制。事件循环或网络运行时用它避免为每个连接开一个阻塞线程。\n\nasyncio 在 Linux 上、Go 的 netpoller 都会用到同类能力。macOS 对应常见的是 kqueue。",
    aliases: ["epoll"],
    source: {
      label: "Wikipedia: epoll",
      url: "https://en.wikipedia.org/wiki/Epoll",
    },
  },
  {
    id: "kqueue",
    title: "kqueue",
    subtitle: "BSD / macOS I/O 多路复用",
    definition:
      "FreeBSD、macOS 等系统上的事件通知接口，用来监视套接字、文件等描述符的就绪状态。角色类似 Linux 的 epoll。\n\nasyncio 与 Go netpoller 在这些平台上会走 kqueue。",
    aliases: ["kqueue"],
    source: {
      label: "Wikipedia: Kqueue",
      url: "https://en.wikipedia.org/wiki/Kqueue",
    },
  },
  {
    id: "semaphore",
    title: "Semaphore",
    subtitle: "信号量",
    definition:
      "用计数限制同时进入临界区的执行流数量。计数为 N 时最多允许 N 个线程或协程持有许可；拿不到就等待，释放后别人才能进。\n\n常用来限流，例如限制并发下载数或同时打开的连接数。threading.Semaphore 与 asyncio.Semaphore 分别服务线程世界和协程世界，不能混用。",
    aliases: ["Semaphore", "semaphore", "信号量", "asyncio.Semaphore"],
    source: {
      label: "Wikipedia: Semaphore (programming)",
      url: "https://en.wikipedia.org/wiki/Semaphore_(programming)",
    },
  },
  {
    id: "pickle",
    title: "pickle",
    subtitle: "Python 序列化",
    definition:
      "把 Python 对象转成字节流、以及再转回来的协议。multiprocessing 的队列、管道在进程间搬对象时，底层常常走 pickle。\n\n它方便，但有开销，也不是跨语言的通用格式。高频、简单的数值更适合共享内存；跨机器则常用网络协议而不是 pickle。",
    aliases: ["pickle", "序列化（pickle）"],
  },
  {
    id: "process-start-methods",
    title: "spawn / fork / forkserver",
    subtitle: "multiprocessing 启动方式",
    definition:
      "Python 创建子进程的三种策略。spawn 重新拉起解释器并导入主模块，最安全也最慢，是 macOS / Windows 默认；fork 复制父进程内存，快但不适合已有多线程的进程；forkserver 先起一个干净的服务进程再派生子进程，是 Unix 上的折中。\n\n选错启动方式，轻则变慢，重则死锁或无限 spawn。",
    aliases: ["spawn", "forkserver", "fork 模式", "启动子进程"],
  },
  {
    id: "goroutine",
    title: "goroutine",
    subtitle: "Go 轻量执行流",
    definition:
      "Go 运行时调度的轻量执行流，用 go 关键字启动。初始栈很小（约 2KB）并可按需增长；海量 goroutine 由少量操作系统线程（M）多路复用执行。\n\n它没有对外暴露的 ID，也不能从外部强杀，只能自行返回，或经 channel / context 协作退出。绝大多数 Go 并发代码都写在这一层，而不是直接操纵 OS 线程。",
    aliases: ["goroutine", "goroutines", "go func"],
    source: {
      label: "Wikipedia: Go (programming language) — Concurrency",
      url: "https://en.wikipedia.org/wiki/Go_(programming_language)#Concurrency",
    },
  },
  {
    id: "go-channel",
    title: "channel",
    subtitle: "Go 通道",
    definition:
      "goroutine 之间传递值的管道，也是“通过通信来共享内存”的主要载体。无缓冲 channel 要求发送与接收同时就绪（会合）；有缓冲 channel 像有界队列，缓冲满才阻塞发送、空才阻塞接收。\n\n关闭表示发送结束；向已关闭 channel 发送会 panic，所以 close 通常归发送方。select 可以同时等待多个 channel，常用来做超时与取消。",
    aliases: [
      "channel",
      "channels",
      "无缓冲 channel",
      "有缓冲 channel",
      "chan ",
    ],
  },
  {
    id: "gmp",
    title: "GMP",
    subtitle: "Go 调度模型",
    definition:
      "Go 调度器的三个核心实体：G（goroutine）、M（OS 线程 / machine）、P（逻辑处理器 / processor）。M 必须绑定 P 才能从本地队列取 G 来跑；P 的数量默认等于 GOMAXPROCS（通常是核数）。\n\n本地队列空了会去全局队列，再不行就从别的 P 偷一半任务（work-stealing）。G 阻塞在系统调用时，P 可以交接给别的 M，避免一个慢调用拖死整核。",
    aliases: ["GMP", "GMP 模型", "G/M/P", "Go 调度器"],
  },
  {
    id: "gomaxprocs",
    title: "GOMAXPROCS",
    subtitle: "可同时执行的 P 数量",
    definition:
      "Go 运行时里，最多允许多少个操作系统线程同时执行用户 goroutine 的上限，也就是 P 的个数。默认通常等于机器的逻辑 CPU 核数。\n\n把它调小会限制并行度；调得过大往往也赚不到，反而增加调度与缓存压力。",
    aliases: ["GOMAXPROCS", "GOMAXPROCS()"],
  },
  {
    id: "work-stealing",
    title: "Work stealing",
    subtitle: "工作窃取",
    definition:
      "一种负载均衡策略：某个处理器本地任务空了，就去别的处理器队列“偷”一半过来跑，让核尽量别闲着。\n\nGo 的 P 本地队列空了之后，就会对其他 P 做 work-stealing。",
    aliases: ["work-stealing", "work stealing", "工作窃取"],
    source: {
      label: "Wikipedia: Work stealing",
      url: "https://en.wikipedia.org/wiki/Work_stealing",
    },
  },
  {
    id: "netpoller",
    title: "netpoller",
    subtitle: "Go 网络轮询器",
    definition:
      "Go 运行时里基于 epoll / kqueue 的网络 I/O 设施。goroutine 在等网络时会被挂起，但不长期占用 OS 线程（M）；套接字就绪后再把对应 G 唤起。\n\n所以高并发网络服务可以用很少的线程扛海量连接。",
    aliases: ["netpoller", "网络轮询器"],
  },
  {
    id: "sysmon",
    title: "sysmon",
    subtitle: "Go 监控线程",
    definition:
      "Go 运行时的后台监控线程。它会检查运行过久的 goroutine 并触发抢占，处理网络轮询、定时器等运行时事务，避免某个 G 长时间霸占 P。",
    aliases: ["sysmon"],
  },
  {
    id: "os-exec",
    title: "os/exec",
    subtitle: "Go 外部进程",
    definition:
      "Go 标准库里启动外部命令的包。适合调用别的程序、需要强隔离，或必须借助操作系统能力的场景；不是日常并发的主路径。\n\n工程上应给子进程配 context 做超时与取消，避免卡死进程一直占资源。",
    aliases: ["os/exec", "exec.Command"],
  },
  {
    id: "sync-mutex",
    title: "sync.Mutex",
    subtitle: "互斥锁",
    definition:
      "同一时刻只允许一个 goroutine 进入临界区的锁。RWMutex 区分读锁与写锁，适合读多写少。它们保护的是共享变量，不是替代 channel 的默认通信方式。\n\nGo 的习惯是：能传数据就先 channel；必须共享状态再用 Mutex；纯计数或标志位可以看 atomic。",
    aliases: ["sync.Mutex", "Mutex", "RWMutex", "sync.RWMutex", "互斥锁"],
  },
  {
    id: "waitgroup",
    title: "sync.WaitGroup",
    subtitle: "等待一组 goroutine",
    definition:
      "计数式等待器：Add 登记任务数，每个任务结束时 Done，Wait 阻塞直到计数归零。常用于主 goroutine 等一批工人收工。\n\nAdd 必须在 Wait 之前、且通常在启动 worker 之前完成，计数不能变成负数。",
    aliases: ["WaitGroup", "sync.WaitGroup", "wg.Wait"],
  },
  {
    id: "go-context",
    title: "context",
    subtitle: "Go 上下文",
    definition:
      "在调用链与 goroutine 树之间传递取消信号、截止时间和请求范围值的标准机制。父 context 取消时，派生出的子 context 都会收到，子 goroutine 应在检查点退出，避免泄漏。\n\n几乎每个长生命周期的 goroutine 都该把 ctx 作为第一个参数往下传。超时用 WithTimeout / WithDeadline，取消用 WithCancel。",
    aliases: [
      "context.Context",
      "context.WithTimeout",
      "context.WithCancel",
      "context 取消信号",
      "context 取消",
      "用 context 控制",
      "配 context",
      "ctx 取消",
      "父 ctx",
    ],
  },
  {
    id: "atomic-ops",
    title: "atomic",
    subtitle: "原子操作",
    definition:
      "对机器字长级别的变量做不可分割的读改写，无需互斥锁。适合高频计数器、标志位这类简单共享状态。\n\n它比 Mutex 轻，但不能代替对复杂结构的保护。Go 在 sync/atomic；乱用原子操作拼复杂协议，往往比一把清晰的锁更难维护。",
    aliases: ["atomic", "sync/atomic", "原子操作", "原子自增"],
  },
  {
    id: "cgo",
    title: "cgo",
    subtitle: "Go 调 C",
    definition:
      "让 Go 程序调用 C 代码的机制。C 侧执行不受 Go 调度器直接管理，往往会占用甚至钉住 OS 线程，成本和复杂度都高于纯 Go。\n\n只有必须复用 C 库或系统接口时才上；日常并发仍应留在 goroutine 世界。",
    aliases: ["cgo", "Cgo"],
  },
  {
    id: "lock-os-thread",
    title: "LockOSThread",
    subtitle: "钉住 OS 线程",
    definition:
      "runtime.LockOSThread 把当前 goroutine 固定到某个操作系统线程上，直到 Unlock。用于 cgo 回调或依赖线程本地状态的系统调用等少数场景。\n\n大多数业务代码不需要它；滥用会削弱调度器的灵活性。",
    aliases: ["LockOSThread", "UnlockOSThread", "runtime.LockOSThread"],
  },
  {
    id: "false-sharing",
    title: "False sharing",
    subtitle: "伪共享",
    definition:
      "多个核上的线程或 goroutine 频繁写同一缓存行里的不同变量，导致缓存行在核之间反复失效，性能暴跌。变量逻辑上并不共享，硬件缓存行却被当成共享了。\n\n结构体里用 padding 把热点字段隔开，是常见缓解手段。",
    aliases: ["伪共享", "False sharing", "false sharing"],
    source: {
      label: "Wikipedia: False sharing",
      url: "https://en.wikipedia.org/wiki/False_sharing",
    },
  },
  {
    id: "tlb",
    title: "TLB",
    subtitle: "Translation Lookaside Buffer",
    definition:
      "CPU 里缓存虚拟地址到物理地址翻译结果的小表。进程切换常要更换地址空间，可能伴随 TLB 失效与重填，所以进程切换往往比同进程内的线程切换更贵。\n\n线程共享页表，切换通常不必整本刷掉地址翻译；协程在用户态切换时更不会碰 TLB。",
    aliases: ["TLB", "刷 TLB", "Translation Lookaside Buffer"],
    source: {
      label: "Wikipedia: Translation lookaside buffer",
      url: "https://en.wikipedia.org/wiki/Translation_lookaside_buffer",
    },
  },
];
