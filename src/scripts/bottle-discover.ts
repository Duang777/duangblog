import { findBottleBySrc } from "@/data/bottles";
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

function tryCollectFromImg(img: HTMLImageElement) {
  const bottle = findBottleBySrc(img.currentSrc || img.src || "");
  if (!bottle) return;
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

function bindWhisperJars(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>(".duang-whisper-jar").forEach(img => {
    if (img.dataset.bottleBound === "1") {
      const bottle = findBottleBySrc(img.currentSrc || img.src || "");
      if (bottle) markJar(img, isBottleUnlocked(bottle.id));
      return;
    }
    img.dataset.bottleBound = "1";
    const bottle = findBottleBySrc(img.currentSrc || img.src || "");
    if (!bottle) return;
    markJar(img, isBottleUnlocked(bottle.id));

    const onActivate = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      tryCollectFromImg(img);
    };
    img.addEventListener("click", onActivate);
    img.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") onActivate(e);
    });
  });
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
  bindWhisperJars();
}

export function bindBottleDiscover() {
  const w = window as unknown as { __bottleDiscoverBound?: boolean };
  if (w.__bottleDiscoverBound) return;
  w.__bottleDiscoverBound = true;
  document.addEventListener("astro:page-load", initBottleDiscover);
  // Cover the rare case where this module loads after the first page-load.
  initBottleDiscover();
}
