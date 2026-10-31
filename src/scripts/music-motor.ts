/**
 * The platter motor. Speed approaches 33⅓ rpm quickly when playback starts
 * and coasts down slowly when it stops, like a belt drive with a heavy
 * platter. A held record (scratching) stops turning; the platter under it
 * keeps going. Reduced motion leaves both still.
 */

// 33⅓ rpm is 200 degrees per second.
const DEG_PER_S = 200;
const SPIN_UP_PER_S = 2.6;
const COAST_PER_S = 0.9;
const STOP_DEG_PER_S = 0.5;

export type Motor = {
  /** Advances by `dtMs`; returns true once the speed sits on its target. */
  step(running: boolean, dtMs: number): boolean;
};

export function createMotor(root: Element): Motor | null {
  const platter = root.querySelector<HTMLElement>(".tt-platter");
  const record = root.querySelector<HTMLElement>("[data-turntable-record]");
  const disc = record?.querySelector<SVGSVGElement>(".tt-disc");
  if (!platter || !record || !disc) return null;

  let speed = 0;
  let platterDeg = 0;
  let discDeg = 0;

  return {
    step(running, dtMs) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        speed = 0;
        return true;
      }
      const target = running ? DEG_PER_S : 0;
      const k = target > speed ? SPIN_UP_PER_S : COAST_PER_S;
      speed = target + (speed - target) * Math.exp((-k * dtMs) / 1000);
      const settled = Math.abs(target - speed) < STOP_DEG_PER_S;
      if (settled) speed = target;

      const turn = (speed * dtMs) / 1000;
      platterDeg = (platterDeg + turn) % 360;
      if (!record.hasAttribute("data-scratching")) {
        discDeg = (discDeg + turn) % 360;
      }
      platter.style.transform = `rotate(${platterDeg.toFixed(2)}deg)`;
      disc.style.transform = `rotate(${discDeg.toFixed(2)}deg)`;
      return settled;
    },
  };
}
