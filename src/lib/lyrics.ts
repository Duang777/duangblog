/**
 * Timed lyrics. Pure, so both the build (parsing LRC files) and the player
 * (finding the current line) can use it.
 */

export type LyricLine = {
  /** Seconds from the start of the song. */
  readonly t: number;
  readonly text: string;
};

export type Lyrics = readonly LyricLine[];

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
// A line can carry several stamps when it repeats: `[00:12.00][01:40.00]text`.
const LEADING_TAGS = /^(?:\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/;
// NetEase opens with credits such as `作词 : Jeff Jarvis`. A lyric line can hold
// a colon too, so only a Chinese key or a known English credit counts.
const CREDIT = new RegExp(
  String.raw`^(?:[\p{Script=Han}·/&\s]+|(?:lyrics|lyricist|composer|arranger|producer|written|music|vocals?|mix(?:ed|ing)?|master(?:ed|ing)?)(?:\s+by)?)\s*[:：]`,
  "iu"
);
const HAS_WORD = /[\p{L}\p{N}]/u;

function seconds(minutes: string, rest: string) {
  return Number(minutes) * 60 + Number(rest.replace(":", "."));
}

/** One entry per timed line, sorted by time; credits and blank lines dropped. */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = raw.match(LEADING_TAGS)?.[0];
    if (!stamps) continue;
    const body = raw
      .slice(stamps.length)
      .trim()
      .replace(/[,，]+$/, "");
    if (!HAS_WORD.test(body) || CREDIT.test(body)) continue;
    for (const [, minutes, rest] of stamps.matchAll(TIME_TAG)) {
      lines.push({ t: seconds(minutes, rest), text: body });
    }
  }
  return lines.sort((a, b) => a.t - b.t);
}

/** Index of the line sung at `at` seconds; -1 before the first line. */
export function lineAt(lyrics: Lyrics, at: number): number {
  let lo = 0;
  let hi = lyrics.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lyrics[mid].t <= at) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
