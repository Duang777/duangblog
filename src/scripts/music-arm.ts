import { type Cue, CUE_MS, formatTime } from "@/lib/music";
import type { PlayerState, Position } from "@/scripts/music-player";

/**
 * The tonearm doubles as the progress bar. It rests off the record while
 * idle; play from a stop cues it (swing in, then lower), and it sweeps toward
 * the label as the song plays. Pausing lifts it in place. Dragging its head
 * seeks.
 *
 * Geometry is in the arm's 500x400 viewBox: pivot at (440,70), stylus tip
 * 256 units below it, record centred at (200,200).
 */

const PIVOT = { x: 440, y: 70 };
const VIEW_W = 500;
const REST_DEG = 0;
// Where the stylus meets the outermost groove (r 156) and the innermost (r 62).
const OUTER_DEG = 27.5;
const INNER_DEG = 48.5;
const SWING_TAU_MS = 240;
const LIFT_TAU_MS = 50;
// Lifting reads as the arm coming toward the viewer, scaled about the pivot.
const LIFT_SCALE = 0.025;
// Stylus jitter in viewBox units: well under a pixel at every size.
const JITTER = [
  { amp: 0.22, hz: 7.3 },
  { amp: 0.14, hz: 12.9 },
] as const;

type Mode =
  | { kind: "following" }
  | { kind: "dragging"; pointerId: number; progress: number }
  | { kind: "cueing"; cue: Cue; from: number; fromLift: number };

// cubic-bezier(.23, 1, .32, 1) for the swing, an ease-in for the lower.
function swingEase(t: number) {
  return bezier(0.23, 1, 0.32, 1, t);
}

function lowerEase(t: number) {
  return t * t * t;
}

/** CSS cubic-bezier timing: solve x(u) = t by Newton steps, return y(u). */
function bezier(x1: number, y1: number, x2: number, y2: number, t: number) {
  const curve = (a: number, b: number, u: number) =>
    3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = curve(x1, x2, u) - t;
    const dx =
      3 * x1 * (1 - u) * (1 - 3 * u) + 3 * x2 * u * (2 - 3 * u) + 3 * u * u;
    if (Math.abs(x) < 1e-5 || dx === 0) break;
    u = Math.min(1, Math.max(0, u - x / dx));
  }
  return curve(y1, y2, u);
}

export type Arm = {
  /** Advances the arm by `dtMs`; returns true once it sits on its target. */
  step(state: PlayerState, pos: Position | null, dtMs: number): boolean;
};

type Deps = {
  seek(seconds: number): void;
  canSeek(): boolean;
  /** Asks for frames, since the arm can move while the song is paused. */
  wake(): void;
};

function angleFor(progress: number) {
  return OUTER_DEG + (INNER_DEG - OUTER_DEG) * progress;
}

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createArm(root: Element, deps: Deps): Arm | null {
  const svg = root.querySelector<SVGSVGElement>(".tt-arm");
  const swing = root.querySelector<SVGGElement>(".tt-arm-swing");
  const grab = root.querySelector<SVGElement>("[data-arm-grab]");
  const head = root.querySelector<SVGElement>(".tt-arm-head");
  const ring = root.querySelector<SVGCircleElement>("[data-arm-ring]");
  const readout = root.querySelector<HTMLElement>("[data-arm-time]");
  if (!svg || !swing || !grab) return null;

  let mode: Mode = { kind: "following" };
  let shown = REST_DEG;
  let lift = 0;
  let lastCue: Cue | null = null;
  let shownRing = -1;
  let duration: number | null = null;

  function progressAt(event: PointerEvent) {
    const box = svg!.getBoundingClientRect();
    const scale = box.width / VIEW_W;
    const dx = event.clientX - (box.left + PIVOT.x * scale);
    const dy = event.clientY - (box.top + PIVOT.y * scale);
    const deg = (Math.atan2(-dx, dy) * 180) / Math.PI;
    return Math.min(
      1,
      Math.max(0, (deg - OUTER_DEG) / (INNER_DEG - OUTER_DEG))
    );
  }

  function showReadout(progress: number | null) {
    if (!readout) return;
    if (progress === null || duration === null) {
      readout.removeAttribute("data-show");
      return;
    }
    readout.textContent = `${formatTime(progress * duration)} / ${formatTime(duration)}`;
    readout.setAttribute("data-show", "");
  }

  grab.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !deps.canSeek()) return;
    event.preventDefault();
    grab.setPointerCapture(event.pointerId);
    mode = {
      kind: "dragging",
      pointerId: event.pointerId,
      progress: progressAt(event),
    };
    root.setAttribute("data-arm-dragging", "");
    showReadout(mode.progress);
    deps.wake();
  });
  grab.addEventListener("pointermove", event => {
    if (mode.kind !== "dragging" || mode.pointerId !== event.pointerId) return;
    mode.progress = progressAt(event);
    showReadout(mode.progress);
    deps.wake();
  });
  const release = (event: PointerEvent) => {
    if (mode.kind !== "dragging" || mode.pointerId !== event.pointerId) return;
    const { progress } = mode;
    mode = { kind: "following" };
    root.removeAttribute("data-arm-dragging");
    showReadout(null);
    if (event.type === "pointerup" && duration !== null) {
      deps.seek(progress * duration);
    }
    deps.wake();
  };
  grab.addEventListener("pointerup", release);
  grab.addEventListener("pointercancel", release);

  /** Moves the arm along its cue; returns false once the needle has landed. */
  function cueStep(m: Extract<Mode, { kind: "cueing" }>, target: number) {
    const t = performance.now() - m.cue.at;
    const swing = m.cue.swing ? CUE_MS.swing : 0;
    if (t < swing) {
      shown = m.from + (target - m.from) * swingEase(t / swing);
      lift = m.fromLift + (1 - m.fromLift) * swingEase(Math.min(1, t / 120));
      return true;
    }
    shown = target;
    const lowered = (t - swing) / CUE_MS.lower;
    if (lowered >= 1) {
      lift = 0;
      return false;
    }
    const top = m.cue.swing ? 1 : m.fromLift;
    lift = top * (1 - lowerEase(lowered));
    return true;
  }

  function jitter(playing: boolean) {
    if (!head) return true;
    if (!playing) {
      head.style.removeProperty("translate");
      return true;
    }
    const s = performance.now() / 1000;
    const [a, b] = JITTER;
    const x = a.amp * Math.sin(2 * Math.PI * a.hz * s);
    const y = b.amp * Math.sin(2 * Math.PI * b.hz * s + 1.3);
    head.style.translate = `${x.toFixed(3)}px ${y.toFixed(3)}px`;
    return false;
  }

  return {
    step(state, pos, dtMs) {
      duration = pos?.duration ?? null;
      const live =
        state.status !== "idle" && deps.canSeek() && duration !== null;
      root.toggleAttribute("data-arm-live", live);
      const progress =
        mode.kind === "dragging"
          ? mode.progress
          : pos && duration
            ? Math.min(1, pos.elapsed / duration)
            : 0;
      const target = state.status === "idle" ? REST_DEG : angleFor(progress);
      const reduced = reducedMotion();

      const cue =
        state.status === "loading" || state.status === "playing"
          ? state.cue
          : null;
      if (cue && cue !== lastCue && mode.kind !== "dragging" && !reduced) {
        mode = { kind: "cueing", cue, from: shown, fromLift: lift };
      }
      lastCue = cue;
      if (
        mode.kind === "cueing" &&
        (cue !== mode.cue || !cueStep(mode, target))
      ) {
        mode = { kind: "following" };
      }

      let settled = false;
      if (mode.kind !== "cueing") {
        const liftTarget = state.status === "paused" ? 1 : 0;
        if (mode.kind === "dragging" || reduced) shown = target;
        else shown += (target - shown) * (1 - Math.exp(-dtMs / SWING_TAU_MS));
        if (reduced) lift = liftTarget;
        else lift += (liftTarget - lift) * (1 - Math.exp(-dtMs / LIFT_TAU_MS));
        settled =
          Math.abs(target - shown) < 0.05 &&
          Math.abs(liftTarget - lift) < 0.005;
        if (settled) {
          shown = target;
          lift = liftTarget;
        }
      }
      const scale = 1 + LIFT_SCALE * lift;
      swing.style.transform = `rotate(${shown.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      const still = jitter(
        state.status === "playing" && mode.kind === "following" && !reduced
      );

      const ringValue = state.status === "idle" ? 0 : progress;
      if (ring && Math.abs(ringValue - shownRing) > 0.0005) {
        shownRing = ringValue;
        ring.style.strokeDashoffset = (1 - ringValue).toFixed(4);
      }
      return settled && still;
    },
  };
}
