/** Shared helpers for the homepage「念头瓶」and mini variants. */

const SOUND_KEY = "term-sound";

const JAR_WHISPERS = [
  "先把一次请求走完，再谈抽象。",
  "超时不是配置项，是边界。",
  "读代码比读 README 少绕路。",
  "笔记写给半年后的自己。",
  "能画出来的，才算想清楚。",
  "线上不复现，多半是时序。",
  "少一层封装，多一分可查。",
];

/**
 * Column bottle asides — a little more character, still one short line.
 * Shown every hover on column jars (not a rare easter egg).
 */
const COLUMN_WHISPERS: Record<string, string[]> = {
  请求过境: [
    "这瓶里泡的全是 timeout。",
    "请求进门容易，出门难。",
    "别问我代理那层怎么说的，它经常改口。",
    "取消键按下去的时候，连接还在犹豫。",
    "空闲也是一种忙碌，keep-alive 懂的。",
    "顺着管子往下看，卡点通常不在你以为的地方。",
  ],
  后端专栏: [
    "机制这东西，冷了会结痂。",
    "优雅留给 demo，线上要的是可查。",
    "又一层封装？瓶盖快拧不开了。",
    "故障先开口，优雅后进来。",
    "画得出来，才算你真想清楚了。",
  ],
  最新速递: [
    "先记再说，写成专栏太慢了。",
    "今天热乎的，明天就凉。",
    "一事一滴，别兑水。",
    "速递不等人，瓶口开着。",
    "短到能一口气读完，才配叫速递。",
  ],
  Agent: [
    "模型在炫，控制面在干活。",
    "循环画不清，工具再多也白搭。",
    "别只看 prompt，看看状态往哪流。",
    "拆开之前，先找到入口那扇门。",
  ],
  拆解: [
    "README 是地图，代码才是路。",
    "能复述给别人听，才算拆开了。",
    "先跟一次完整路径，再谈架构图。",
    "仓库很大，入口通常很小。",
  ],
};

let audioCtx: AudioContext | null = null;

export function jarSoundEnabled() {
  return localStorage.getItem(SOUND_KEY) !== "off";
}

/** Soft clink when the bottle is opened / poured — follows terminal sound. */
export function playJarOpenSound() {
  if (!jarSoundEnabled()) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // ignore
  }
}

export function jarSeason(): "spring" | "summer" | "autumn" | "winter" {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function pickJarWhisper(columnTag?: string | null): string {
  const bank =
    (columnTag && COLUMN_WHISPERS[columnTag]) || JAR_WHISPERS;
  return bank[Math.floor(Math.random() * bank.length)]!;
}

/**
 * Homepage jar: rare aside (~10%).
 * Column jars: always return a line — hover should feel talkative.
 */
export function maybeJarWhisper(columnTag?: string | null): string | null {
  if (columnTag) return pickJarWhisper(columnTag);
  return Math.random() < 0.1 ? pickJarWhisper(null) : null;
}

export const JAR_POUR_EVENT = "duang:jar-pour";

export type JarPourDetail = { column?: string | null };
