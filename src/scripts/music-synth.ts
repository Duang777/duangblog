import { mulberry32, type SeedSource } from "@/lib/music";

const STEPS = 16;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
const MASTER_GAIN = 0.25;
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const NOTE_OFFSET: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

type Pattern = {
  stepSeconds: number;
  kick: boolean[];
  hat: number[];
  bass: (number | null)[];
  arp: (number | null)[];
};

/** MIDI note of the key's root in octave 2, e.g. "A minor" is A2 (45). */
function rootMidi(key: string) {
  const match = /^\s*([A-Ga-g])([#b]?)/.exec(key);
  if (!match) return 45;
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return 36 + ((NOTE_OFFSET[match[1].toUpperCase()] + accidental + 12) % 12);
}

function buildPattern({ bpm, key, seed }: SeedSource): Pattern {
  const rand = mulberry32(seed);
  const root = rootMidi(key);
  const degree = (d: number) =>
    root + MINOR_PENTATONIC[d % 5] + 12 * Math.floor(d / 5);

  const fourOnFloor = rand() < 0.4;
  const kick = Array.from({ length: STEPS }, (_, i) => {
    if (i === 0 || i === 8) return true;
    if (i === 4 || i === 12) return fourOnFloor;
    return (i === 10 || i === 14) && rand() < 0.25;
  });

  const hat = Array.from({ length: STEPS }, (_, i) => {
    if (i % 4 === 2) return 0.7;
    return i % 2 === 1 && rand() < 0.35 ? 0.3 : 0;
  });

  const bass = Array.from({ length: STEPS }, (_, i) => {
    if (i === 0) return degree(0);
    if (rand() > 0.2) return null;
    return degree([0, 0, 2, 3, 4][Math.floor(rand() * 5)]);
  });

  let walk = 5 + Math.floor(rand() * 5);
  const arp = Array.from({ length: STEPS }, () => {
    if (rand() > 0.42) return null;
    walk = Math.min(12, Math.max(5, walk + Math.floor(rand() * 5) - 2));
    return degree(walk) + 12;
  });

  return { stepSeconds: 60 / bpm / 4, kick, hat, bass, arp };
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export type Synth = {
  start(source: SeedSource): void;
  pause(): void;
  resume(): void;
  stop(): void;
  elapsed(): number;
};

export function createSynth(ctx: AudioContext, output: AudioNode): Synth {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(output);

  const delay = ctx.createDelay(1);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  feedback.gain.value = 0.32;
  wet.gain.value = 0.3;
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  let pattern: Pattern | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  // Each run gets its own bus so pausing can fade notes already scheduled.
  let run: { dry: GainNode; send: GainNode } | null = null;
  let step = 0;
  let nextTime = 0;
  let startedAt = 0;
  let accumulated = 0;

  function envelope(
    node: GainNode,
    t: number,
    peak: number,
    attack: number,
    release: number
  ) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  function kick(t: number, bus: AudioNode) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    envelope(amp, t, 0.9, 0.004, 0.32);
    osc.connect(amp).connect(bus);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  function hat(t: number, velocity: number, bus: AudioNode) {
    const src = ctx.createBufferSource();
    const hp = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noise;
    hp.type = "highpass";
    hp.frequency.value = 7000;
    envelope(amp, t, 0.22 * velocity, 0.002, 0.045);
    src.connect(hp).connect(amp).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.07);
  }

  function bass(t: number, midi: number, length: number, bus: AudioNode) {
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(midi);
    lp.type = "lowpass";
    lp.frequency.value = 600;
    envelope(amp, t, 0.5, 0.01, length);
    osc.connect(lp).connect(amp).connect(bus);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  function arp(t: number, midi: number, dry: AudioNode, send: AudioNode) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = midiToHz(midi);
    envelope(amp, t, 0.16, 0.005, 0.22);
    osc.connect(amp);
    amp.connect(dry);
    amp.connect(send);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  function schedule() {
    if (!pattern || !run) return;
    const { dry, send } = run;
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const i = step % STEPS;
      if (pattern.kick[i]) kick(nextTime, dry);
      if (pattern.hat[i] > 0) hat(nextTime, pattern.hat[i], dry);
      const b = pattern.bass[i];
      if (b !== null) bass(nextTime, b, pattern.stepSeconds * 1.6, dry);
      const a = pattern.arp[i];
      if (a !== null) arp(nextTime, a, dry, send);
      nextTime += pattern.stepSeconds;
      step++;
    }
  }

  function openRun() {
    const dry = ctx.createGain();
    const send = ctx.createGain();
    dry.connect(master);
    send.connect(delay);
    run = { dry, send };
    nextTime = ctx.currentTime + 0.05;
    startedAt = nextTime;
    timer = setInterval(schedule, LOOKAHEAD_MS);
    schedule();
  }

  function closeRun() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (!run) return;
    const { dry, send } = run;
    const t = ctx.currentTime;
    for (const node of [dry, send]) {
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(0, t + 0.06);
    }
    setTimeout(() => {
      dry.disconnect();
      send.disconnect();
    }, 300);
    run = null;
  }

  function elapsed() {
    if (!run) return accumulated;
    return accumulated + Math.max(0, ctx.currentTime - startedAt);
  }

  return {
    start(source) {
      closeRun();
      pattern = buildPattern(source);
      delay.delayTime.value = pattern.stepSeconds * 3;
      step = 0;
      accumulated = 0;
      openRun();
    },
    pause() {
      if (!run) return;
      accumulated = elapsed();
      closeRun();
    },
    resume() {
      if (run || !pattern) return;
      openRun();
    },
    stop() {
      closeRun();
      pattern = null;
      accumulated = 0;
    },
    elapsed,
  };
}
