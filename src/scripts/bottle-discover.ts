import { findBottleBySrc, getBottle } from "@/data/bottles";
import { playJarOpenSound } from "@/scripts/idea-jar";
import {
  BOTTLE_UNLOCK_EVENT,
  isBottleUnlocked,
  unlockBottle,
} from "@/scripts/bottle-collection";

const TOAST_ID = "bottle-discover-toast";

function cabinetHref(): string {
  const path = window.location.pathname;
  if (path === "/en" || path.startsWith("/en/")) return "/en/bottles/";
  return "/bottles/";
}

function showToast(name: string, fresh: boolean) {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOAST_ID;
    el.className = "bottle-discover-toast font-mono";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  const link = cabinetHref();
  el.innerHTML = fresh
    ? `收进柜子了 · ${name} <a href="${link}">去看看 →</a>`
    : `这只已经在柜子里 · ${name}`;
  el.classList.add("is-shown");
  window.clearTimeout((el as HTMLElement & { _hide?: number })._hide);
  (el as HTMLElement & { _hide?: number })._hide = window.setTimeout(() => {
    el?.classList.remove("is-shown");
  }, 3200);
}

function markJar(img: HTMLImageElement, unlocked: boolean) {
  img.classList.toggle("is-collected", unlocked);
  img.title = unlocked ? "已收进收藏柜" : "点一下，收进收藏柜";
  img.setAttribute("role", "button");
  img.tabIndex = 0;
}

/** Resolve catalog bottle from data-bottle-id or image URL. */
function resolveBottle(img: HTMLImageElement) {
  const id = img.dataset.bottleId?.trim();
  if (id) {
    const byId = getBottle(id);
    if (byId) return byId;
  }
  const candidates = [
    img.currentSrc,
    img.src,
    img.getAttribute("src") ?? "",
  ];
  for (const src of candidates) {
    if (!src) continue;
    const bottle = findBottleBySrc(src);
    if (bottle) return bottle;
  }
  return undefined;
}

function tryCollectFromImg(img: HTMLImageElement) {
  const bottle = resolveBottle(img);
  if (!bottle) return;
  if (!img.dataset.bottleId) img.dataset.bottleId = bottle.id;
  const fresh = unlockBottle(bottle.id);
  if (fresh) {
    playJarOpenSound();
    document.dispatchEvent(
      new CustomEvent(BOTTLE_UNLOCK_EVENT, { detail: { id: bottle.id } })
    );
  }
  markJar(img, true);
  showToast(bottle.name, fresh);
}

function jarFromEventTarget(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element)) return null;
  const img = target.closest("img.duang-whisper-jar");
  if (img instanceof HTMLImageElement) return img;
  // Allow clicking the note label next to the jar.
  const row = target.closest(".duang-whisper-jar-row");
  const sibling = row?.querySelector("img.duang-whisper-jar");
  return sibling instanceof HTMLImageElement ? sibling : null;
}

function syncWhisperJarState(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>("img.duang-whisper-jar").forEach(img => {
    const bottle = resolveBottle(img);
    if (!bottle) return;
    if (!img.dataset.bottleId) img.dataset.bottleId = bottle.id;
    markJar(img, isBottleUnlocked(bottle.id));
  });
}

function onJarActivate(e: Event) {
  const img = jarFromEventTarget(e.target);
  if (!img) return;
  e.preventDefault();
  e.stopPropagation();
  tryCollectFromImg(img);
}

/** Homepage idea jar → 念头瓶. */
export function unlockHomeIdeaJar() {
  if (!unlockBottle("jar")) return false;
  playJarOpenSound();
  document.dispatchEvent(
    new CustomEvent(BOTTLE_UNLOCK_EVENT, { detail: { id: "jar" } })
  );
  showToast("念头瓶", true);
  return true;
}

export function initBottleDiscover() {
  syncWhisperJarState();
}

export function bindBottleDiscover() {
  const w = window as unknown as { __bottleDiscoverBound?: boolean };
  if (w.__bottleDiscoverBound) return;
  w.__bottleDiscoverBound = true;

  // Capture-phase delegation: survives ClientRouter swaps and does not
  // depend on per-image listeners that can be skipped after a failed match.
  document.addEventListener("click", onJarActivate, true);
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const img = jarFromEventTarget(e.target);
    if (!img || e.target !== img) return;
    onJarActivate(e);
  });

  document.addEventListener("astro:page-load", initBottleDiscover);
  initBottleDiscover();
}
