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
} from "@/lib/netease-resolve";
import { createSynth, type Synth } from "@/scripts/music-synth";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused";

export type PlayerState =
  /** `blocked`: the browser refused to start audio for this click. */
  | { status: "idle"; blocked?: true }
  /** `cue` is set when this play started from a stop. */
  | { status: "loading" | "playing"; track: QueueItem; cue: Cue | null }
  | { status: "paused"; track: QueueItem };

type Engine = {
  ctx: AudioContext;
  /** Between the sources and the analyser, so the meters fade in with the sound. */
  gain: GainNode;
  analyser: AnalyserNode;
  audio: HTMLAudioElement;
  synth: Synth;
};

// NetEase media URLs expire about 25 minutes after they are issued.
const NETEASE_URL_TTL_MS = 20 * 60 * 1000;

const listeners = new Set<(state: PlayerState) => void>();
const measuredDurations = new Map<string, number>();
// Tracks that failed to load this visit. They are skipped and never retried,
// so a run of failures ends after one attempt per track.
const unavailable = new Set<string>();

// Resolved NetEase media URLs by song id. A URL in hand lets a click call
// audio.play() in its own task; Safari refuses play() once a fetch sits between.
const resolved = new Map<number, { url: string | null; at: number }>();
const resolving = new Map<number, Promise<string | null>>();

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

/** Created on the first user gesture; browsers refuse to start audio before that. */
function ensureEngine(): Engine {
  if (engine) return engine;
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;
  analyser.connect(ctx.destination);
  const gain = ctx.createGain();
  gain.connect(analyser);

  const audio = new Audio();
  audio.preload = "auto";
  // NetEase media is cross-origin; without CORS the analyser would read silence.
  audio.crossOrigin = "anonymous";
  ctx.createMediaElementSource(audio).connect(gain);
  audio.addEventListener("loadedmetadata", () => {
    if (state.status !== "idle" && Number.isFinite(audio.duration)) {
      measuredDurations.set(state.track.id, audio.duration);
    }
  });
  audio.addEventListener("ended", () => {
    if (state.status === "playing") next();
  });
  // Load failures before playback reject audio.play(); this catches the ones after.
  audio.addEventListener("error", () => {
    if (state.status === "playing" && state.track.source.kind !== "seed") {
      fail(state.track);
    }
  });

  engine = { ctx, gain, analyser, audio, synth: createSynth(ctx, gain) };
  return engine;
}

function silence(e: Engine) {
  e.audio.pause();
  e.synth.stop();
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
}

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function freshUrl(id: number) {
  const hit = resolved.get(id);
  return hit && Date.now() - hit.at < NETEASE_URL_TTL_MS ? hit : null;
}

async function fetchUrl(id: number) {
  const response = await fetch(`${NETEASE_API_PATH}${id}`);
  if (!response.ok) throw new Error(`resolve ${id}: ${response.status}`);
  const resolution = (await response.json()) as NeteaseResolution;
  const url = resolution.playable ? resolution.url : null;
  resolved.set(id, { url, at: Date.now() });
  return url;
}

function resolveUrl(id: number): Promise<string | null> {
  const hit = freshUrl(id);
  if (hit) return Promise.resolve(hit.url);
  let pending = resolving.get(id);
  if (!pending) {
    pending = fetchUrl(id).finally(() => resolving.delete(id));
    resolving.set(id, pending);
  }
  return pending;
}

/** Resolves every NetEase song ahead of the click; already fresh ones cost nothing. */
export function warm() {
  for (const item of queue) {
    if (item.source.kind === "netease") {
      resolveUrl(item.source.id).catch(() => undefined);
    }
  }
}

/** The media URL without waiting when it is already known, else a promise. */
function mediaUrl(source: Exclude<Source, { kind: "seed" }>) {
  if (source.kind === "file") return source.url;
  const hit = freshUrl(source.id);
  return hit ? hit.url : resolveUrl(source.id);
}

function isStale(source: Source) {
  return (
    source.kind === "netease" &&
    loaded !== null &&
    Date.now() - loaded.at > NETEASE_URL_TTL_MS
  );
}

async function start(track: QueueItem, resume: boolean) {
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
  fadeIn(e, cue ? cueLandsMs(cue) : 0);
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
        const known = mediaUrl(source);
        const url = known instanceof Promise ? await known : known;
        if (gen !== generation) return;
        if (url === null) throw new Error(`${track.id} cannot play here`);
        e.audio.src = url;
        e.audio.currentTime = startAt;
      }
      loaded = reuse ? loaded : { id: track.id, at: Date.now() };
      await Promise.all([e.audio.play(), resuming]);
    }
    if (gen === generation) setState({ status: "playing", track, cue });
    warm();
  } catch (error) {
    if (gen !== generation) return;
    // Autoplay refusals are about the gesture, not the track.
    if (error instanceof DOMException && error.name === "NotAllowedError") {
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

export function analyser() {
  return engine?.analyser ?? null;
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
