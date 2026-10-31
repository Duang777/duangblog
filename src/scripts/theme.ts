const THEME_KEY = "theme";
const LIGHT = "light";
const DARK = "dark";

function getPreferredTheme(): string {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

// Reuse the value already set by the inline FOUC-prevention script if available.
let themeValue: string =
  (window as unknown as { __theme?: { value: string } }).__theme?.value ??
  getPreferredTheme();

function getTod(): string {
  const hour = new Date().getHours();
  if (hour < 6 || hour >= 22) return "night";
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function persist(): void {
  localStorage.setItem(THEME_KEY, themeValue);
  reflect();
}

function reflect(): void {
  const root = document.firstElementChild;
  root?.setAttribute("data-theme", themeValue);
  root?.setAttribute("data-tod", getTod());
  root?.classList.toggle("dark", themeValue === DARK);
  document.querySelector("#theme-btn")?.setAttribute("aria-label", themeValue);

  // Fill <meta name="theme-color"> with the computed background colour so
  // Android's browser chrome matches the page background.
  const bg = window.getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
}

const REVEAL_ATTR = "data-theme-reveal";
const REVEAL_MS = 620;

function flip(): void {
  themeValue = themeValue === LIGHT ? DARK : LIGHT;
  persist();
}

/**
 * The new theme spreads from the button as a circle. The attribute scopes the
 * view-transition CSS to this one transition, so page navigations keep theirs.
 */
function revealFrom(button: Element): void {
  const root = document.documentElement;
  const box = button.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );
  root.setAttribute(REVEAL_ATTR, "");
  const transition = document.startViewTransition(flip);
  void transition.ready
    .then(() =>
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: REVEAL_MS,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    )
    .catch(() => undefined);
  void transition.finished.finally(() => root.removeAttribute(REVEAL_ATTR));
}

function onThemeClick(event: Event): void {
  const button = event.currentTarget as Element;
  const canReveal =
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (canReveal) revealFrom(button);
  else flip();
}

function setup(): void {
  reflect();
  document.querySelector("#theme-btn")?.addEventListener("click", onThemeClick);
}

setup();

// Re-run after View Transitions navigation.
document.addEventListener("astro:after-swap", setup);

// Carry the theme-color value across View Transitions to prevent the
// Android navigation bar from flashing during page transitions.
document.addEventListener("astro:before-swap", event => {
  const color = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");
  if (color) {
    (event as { newDocument: Document }).newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", color);
  }
});

// Sync with OS-level dark/light preference changes.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches }) => {
    themeValue = matches ? DARK : LIGHT;
    persist();
  });
