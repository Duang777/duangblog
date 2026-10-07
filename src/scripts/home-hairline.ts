import { keyboard, riffle, type Figure } from "@lucasmarkes/hairline";

const mountFigure = { keyboard, riffle } as const;

type FigureName = keyof typeof mountFigure;

let figures: Figure[] = [];

function clearFigures() {
  for (const figure of figures) figure.destroy();
  figures = [];
}

function isFigureName(name: string | undefined): name is FigureName {
  return name === "keyboard" || name === "riffle";
}

function mountFigures() {
  clearFigures();
  const hosts = document.querySelectorAll<HTMLElement>(
    ".home-hairline [data-figure], .home-hero-figure [data-figure]"
  );
  hosts.forEach(host => {
    const name = host.dataset.figure;
    if (!isFigureName(name)) return;
    figures.push(
      mountFigure[name](host, {
        intensity: 0.55,
        label: host.dataset.label,
      })
    );
  });
}

/** Draw the landing figures, and drop them when the home page is left. */
export function bindHomeHairline() {
  const w = window as unknown as { __homeHairlineBound?: boolean };
  const boot = () => {
    if (
      !document.querySelector(".home-hairline, .home-hero-figure")
    ) {
      clearFigures();
      return;
    }
    mountFigures();
  };
  if (!w.__homeHairlineBound) {
    w.__homeHairlineBound = true;
    document.addEventListener("astro:page-load", boot);
    document.addEventListener("astro:before-swap", clearFigures);
  }
  boot();
}
