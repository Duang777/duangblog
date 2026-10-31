import { type NeteaseSong, neteaseSongs } from "@/data/netease";
import { type Lyrics, parseLrc } from "@/lib/lyrics";
import { formatTime, type QueueItem, type Side, trackCode } from "@/lib/music";

// Written by `node scripts/netease.mjs lyrics`, one file per song id.
const lrcFiles = import.meta.glob<string>("/src/data/lyrics/*.lrc", {
  query: "?raw",
  import: "default",
  eager: true,
});

function lyricsOf(id: number): Lyrics | undefined {
  const text = lrcFiles[`/src/data/lyrics/${id}.lrc`];
  const lines = text ? parseLrc(text) : [];
  return lines.length > 0 ? lines : undefined;
}

export type NeteaseRow = {
  song: NeteaseSong;
  code: string;
  /** Queue id and `data-track-id` of a SIDE A row. */
  queueId: string;
  duration: string;
};

function toRows(side: Side, songs: readonly NeteaseSong[]): NeteaseRow[] {
  return songs.map((song, i) => ({
    song,
    code: trackCode(side, i + 1),
    queueId: `netease-${song.id}`,
    duration: formatTime(song.durationMs / 1000),
  }));
}

/** SIDE A plays in the site player; SIDE B only links out to NetEase. */
const sideA = toRows(
  "A",
  neteaseSongs.filter(song => song.playable)
);
const sideB = toRows(
  "B",
  neteaseSongs.filter(song => !song.playable)
);

export const neteaseSides = (
  [
    ["A", sideA],
    ["B", sideB],
  ] as const
).filter(([, rows]) => rows.length > 0);

export const neteaseQueue: QueueItem[] = sideA.map(row => ({
  id: row.queueId,
  code: row.code,
  title: row.song.title,
  details: [row.song.artist],
  source: { kind: "netease", id: row.song.id },
  duration: row.duration,
  cover: coverUrl(row.song),
  lyrics: lyricsOf(row.song.id),
}));

export function songUrl(id: number) {
  return `https://music.163.com/song?id=${id}`;
}

export function coverUrl(song: NeteaseSong) {
  return `${song.cover}?param=400y400`;
}
