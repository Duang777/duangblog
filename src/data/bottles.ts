/**
 * Collectible bottle catalog for the easter-egg shelf & cabinet.
 * Images live under /public/images/.
 * Bottle art must follow childlike-sketch skill (black line on white).
 */
export type BottleDef = {
  id: string;
  /** Display name on shelf / cabinet. */
  name: string;
  /** One-line flavor text. */
  note: string;
  /** Path under site root, e.g. /images/….png */
  src: string;
  /** Where a careful reader might have seen it. */
  foundIn?: string;
};

export const BOTTLES: BottleDef[] = [
  {
    id: "jar",
    name: "念头瓶",
    note: "首页那只老伙计。点子泡久了会起泡。",
    src: "/images/childlike-sketch-jar.png",
    foundIn: "首页念头瓶 / MySQL 边注",
  },
  {
    id: "flask-gil",
    name: "GIL 瓶",
    note: "细颈烧瓶，瓶口挂着一把小锁。排队的热闹装在这里。",
    src: "/images/childlike-sketch-flask-gil.png",
    foundIn: "进程文 · Python 视角",
  },
  {
    id: "jar-swarm",
    name: "swarm 瓶",
    note: "圆罐里挤满弯线。goroutine 多了也不嫌挤。",
    src: "/images/childlike-sketch-jar-swarm.png",
    foundIn: "进程文 · Go 视角",
  },
  {
    id: "channel",
    name: "管道瓶",
    note: "瓶身穿了一根管子。水从这边进，从那边出。",
    src: "/images/childlike-sketch-channel-bottle.png",
    foundIn: "进程文 · Go · channel",
  },
  {
    id: "three",
    name: "三瓶组",
    note: "进程、线程、协程并排站着，别灌混了。",
    src: "/images/childlike-sketch-three-bottles.png",
    foundIn: "进程文 · Python",
  },
  {
    id: "warm",
    name: "热瓶",
    note: "冒着小气。热着也得排队，GIL 懂的。",
    src: "/images/childlike-sketch-warm-bottle.png",
    foundIn: "进程文 · Python",
  },
  {
    id: "runtime",
    name: "调度瓶",
    note: "贴着小标签的运行时瓶。你写 go，它写 GMP。",
    src: "/images/childlike-sketch-runtime-bottle.png",
    foundIn: "进程文 · Go · GMP",
  },
  {
    id: "layered",
    name: "分层瓶",
    note: "一层一层摞着。各装各的，别串味。",
    src: "/images/childlike-sketch-layered-bottle.png",
    foundIn: "后端架构 · Python / Go",
  },
  {
    id: "node",
    name: "Node 瓶",
    note: "瓶身贴着 TS 小纸条。单线程里也能跑出热闹。",
    src: "/images/childlike-sketch-node-bottle.png",
    foundIn: "后端架构 · TypeScript",
  },
  {
    id: "cache",
    name: "缓存瓶",
    note: "里头一格一格的。近的快，远的慢。",
    src: "/images/childlike-sketch-cache-bottle.png",
    foundIn: "高性能后端 · 缓存与内存",
  },
  {
    id: "lock",
    name: "锁瓶",
    note: "瓶肚画着一把锁。排着队，别硬抢。",
    src: "/images/childlike-sketch-lock-bottle.png",
    foundIn: "MySQL · 锁机制",
  },
  {
    id: "mvcc",
    name: "多版本瓶",
    note: "一层一层版本叠着。读的是旧的，写的是新的。",
    src: "/images/childlike-sketch-mvcc-bottle.png",
    foundIn: "MySQL · MVCC",
  },
  {
    id: "ego-browser",
    name: "人机共享瓶",
    note: "瓶肚开了个小窗口。人和页面对着看。",
    src: "/images/childlike-sketch-ego-browser-bottle.png",
    foundIn: "Ego Lite 深挖",
  },
  {
    id: "rlm",
    name: "RLM 递归瓶",
    note: "瓶子里还有瓶子。套娃要有尽头。",
    src: "/images/childlike-sketch-rlm-bottle.png",
    foundIn: "Prime Agent · RLM",
  },
  {
    id: "subagent",
    name: "子 Agent 罐",
    note: "罐子里冒着小泡。分出去干，再收回来。",
    src: "/images/childlike-sketch-subagent-jar.png",
    foundIn: "Prime Agent · 子 Agent",
  },
  {
    id: "heartbeat",
    name: "心跳瓶",
    note: "瓶肚画着一条心跳线。还在跳，就还活着。",
    src: "/images/childlike-sketch-heartbeat-bottle.png",
    foundIn: "Prime Agent · 心跳",
  },
  {
    id: "trace",
    name: "trace 瓶",
    note: "瓶肚里长着一棵 span 树。因果对得上，排障才有路。",
    src: "/images/childlike-sketch-trace-bottle.png",
    foundIn: "Agent 系统架构 · Trace 侧记",
  },
  {
    id: "budget",
    name: "预算瓶",
    note: "瓶肚开了个小窗，一层一层装着 token。满了就漏。",
    src: "/images/childlike-sketch-budget-bottle.png",
    foundIn: "Agent 系统架构 · 上下文工程",
  },
  {
    id: "pi-ai",
    name: "归一瓶",
    note: "四扇小门收成一个瓶口。协议可以脏，接口得干净。",
    src: "/images/childlike-sketch-pi-ai-bottle.png",
    foundIn: "Pi 深度解析 · pi-ai 协议归一",
  },
  {
    id: "handoff",
    name: "交接瓶",
    note: "瓶口封着一块蜡。同厂才认，换厂就拆封降级。",
    src: "/images/childlike-sketch-handoff-bottle.png",
    foundIn: "Pi 深度解析 · pi-ai 上下文流动",
  },
  {
    id: "dsh",
    name: "插件瓶",
    note: "瓶肚里挂着一棵小插件树。卸下来，树上那截也跟着没了。",
    src: "/images/childlike-sketch-dsh-bottle.png",
    foundIn: "最新速递 · DeepSeek Harness",
  },
  {
    id: "opencli",
    name: "命令瓶",
    note: "瓶肚一边是命令行，一边是小窗口。登录态还在浏览器里。",
    src: "/images/childlike-sketch-opencli-bottle.png",
    foundIn: "Agent 拆解 · OpenCLI",
  },
  {
    id: "shelf",
    name: "货架瓶",
    note: "细长瓶颈，瓶肚里搁着一小排盒子。先占位子，分数以后再补。",
    src: "/images/childlike-sketch-shelf-bottle.png",
    foundIn: "thinking · Personal AI 四方格局",
  },
  {
    id: "letter",
    name: "来信瓶",
    note: "圆肚子，瓶口卡着一封信。看见信，不等于记得是谁写的。",
    src: "/images/childlike-sketch-letter-bottle.png",
    foundIn: "thinking · Personal AI 四方格局",
  },
  {
    id: "desk",
    name: "电脑瓶",
    note: "矮瓶子长了两条腿，肚子里坐着一台小显示器。",
    src: "/images/childlike-sketch-desk-bottle.png",
    foundIn: "thinking · Personal AI 四方格局",
  },
  {
    id: "amp",
    name: "放大瓶",
    note: "细长瓶子，肚子里三只盒子越往下越大。一次请求会变成好几次模型调用。",
    src: "/images/childlike-sketch-amp-bottle.png",
    foundIn: "Agent 系统架构设计 · OpenAI Agents SDK",
  },
  {
    id: "loop",
    name: "移交瓶",
    note: "圆罐子，肚子里画着一个没封口的圈。Agent 把话交出去，再交回来。",
    src: "/images/childlike-sketch-loop-bottle.png",
    foundIn: "Agent 系统架构设计 · OpenAI Agents SDK",
  },
  {
    id: "span",
    name: "追踪瓶",
    note: "矮瓶子长了两条腿，肚子里叠着四格。每一格是链路里的一段。",
    src: "/images/childlike-sketch-span-bottle.png",
    foundIn: "Agent 系统架构设计 · OpenAI Agents SDK",
  },
  {
    id: "spec",
    name: "规格瓶",
    note: "细高瓶子，肚子里三只空方格。规格没写完，后面的选择都是猜的。",
    src: "/images/childlike-sketch-spec-bottle.png",
    foundIn: "thinking · 生产级 Agent 手册",
  },
  {
    id: "stop",
    name: "停止瓶",
    note: "圆罐子，瓶口被一横挡住。循环到点就停，不等模型自己说停。",
    src: "/images/childlike-sketch-stop-bottle.png",
    foundIn: "thinking · 生产级 Agent 手册",
  },
  {
    id: "fence",
    name: "边界瓶",
    note: "矮罐子长了两条腿，肚子里一道小栅栏。谁能调用，写在栅栏这边。",
    src: "/images/childlike-sketch-fence-bottle.png",
    foundIn: "thinking · 生产级 Agent 手册",
  },
];

export function getBottle(id: string): BottleDef | undefined {
  return BOTTLES.find(b => b.id === id);
}

/** Match a whisper / doodle image URL to a catalog bottle. */
export function findBottleBySrc(src: string): BottleDef | undefined {
  const path = src.split("?")[0]?.split("#")[0] ?? "";
  return BOTTLES.find(
    b => path === b.src || path.endsWith(b.src) || path.endsWith(b.src.slice(1))
  );
}

export const BOTTLE_COLLECTION_KEY = "duang-bottle-collection-v1";
