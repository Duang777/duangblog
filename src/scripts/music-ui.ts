import {
  formatTime,
  idleTicker,
  QUEUE_ELEMENT_ID,
  type QueueItem,
} from "@/lib/music";
import * as player from "@/scripts/music-player";
import type { PlayerState } from "@/scripts/music-player";
import { type Arm, createArm } from "@/scripts/music-arm";
import { printCover, printInto } from "@/scripts/music-dither";
import { createLyrics, type LyricsView } from "@/scripts/music-lyrics";
import { createMotor, type Motor } from "@/scripts/music-motor";
import { createPointerFx, type PointerFx } from "@/scripts/music-pointer";
import {
  createWordmark,
  type WordDrive,
  type Wordmark,
} from "@/scripts/music-wordmark";
import { enterBlog } from "@/scripts/music-wipe";

const NOW_STATE = {
  idle: "待机",
  loading: "载入中",
  playing: "正在播放",
  paused: "已暂停",
} as const;

const SPECTRUM_BARS = 20;
// Display-only gain, like volts per division: the quiet master bus barely moves the trace.
const SCOPE_GAIN = 3;
// 33⅓ rpm is 200 degrees per second.
const NORMAL_DEG_PER_MS = 0.2;
const HINT_MS = 2400;

let queue: QueueItem[] = [];
let state: PlayerState = player.getState();
let raf = 0;
let lastFrame = 0;
let timeData: Uint8Array<ArrayBuffer> | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
const spectrumLevels = new Float32Array(SPECTRUM_BARS);
let wordLevels = new Float32Array(0);
let wordmark: Wordmark | null = null;
let lyrics: LyricsView | null = null;
let arm: Arm | null = null;
let armSettled = true;
let motor: Motor | null = null;
let motorSettled = true;
let fx: PointerFx | null = null;
let fxSettled = true;
let wordmarkSettled = true;
// The landing hero covers the player bar; pages without a hero count as hidden.
let heroVisible = false;
let heroObserver: IntersectionObserver | null = null;
let hintTimer = 0;

function readQueue(): QueueItem[] {
  const el = document.getElementById(QUEUE_ELEMENT_ID);
  if (!el?.textContent) return [];
  return JSON.parse(el.textContent) as QueueItem[];
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']"
    ) !== null
  );
}

function isActive(s: PlayerState) {
  return s.status === "playing" || s.status === "loading";
}

function currentId(s: PlayerState) {
  return s.status === "idle" ? null : s.track.id;
}

function tickerText(s: PlayerState) {
  if (s.status === "idle") return idleTicker(player.hasPlayable());
  const { code, title, details } = s.track;
  const verb = s.status === "paused" ? "PAUSED" : "NOW PLAYING";
  const fields = [verb, `${code} ${title}`, ...details];
  return `${fields.join(" · ")} · `.repeat(3);
}

const EMPTY_HINT = "还没有能在这里放的歌";
const BLOCKED_HINT = "浏览器拦下了播放，再点一次试试";

function showHint(text: string) {
  const hint = document.querySelector<HTMLElement>("[data-music-hint]");
  if (!hint) return;
  hint.textContent = text;
  hint.setAttribute("data-show", "");
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    hint.removeAttribute("data-show");
    hint.textContent = "";
  }, HINT_MS);
}

function toggle(id?: string) {
  if (queue.length > 0) player.toggle(id);
  else showHint(EMPTY_HINT);
}

function render() {
  const id = currentId(state);
  const active = isActive(state);

  for (const el of document.querySelectorAll<HTMLElement>("[data-track-id]")) {
    const current = el.dataset.trackId === id;
    el.toggleAttribute("data-current", current);
    if (el.matches(".tl-row")) {
      if (current) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
      el.toggleAttribute(
        "data-unavailable",
        player.isUnavailable(el.dataset.trackId ?? "")
      );
    }
  }

  for (const btn of document.querySelectorAll<HTMLElement>(
    "[data-music-action='toggle']"
  )) {
    const own = btn.dataset.trackId;
    const pausing = active && (own === undefined || own === id);
    btn.toggleAttribute("data-pausing", pausing);
    btn.setAttribute(
      "aria-label",
      pausing
        ? (btn.dataset.labelPause ?? "暂停")
        : (btn.dataset.labelPlay ?? "播放")
    );
  }

  const text = tickerText(state);
  for (const span of document.querySelectorAll("[data-marquee-text]")) {
    if (span.textContent !== text) span.textContent = text;
  }

  const now =
    state.status === "idle"
      ? null
      : {
          code: state.track.code,
          title: state.track.title,
          artist: state.track.details.join(" · "),
        };
  const fields = [
    ["[data-player-code]", "code", "--"],
    ["[data-player-title]", "title", "还没放歌"],
    ["[data-player-artist]", "artist", ""],
  ] as const;
  for (const [selector, field, fallback] of fields) {
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const text = now ? now[field] : (el.dataset.idle ?? fallback);
      if (el.textContent !== text) el.textContent = text;
    }
  }
  const stateLabel = document.querySelector("[data-now-state]");
  if (stateLabel) stateLabel.textContent = NOW_STATE[state.status];

  const scrub = document.querySelector<HTMLInputElement>("[data-player-scrub]");
  if (scrub) {
    scrub.toggleAttribute(
      "data-off",
      state.status === "idle" || state.track.source.kind === "seed"
    );
  }

  printCovers();
  renderClock();
  refresh();
}

/** The sleeve and the record label show the current cover, or the first one while idle. */
function printCovers() {
  const sleeve = document.querySelector(".mx-sleeve");
  const cover =
    sleeve?.querySelector(":scope > [data-current]") ??
    sleeve?.firstElementChild;
  if (cover instanceof HTMLElement && cover.dataset.cover) {
    void printInto(cover, cover.dataset.cover);
  }

  const art = document.querySelector<SVGImageElement>("[data-label-art]");
  const deck = art?.closest(".tt");
  if (!art || !deck) return;
  const track =
    state.status === "idle" ? queue.find(q => q.cover) : state.track;
  void printCover(art, track?.cover ?? null).then(result => {
    if (result !== "stale")
      deck.toggleAttribute("data-picture", result === "ok");
  });
}

function renderClock() {
  const clock = document.querySelector("[data-player-time]");
  const scrub = document.querySelector<HTMLInputElement>("[data-player-scrub]");
  const pos = player.position();
  if (clock) {
    if (!pos) clock.textContent = "0:00";
    else if (pos.duration === null)
      clock.textContent = `${formatTime(pos.elapsed)} / LOOP`;
    else
      clock.textContent = `${formatTime(pos.elapsed)} / ${formatTime(pos.duration)}`;
  }
  if (scrub && pos?.duration && document.activeElement !== scrub) {
    scrub.max = String(pos.duration);
    scrub.value = String(pos.elapsed);
  }
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { ctx: canvas.getContext("2d"), w, h, dpr };
}

function ink(el: Element) {
  return getComputedStyle(el).getPropertyValue("--foreground").trim() || "#000";
}

function drawScope(canvas: HTMLCanvasElement, node: AnalyserNode | null) {
  const { ctx, w, h, dpr } = fitCanvas(canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = ink(canvas);
  ctx.lineWidth = dpr;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (!node || state.status !== "playing") {
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
  } else {
    if (timeData?.length !== node.fftSize)
      timeData = new Uint8Array(node.fftSize);
    node.getByteTimeDomainData(timeData);
    const n = timeData.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const v = Math.max(
        -1,
        Math.min(1, ((timeData[i] - 128) / 128) * SCOPE_GAIN)
      );
      const y = h / 2 - v * (h / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

/** Reads the analyser once per frame; null when nothing is audible. */
function readFrequencies(node: AnalyserNode | null) {
  if (!node || state.status !== "playing") return null;
  if (freqData?.length !== node.frequencyBinCount) {
    freqData = new Uint8Array(node.frequencyBinCount);
  }
  node.getByteFrequencyData(freqData);
  return freqData;
}

/**
 * Peak level (0..1) of `out.length` log-spaced bands between `loHz` and `hiHz`,
 * so the bass does not hog every band.
 */
function bandLevels(
  freq: Uint8Array,
  sampleRate: number,
  loHz: number,
  hiHz: number,
  out: Float32Array
) {
  const nyquist = sampleRate / 2;
  const count = out.length;
  for (let i = 0; i < count; i++) {
    const lo = loHz * (hiHz / loHz) ** (i / count);
    const hi = loHz * (hiHz / loHz) ** ((i + 1) / count);
    const a = Math.floor((lo / nyquist) * freq.length);
    const b = Math.max(a + 1, Math.floor((hi / nyquist) * freq.length));
    let peak = 0;
    for (let k = a; k < b && k < freq.length; k++) {
      peak = Math.max(peak, freq[k]);
    }
    out[i] = peak / 255;
  }
  return out;
}

function drawSpectrum(canvas: HTMLCanvasElement, levels: Float32Array | null) {
  const { ctx, w, h, dpr } = fitCanvas(canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = ink(canvas);
  const gap = 2 * dpr;
  const barW = (w - gap * (SPECTRUM_BARS - 1)) / SPECTRUM_BARS;
  for (let i = 0; i < SPECTRUM_BARS; i++) {
    const barH = Math.max(dpr, (levels?.[i] ?? 0) * h);
    ctx.fillRect(i * (barW + gap), h - barH, barW, barH);
  }
}

/** Redraws now and keeps frames coming while anything still moves. */
function refresh() {
  draw();
  loop();
}

function seekTo(seconds: number) {
  player.seek(seconds);
  refresh();
}

/** Jumping to a lyric line also resumes a paused song. */
function seekAndPlay(seconds: number) {
  player.seek(seconds);
  if (state.status === "paused") player.play();
  refresh();
}

function toggleLyrics() {
  const shown = lyrics?.toggleSheet() ?? false;
  if (shown) refresh();
  return shown;
}

function draw(dtMs = 0) {
  const pos = player.position();
  lyrics?.step(state, pos);
  armSettled = arm?.step(state, pos, dtMs) ?? true;
  motorSettled = motor?.step(isActive(state), dtMs) ?? true;

  const node = player.analyser();
  const freq = readFrequencies(node);
  const sampleRate = node?.context.sampleRate ?? 48000;

  const scope = document.querySelector<HTMLCanvasElement>("[data-music-scope]");
  if (scope && heroVisible) drawScope(scope, node);

  const spectrum = document.querySelector<HTMLCanvasElement>(
    "[data-music-spectrum]"
  );
  if (spectrum && !heroVisible) {
    drawSpectrum(
      spectrum,
      freq && bandLevels(freq, sampleRate, 40, 12000, spectrumLevels)
    );
  }

  if (wordmark && heroVisible) {
    wordmarkSettled = wordmark.step(wordDrive(freq, sampleRate), dtMs);
  }
  fxSettled = fx?.step(dtMs) ?? true;
  writeRowProgress(pos);
}

let progressRow: HTMLElement | null = null;

function writeRowProgress(pos: player.Position | null) {
  const id = currentId(state);
  const row = id
    ? document.querySelector<HTMLElement>(
        `.tl-row[data-track-id="${CSS.escape(id)}"]`
      )
    : null;
  if (progressRow && progressRow !== row) {
    progressRow.style.removeProperty("--tl-progress");
  }
  progressRow = row;
  if (row && pos?.duration) {
    row.style.setProperty(
      "--tl-progress",
      (pos.elapsed / pos.duration).toFixed(4)
    );
  }
}

/** Audio wins; with nothing audible the pointer moves the letters. */
function wordDrive(
  freq: Uint8Array | null,
  sampleRate: number
): WordDrive | null {
  if (freq) {
    return {
      source: "audio",
      levels: bandLevels(freq, sampleRate, 40, 12000, wordLevels),
    };
  }
  const levels = fx?.wordLevels();
  return levels ? { source: "pointer", levels } : null;
}

function isMusicPage() {
  return document.querySelector(".music-scope") !== null;
}

function shouldAnimate() {
  if (document.hidden || !isMusicPage()) return false;
  if (
    state.status === "playing" ||
    !armSettled ||
    !motorSettled ||
    !fxSettled
  ) {
    return true;
  }
  return wordmark !== null && heroVisible && !wordmarkSettled;
}

function loop() {
  if (raf || !shouldAnimate()) return;
  raf = requestAnimationFrame(function frame(now) {
    raf = 0;
    // Clamp so a frame after a stall does not jump the letters.
    const dt = lastFrame ? Math.min(now - lastFrame, 64) : 16;
    lastFrame = now;
    draw(dt);
    renderClock();
    if (shouldAnimate()) loop();
    else lastFrame = 0;
  });
}

function watchHero() {
  heroObserver?.disconnect();
  heroObserver = null;
  const scope = document.querySelector<HTMLElement>(".music-scope");
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  heroVisible = hero !== null;
  if (!scope || !hero) return;
  heroObserver = new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.intersectionRatio > 0.25;
      scope.toggleAttribute("data-hero-in", heroVisible);
      refresh();
    },
    { threshold: [0, 0.25, 0.5] }
  );
  heroObserver.observe(hero);
}

function onClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-lyrics-toggle]")) {
    toggleLyrics();
    return;
  }
  const control = event.target.closest<HTMLElement>("[data-music-action]");
  if (control) {
    if (control.hasAttribute("data-just-scratched")) {
      control.removeAttribute("data-just-scratched");
      return;
    }
    const action = control.dataset.musicAction;
    if (action === "toggle") toggle(control.dataset.trackId);
    else if (action === "prev") player.prev();
    else if (action === "next") player.next();
    return;
  }
  if (event.target.closest("a")) return;
  const row = event.target.closest<HTMLElement>(".tl-row[data-track-id]");
  if (row) toggle(row.dataset.trackId);
}

const SEEK_STEP_S = 5;

function nudge(seconds: number) {
  const pos = player.position();
  if (!pos || !player.canSeek()) return false;
  const end = pos.duration ?? Number.POSITIVE_INFINITY;
  seekTo(Math.min(Math.max(0, pos.elapsed + seconds), end - 0.5));
  return true;
}

function playAt(index: number) {
  const item = queue[index];
  if (!item) return false;
  player.play(item.id);
}

type KeyCommand = (event: KeyboardEvent) => boolean | void;

/** Returns false to leave the key to the browser. */
const KEY_COMMANDS: Record<string, KeyCommand> = {
  b: event => {
    if (event.target !== document.body) return false;
    enterBlog();
  },
  enter: event => {
    if (event.target !== document.body) return false;
    enterBlog();
  },
  " ": event => {
    // Space already activates a focused button or link natively.
    if (event.target instanceof Element && event.target.closest("button, a")) {
      return false;
    }
    toggle();
  },
  k: () => player.prev(),
  j: () => player.next(),
  // With a song loaded the arrows scrub; before that they step like K and J.
  arrowleft: () => nudge(-SEEK_STEP_S) || player.prev(),
  arrowright: () => nudge(SEEK_STEP_S) || player.next(),
  l: () => toggleLyrics(),
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [String(i + 1), () => playAt(i)])
  ),
};

function onKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  ) {
    return;
  }
  if (!isMusicPage() || isTyping(event.target)) return;
  const command = KEY_COMMANDS[event.key.toLowerCase()];
  if (command && command(event) !== false) event.preventDefault();
}

function onScrub(event: Event) {
  const target = event.target;
  if (
    target instanceof HTMLInputElement &&
    target.matches("[data-player-scrub]")
  ) {
    player.seek(Number(target.value));
  }
}

function angleOf(event: PointerEvent, cx: number, cy: number) {
  return (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  const record = event.target.closest<HTMLElement>("[data-turntable-record]");
  if (!record) return;

  const box = record.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  let lastAngle = angleOf(event, cx, cy);
  let lastTime = event.timeStamp;
  let offset =
    Number.parseFloat(record.style.getPropertyValue("--scratch")) || 0;
  let travelled = 0;
  let rate = 1;

  record.setPointerCapture(event.pointerId);
  record.setAttribute("data-scratching", "");

  const move = (e: PointerEvent) => {
    const angle = angleOf(e, cx, cy);
    const delta = ((angle - lastAngle + 540) % 360) - 180;
    const dt = Math.max(1, e.timeStamp - lastTime);
    lastAngle = angle;
    lastTime = e.timeStamp;
    offset += delta;
    travelled += Math.abs(delta);
    record.style.setProperty("--scratch", `${offset}deg`);
    if (state.status === "playing") {
      rate = rate * 0.6 + (delta / dt / NORMAL_DEG_PER_MS) * 0.4;
      player.scratch(Math.min(2.5, Math.max(0.1, rate)));
    }
  };

  const release = () => {
    record.removeEventListener("pointermove", move);
    record.removeEventListener("pointerup", release);
    record.removeEventListener("pointercancel", release);
    record.removeAttribute("data-scratching");
    player.scratch(null);
    if (travelled > 3) {
      record.setAttribute("data-just-scratched", "");
      // The click that follows pointerup is dispatched in the same task.
      setTimeout(() => record.removeAttribute("data-just-scratched"));
    }
  };

  record.addEventListener("pointermove", move);
  record.addEventListener("pointerup", release);
  record.addEventListener("pointercancel", release);
}

function probeDurations() {
  for (const item of queue) {
    if (item.source.kind !== "file" || player.durationOf(item) !== null)
      continue;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.addEventListener(
      "loadedmetadata",
      () => {
        player.noteDuration(item.id, probe.duration);
        fillDurations();
      },
      { once: true }
    );
    probe.src = item.source.url;
  }
}

function fillDurations() {
  for (const item of queue) {
    const seconds = player.durationOf(item);
    const text =
      item.source.kind === "seed"
        ? "LOOP"
        : seconds === null
          ? "--:--"
          : formatTime(seconds);
    for (const el of document.querySelectorAll(
      `[data-duration-for="${CSS.escape(item.id)}"]`
    )) {
      el.textContent = text;
    }
  }
}

/** Builds the views that bind listeners to this page's elements. */
function bindPage() {
  const word = document.querySelector(".mx-word");
  wordmark = word && createWordmark(word);
  wordmarkSettled = true;
  if (wordmark && wordLevels.length !== wordmark.bands) {
    wordLevels = new Float32Array(wordmark.bands);
  }
  lyrics = createLyrics(seekAndPlay);
  const turntable = document.querySelector(".tt");
  arm =
    turntable &&
    createArm(turntable, {
      seek: seekTo,
      canSeek: player.canSeek,
      wake() {
        armSettled = false;
        loop();
      },
    });
  armSettled = true;
  motor = turntable && createMotor(turntable);
  motorSettled = true;
  fx = isMusicPage()
    ? createPointerFx(() => {
        fxSettled = false;
        loop();
      })
    : null;
  fxSettled = true;
}

// The first load runs onPageLoad twice (direct call, then astro:page-load).
let boundMain: Element | null = null;

function onPageLoad() {
  const main = document.querySelector("main");
  if (main !== boundMain) {
    boundMain = main;
    bindPage();
  }
  watchHero();
  if (!isMusicPage()) return;
  queue = readQueue();
  player.setQueue(queue);
  player.warm();
  fillDurations();
  probeDurations();
  render();
}

/** Safe to call on every page load: listeners attach once per window. */
export function bindMusicUI() {
  const w = window as unknown as { __musicUiBound?: boolean };
  if (!w.__musicUiBound) {
    w.__musicUiBound = true;
    player.subscribe(next => {
      if (next.status === "idle" && next.blocked) showHint(BLOCKED_HINT);
      state = next;
      render();
    });
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("input", onScrub);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) player.warm();
      refresh();
    });
    document.addEventListener("astro:page-load", onPageLoad);
  }
  onPageLoad();
}
