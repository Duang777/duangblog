import {
  getJarSnapshot,
  getLastRead,
  jarLevelRose,
  resolveJarDragSlug,
  takeJarPourPending,
} from "@/scripts/read-state";
import {
  jarSeason,
  maybeJarWhisper,
  playJarOpenSound,
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

export function syncIdeaJarRoot(root: HTMLElement) {
  const total = Number(root.dataset.totalPosts ?? 0);
  const snap = getJarSnapshot(total);
  const isMini = root.classList.contains("idea-jar-mini");

  root.dataset.season = jarSeason();
  root.classList.toggle("is-dusty", snap.dusty);
  root.classList.toggle("is-visited-today", snap.visitedToday);

  const liquid = root.querySelector<SVGGElement>(".jar-liquid-fill");
  if (liquid) {
    const y = isMini ? 86 : 88;
    const x = isMini ? 28 : 36;
    liquid.setAttribute(
      "transform",
      `translate(${x} ${y}) scale(1 ${snap.level.toFixed(3)})`
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

  const tip = root.querySelector<HTMLElement>(".home-idea-jar-tip");
  if (tip) {
    const lines = [
      `读过 ${snap.readCount} 篇 · 暂停 ${snap.bookmarkCount} · 这周 ${snap.weekVisits} 天`,
    ];
    if (snap.latestBookmark) {
      lines.push(
        `纸条 · ${snap.latestBookmark.slug} · 约 ${Math.round(snap.latestBookmark.progress * 100)}%`
      );
    }
    const whisper = root.dataset.hoverWhisper;
    if (whisper) lines.push(whisper);
    tip.textContent = lines.join(" · ");
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

  if (takeJarPourPending()) {
    root.classList.add("is-pour-flash");
    window.setTimeout(() => root.classList.remove("is-pour-flash"), 1600);
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
    const whisper = maybeJarWhisper();
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

export function initIdeaJars() {
  document.querySelectorAll<HTMLElement>(".home-idea-jar, .idea-jar-mini").forEach(root => {
    if (root.classList.contains("home-idea-jar") && root.dataset.jarBound !== "1") {
      bindIdeaJarRoot(root, {
        todayPickSlug: root.dataset.todaySlug || null,
        todayPickHref: root.dataset.todayHref || null,
        fallbackSlug: root.dataset.fallbackSlug || null,
      });
    } else {
      syncIdeaJarRoot(root);
    }
  });
}
