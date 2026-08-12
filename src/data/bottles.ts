/**
 * Collectible bottle catalog for the easter-egg shelf & cabinet.
 * Images live under /public/images/.
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
    id: "rlm",
    name: "RLM 递归瓶",
    note: "大瓶里套着小瓶，小瓶里还套小瓶。上下文一层一层装。",
    src: "/images/childlike-sketch-rlm-bottle.png",
    foundIn: "Agent 拆解 · Prime Agent",
  },
  {
    id: "subagent",
    name: "子 Agent 罐",
    note: "圆罐里挤满弯线和小点。大伙分头干活，最后碰个头。",
    src: "/images/childlike-sketch-subagent-jar.png",
    foundIn: "Agent 拆解 · Prime Agent · 子智能体",
  },
  {
    id: "heartbeat",
    name: "心跳瓶",
    note: "瓶身上画着一条心跳线。你关掉终端，它还在慢慢跳。",
    src: "/images/childlike-sketch-heartbeat-bottle.png",
    foundIn: "Agent 拆解 · Prime Agent · 长时间运行",
  },
  {
    id: "mvcc-bottle",
    name: "多版本瓶",
    note: "瓶里叠着好几层旧版本。读写各看各的，谁也不堵谁。",
    src: "/images/childlike-sketch-mvcc-bottle.png",
    foundIn: "MySQL · 事务与 MVCC",
  },
  {
    id: "cache-pyramid-bottle",
    name: "缓存金字塔瓶",
    note: "瓶里叠着四层：L3 最宽，越往上越小越快，顶层寄存器。最底层的主存慢得像隔了一条街。",
    src: "/images/childlike-sketch-cache-bottle.png",
    foundIn: "高性能后端实战 · CPU 缓存与内存层级",
  },
  {
    id: "lock-bottle",
    name: "锁瓶",
    note: "瓶身上挂着一把锁，旁边两把小钥匙。MVCC 把读放走了，写的门还得有人守。",
    src: "/images/childlike-sketch-lock-bottle.png",
    foundIn: "MySQL · 锁机制全解",
  },
  {
    id: "ego-browser-bottle",
    name: "人机共享瓶",
    note: "瓶里装一个浏览器窗口，分成左右两个 Space，一个给人一个给 Agent。瓶口飘出两个小气泡，是新开的任务空间。",
    src: "/images/childlike-sketch-ego-browser-bottle.png",
    foundIn: "Agent 拆解 · ego-lite",
  },
  {
    id: "layered-bottle",
    name: "分层瓶",
    note: "瓶身横切成四层，顶上飘请求圆圈、二层是齿轮、三层是数据库圆柱、底层一道波浪。四层各装各的，谁也不抢谁的活。",
    src: "/images/childlike-sketch-layered-bottle.png",
    foundIn: "后端架构深度解析 · Python 篇",
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
