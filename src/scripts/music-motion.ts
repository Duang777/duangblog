/** Entrance and scroll reveals for the music pages. */

const INTRO_ATTR = "data-mx-intro";
const REVEAL_STAGGER_MS = 60;
const REVEAL_MAX_DELAY_MS = 360;

/** Drops the intro flag once every one-shot entrance animation has run. */
function endIntro() {
  const root = document.documentElement;
  if (!root.hasAttribute(INTRO_ATTR)) return;
  const entrances = document
    .getAnimations()
    .filter(a => a.effect?.getTiming().iterations !== Infinity)
    .map(a => a.finished);
  void Promise.allSettled(entrances).then(() =>
    root.removeAttribute(INTRO_ATTR)
  );
}

function revealOnScroll() {
  const scope = document.querySelector<HTMLElement>(".music-scope");
  const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (!scope || items.length === 0) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  scope.setAttribute("data-reveal-armed", "");
  const observer = new IntersectionObserver(
    entries => {
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const delay = Math.min(
          order++ * REVEAL_STAGGER_MS,
          REVEAL_MAX_DELAY_MS
        );
        el.style.setProperty("--reveal-delay", `${delay}ms`);
        el.setAttribute("data-shown", "");
        observer.unobserve(el);
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  for (const item of items) observer.observe(item);
  document.addEventListener("astro:before-swap", () => observer.disconnect(), {
    once: true,
  });
}

function onPageLoad() {
  if (!document.querySelector(".music-scope")) return;
  endIntro();
  revealOnScroll();
}

export function bindMusicMotion() {
  const w = window as unknown as { __musicMotionBound?: boolean };
  if (!w.__musicMotionBound) {
    w.__musicMotionBound = true;
    document.addEventListener("astro:page-load", onPageLoad);
  }
}
