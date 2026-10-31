/**
 * Shared by the music pages (build time) and the player (browser).
 * No `astro:content` import here, so client scripts can use it.
 */

import type { Lyrics } from "@/lib/lyrics";

export type Side = "A" | "B";
export type TrackStatus = "released" | "demo" | "sketch";

export type Source =
  | { kind: "file"; url: string }
  | { kind: "seed"; bpm: number; key: string; seed: number }
  /** Asks /api/netease/<id> for CORS media first, else plays NetEase's outlink. */
  | { kind: "netease"; id: number };

export type SeedSource = Extract<Source, { kind: "seed" }>;

export type QueueItem = {
  id: string;
  code: string;
  title: string;
  /** Ticker fields after the title: BPM and key, or the artist. */
  details: string[];
  source: Source;
  duration?: string;
  /** Album art URL; own tracks without a photo cover have none. */
  cover?: string;
  /** Timed lines, sorted by time; absent when the song has none. */
  lyrics?: Lyrics;
};

export const QUEUE_ELEMENT_ID = "music-queue";

/**
 * Play from a stop is a cue: the tonearm swings onto the record unless it is
 * already over the groove, then lowers. The sound fades in as it lands.
 */
export type Cue = { at: number; swing: boolean };

export const CUE_MS = { swing: 520, lower: 140, fade: 250 } as const;

export function cueLandsMs(cue: Cue) {
  return (cue.swing ? CUE_MS.swing : 0) + CUE_MS.lower;
}

export function idleTicker(hasPlayable: boolean) {
  const line = hasPlayable
    ? "待机 · 点一下唱片开始 · DUANG RECORDS · SIDE A / SIDE B · "
    : "歌单里还没有能在站内放的歌 · DUANG RECORDS · ";
  return line.repeat(3);
}

export const STATUS_LABEL: Record<TrackStatus, string> = {
  released: "发行",
  demo: "Demo",
  sketch: "草稿",
};

export function trackCode(side: Side, no: number) {
  return `${side}${no}`;
}

/** FNV-1a, so a slug always maps to the same pattern and cover. */
export function hashSeed(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseDuration(text: string | undefined) {
  if (!text) return null;
  const [m, s] = text.split(":").map(Number);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null;
}

export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
