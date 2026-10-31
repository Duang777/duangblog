/**
 * Pointer-driven touches on the landing: the wordmark leaning toward the
 * cursor, magnetic transport buttons, a tilting sleeve and a cover that
 * follows the cursor over the tracklist. Pointer events only set targets;
 * `step`, run by the shared animation frame, moves everything toward them
 * and reports when all of it has settled so the frame loop can stop.
 */

import { printInto } from "@/scripts/music-dither";

const MAGNET_REACH = 1.5;
const MAGNET_MAX_PX = 6;
const TILT_MAX_DEG = { x: 7, y: 9 };
const TILT_TAU_MS = 140;
const FOLLOW_TAU_MS = 90;
const FLOAT_OFFSET_PX = 28;

/** Exponential approach: frame-rate independent and never overshoots. */
type Ease = { value: number; target: number };

function ease(value = 0): Ease {
  return { value, target: value };
}

/** Moves `e` toward its target; returns true once it is there. */
function approach(e: Ease, dtMs: number, tauMs: number, epsilon: number) {
  e.value += (e.target - e.value) * (1 - Math.exp(-dtMs / tauMs));
  if (Math.abs(e.target - e.value) < epsilon) {
    e.value = e.target;
    return true;
  }
  return false;
}

/** A damped spring, for the buttons that should snap back with a little give. */
type Spring = { value: number; velocity: number; target: number };

function spring(): Spring {
  return { value: 0, velocity: 0, target: 0 };
}

function stepSpring(s: Spring, dtMs: number) {
  const stiffness = 420;
  const damping = 22;
  let left = dtMs / 1000;
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    s.velocity += (stiffness * (s.target - s.value) - damping * s.velocity) * h;
    s.value += s.velocity * h;
    left -= h;
  }
  if (Math.abs(s.target - s.value) < 0.02 && Math.abs(s.velocity) < 0.05) {
    s.value = s.target;
    s.velocity = 0;
    return true;
  }
  return false;
}

export type PointerFx = {
  /** Gaussian levels around the pointer over the hero, one per letter. */
  wordLevels(): Float32Array | null;
  step(dtMs: number): boolean;
};

function decorative() {
  return (
    matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function bindWordmark(hero: HTMLElement, wake: () => void) {
  const cells = [...hero.querySelectorAll<HTMLElement>(".mx-cell")];
  const levels = new Float32Array(cells.length);
  let centers: number[] = [];
  let sigma = 1;
  let pointerX: number | null = null;

  const measure = () => {
    const boxes = cells.map(cell => cell.getBoundingClientRect());
    centers = boxes.map(box => box.left + box.width / 2);
    sigma = Math.max(1, (boxes[0]?.width ?? 1) * 0.6);
  };
  measure();
  window.addEventListener("resize", measure);
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("resize", measure),
    { once: true }
  );

  hero.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || !decorative()) return;
    pointerX = event.clientX;
    wake();
  });
  hero.addEventListener("pointerleave", () => {
    pointerX = null;
    wake();
  });

  return () => {
    if (pointerX === null || cells.length === 0) return null;
    for (const [i, center] of centers.entries()) {
      const dx = pointerX - center;
      levels[i] = Math.exp(-(dx * dx) / (2 * sigma * sigma));
    }
    return levels;
  };
}

function bindMagnets(meta: HTMLElement, wake: () => void) {
  const magnets = [...meta.querySelectorAll<HTMLElement>(".mx-tbtn")].map(
    button => ({
      face: button.querySelector<SVGElement>(":scope > svg"),
      x: spring(),
      y: spring(),
    })
  );

  const aim = (event: PointerEvent | null) => {
    for (const m of magnets) {
      m.x.target = 0;
      m.y.target = 0;
      if (!event || !m.face) continue;
      const box = m.face.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const reach = (box.width / 2) * MAGNET_REACH;
      const distance = Math.hypot(dx, dy);
      if (distance > reach) continue;
      const pull =
        (MAGNET_MAX_PX * (1 - distance / reach)) / Math.max(distance, 1);
      m.x.target = dx * pull;
      m.y.target = dy * pull;
    }
    wake();
  };
  meta.addEventListener("pointermove", event => {
    if (event.pointerType !== "touch" && decorative()) aim(event);
  });
  meta.addEventListener("pointerleave", () => aim(null));

  return (dtMs: number) => {
    let settled = true;
    for (const m of magnets) {
      settled = stepSpring(m.x, dtMs) && settled;
      settled = stepSpring(m.y, dtMs) && settled;
      m.face?.style.setProperty(
        "translate",
        m.x.value || m.y.value
          ? `${m.x.value.toFixed(2)}px ${m.y.value.toFixed(2)}px`
          : ""
      );
    }
    return settled;
  };
}

function bindTilt(sleeve: HTMLElement, wake: () => void) {
  const rx = ease();
  const ry = ease();
  const glare = ease();
  let gx = 50;
  let gy = 50;

  sleeve.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || !decorative()) return;
    const box = sleeve.getBoundingClientRect();
    const u = (event.clientX - box.left) / box.width;
    const v = (event.clientY - box.top) / box.height;
    ry.target = (u - 0.5) * 2 * TILT_MAX_DEG.y;
    rx.target = -(v - 0.5) * 2 * TILT_MAX_DEG.x;
    glare.target = 1;
    gx = u * 100;
    gy = v * 100;
    wake();
  });
  sleeve.addEventListener("pointerleave", () => {
    rx.target = 0;
    ry.target = 0;
    glare.target = 0;
    wake();
  });

  return (dtMs: number) => {
    const settled = [
      approach(rx, dtMs, TILT_TAU_MS, 0.02),
      approach(ry, dtMs, TILT_TAU_MS, 0.02),
      approach(glare, dtMs, TILT_TAU_MS, 0.005),
    ].every(Boolean);
    const { style } = sleeve;
    if (rx.value === 0 && ry.value === 0 && glare.value === 0) {
      style.removeProperty("transform");
      style.removeProperty("--glare");
    } else {
      style.transform = `perspective(900px) rotateX(${rx.value.toFixed(2)}deg) rotateY(${ry.value.toFixed(2)}deg)`;
      style.setProperty("--glare", glare.value.toFixed(3));
      style.setProperty("--gx", `${gx.toFixed(1)}%`);
      style.setProperty("--gy", `${gy.toFixed(1)}%`);
    }
    return settled;
  };
}

function bindFloatCover(list: HTMLElement, wake: () => void) {
  const float = document.querySelector<HTMLElement>("[data-tl-float]");
  const img = float?.querySelector("img");
  if (!float || !img) return () => true;
  const x = ease();
  const y = ease();
  const shown = ease();
  let placed = false;

  const follow = (event: PointerEvent) => {
    const height = float.offsetHeight;
    x.target = event.clientX + FLOAT_OFFSET_PX;
    y.target = Math.min(
      window.innerHeight - height - 8,
      Math.max(8, event.clientY - height / 2)
    );
    if (!placed) {
      x.value = x.target;
      y.value = y.target;
      placed = true;
    }
  };

  list.addEventListener("pointerover", event => {
    if (event.pointerType === "touch" || !decorative()) return;
    const row =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-cover]")
        : null;
    if (!row) return;
    const src = row.dataset.cover ?? "";
    if (img.getAttribute("src") !== src) img.src = src;
    void printInto(float, src);
    follow(event);
    shown.target = 1;
    wake();
  });
  list.addEventListener("pointermove", event => {
    if (shown.target === 0) return;
    follow(event);
    wake();
  });
  list.addEventListener("pointerleave", () => {
    shown.target = 0;
    placed = false;
    wake();
  });

  return (dtMs: number) => {
    const settled = [
      approach(x, dtMs, FOLLOW_TAU_MS, 0.1),
      approach(y, dtMs, FOLLOW_TAU_MS, 0.1),
      approach(shown, dtMs, 120, 0.01),
    ].every(Boolean);
    float.style.translate = `${x.value.toFixed(1)}px ${y.value.toFixed(1)}px`;
    float.style.opacity = shown.value.toFixed(3);
    float.style.scale = (0.92 + 0.08 * shown.value).toFixed(3);
    float.toggleAttribute("data-show", shown.value > 0);
    return settled;
  };
}

export function createPointerFx(wake: () => void): PointerFx {
  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const meta = hero?.querySelector<HTMLElement>(".mx-meta");
  const sleeve = hero?.querySelector<HTMLElement>(".mx-sleeve");
  const list = document.querySelector<HTMLElement>(".mx-tracklist");

  const wordLevels = hero ? bindWordmark(hero, wake) : () => null;
  const steps = [
    meta ? bindMagnets(meta, wake) : null,
    sleeve ? bindTilt(sleeve, wake) : null,
    list ? bindFloatCover(list, wake) : null,
  ].filter(step => step !== null);

  return {
    wordLevels,
    step(dtMs) {
      let settled = true;
      for (const step of steps) settled = step(dtMs) && settled;
      return settled;
    },
  };
}
