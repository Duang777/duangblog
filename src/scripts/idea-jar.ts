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

export function pickJarWhisper(): string {
  return JAR_WHISPERS[Math.floor(Math.random() * JAR_WHISPERS.length)]!;
}

/** ~8% chance to surface an extra whisper line on hover. */
export function maybeJarWhisper(): string | null {
  return Math.random() < 0.08 ? pickJarWhisper() : null;
}
