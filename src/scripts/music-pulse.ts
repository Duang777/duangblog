/**
 * Stands in for the analyser while a song plays straight from NetEase. That
 * media carries no CORS header, so Web Audio reads only silence from it; the
 * meters follow a generated groove clocked by the song's own position, so it
 * holds still on pause and jumps with a seek.
 */

/** What the meters read: an AnalyserNode, or the groove below. */
export type Meter = Pick<
  AnalyserNode,
  | "fftSize"
  | "frequencyBinCount"
  | "getByteFrequencyData"
  | "getByteTimeDomainData"
> & { readonly context: { readonly sampleRate: number } };

export type PulseClock = () => { seconds: number; level: number };

const BPM = 118;
const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;
const SCOPE_AMPLITUDE = 0.32;

/** Deterministic 0..1 noise, so a given moment of a song always looks the same. */
function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth 0..1 noise over `t`, a different curve per `lane`. */
function drift(t: number, lane: number) {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash(i + lane * 57) * (1 - s) + hash(i + 1 + lane * 57) * s;
}

function groove(seconds: number) {
  const beats = (seconds * BPM) / 60;
  const beat = beats % 1;
  const bar = Math.floor(beats / 4);
  const backbeat = Math.floor(beats) % 2 === 1;
  return {
    kick: Math.exp(-beat * 7),
    snare: backbeat ? Math.exp(-beat * 9) : 0,
    hat: Math.exp(-((beats * 2) % 1) * 14) * (0.55 + 0.45 * hash(bar)),
    swell: 0.75 + 0.25 * drift(beats / 8, 1),
  };
}

export function createPulse(clock: PulseClock): Meter {
  const binHz = SAMPLE_RATE / FFT_SIZE;
  return {
    fftSize: FFT_SIZE,
    frequencyBinCount: FFT_SIZE / 2,
    context: { sampleRate: SAMPLE_RATE },
    getByteFrequencyData(out: Uint8Array) {
      const { seconds, level } = clock();
      const g = groove(seconds);
      const beats = (seconds * BPM) / 60;
      for (let i = 0; i < out.length; i++) {
        const hz = i * binHz;
        // Music falls off toward the top; bands breathe on their own.
        const octave = Math.log2(Math.max(hz, 20) / 20);
        const floor = Math.max(0, 0.62 - octave * 0.055);
        const texture = 0.5 + 0.5 * drift(beats * 2 + i * 0.07, 2);
        let v = floor * texture * g.swell;
        if (hz < 160) v += 0.5 * g.kick;
        if (hz > 180 && hz < 2400) v += 0.32 * g.snare * texture;
        if (hz > 5000 && hz < 14000) v += 0.3 * g.hat * texture;
        out[i] = Math.min(255, Math.max(0, v * level * 255));
      }
    },
    getByteTimeDomainData(out: Uint8Array) {
      const { seconds, level } = clock();
      const g = groove(seconds);
      const amp = SCOPE_AMPLITUDE * level * (0.35 + 0.65 * g.kick);
      for (let i = 0; i < out.length; i++) {
        const t = seconds + i / SAMPLE_RATE;
        const v =
          0.6 * Math.sin(2 * Math.PI * 55 * t) +
          0.3 * Math.sin(2 * Math.PI * 220 * t + g.snare * 3) +
          0.1 * (hash(i + Math.floor(seconds * 60)) * 2 - 1) * g.hat;
        out[i] = Math.min(255, Math.max(0, 128 + v * amp * 127));
      }
    },
  };
}
