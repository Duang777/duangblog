import {
  CUE_MS,
  type Cue,
  cueLandsMs,
  parseDuration,
  type QueueItem,
  type Source,
} from "@/lib/music";
import {
  NETEASE_API_PATH,
  type NeteaseResolution,
  outerUrl,
} from "@/lib/netease-resolve";
import { createPulse, type Meter } from "@/scripts/music-pulse";
import { createSynth, type Synth } from "@/scripts/music-synth";

export type { Meter } from "@/scripts/music-pulse";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused";

export type PlayerState =
  /** `blocked`: the browser refused to start audio without a user gesture. */
  | { status: "idle"; blocked?: true }
  /** `cue` is set when this play started from a stop. */
  | { status: "loading" | "playing"; track: QueueItem; cue: Cue | null }
  | { status: "paused"; track: QueueItem };

type Engine = {
  ctx: AudioContext;
  /** Between the sources and the analyser, so the meters fade in with the sound. */
  gain: GainNode;
  analyser: AnalyserNode;
  /** Plays CORS media through the analyser. */
  routed: HTMLAudioElement;
  /**
   * Plays media without CORS, outside the graph: Web Audio would silence it.
   * Its meters come from `pulse`.
   */
  direct: HTMLAudioElement;
  /** Whichever element holds the current song. */
  audio: HTMLAudioElement;
  pulse: Meter;
  synth: Synth;
};

/**
 * `cors` media can feed the analyser. NetEase's outlink cannot: the browser
 * follows it itself, so it plays wherever the visitor can reach NetEase.
 */
type Media = { url: string; cors: boolean };

// NetEase media URLs expire about 25 minutes after they are issued.
const NETEASE_URL_TTL_MS = 20 * 60 * 1000;
// Past this the site's resolver counts as down and the outlink takes over.
const RESOLVE_TIMEOUT_MS = 3500;

const listeners = new Set<(state: PlayerState) => void>();
const measuredDurations = new Map<string, number>();
// Tracks that failed to load this visit. They are skipped and never retried,
// so a run of failures ends after one attempt per track.
const unavailable = new Set<string>();

// Resolved NetEase media URLs by song id. A URL in hand lets a click call
// audio.play() in its own task; Safari refuses play() once a fetch sits between.
const resolved = new Map<number, { media: Media; at: number }>();
const resolving = new Map<number, Promise<Media>>();
// When the fade-in started, in performance.now() time; drives `direct.volume`.
let fadeFrom = 0;
let fadeFrame = 0;

let state: PlayerState = { status: "idle" };
let queue: QueueItem[] = [];
let engine: Engine | null = null;
// Which track the audio element or synth holds, so a resume never plays the
// previous track's sound after a pause that landed mid-load.
let loaded: { id: string; at: number } | null = null;
// Bumped by every transition so a slow fetch or audio.play() cannot land on a newer state.
let generation = 0;

function setState(next: PlayerState) {
  state = next;
  mirror();
  for (const listener of listeners) listener(state);
}

function mirror() {
  document.documentElement.dataset.music = state.status;
}

/** Created when playback is first attempted; browser policy may require a gesture. */
function ensureEngine(): Engine {
  if (engine) return engine;
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;
  analyser.connect(ctx.destination);
  const gain = ctx.createGain();
  gain.connect(analyser);

  const routed = new Audio();
  // NetEase media is cross-origin; without CORS the analyser would read silence.
  routed.crossOrigin = "anonymous";
  ctx.createMediaElementSource(routed).connect(gain);
  const direct = new Audio();

  for (const audio of [routed, direct]) {
    audio.preload = "auto";
    audio.addEventListener("loadedmetadata", () => {
      if (
        audio === engine?.audio &&
        state.status !== "idle" &&
        Number.isFinite(audio.duration)
      ) {
        measuredDurations.set(state.track.id, audio.duration);
      }
    });
    audio.addEventListener("ended", () => {
      if (audio === engine?.audio && state.status === "playing") next();
    });
    // Load failures before playback reject audio.play(); this catches the ones after.
    audio.addEventListener("error", () => {
      if (
        audio === engine?.audio &&
        state.status === "playing" &&
        state.track.source.kind !== "seed"
      ) {
        fail(state.track);
      }
    });
  }

  const pulse = createPulse(() => ({
    seconds: direct.currentTime,
    level: direct.paused ? 0 : fadeLevel(),
  }));
  engine = {
    ctx,
    gain,
    analyser,
    routed,
    direct,
    audio: routed,
    pulse,
    synth: createSynth(ctx, gain),
  };
  return engine;
}

function silence(e: Engine) {
  e.routed.pause();
  e.direct.pause();
  e.synth.stop();
}

function fadeLevel() {
  return Math.min(1, Math.max(0, (performance.now() - fadeFrom) / CUE_MS.fade));
}

/** Silent now, then up to full over a short ramp once `delayMs` has passed. */
function fadeIn(e: Engine, delayMs: number) {
  const { gain } = e.gain;
  const now = e.ctx.currentTime;
  const from = now + delayMs / 1000;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(0, now);
  gain.setValueAtTime(0, from);
  gain.linearRampToValueAtTime(1, from + CUE_MS.fade / 1000);

  // The direct element sits outside the graph, so its volume follows by hand.
  // iOS ignores element volume; there the sound just starts at full.
  fadeFrom = performance.now() + delayMs;
  cancelAnimationFrame(fadeFrame);
  const ramp = () => {
    const level = fadeLevel();
    e.direct.volume = level;
    if (level < 1) fadeFrame = requestAnimationFrame(ramp);
  };
  ramp();
}

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function freshMedia(id: number) {
  const hit = resolved.get(id);
  return hit && Date.now() - hit.at < NETEASE_URL_TTL_MS ? hit.media : null;
}

/**
 * The site's resolver hands back CORS media, but only when NetEase serves the
 * server's region. Otherwise the visitor's browser follows the outlink itself;
 * a VIP song then fails to load and is skipped like any other failure.
 */
async function fetchMedia(id: number): Promise<Media> {
  let media: Media = { url: outerUrl(id), cors: false };
  try {
    const response = await fetch(`${NETEASE_API_PATH}${id}`, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (response.ok) {
      const resolution = (await response.json()) as NeteaseResolution;
      if (resolution.playable) media = { url: resolution.url, cors: true };
    }
  } catch {
    // Unreachable or slow resolver: the outlink still plays in mainland China.
  }
  resolved.set(id, { media, at: Date.now() });
  return media;
}

function resolveMedia(id: number): Promise<Media> {
  const hit = freshMedia(id);
  if (hit) return Promise.resolve(hit);
  let pending = resolving.get(id);
  if (!pending) {
    pending = fetchMedia(id).finally(() => resolving.delete(id));
    resolving.set(id, pending);
  }
  return pending;
}

/** Resolves every NetEase song ahead of the click; already fresh ones cost nothing. */
export function warm() {
  for (const item of queue) {
    if (item.source.kind === "netease") void resolveMedia(item.source.id);
  }
}

/** The media without waiting when it is already known, else a promise. */
function mediaFor(source: Exclude<Source, { kind: "seed" }>) {
  if (source.kind === "file") return { url: source.url, cors: true };
  return freshMedia(source.id) ?? resolveMedia(source.id);
}

function isStale(source: Source) {
  return (
    source.kind === "netease" &&
    loaded !== null &&
    Date.now() - loaded.at > NETEASE_URL_TTL_MS
  );
}

async function start(track: QueueItem, resume: boolean, automatic = false) {
  const e = ensureEngine();
  const gen = ++generation;
  const { source } = track;
  const holds = resume && loaded?.id === track.id;
  const reuse = holds && !isStale(source);
  // A stale URL is fetched again and picks up where the pause left it.
  const startAt = holds ? e.audio.currentTime : 0;
  const fromStop = state.status === "idle" || state.status === "paused";
  const cue: Cue | null =
    fromStop && !reducedMotion()
      ? { at: performance.now(), swing: !holds }
      : null;
  if (!reuse) silence(e);
  if (automatic) {
    // Start audibly so the browser checks its policy before accepting playback.
    e.direct.volume = 1;
  } else {
    fadeIn(e, cue ? cueLandsMs(cue) : 0);
  }
  setState({ status: reuse ? "playing" : "loading", track, cue });
  // Started before any await: strict browsers honour resume() and play() only
  // inside the click's own task.
  const resuming = e.ctx.resume();
  try {
    if (source.kind === "seed") {
      await resuming;
      if (reuse) e.synth.resume();
      else e.synth.start(source);
    } else {
      if (!reuse) {
        const known = mediaFor(source);
        const media = known instanceof Promise ? await known : known;
        if (gen !== generation) return;
        const element = media.cors ? e.routed : e.direct;
        e.audio = element;
        element.src = media.url;
        element.currentTime = startAt;
      }
      loaded = reuse ? loaded : { id: track.id, at: Date.now() };
      await e.audio.play();
      if (!automatic || e.audio !== e.direct) await resuming;
    }
    if (gen === generation) setState({ status: "playing", track, cue });
    warm();
  } catch (error) {
    if (gen !== generation) return;
    // Autoplay refusals are about the gesture, not the track.
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      silence(e);
      setState({ status: "idle", blocked: true });
    } else {
      fail(track);
    }
  }
}

/** Marks the track unavailable and moves on to the next one that can still play. */
function fail(track: QueueItem) {
  unavailable.add(track.id);
  if (engine) silence(engine);
  const target = neighbor(track, 1);
  if (target) {
    void start(target, false);
  } else {
    generation++;
    setState({ status: "idle" });
  }
}

/** The nearest playable track `offset` steps away, wrapping; may be `from` itself. */
function neighbor(from: QueueItem | null, offset: 1 | -1) {
  const index = from ? queue.findIndex(item => item.id === from.id) : -1;
  for (let i = 1; i <= queue.length; i++) {
    const n = queue.length;
    const item = queue[(((index + offset * i) % n) + n) % n];
    if (!unavailable.has(item.id)) return item;
  }
  return null;
}

function currentTrack() {
  return state.status === "idle" ? null : state.track;
}

export function setQueue(items: QueueItem[]) {
  queue = items;
}

export function getState() {
  return state;
}

export function subscribe(listener: (state: PlayerState) => void) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function hasPlayable() {
  return queue.some(item => !unavailable.has(item.id));
}

export function isUnavailable(id: string) {
  return unavailable.has(id);
}

export function play(id?: string) {
  const track =
    queue.find(item => item.id === id) ??
    currentTrack() ??
    neighbor(null, 1) ??
    queue[0];
  if (!track) return;
  // A click is a fresh try; only automatic skips honour earlier failures.
  unavailable.delete(track.id);
  const same = currentTrack()?.id === track.id;
  if (same && (state.status === "playing" || state.status === "loading")) {
    return;
  }
  void start(track, same && state.status === "paused");
}

export function autoplay() {
  const first = queue[0];
  if (first) void start(first, false, true);
}

export function pause() {
  if (state.status !== "playing" && state.status !== "loading") return;
  generation++;
  if (engine) {
    engine.audio.pause();
    engine.synth.pause();
  }
  setState({ status: "paused", track: state.track });
}

export function toggle(id?: string) {
  const current = currentTrack();
  const target = id ?? current?.id;
  const isCurrent = current !== null && target === current.id;
  if (isCurrent && (state.status === "playing" || state.status === "loading")) {
    pause();
  } else {
    play(target);
  }
}

function step(offset: 1 | -1) {
  const current = currentTrack();
  const target = neighbor(current, offset);
  if (!target) return;
  if (target.id === current?.id) {
    if (engine) silence(engine);
    void start(target, false);
  } else {
    play(target.id);
  }
}

export function next() {
  step(1);
}

export function prev() {
  step(-1);
}

export function stop() {
  generation++;
  if (engine) silence(engine);
  setState({ status: "idle" });
}

export function analyser(): Meter | null {
  if (!engine) return null;
  const track = currentTrack();
  const direct =
    track?.source.kind !== "seed" && engine.audio === engine.direct;
  return direct ? engine.pulse : engine.analyser;
}

export function durationOf(track: QueueItem) {
  return (
    parseDuration(track.duration) ?? measuredDurations.get(track.id) ?? null
  );
}

export function noteDuration(id: string, seconds: number) {
  if (Number.isFinite(seconds)) measuredDurations.set(id, seconds);
}

export type Position = { elapsed: number; duration: number | null };

export function position(): Position | null {
  const track = currentTrack();
  if (!track || !engine) return null;
  if (track.source.kind === "seed") {
    return { elapsed: engine.synth.elapsed(), duration: null };
  }
  if (loaded?.id !== track.id)
    return { elapsed: 0, duration: durationOf(track) };
  const { currentTime, duration } = engine.audio;
  return {
    elapsed: currentTime,
    duration: Number.isFinite(duration) ? duration : durationOf(track),
  };
}

/** True when the audio element holds the current song, so `seek` lands. */
export function canSeek() {
  const track = currentTrack();
  return (
    track !== null && track.source.kind !== "seed" && loaded?.id === track.id
  );
}

export function seek(seconds: number) {
  if (!canSeek() || !engine) return;
  engine.audio.currentTime = seconds;
}

/** Scratching bends the file's playback rate; `null` releases the record. */
export function scratch(rate: number | null) {
  if (!canSeek() || !engine) return;
  const { audio } = engine;
  audio.preservesPitch = rate === null;
  audio.playbackRate = rate ?? 1;
}

// ClientRouter replaces <html> attributes on every swap, so re-mirror, and
// leaving the section must not leave invisible audio playing.
document.addEventListener("astro:after-swap", () => {
  if (!document.querySelector(".music-scope")) {
    if (state.status !== "idle") stop();
    delete document.documentElement.dataset.music;
    return;
  }
  mirror();
});

if (document.querySelector(".music-scope")) mirror();
