import { formatTime } from "@/lib/music";
import { lineAt, type Lyrics } from "@/lib/lyrics";
import { printInto } from "@/scripts/music-dither";
import type { PlayerState, Position } from "@/scripts/music-player";

/**
 * Synced lyrics on the landing: a two-line panel under the now-playing title
 * and a full-screen sheet. Both follow one cursor, the line being sung, which
 * the shared animation frame advances through `step`.
 */

// A held note or an instrumental break should not stretch the fill for ever.
const MAX_LINE_S = 7;
// After the reader scrolls the sheet, it stops following the song for a moment.
const FOLLOW_PAUSE_MS = 2500;
const MAX_DISTANCE = 6;

/** What the panel and sheet currently show; rebuilt when the track changes. */
type Cursor = {
  trackId: string;
  lyrics: Lyrics;
  /** `lineAt` of the last frame; -1 before the first line. */
  index: number;
  fill: number;
};

export type LyricsView = {
  step(state: PlayerState, pos: Position | null): void;
  /** Opens or closes the sheet; false when the current track has no lyrics. */
  toggleSheet(): boolean;
};

type Elements = {
  panel: HTMLElement;
  now: HTMLElement;
  next: HTMLElement;
  sheet: HTMLDialogElement;
  list: HTMLOListElement;
  bar: HTMLElement | null;
  time: HTMLElement | null;
  art: HTMLImageElement | null;
};

function find(): Elements | null {
  const panel = document.querySelector<HTMLElement>("[data-lyric]");
  const now = document.querySelector<HTMLElement>("[data-lyric-now]");
  const next = document.querySelector<HTMLElement>("[data-lyric-next]");
  const sheet = document.querySelector<HTMLDialogElement>(
    "dialog[data-lyrics-sheet]"
  );
  const list = document.querySelector<HTMLOListElement>("[data-lyrics-list]");
  if (!panel || !now || !next || !sheet || !list) return null;
  return {
    panel,
    now,
    next,
    sheet,
    list,
    bar: sheet.querySelector("[data-lyrics-bar]"),
    time: sheet.querySelector("[data-lyrics-time]"),
    art: sheet.querySelector("[data-lyrics-art]"),
  };
}

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function lineFill(lyrics: Lyrics, index: number, at: number, end: number) {
  if (index < 0) return 0;
  const start = lyrics[index].t;
  const until = lyrics[index + 1]?.t ?? end;
  const span = Math.min(Math.max(until - start, 0.5), MAX_LINE_S);
  return Math.min(1, Math.max(0, (at - start) / span));
}

function buildList(list: HTMLOListElement, lyrics: Lyrics) {
  list.replaceChildren(
    ...lyrics.map(({ t, text }, i) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mx-lyrics-line";
      button.dataset.line = String(i);
      button.setAttribute("aria-label", `${formatTime(t)} ${text}`);
      const ink = document.createElement("span");
      ink.className = "mx-lyric-ink";
      ink.textContent = text;
      button.append(ink);
      item.append(button);
      return item;
    })
  );
}

export function createLyrics(
  seek: (seconds: number) => void
): LyricsView | null {
  const els = find();
  if (!els) return null;
  const { panel, now, next, sheet, list, bar, time, art } = els;
  let cursor: Cursor | null = null;
  let followPausedUntil = 0;

  const lineButton = (i: number) =>
    list.querySelector<HTMLElement>(`[data-line="${i}"]`);

  function center(instant: boolean) {
    if (!cursor || !sheet.open) return;
    const target = lineButton(Math.max(0, cursor.index));
    if (!target) return;
    const top =
      target.offsetTop + target.offsetHeight / 2 - list.clientHeight / 2;
    list.scrollTo({
      top,
      behavior: instant || reducedMotion() ? "auto" : "smooth",
    });
  }

  function slideIn() {
    if (reducedMotion()) return;
    const frames = [
      { opacity: 0, translate: "0 0.6em" },
      { opacity: 1, translate: "0 0" },
    ];
    now.animate(frames, {
      duration: 320,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    next.animate(frames, {
      duration: 320,
      delay: 40,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "backwards",
    });
  }

  function showLine(index: number) {
    if (!cursor) return;
    const { lyrics } = cursor;
    now.textContent = lyrics[index]?.text ?? "";
    next.textContent = lyrics[index + 1]?.text ?? "";
    slideIn();
    const centre = Math.max(0, index);
    for (const button of list.querySelectorAll<HTMLElement>("[data-line]")) {
      const i = Number(button.dataset.line);
      const distance = Math.min(Math.abs(i - centre), MAX_DISTANCE);
      button.style.setProperty(
        "--d",
        String(index < 0 ? distance + 1 : distance)
      );
      button.toggleAttribute("data-current", i === index);
      if (i === index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
      if (i !== index) button.style.removeProperty("--fill");
    }
    if (performance.now() >= followPausedUntil) center(false);
  }

  function writeFill(fill: number) {
    if (!cursor || Math.abs(fill - cursor.fill) < 0.002) return;
    cursor.fill = fill;
    const value = fill.toFixed(3);
    now.style.setProperty("--fill", value);
    lineButton(cursor.index)?.style.setProperty("--fill", value);
  }

  function writeProgress(pos: Position | null) {
    const elapsed = pos?.elapsed ?? 0;
    const duration = pos?.duration ?? null;
    bar?.style.setProperty(
      "--p",
      duration ? (elapsed / duration).toFixed(4) : "0"
    );
    if (time) {
      const text = duration
        ? `${formatTime(elapsed)} / ${formatTime(duration)}`
        : formatTime(elapsed);
      if (time.textContent !== text) time.textContent = text;
    }
  }

  function retarget(state: PlayerState) {
    const track = state.status === "idle" ? null : state.track;
    const lyrics = track?.lyrics;
    if (!track || !lyrics?.length) {
      if (cursor) list.replaceChildren();
      cursor = null;
      panel.hidden = true;
      if (sheet.open) sheet.close();
      return;
    }
    if (cursor?.trackId === track.id) return;
    cursor = { trackId: track.id, lyrics, index: -2, fill: -1 };
    buildList(list, lyrics);
    const sleeve = document.querySelector<HTMLImageElement>(
      `.mx-sleeve-cover[data-track-id="${CSS.escape(track.id)}"] img`
    );
    if (art) {
      if (sleeve) art.src = sleeve.currentSrc || sleeve.src;
      else art.removeAttribute("src");
      printArt();
    }
    panel.hidden = false;
  }

  /** Sized from the open sheet, so it prints again once the sheet shows. */
  function printArt() {
    const box = art?.parentElement;
    if (box) void printInto(box, art?.getAttribute("src") ?? null);
  }

  function pauseFollow() {
    followPausedUntil = performance.now() + FOLLOW_PAUSE_MS;
  }

  list.addEventListener("wheel", pauseFollow, { passive: true });
  list.addEventListener("touchmove", pauseFollow, { passive: true });
  list.addEventListener("click", event => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-line]")
        : null;
    if (!button || !cursor) return;
    const line = cursor.lyrics[Number(button.dataset.line)];
    if (line) seek(line.t);
  });
  sheet.addEventListener("close", () => {
    document.documentElement.removeAttribute("data-lyrics-open");
  });

  return {
    step(state, pos) {
      retarget(state);
      if (!cursor) return;
      const at = pos?.elapsed ?? 0;
      const index = lineAt(cursor.lyrics, at);
      if (index !== cursor.index) {
        cursor.index = index;
        cursor.fill = -1;
        showLine(index);
      }
      const end = pos?.duration ?? at + MAX_LINE_S;
      writeFill(lineFill(cursor.lyrics, index, at, end));
      if (sheet.open) writeProgress(pos);
    },
    toggleSheet() {
      if (sheet.open) {
        sheet.close();
        return true;
      }
      if (!cursor) return false;
      document.documentElement.setAttribute("data-lyrics-open", "");
      sheet.showModal();
      printArt();
      sheet.focus();
      center(true);
      return true;
    },
  };
}
