import { navigate } from "astro:transitions/client";

/**
 * Leaving the music section for the blog: an ink band rises over the old page
 * and uncovers the new one. The rules ride along into the new document, since
 * music.css leaves with the music page on swap.
 */

const STYLE_ID = "mx-wipe-style";

function wipeCss(ink: string) {
  return `
html[data-mx-wipe]::view-transition { background: ${ink}; }
html[data-mx-wipe]::view-transition-old(root),
html[data-mx-wipe]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation-duration: 560ms;
  animation-timing-function: cubic-bezier(0.76, 0, 0.24, 1);
  animation-fill-mode: both;
}
html[data-mx-wipe]::view-transition-old(root) { animation-name: mx-wipe-out; }
html[data-mx-wipe]::view-transition-new(root) {
  animation-name: mx-wipe-in;
  animation-delay: 200ms;
}
@keyframes mx-wipe-out {
  from { clip-path: inset(0 0 0 0); }
  to { clip-path: inset(0 0 100% 0); }
}
@keyframes mx-wipe-in {
  from { clip-path: inset(100% 0 0 0); }
  to { clip-path: inset(0 0 0 0); }
}
`;
}

let ink: string | null = null;

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function arm() {
  if (reducedMotion()) return;
  ink =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--foreground")
      .trim() || "#0b0b0b";
}

function onClick(event: MouseEvent) {
  // ClientRouter already claimed plain clicks; modified clicks open a new tab.
  if (!event.defaultPrevented) return;
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-enter-blog]")) arm();
}

function onBeforeSwap(event: Event) {
  if (ink === null) return;
  const { newDocument, viewTransition } = event as Event & {
    newDocument: Document;
    viewTransition?: ViewTransition;
  };
  const style = newDocument.createElement("style");
  style.id = STYLE_ID;
  style.textContent = wipeCss(ink);
  newDocument.head.append(style);
  newDocument.documentElement.setAttribute("data-mx-wipe", "");
  ink = null;
  const cleanup = () => {
    document.documentElement.removeAttribute("data-mx-wipe");
    document.getElementById(STYLE_ID)?.remove();
  };
  if (viewTransition) viewTransition.finished.finally(cleanup);
  else setTimeout(cleanup);
}

/** For the keyboard shortcut; clicks on the link go through ClientRouter. */
export function enterBlog() {
  const link = document.querySelector<HTMLAnchorElement>("[data-enter-blog]");
  if (!link) return;
  arm();
  void navigate(link.href);
}

export function bindEnterBlog() {
  const w = window as unknown as { __musicWipeBound?: boolean };
  if (w.__musicWipeBound) return;
  w.__musicWipeBound = true;
  document.addEventListener("click", onClick);
  document.addEventListener("astro:before-swap", onBeforeSwap);
}
