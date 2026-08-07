import {
  getJarSnapshot,
  getLastRead,
  getReads,
  jarLevelRose,
  resolveJarDragSlug,
  takeJarPourPending,
} from "@/scripts/read-state";
import {
  JAR_POUR_EVENT,
  jarSeason,
  maybeJarWhisper,
  playJarOpenSound,
  type JarPourDetail,
} from "@/scripts/idea-jar";

type BindOpts = {
  todayPickSlug?: string | null;
  todayPickHref?: string | null;
  fallbackSlug?: string | null;
  postsJson?: string;
};

function postsFromHero(): { slug: string; href: string }[] {
  try {
    const raw = document.getElementById("hero")?.dataset.posts;
    return raw ? (JSON.parse(raw) as { slug: string; href: string }[]) : [];
  } catch {
    return [];
  }
}

function hrefForSlug(slug: string, posts: { slug: string; href: string }[]) {
  return posts.find(p => p.slug === slug)?.href ?? null;
}

function parseTagSlugs(root: HTMLElement): string[] {
  const raw = root.dataset.tagSlugs;
  if (!raw) return [];
  try {
    const slugs = JSON.parse(raw) as string[];
    return Array.isArray(slugs) ? slugs : [];
  } catch {
    return [];
  }
}

function tagScopedLevel(root: HTMLElement): number | null {
  if (!root.dataset.tagSlugs) return null;
  const slugs = parseTagSlugs(root);
  if (slugs.length === 0) return 0.05;
  const reads = getReads();
  const readCount = slugs.filter(s => reads.has(s)).length;
  const ratio = readCount / slugs.length;
  return readCount > 0 ? Math.max(0.1, Math.min(1, ratio)) : 0.05;
}

function tagScopedCounts(root: HTMLElement): {
  readCount: number;
  total: number;
} | null {
  if (!root.dataset.tagSlugs) return null;
  const slugs = parseTagSlugs(root);
  if (slugs.length === 0) return { readCount: 0, total: 0 };
  const reads = getReads();
  return {
    readCount: slugs.filter(s => reads.has(s)).length,
    total: slugs.length,
  };
}

function playPourReaction(root: HTMLElement) {
  root.classList.add("is-wobble", "is-pour-flash");
  window.setTimeout(() => root.classList.remove("is-wobble"), 520);
  window.setTimeout(() => root.classList.remove("is-pour-flash"), 1600);
}

export function syncIdeaJarRoot(root: HTMLElement) {
  const total = Number(root.dataset.totalPosts ?? 0);
  const snap = getJarSnapshot(total);
  const isMini = root.classList.contains("idea-jar-mini");
  const scoped = tagScopedLevel(root);
  const level = scoped ?? snap.level;

  root.dataset.season = jarSeason();
  root.classList.toggle("is-dusty", snap.dusty);
  root.classList.toggle("is-visited-today", snap.visitedToday);

  const liquid = root.querySelector<SVGGElement>(".jar-liquid-fill");
  if (liquid) {
    const x = Number(root.dataset.liquidX ?? (isMini ? 28 : 36));
    const y = Number(root.dataset.liquidY ?? (isMini ? 68 : 88));
    liquid.setAttribute(
      "transform",
      `translate(${x} ${y}) scale(1 ${level.toFixed(3)})`
    );
  }

  const notches = root.querySelector<SVGGElement>(".jar-lid-notches");
  if (notches) {
    notches.replaceChildren();
    const count = Math.min(7, snap.weekVisits);
    for (let i = 0; i < count; i++) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(24 + i * 3.2));
      line.setAttribute("y1", "12");
      line.setAttribute("x2", String(24 + i * 3.2));
      line.setAttribute("y2", "15.5");
      line.setAttribute("class", "jar-notch");
      notches.appendChild(line);
    }
  }

  const tip = root.querySelector<HTMLElement>(
    ".home-idea-jar-tip, .idea-jar-mini-tip"
  );
  if (tip) {
    const scopedCounts = tagScopedCounts(root);
    const whisper = root.dataset.hoverWhisper;
    if (tip.classList.contains("idea-jar-mini-tip")) {
      const progress = scopedCounts
        ? `读过 ${scopedCounts.readCount}/${scopedCounts.total}`
        : "";
      tip.replaceChildren();
      if (progress) {
        const line = document.createElement("span");
        line.className = "idea-jar-mini-tip-progress";
        line.textContent = progress;
        tip.appendChild(line);
      }
      if (whisper) {
        const aside = document.createElement("span");
        aside.className = "idea-jar-mini-tip-whisper";
        aside.textContent = whisper;
        tip.appendChild(aside);
      }
    } else {
      const lines: string[] = [
        `读过 ${snap.readCount} 篇 · 暂停 ${snap.bookmarkCount} · 这周 ${snap.weekVisits} 天`,
      ];
      if (snap.latestBookmark) {
        lines.push(
          `纸条 · ${snap.latestBookmark.slug} · 约 ${Math.round(snap.latestBookmark.progress * 100)}%`
        );
      }
      if (whisper) lines.push(whisper);
      tip.textContent = lines.join(" · ");
    }
  }

  const btn = root.querySelector<HTMLButtonElement>(".home-idea-jar-btn");
  if (btn) {
    const last = getLastRead()?.slug ?? null;
    const today =
      root.dataset.todaySlug || btn.dataset.todaySlug || null;
    const fallback = root.dataset.fallbackSlug || null;
    const dragSlug = resolveJarDragSlug({
      lastSlug: last,
      todayPickSlug: today,
      fallbackSlug: fallback,
    });
    if (dragSlug) {
      btn.draggable = true;
      btn.dataset.termSlug = dragSlug;
    } else {
      btn.removeAttribute("draggable");
      delete btn.dataset.termSlug;
    }
  }

  if (!isMini && jarLevelRose(snap.level)) {
    root.classList.add("is-bubbling");
    window.setTimeout(() => root.classList.remove("is-bubbling"), 2200);
  }
}

/** Apply pending pour flash when entering a column list — not article pages. */
function consumePourOnEntry(root: HTMLElement) {
  // Article jars already react via JAR_POUR_EVENT; leave session for the tag page.
  if (root.closest(".post-jar-aside")) return;
  const column = root.dataset.columnTag || null;
  if (!column) return;
  if (takeJarPourPending(column)) {
    playPourReaction(root);
  }
}

export function bindIdeaJarRoot(root: HTMLElement, opts: BindOpts = {}) {
  if (root.dataset.jarBound === "1") return;
  root.dataset.jarBound = "1";

  if (opts.todayPickSlug) root.dataset.todaySlug = opts.todayPickSlug;
  if (opts.fallbackSlug) root.dataset.fallbackSlug = opts.fallbackSlug;
  if (opts.todayPickHref) root.dataset.todayHref = opts.todayPickHref;

  syncIdeaJarRoot(root);

  const btn = root.querySelector<HTMLButtonElement>(".home-idea-jar-btn");
  if (!btn) return;

  let dragged = false;
  let clickTimer = 0;

  const show = () => {
    const whisper = maybeJarWhisper(null);
    if (whisper) root.dataset.hoverWhisper = whisper;
    else delete root.dataset.hoverWhisper;
    syncIdeaJarRoot(root);
    root.classList.add("is-tip-shown");
    void import("@/scripts/bottle-discover").then(m => m.unlockHomeIdeaJar());
  };
  const hide = () => {
    delete root.dataset.hoverWhisper;
    syncIdeaJarRoot(root);
    root.classList.remove("is-tip-shown");
  };

  btn.addEventListener("mouseenter", show);
  btn.addEventListener("mouseleave", hide);
  btn.addEventListener("focus", show);
  btn.addEventListener("blur", hide);

  btn.addEventListener("dragstart", e => {
    dragged = true;
    playJarOpenSound();
    root.classList.add("is-wobble");
    e.dataTransfer?.setData("text/jar-drop", "1");
    const slug = btn.dataset.termSlug;
    if (slug) {
      e.dataTransfer?.setData("text/term-slug", slug);
      e.dataTransfer?.setData("text/plain", slug);
    }
    e.dataTransfer!.effectAllowed = "copy";
  });

  btn.addEventListener("dragend", () => {
    root.classList.remove("is-wobble");
    window.setTimeout(() => {
      dragged = false;
    }, 0);
  });

  btn.addEventListener("click", () => {
    if (dragged) return;
    window.clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => {
      const href = root.dataset.todayHref;
      if (href) window.location.assign(href);
    }, 260);
  });

  btn.addEventListener("dblclick", e => {
    e.preventDefault();
    window.clearTimeout(clickTimer);
    const last = getLastRead()?.slug;
    if (!last) return;
    const posts = opts.postsJson
      ? (JSON.parse(opts.postsJson) as { slug: string; href: string }[])
      : postsFromHero();
    const href = hrefForSlug(last, posts);
    if (href) window.location.assign(href);
  });

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let wobbleTimer = 0;
    const onScroll = () => {
      root.classList.add("is-wobble");
      window.clearTimeout(wobbleTimer);
      wobbleTimer = window.setTimeout(
        () => root.classList.remove("is-wobble"),
        420
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener(
      "astro:before-swap",
      () => window.removeEventListener("scroll", onScroll),
      { once: true }
    );
  }

  const onStorage = () => syncIdeaJarRoot(root);
  window.addEventListener("storage", onStorage);
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("storage", onStorage),
    { once: true }
  );
}

/** Column / article mini bottles: hover tip + whisper + pour reaction. */
export function bindColumnJarMini(root: HTMLElement) {
  if (root.dataset.jarBound === "1") return;
  root.dataset.jarBound = "1";
  root.classList.add("is-interactive");

  syncIdeaJarRoot(root);
  consumePourOnEntry(root);

  const column = root.dataset.columnTag || null;

  const show = () => {
    const whisper = maybeJarWhisper(column);
    if (whisper) root.dataset.hoverWhisper = whisper;
    else delete root.dataset.hoverWhisper;
    syncIdeaJarRoot(root);
    root.classList.add("is-tip-shown");
  };
  const hide = () => {
    delete root.dataset.hoverWhisper;
    syncIdeaJarRoot(root);
    root.classList.remove("is-tip-shown");
  };

  root.addEventListener("mouseenter", show);
  root.addEventListener("mouseleave", hide);

  const onPour = (e: Event) => {
    const detail = (e as CustomEvent<JarPourDetail>).detail;
    const pouredColumn = detail?.column ?? null;
    if (column && pouredColumn && pouredColumn !== column) return;
    // Leave session pending so the column list still flashes on the way back.
    playPourReaction(root);
  };
  document.addEventListener(JAR_POUR_EVENT, onPour);
  document.addEventListener(
    "astro:before-swap",
    () => document.removeEventListener(JAR_POUR_EVENT, onPour),
    { once: true }
  );
}

export function initIdeaJars() {
  document.querySelectorAll<HTMLElement>(".home-idea-jar").forEach(root => {
    if (root.dataset.jarBound !== "1") {
      bindIdeaJarRoot(root, {
        todayPickSlug: root.dataset.todaySlug || null,
        todayPickHref: root.dataset.todayHref || null,
        fallbackSlug: root.dataset.fallbackSlug || null,
      });
    } else {
      syncIdeaJarRoot(root);
    }
  });

  document.querySelectorAll<HTMLElement>(".idea-jar-mini").forEach(root => {
    if (root.dataset.columnTag) {
      if (root.dataset.jarBound !== "1") bindColumnJarMini(root);
      else syncIdeaJarRoot(root);
    } else {
      syncIdeaJarRoot(root);
    }
  });
}
