/**
 * The landing wordmark: one letter per band. While music plays a letter's
 * weight and height follow its frequency band; with nothing playing the
 * pointer can stand in for the music. At rest every letter sits at the idle
 * weight.
 */

const IDLE_WEIGHT = 900;
const MIN_WEIGHT = 300;
const MAX_STRETCH = 0.08;
// Rising energy lands fast, falling energy lets go slowly: breathing, not jitter.
const ATTACK_MS = 70;
const RELEASE_MS = 260;
// A band's loudest recent value sets its full scale; it fades over a few seconds
// so a quiet band still uses the whole range. The floor keeps silence thin.
const PEAK_HALF_LIFE_MS = 2500;
const PEAK_FLOOR = 0.12;

// A loud band thickens its letter; the pointer thins the letters under it.
const WEIGHT_FOR: Record<WordDrive["source"], (energy: number) => number> = {
  audio: energy => MIN_WEIGHT + (IDLE_WEIGHT - MIN_WEIGHT) * energy,
  pointer: energy => IDLE_WEIGHT - (IDLE_WEIGHT - MIN_WEIGHT) * energy,
};

type Letter = {
  el: HTMLElement;
  weight: number;
  stretch: number;
  peak: number;
};

/**
 * What moves the letters, one 0..1 level per band. Audio levels are scaled
 * against each band's recent peak; pointer levels are already proportions.
 */
export type WordDrive = {
  source: "audio" | "pointer";
  levels: Float32Array;
};

export type Wordmark = {
  readonly bands: number;
  /**
   * Advances every letter by `dtMs`; `drive` is null when nothing moves them.
   * Returns true once every letter has reached where the drive puts it.
   */
  step(drive: WordDrive | null, dtMs: number): boolean;
};

function write(letter: Letter) {
  const { style } = letter.el;
  const weight = String(Math.round(letter.weight));
  const scale = `1 ${(1 + letter.stretch).toFixed(3)}`;
  if (style.fontWeight !== weight) style.fontWeight = weight;
  if (style.scale !== scale) style.scale = scale;
}

export function createWordmark(root: Element): Wordmark | null {
  const letters: Letter[] = [
    ...root.querySelectorAll<HTMLElement>(".mx-letter"),
  ].map(el => ({ el, weight: IDLE_WEIGHT, stretch: 0, peak: PEAK_FLOOR }));
  if (letters.length === 0) return null;

  return {
    bands: letters.length,
    step(drive, dtMs) {
      let settled = true;
      const peakDecay = 0.5 ** (dtMs / PEAK_HALF_LIFE_MS);
      for (const [i, letter] of letters.entries()) {
        let targetWeight = IDLE_WEIGHT;
        let targetStretch = 0;
        if (drive) {
          const level = drive.levels[i] ?? 0;
          let energy = level;
          if (drive.source === "audio") {
            letter.peak = Math.max(level, letter.peak * peakDecay, PEAK_FLOOR);
            energy = (level / letter.peak) ** 1.4;
          }
          targetWeight = WEIGHT_FOR[drive.source](energy);
          targetStretch = MAX_STRETCH * energy;
        }
        const tau = targetWeight > letter.weight ? ATTACK_MS : RELEASE_MS;
        const k = 1 - Math.exp(-dtMs / tau);
        letter.weight += (targetWeight - letter.weight) * k;
        letter.stretch += (targetStretch - letter.stretch) * k;
        if (
          Math.abs(targetWeight - letter.weight) < 1 &&
          Math.abs(targetStretch - letter.stretch) < 0.001
        ) {
          letter.weight = targetWeight;
          letter.stretch = targetStretch;
        } else {
          settled = false;
        }
        write(letter);
      }
      return settled;
    },
  };
}
