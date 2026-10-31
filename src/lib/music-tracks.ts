import { type CollectionEntry, getCollection } from "astro:content";
import {
  hashSeed,
  type QueueItem,
  type Side,
  type Source,
  trackCode,
} from "@/lib/music";
import { neteaseQueue } from "@/lib/netease";

export type Track = CollectionEntry<"tracks">;

export async function getTracks(): Promise<Track[]> {
  const tracks = await getCollection("tracks", ({ data }) => !data.draft);
  return tracks.sort(
    (a, b) => a.data.side.localeCompare(b.data.side) || a.data.no - b.data.no
  );
}

export function groupBySide(tracks: Track[]) {
  const sides = new Map<Side, Track[]>();
  for (const track of tracks) {
    const list = sides.get(track.data.side) ?? [];
    list.push(track);
    sides.set(track.data.side, list);
  }
  return [...sides.entries()];
}

/** The one place an own track's playback source is decided. */
function toSource(track: Track): Source {
  const { audio, bpm, key } = track.data;
  if (audio) return { kind: "file", url: audio };
  return { kind: "seed", bpm, key, seed: hashSeed(track.id) };
}

export function toQueueItem(track: Track): QueueItem {
  const { side, no, title, bpm, key, duration } = track.data;
  return {
    id: track.id,
    code: trackCode(side, no),
    title,
    details: [`${bpm} BPM`, key],
    source: toSource(track),
    duration,
  };
}

/** Own tracks first, then the NetEase songs that can play here. */
export async function getQueue(): Promise<QueueItem[]> {
  return [...(await getTracks()).map(toQueueItem), ...neteaseQueue];
}
