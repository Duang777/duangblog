/**
 * Album covers printed as 1-bit ordered dither (Bayer 8x8) in the page's two
 * tokens. A cover's mask (which cells are lit) is computed once per size; the
 * painted pixels are cached per theme, so a theme flip repaints every shown
 * cover synchronously, in time for the circle reveal's new snapshot.
 *
 * NetEase's image hosts send `Access-Control-Allow-Origin: *`, so a CORS load
 * keeps the canvas readable.
 */

type Rgb = readonly [number, number, number];
type Target = HTMLCanvasElement | SVGImageElement;
type Shown = {
  src: string;
  cells: number;
  ready: Promise<Uint8Array | null>;
  mask: Uint8Array | null;
};

const CELL_PX = 3;
const MIN_CELLS = 24;
const MAX_CELLS = 160;
// Hidden targets (a closed dialog) have no box yet; they reprint when shown.
const FALLBACK_CELLS = 96;
// Share of cells clipped to pure ink and pure paper when levelling a cover.
const LEVELS_CLIP = 0.01;

const BAYER_8 = Float32Array.from({ length: 64 }, (_, i) => {
  const x = i & 7;
  const y = i >> 3;
  let rank = 0;
  for (let bit = 0; bit < 3; bit++) {
    const xb = (x >> bit) & 1;
    const yb = (y >> bit) & 1;
    rank += (((xb ^ yb) << 1) | yb) << (2 * (2 - bit));
  }
  return (rank + 0.5) / 64;
});

// Thresholds compare against linear light; sRGB values would print too bright.
const LINEAR = Float32Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const masks = new Map<string, Promise<Uint8Array | null>>();
const prints = new Map<string, { data: ImageData; url?: string }>();
const shown = new Map<Target, Shown>();

function reducedData() {
  return matchMedia("(prefers-reduced-data: reduce)").matches;
}

async function readMask(src: string, cells: number) {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = cells;
    canvas.height = cells;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      cells,
      cells
    );
    const { data } = ctx.getImageData(0, 0, cells, cells);
    const light = new Float32Array(cells * cells);
    for (let i = 0; i < light.length; i++) {
      const p = i * 4;
      light[i] =
        0.2126 * LINEAR[data[p]] +
        0.7152 * LINEAR[data[p + 1]] +
        0.0722 * LINEAR[data[p + 2]];
    }
    // Two tones carry little range, so stretch each cover to its own levels
    // first; a dark sleeve would otherwise print as solid ink.
    const sorted = light.slice().sort();
    const lo = sorted[Math.floor(sorted.length * LEVELS_CLIP)];
    const hi = sorted[Math.ceil(sorted.length * (1 - LEVELS_CLIP)) - 1];
    const span = Math.max(hi - lo, 1e-3);
    const mask = new Uint8Array(light.length);
    for (let i = 0; i < mask.length; i++) {
      const x = i % cells;
      const y = (i / cells) | 0;
      const level = (light[i] - lo) / span;
      mask[i] = level > BAYER_8[((y & 7) << 3) | (x & 7)] ? 1 : 0;
    }
    return mask;
  } catch {
    return null;
  }
}

function maskOf(src: string, cells: number) {
  const key = `${src} ${cells}`;
  let mask = masks.get(key);
  if (!mask) {
    mask = readMask(src, cells);
    masks.set(key, mask);
  }
  return mask;
}

function parseColor(value: string): Rgb {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = value;
  const hex = ctx.fillStyle;
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function brightness([r, g, b]: Rgb) {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/** The two tokens as [dark, light], so the photo stays a positive in both themes. */
function palette(): { key: string; dark: Rgb; light: Rgb } {
  const style = getComputedStyle(document.documentElement);
  const ink = style.getPropertyValue("--foreground").trim() || "#000";
  const paper = style.getPropertyValue("--background").trim() || "#fff";
  const a = parseColor(ink);
  const b = parseColor(paper);
  const [dark, light] = brightness(a) <= brightness(b) ? [a, b] : [b, a];
  return { key: `${dark.join()}/${light.join()}`, dark, light };
}

function printOf(src: string, cells: number, mask: Uint8Array) {
  const colors = palette();
  const key = `${src} ${cells} ${colors.key}`;
  let print = prints.get(key);
  if (!print) {
    const data = new ImageData(cells, cells);
    for (let i = 0; i < mask.length; i++) {
      const [r, g, b] = mask[i] ? colors.light : colors.dark;
      data.data.set([r, g, b, 255], i * 4);
    }
    print = { data };
    prints.set(key, print);
  }
  return print;
}

function paint(target: Target, { src, cells, mask }: Shown) {
  if (!mask) return;
  const print = printOf(src, cells, mask);
  if (target instanceof HTMLCanvasElement) {
    if (target.width !== cells) target.width = cells;
    if (target.height !== cells) target.height = cells;
    target.getContext("2d")?.putImageData(print.data, 0, 0);
    return;
  }
  if (!print.url) {
    const canvas = document.createElement("canvas");
    canvas.width = cells;
    canvas.height = cells;
    canvas.getContext("2d")?.putImageData(print.data, 0, 0);
    print.url = canvas.toDataURL();
  }
  if (target.getAttribute("href") !== print.url) {
    target.setAttribute("href", print.url);
  }
}

function cssSize(target: Target) {
  if (target instanceof HTMLCanvasElement) return target.clientWidth;
  // A rotating disc's bounding box grows with the angle; scale the viewBox instead.
  const svg = target.ownerSVGElement;
  const view = svg?.viewBox.baseVal.width;
  if (!svg || !view) return 0;
  return (svg.clientWidth * target.width.baseVal.value) / view;
}

function cellsFor(target: Target) {
  const size = cssSize(target);
  if (size <= 0) return FALLBACK_CELLS;
  return Math.min(MAX_CELLS, Math.max(MIN_CELLS, Math.round(size / CELL_PX)));
}

export type PrintResult = "ok" | "failed" | "stale";

/**
 * Prints `src` onto `target` and keeps it in step with the theme. `failed`
 * means the cover cannot be read, so the caller keeps its `<img>`; `stale`
 * means a later call for the same target won. Repeats cost nothing.
 */
export async function printCover(
  target: Target,
  src: string | null
): Promise<PrintResult> {
  if (!src || reducedData()) {
    shown.delete(target);
    return "failed";
  }
  const cells = cellsFor(target);
  const current = shown.get(target);
  const entry: Shown =
    current?.src === src && current.cells === cells
      ? current
      : { src, cells, ready: maskOf(src, cells), mask: null };
  shown.set(target, entry);
  const mask = await entry.ready;
  if (shown.get(target) !== entry) return "stale";
  if (entry.mask !== mask) {
    entry.mask = mask;
    paint(target, entry);
  }
  return mask ? "ok" : "failed";
}

/** Prints into the box's `.mx-print` canvas and marks the box for CSS. */
export async function printInto(box: HTMLElement, src: string | null) {
  const canvas = box.querySelector<HTMLCanvasElement>(":scope > .mx-print");
  if (!canvas) return;
  const result = await printCover(canvas, src);
  if (result !== "stale") box.dataset.print = result;
}

function repaintAll() {
  for (const [target, entry] of shown) {
    if (!target.isConnected) shown.delete(target);
    else paint(target, entry);
  }
}

new MutationObserver(repaintAll).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
