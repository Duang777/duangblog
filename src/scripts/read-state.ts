/**
 * Shared local reading bookmarks: which posts were opened, and where
 * the reader last stopped. Used by the homepage terminal and post pages.
 */

const READS_KEY = "term-reads";
const LAST_READ_KEY = "term-last-read";
const SCROLL_KEY = "post-scroll-bookmarks";
const VISITS_KEY = "site-visit-days";

export function getReadSlugs(): string[] {
  try {
    const raw = localStorage.getItem(READS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function getReads(): Set<string> {
  return new Set(getReadSlugs());
}

export function markPostRead(slug: string) {
  if (!slug) return;
  const reads = getReads();
  reads.add(slug);
  try {
    localStorage.setItem(READS_KEY, JSON.stringify([...reads]));
  } catch {
    // ignore
  }
}

export type LastRead = {
  slug: string;
  /** 0..1 scroll progress through the article */
  progress: number;
  at: number;
};

function setLastRead(data: LastRead) {
  try {
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function getLastRead(): LastRead | null {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LastRead;
    if (!data?.slug || typeof data.progress !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

export function rememberReadProgress(slug: string, progress: number) {
  if (!slug) return;
  const clamped = Math.min(1, Math.max(0, progress));
  setLastRead({ slug, progress: clamped, at: Date.now() });
}

export function touchLastRead(slug: string) {
  if (!slug) return;
  const prev = getLastRead();
  if (!prev || prev.slug !== slug) {
    setLastRead({ slug, progress: 0, at: Date.now() });
  } else {
    setLastRead({ ...prev, at: Date.now() });
  }
}

export type ScrollBookmark = {
  y: number;
  progress: number;
  at: number;
};

function readScrollMap(): Record<string, ScrollBookmark> {
  try {
    const raw = localStorage.getItem(SCROLL_KEY);
    const data = raw ? (JSON.parse(raw) as Record<string, ScrollBookmark>) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function rememberScrollBookmark(
  slug: string,
  y: number,
  progress: number
) {
  if (!slug) return;
  const map = readScrollMap();
  map[slug] = {
    y: Math.max(0, Math.round(y)),
    progress: Math.min(1, Math.max(0, progress)),
    at: Date.now(),
  };
  const entries = Object.entries(map).sort((a, b) => b[1].at - a[1].at);
  const trimmed = Object.fromEntries(entries.slice(0, 40));
  try {
    localStorage.setItem(SCROLL_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function getScrollBookmark(slug: string): ScrollBookmark | null {
  if (!slug) return null;
  const hit = readScrollMap()[slug];
  if (!hit || typeof hit.y !== "number") return null;
  if (Date.now() - hit.at > 14 * 24 * 60 * 60 * 1000) return null;
  return hit;
}

export function clearScrollBookmark(slug: string) {
  if (!slug) return;
  const map = readScrollMap();
  if (!(slug in map)) return;
  delete map[slug];
  try {
    localStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Record that the reader opened the site today. */
export function touchVisitDay() {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    const days = Array.isArray(arr) ? arr : [];
    const today = dayKey();
    const next = [today, ...days.filter(d => d !== today)].slice(0, 60);
    localStorage.setItem(VISITS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** How many distinct calendar days in the last 7 days the reader visited. */
export function weekVisitDays(): number {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 6);
    const cut = dayKey(cutoff);
    return arr.filter(d => typeof d === "string" && d >= cut).length;
  } catch {
    return 0;
  }
}
