/**
 * Small reading touches for post pages: copy-with-source, a gentle
 * end-of-article hint, code-block stamps, and expandable quote sources.
 * Each guard is idempotent so ClientRouter re-runs stay safe.
 */

import {
  rememberReadProgress,
  rememberScrollBookmark,
  getScrollBookmark,
  clearScrollBookmark,
  getReadSlugs,
  touchVisitDay,
  markJarPourPending,
} from "@/scripts/read-state";
import { JAR_POUR_EVENT, type JarPourDetail } from "@/scripts/idea-jar";

const SITE_NAME = "duangblog";
const EXT_SEEN_KEY = "post-ext-seen";
const SNIPPET_LANGS = new Set([
  "go",
  "golang",
  "sql",
  "mysql",
  "postgres",
  "postgresql",
  "tsql",
  "plsql",
]);

function currentSlug(): string {
  const parts = window.location.pathname.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "posts";
}

function getSeenHosts(): Set<string> {
  try {
    const raw = localStorage.getItem(EXT_SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markHostSeen(host: string) {
  const seen = getSeenHosts();
  seen.add(host);
  try {
    localStorage.setItem(EXT_SEEN_KEY, JSON.stringify([...seen].slice(-80)));
  } catch {
    // ignore
  }
}

function initCopyWithSource(article: HTMLElement) {
  if (article.dataset.copySourceBound === "1") return;
  article.dataset.copySourceBound = "1";

  const heading = document.querySelector("main h1");
  const targets = [article, heading].filter(Boolean) as HTMLElement[];

  for (const target of targets) {
    target.addEventListener("copy", event => {
      const selection = window.getSelection?.();
      const text = selection?.toString() ?? "";
      if (text.length < 12) return; // let short snippets copy clean

      const url = window.location.href.split("#")[0];
      const source = `\n\n— ${SITE_NAME} · ${currentSlug()}\n${url}`;
      event.clipboardData?.setData("text/plain", text + source);
      event.preventDefault();
    });
  }
}

function initReadCompleteHint(article: HTMLElement) {
  const related = document.querySelector(".continue-reading");
  if (!related || article.dataset.readHintBound === "1") return;
  article.dataset.readHintBound = "1";

  const hint = document.createElement("p");
  hint.className = "post-read-hint font-mono";
  hint.textContent = "读到这儿了 — 接着读上面几条";
  related.parentElement?.insertBefore(hint, related);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hint.classList.add("is-shown");
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          hint.classList.add("is-shown");
          observer.disconnect();
        }
      }
    },
    { rootMargin: "0px 0px -20% 0px" }
  );
  observer.observe(hint);
}

const CODE_COPIED_KEY = "post-code-copied";

function codeBlockKey(pre: HTMLElement): string {
  const text = pre.querySelector("code")?.textContent ?? "";
  return `${currentSlug()}::${text.slice(0, 48).replace(/\s+/g, " ")}`;
}

function getCopiedCodeKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(CODE_COPIED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markCodeCopied(pre: HTMLElement) {
  const key = codeBlockKey(pre);
  const set = getCopiedCodeKeys();
  set.add(key);
  try {
    sessionStorage.setItem(CODE_COPIED_KEY, JSON.stringify([...set].slice(-40)));
  } catch {
    // ignore
  }
  const stamp = pre.querySelector<HTMLElement>(".code-stamp");
  if (stamp) {
    stamp.dataset.langLabel = stamp.dataset.langLabel || stamp.textContent || "";
    stamp.textContent = "copied";
    stamp.classList.add("is-copied");
  }
  pre.classList.add("is-code-copied");
}

function initCodeStamps(article: HTMLElement) {
  const copied = getCopiedCodeKeys();
  const blocks = Array.from(
    article.querySelectorAll<HTMLElement>("pre:not(.mermaid)")
  );
  for (const pre of blocks) {
    if (pre.dataset.stamped === "1") continue;
    pre.dataset.stamped = "1";

    let lang = pre.dataset.language ?? "";
    if (!lang) {
      const code = pre.querySelector("code");
      const match = code?.className.match(/language-([\w-]+)/);
      lang = match?.[1] ?? "";
    }
    if (!lang || lang === "plaintext" || lang === "text") continue;

    const code = pre.querySelector("code");
    const text = code?.textContent ?? "";
    const lineCount = Math.max(1, text.replace(/\n$/, "").split("\n").length);
    const label = lineCount >= 4 ? `${lang} · ${lineCount} lines` : lang;

    const stamp = document.createElement("span");
    stamp.className = "code-stamp font-mono";
    stamp.dataset.langLabel = label;
    stamp.setAttribute("aria-hidden", "true");

    if (copied.has(codeBlockKey(pre))) {
      stamp.textContent = "copied";
      stamp.classList.add("is-copied");
      pre.classList.add("is-code-copied");
    } else {
      stamp.textContent = label;
    }
    pre.appendChild(stamp);

    if (SNIPPET_LANGS.has(lang.toLowerCase())) {
      const note = document.createElement("span");
      note.className = "code-snippet-note font-mono";
      note.textContent = "片段 · 不可跑";
      note.setAttribute("aria-hidden", "true");
      const wrap = pre.closest(".code-block-wrap");
      (wrap ?? pre).appendChild(note);
    }
  }
}

/** Persist that a code block was copied this session (also used by inline copy button). */
export function noteCodeBlockCopied(pre: HTMLElement) {
  markCodeCopied(pre);
}

function initQuoteSources(article: HTMLElement) {
  const quotes = Array.from(article.querySelectorAll("blockquote"));
  const markers = ["来源：", "来源:", "來源：", "source:", "Source:"];

  for (const quote of quotes) {
    if ((quote as HTMLElement).dataset.sourceBound === "1") continue;
    const paragraphs = Array.from(quote.querySelectorAll(":scope > p"));
    const last = paragraphs[paragraphs.length - 1];
    if (!last) continue;

    const raw = last.textContent?.trim() ?? "";
    const marker = markers.find(m => raw.startsWith(m));
    if (!marker) continue;

    (quote as HTMLElement).dataset.sourceBound = "1";
    const sourceText = raw.slice(marker.length).trim();

    const details = document.createElement("details");
    details.className = "quote-source font-mono";
    const summary = document.createElement("summary");
    summary.textContent = "出处";
    const body = document.createElement("span");
    body.className = "quote-source-body";
    body.textContent = sourceText;
    details.append(summary, body);

    last.replaceWith(details);
  }
}

function headingLabel(heading: HTMLElement): string {
  const clone = heading.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".heading-link").forEach(el => el.remove());
  return clone.textContent?.trim() ?? "";
}

function initChapterTrail(article: HTMLElement) {
  if (article.dataset.trailBound === "1") return;
  const sections = Array.from(
    article.querySelectorAll<HTMLElement>("h2")
  ).filter(h => headingLabel(h));
  const headings = Array.from(
    article.querySelectorAll<HTMLElement>("h2, h3")
  ).filter(h => headingLabel(h));
  if (headings.length === 0) return;
  article.dataset.trailBound = "1";

  const trail = document.querySelector<HTMLElement>("[data-rail='trail']");
  const page = document.querySelector<HTMLElement>("[data-rail='page']");
  if (!trail || !page) return;

  let current = "";
  let currentPage = "";

  const onScroll = () => {
    const line = window.innerHeight * 0.3;
    let active: HTMLElement | null = null;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= line) active = heading;
      else break;
    }
    const articleRect = article.getBoundingClientRect();
    const past = articleRect.bottom < line;
    const next = past || !active ? "" : headingLabel(active);
    if (next !== current) {
      current = next;
      trail.textContent = next;
      trail.classList.toggle("is-shown", next !== "");
    }

    if (sections.length > 0) {
      let sectionIndex = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i]!.getBoundingClientRect().top <= line) {
          sectionIndex = i + 1;
        } else break;
      }
      const label =
        past || sectionIndex === 0 ? "" : `${sectionIndex} / ${sections.length}`;
      if (label !== currentPage) {
        currentPage = label;
        page.textContent = label;
        page.classList.toggle("is-shown", label !== "");
      }
    }
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("scroll", onScroll),
    { once: true }
  );
}

function mermaidStampLabel(source: string): string {
  const head = source.trim().split("\n")[0]?.trim().toLowerCase() ?? "";
  if (head.startsWith("sequencediagram")) return "图 · 时序";
  if (head.startsWith("statediagram")) return "图 · 状态";
  if (head.startsWith("classdiagram")) return "图 · 类图";
  if (head.startsWith("erdiagram")) return "图 · ER";
  if (head.startsWith("gantt")) return "图 · 甘特";
  if (head.startsWith("pie")) return "图 · 占比";
  if (head.startsWith("journey")) return "图 · 旅程";
  if (head.startsWith("gitgraph")) return "图 · 分支";
  if (head.startsWith("mindmap")) return "图 · 脑图";
  if (head.startsWith("timeline")) return "图 · 时间线";
  if (/^(flowchart|graph)\b/.test(head)) return "图 · 拓扑";
  if (head.startsWith("c4")) return "图 · C4";
  return "图 · 示意";
}

function stampMermaidWrap(wrap: HTMLElement, pre: HTMLElement) {
  wrap.style.setProperty(
    "--mermaid-stamp",
    `"${mermaidStampLabel(pre.textContent ?? "")}"`
  );
}

function initChapterOutline(article: HTMLElement) {
  if (article.dataset.outlineBound === "1") return;
  if (window.matchMedia("(max-width: 1100px)").matches) return;
  const mount = article.closest<HTMLElement>(".post-body-wrap");
  if (!mount) return;
  const h2s = Array.from(
    article.querySelectorAll<HTMLElement>("h2")
  ).filter(h => headingLabel(h));
  if (h2s.length < 2) return;
  article.dataset.outlineBound = "1";

  const nav = document.createElement("nav");
  nav.className = "post-chapter-outline font-mono";
  nav.setAttribute("aria-label", "章节");

  const list = document.createElement("ol");
  for (const h2 of h2s) {
    if (!h2.id) {
      const label = headingLabel(h2)
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w\u4e00-\u9fff-]/g, "");
      if (label) h2.id = label;
    }
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = h2.id ? `#${h2.id}` : "#";
    a.textContent = headingLabel(h2);
    li.appendChild(a);
    list.appendChild(li);
  }
  nav.appendChild(list);
  mount.appendChild(nav);

  const firstH2 = h2s[0]!;
  const onScroll = () => {
    const past = firstH2.getBoundingClientRect().top < window.innerHeight * 0.22;
    nav.classList.toggle("is-shown", past);

    const line = window.innerHeight * 0.3;
    let activeIdx = -1;
    h2s.forEach((h, i) => {
      if (h.getBoundingClientRect().top <= line) activeIdx = i;
    });
    list.querySelectorAll("li").forEach((li, i) => {
      li.classList.toggle("is-active", i === activeIdx);
    });
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("scroll", onScroll),
    { once: true }
  );
}

function initMermaidStamps(article: HTMLElement) {
  for (const pre of article.querySelectorAll<HTMLElement>("pre.mermaid")) {
    pre.querySelector(".mermaid-stamp")?.remove();

    const parent = pre.parentElement;
    if (parent?.classList.contains("mermaid-wrap")) {
      stampMermaidWrap(parent, pre);
      continue;
    }

    const wrap = document.createElement("div");
    wrap.className = "mermaid-wrap";
    pre.parentNode?.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    stampMermaidWrap(wrap, pre);
  }
}

function initHashFlash(article: HTMLElement) {
  const flash = (el: HTMLElement) => {
    el.classList.add("is-hash-flash");
    window.setTimeout(() => el.classList.remove("is-hash-flash"), 1400);
  };

  const targetFromHash = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el && article.contains(el)) {
      requestAnimationFrame(() => flash(el));
    }
  };

  targetFromHash();
  const onHash = () => targetFromHash();
  window.addEventListener("hashchange", onHash);
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("hashchange", onHash),
    { once: true }
  );
}

function initPrintFootnotes(article: HTMLElement) {
  const refs = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]")
  );
  if (refs.length === 0) return;

  const expand = () => {
    for (const ref of refs) {
      if (ref.dataset.printExpanded === "1") continue;
      const id = ref.getAttribute("href")?.slice(1);
      const note = id ? document.getElementById(id) : null;
      if (!note) continue;
      const clone = note.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("[data-footnote-backref]")
        .forEach(el => el.remove());
      const text = clone.textContent?.trim();
      if (!text) continue;
      const span = document.createElement("span");
      span.className = "print-footnote-inline";
      span.textContent = `（${text}）`;
      ref.after(span);
      ref.dataset.printExpanded = "1";
    }
  };

  const collapse = () => {
    article.querySelectorAll(".print-footnote-inline").forEach(el => el.remove());
    refs.forEach(ref => {
      delete ref.dataset.printExpanded;
    });
  };

  window.addEventListener("beforeprint", expand);
  window.addEventListener("afterprint", collapse);
  document.addEventListener(
    "astro:before-swap",
    () => {
      window.removeEventListener("beforeprint", expand);
      window.removeEventListener("afterprint", collapse);
      collapse();
    },
    { once: true }
  );
}

function initJarPourHint(article: HTMLElement) {
  if (article.dataset.jarPourBound === "1") return;
  article.dataset.jarPourBound = "1";

  const hint = document.createElement("p");
  hint.className = "post-jar-pour font-mono";
  hint.textContent = "已倒进念头瓶";
  hint.hidden = true;
  const stamp = document.querySelector(".post-written-stamp");
  if (stamp) stamp.insertAdjacentElement("beforebegin", hint);
  else article.appendChild(hint);

  let poured = false;
  const onScroll = () => {
    if (poured) return;
    const rect = article.getBoundingClientRect();
    const seen = (window.innerHeight - rect.top) / Math.max(1, rect.height);
    if (seen < 0.88) return;
    poured = true;
    const column =
      document.querySelector<HTMLElement>(".idea-jar-mini[data-column-tag]")
        ?.dataset.columnTag ?? null;
    markJarPourPending(column);
    document.dispatchEvent(
      new CustomEvent<JarPourDetail>(JAR_POUR_EVENT, {
        detail: { column },
      })
    );
    hint.hidden = false;
    hint.classList.add("is-shown");
    window.removeEventListener("scroll", onScroll);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("scroll", onScroll),
    { once: true }
  );
}

function initMidCrease(article: HTMLElement) {
  if (article.dataset.creaseBound === "1") return;
  if (article.scrollHeight < window.innerHeight * 1.6) return;
  article.dataset.creaseBound = "1";

  const crease = document.createElement("div");
  crease.className = "post-mid-crease";
  crease.setAttribute("aria-hidden", "true");
  article.appendChild(crease);

  const onScroll = () => {
    const rect = article.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const height = Math.max(1, article.offsetHeight);
    const view = window.scrollY + window.innerHeight * 0.45;
    const progress = (view - top) / height;
    crease.classList.toggle("is-shown", progress >= 0.45 && progress <= 0.62);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("scroll", onScroll),
    { once: true }
  );
}

function initScrollInk(article: HTMLElement) {
  if (article.dataset.scrollInkBound === "1") return;
  article.dataset.scrollInkBound = "1";

  let bar = document.querySelector<HTMLElement>(".progress-container");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "progress-container";
    const fill = document.createElement("div");
    fill.className = "progress-bar";
    fill.id = "myBar";
    bar.appendChild(fill);
    document.body.appendChild(bar);
  }
  bar.classList.add("is-ink");

  let hideTimer = 0;
  let lastWrite = 0;
  const slug = currentSlug();

  const onScroll = () => {
    const winScroll =
      document.body.scrollTop || document.documentElement.scrollTop;
    const height = Math.max(
      1,
      document.documentElement.scrollHeight -
        document.documentElement.clientHeight
    );
    const scrolled = winScroll / height;
    const myBar = document.getElementById("myBar");
    if (myBar) myBar.style.width = `${scrolled * 100}%`;

    if (scrolled > 0.01) {
      bar!.classList.add("is-shown");
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(
        () => bar!.classList.remove("is-shown"),
        1000
      );
    }

    const rect = article.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const articleH = Math.max(1, article.offsetHeight - window.innerHeight);
    const articleProgress = Math.min(
      1,
      Math.max(0, (window.scrollY - top) / articleH)
    );
    const now = Date.now();
    if (now - lastWrite > 800) {
      lastWrite = now;
      rememberReadProgress(slug, articleProgress);
      rememberScrollBookmark(slug, window.scrollY, articleProgress);
    }
  };

  const persistNow = () => {
    const rect = article.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const articleH = Math.max(1, article.offsetHeight - window.innerHeight);
    const articleProgress = Math.min(
      1,
      Math.max(0, (window.scrollY - top) / articleH)
    );
    rememberReadProgress(slug, articleProgress);
    rememberScrollBookmark(slug, window.scrollY, articleProgress);
  };

  const onHide = () => {
    if (document.visibilityState === "hidden") persistNow();
  };

  // Seed width without flashing the ink on first paint.
  {
    const winScroll =
      document.body.scrollTop || document.documentElement.scrollTop;
    const height = Math.max(
      1,
      document.documentElement.scrollHeight -
        document.documentElement.clientHeight
    );
    const myBar = document.getElementById("myBar");
    if (myBar) myBar.style.width = `${(winScroll / height) * 100}%`;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", persistNow);
  document.addEventListener("visibilitychange", onHide);
  document.addEventListener(
    "astro:before-swap",
    () => {
      persistNow();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onHide);
      window.clearTimeout(hideTimer);
    },
    { once: true }
  );
}

function initResumeBookmark(article: HTMLElement) {
  if (article.dataset.resumeBound === "1") return;
  article.dataset.resumeBound = "1";

  const slug = currentSlug();
  const bookmark = getScrollBookmark(slug);
  if (!bookmark) return;
  // Only offer resume when the reader was meaningfully mid-article.
  if (bookmark.progress < 0.12 || bookmark.progress > 0.92) return;
  if (bookmark.y < window.innerHeight * 0.55) return;

  const host =
    document.querySelector("main h1")?.parentElement ??
    document.getElementById("main-content") ??
    article;

  const tip = document.createElement("button");
  tip.type = "button";
  tip.className = "post-resume-tip font-mono";
  const pct = Math.round(bookmark.progress * 100);
  tip.textContent = `塞回念头瓶 · 约 ${pct}%`;
  tip.setAttribute("aria-label", `跳到上次阅读位置，约 ${pct}%`);

  const title = document.querySelector("main h1");
  if (title) title.insertAdjacentElement("afterend", tip);
  else host.prepend(tip);

  window.requestAnimationFrame(() => tip.classList.add("is-shown"));

  tip.addEventListener("click", () => {
    const y = bookmark.y;
    clearScrollBookmark(slug);
    tip.classList.remove("is-shown");
    window.setTimeout(() => tip.remove(), 280);
    window.scrollTo({
      top: y,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  });

  // Auto-dismiss after a while if ignored.
  window.setTimeout(() => {
    if (!tip.isConnected) return;
    tip.classList.remove("is-shown");
    window.setTimeout(() => tip.remove(), 400);
  }, 10000);
}

function initFootnotePreviews(article: HTMLElement) {
  if (article.dataset.footnoteBound === "1") return;
  const refs = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]")
  );
  if (refs.length === 0) return;
  article.dataset.footnoteBound = "1";

  const pop = document.createElement("div");
  pop.className = "footnote-pop";
  pop.setAttribute("role", "tooltip");
  document.body.appendChild(pop);
  document.addEventListener("astro:before-swap", () => pop.remove(), {
    once: true,
  });

  let hideTimer = 0;

  const show = (ref: HTMLAnchorElement) => {
    const id = ref.getAttribute("href")?.slice(1);
    if (!id) return;
    const note = document.getElementById(id);
    if (!note) return;

    const clone = note.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-footnote-backref]").forEach(el => el.remove());
    const text = clone.textContent?.trim() ?? "";
    if (!text) return;

    pop.textContent = text;
    const rect = ref.getBoundingClientRect();
    pop.style.top = `${window.scrollY + rect.bottom + 8}px`;
    pop.style.left = `${Math.max(
      12,
      Math.min(
        window.scrollX + rect.left - 40,
        window.scrollX + window.innerWidth - pop.offsetWidth - 12
      )
    )}px`;
    window.clearTimeout(hideTimer);
    pop.classList.add("is-shown");
  };

  const hide = () => {
    hideTimer = window.setTimeout(
      () => pop.classList.remove("is-shown"),
      120
    );
  };

  for (const ref of refs) {
    ref.addEventListener("mouseenter", () => show(ref));
    ref.addEventListener("focus", () => show(ref));
    ref.addEventListener("mouseleave", hide);
    ref.addEventListener("blur", hide);
  }
  pop.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  pop.addEventListener("mouseleave", hide);
}

function initExcerptPick(article: HTMLElement) {
  if (article.dataset.excerptBound === "1") return;
  article.dataset.excerptBound = "1";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "excerpt-pick font-mono";
  btn.textContent = "摘";
  btn.setAttribute("aria-label", "摘录并复制出处");
  document.body.appendChild(btn);

  let hideTimer = 0;
  const hide = () => {
    hideTimer = window.setTimeout(() => btn.classList.remove("is-shown"), 180);
  };

  const place = () => {
    const selection = window.getSelection?.();
    const text = selection?.toString().trim() ?? "";
    if (!selection || selection.isCollapsed || text.length < 8) {
      btn.classList.remove("is-shown");
      return;
    }
    if (!article.contains(selection.anchorNode)) {
      btn.classList.remove("is-shown");
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      btn.classList.remove("is-shown");
      return;
    }

    window.clearTimeout(hideTimer);
    btn.style.top = `${window.scrollY + rect.top - 28}px`;
    btn.style.left = `${Math.min(
      window.scrollX + rect.right - 8,
      window.scrollX + window.innerWidth - 48
    )}px`;
    btn.classList.add("is-shown");
  };

  document.addEventListener("selectionchange", place);
  btn.addEventListener("mousedown", event => event.preventDefault());
  btn.addEventListener("click", async () => {
    const selection = window.getSelection?.();
    const text = selection?.toString().trim() ?? "";
    if (!text) return;
    const url = window.location.href.split("#")[0];
    const payload = `${text}\n\n— ${SITE_NAME} · ${currentSlug()}\n${url}`;
    try {
      await navigator.clipboard.writeText(payload);
      btn.textContent = "已摘";
      window.setTimeout(() => {
        btn.textContent = "摘";
        btn.classList.remove("is-shown");
      }, 700);
    } catch {
      btn.classList.remove("is-shown");
    }
  });
  document.addEventListener("scroll", hide, { passive: true });
  document.addEventListener(
    "astro:before-swap",
    () => {
      document.removeEventListener("selectionchange", place);
      document.removeEventListener("scroll", hide);
      btn.remove();
    },
    { once: true }
  );
}

function initExternalLinkHints(article: HTMLElement) {
  if (article.dataset.extHintBound === "1") return;
  article.dataset.extHintBound = "1";

  const origin = window.location.origin;
  const seen = getSeenHosts();
  const links = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[href^='http']")
  );
  for (const link of links) {
    try {
      const url = new URL(link.href);
      if (url.origin === origin) continue;
      const host = url.hostname.replace(/^www\./, "");
      const again = seen.has(host);
      const existing = link.getAttribute("title")?.trim();
      const base = again ? `${host} · 又见` : host;
      if (!existing) link.setAttribute("title", base);
      else if (!existing.includes(host)) {
        link.setAttribute("title", `${existing} · ${base}`);
      } else if (again && !existing.includes("又见")) {
        link.setAttribute("title", `${existing} · 又见`);
      }

      if (again) {
        link.classList.add("ext-seen-again");
        if (!link.querySelector(".ext-again-mark")) {
          const mark = document.createElement("span");
          mark.className = "ext-again-mark font-mono";
          mark.textContent = "又见";
          mark.setAttribute("aria-hidden", "true");
          link.appendChild(mark);
        }
      }

      link.addEventListener("click", () => markHostSeen(host), { once: true });
      link.addEventListener("mouseenter", () => markHostSeen(host), {
        once: true,
      });
    } catch {
      // ignore bad hrefs
    }
  }
}

function initCodeLineNumbers(article: HTMLElement) {
  const blocks = Array.from(
    article.querySelectorAll<HTMLElement>("pre:not(.mermaid)")
  );
  for (const pre of blocks) {
    if (pre.dataset.linesBound === "1") continue;
    const code = pre.querySelector("code");
    if (!code) continue;
    const text = code.textContent ?? "";
    const lineCount = Math.max(1, text.replace(/\n$/, "").split("\n").length);
    if (lineCount < 6) continue;
    pre.dataset.linesBound = "1";
    pre.classList.add("has-line-rail");
    const rail = document.createElement("span");
    rail.className = "code-line-rail font-mono";
    rail.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= lineCount; i++) {
      const n = document.createElement("span");
      n.textContent = String(i);
      rail.appendChild(n);
    }
    pre.appendChild(rail);
  }
}

function initQuoteCopy(article: HTMLElement) {
  if (article.dataset.quoteCopyBound === "1") return;
  article.dataset.quoteCopyBound = "1";

  const quotes = Array.from(article.querySelectorAll("blockquote"));
  for (const quote of quotes) {
    if ((quote as HTMLElement).dataset.copyBound === "1") continue;
    (quote as HTMLElement).dataset.copyBound = "1";
    (quote as HTMLElement).classList.add("has-quote-copy");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quote-copy font-mono";
    btn.textContent = "抄";
    btn.setAttribute("aria-label", "抄录这段引用");
    quote.appendChild(btn);

    btn.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const clone = quote.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".quote-copy, .quote-host-note").forEach(el => {
        el.remove();
      });
      const text = clone.textContent?.replace(/\s+\n/g, "\n").trim() ?? "";
      if (!text) return;
      const url = window.location.href.split("#")[0];
      const payload = `${text}\n\n— ${SITE_NAME} · ${currentSlug()}\n${url}`;
      try {
        await navigator.clipboard.writeText(payload);
        btn.textContent = "已抄";
        window.setTimeout(() => {
          btn.textContent = "抄";
        }, 900);
      } catch {
        // ignore
      }
    });
  }
}

function initQuoteInkFade(article: HTMLElement) {
  if (article.dataset.quoteInkBound === "1") return;
  const quotes = Array.from(article.querySelectorAll("blockquote"));
  if (quotes.length === 0) return;
  article.dataset.quoteInkBound = "1";

  const onScroll = () => {
    const mid = window.innerHeight * 0.45;
    for (const quote of quotes) {
      const rect = quote.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const dist = Math.abs(center - mid) / window.innerHeight;
      const dry = Math.min(1, Math.max(0, dist * 1.6));
      (quote as HTMLElement).style.setProperty(
        "--quote-ink",
        String(1 - dry * 0.55)
      );
    }
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener(
    "astro:before-swap",
    () => window.removeEventListener("scroll", onScroll),
    { once: true }
  );
}

function initImageAltNotes(article: HTMLElement) {
  if (article.dataset.altNoteBound === "1") return;
  article.dataset.altNoteBound = "1";

  const images = Array.from(article.querySelectorAll("img")).filter(
    img => (img.getAttribute("alt") ?? "").trim().length > 0 && !img.closest("a")
  );
  for (const image of images) {
    const alt = image.getAttribute("alt")!.trim();
    const wrap = document.createElement("span");
    wrap.className = "img-alt-wrap";
    image.parentNode?.insertBefore(wrap, image);
    wrap.appendChild(image);
    const note = document.createElement("span");
    note.className = "img-alt-note font-mono";
    note.textContent = alt;
    note.setAttribute("aria-hidden", "true");
    wrap.appendChild(note);
  }
}

function initQuoteLinkNotes(article: HTMLElement) {
  if (article.dataset.quoteLinkBound === "1") return;
  article.dataset.quoteLinkBound = "1";

  const quotes = Array.from(article.querySelectorAll("blockquote"));
  const origin = window.location.origin;
  for (const quote of quotes) {
    if ((quote as HTMLElement).dataset.linkNote === "1") continue;
    const link = quote.querySelector<HTMLAnchorElement>("a[href^='http']");
    if (!link) continue;
    try {
      const url = new URL(link.href);
      if (url.origin === origin) continue;
      const host = url.hostname.replace(/^www\./, "");
      (quote as HTMLElement).dataset.linkNote = "1";
      (quote as HTMLElement).classList.add("has-quote-host");
      const note = document.createElement("span");
      note.className = "quote-host-note font-mono";
      note.textContent = `可核对 · ${host}`;
      note.setAttribute("aria-hidden", "true");
      quote.appendChild(note);
    } catch {
      // ignore
    }
  }
}

function initPrintSheetHead() {
  if (document.querySelector(".print-sheet-head")) return;
  const title =
    document.querySelector("main h1")?.textContent?.trim() || document.title;
  const dateEl = document.querySelector("time");
  const date =
    dateEl?.getAttribute("datetime")?.slice(0, 10) ||
    dateEl?.textContent?.trim() ||
    "";
  const head = document.createElement("p");
  head.className = "print-sheet-head font-mono";
  head.textContent = date
    ? `${SITE_NAME} · ${title} · ${date}`
    : `${SITE_NAME} · ${title}`;
  document.body.prepend(head);
}

function initHubSeriesDots(article: HTMLElement) {
  if (article.dataset.hubDotsBound === "1") return;
  const lists = Array.from(article.querySelectorAll(":scope > ul"));
  if (lists.length === 0) return;

  const reads = new Set(getReadSlugs());
  let bound = false;

  for (const list of lists) {
    const links = Array.from(
      list.querySelectorAll<HTMLAnchorElement>("a[href*='/posts/']")
    );
    if (links.length < 2) continue;
    const slugs = links
      .map(a => {
        try {
          const parts = new URL(a.href, window.location.origin).pathname
            .replace(/\/+$/, "")
            .split("/");
          return parts[parts.length - 1] || "";
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    if (slugs.length < 2) continue;

    const readCount = slugs.filter(s => reads.has(s)).length;
    const total = slugs.length;
    const maxDots = Math.min(12, total);
    const filled = Math.round((readCount / total) * maxDots);
    const dots =
      "●".repeat(filled) + "○".repeat(Math.max(0, maxDots - filled));

    const line = document.createElement("p");
    line.className = "hub-series-progress font-mono";
    line.textContent = `${dots}  ${readCount}/${total}`;
    line.setAttribute("aria-label", `已读 ${readCount} 篇，共 ${total} 篇`);
    list.parentElement?.insertBefore(line, list);
    bound = true;
  }

  if (bound) article.dataset.hubDotsBound = "1";
}

export function initColumnProgressDots() {
  const stat = document.querySelector<HTMLElement>(".tag-notebook-stat");
  const list = document.querySelector<HTMLElement>(".tag-post-list");
  if (!stat || !list || stat.dataset.progressBound === "1") return;
  const cards = Array.from(list.querySelectorAll<HTMLElement>(".post-card"));
  if (cards.length === 0) return;
  stat.dataset.progressBound = "1";

  const reads = new Set(getReadSlugs());
  let readCount = 0;
  for (const card of cards) {
    const slug = card.dataset.termSlug;
    if (slug && reads.has(slug)) readCount += 1;
  }

  const total = cards.length;
  const maxBeads = Math.min(14, Math.max(total, 4));
  const filled = Math.round((readCount / Math.max(1, total)) * maxBeads);

  const rail = document.createElement("span");
  rail.className = "tag-bead-rail";
  rail.setAttribute(
    "aria-label",
    `已读 ${readCount} 篇，共 ${total} 篇`
  );
  rail.title = `已读 ${readCount}/${total}`;

  for (let i = 0; i < maxBeads; i++) {
    const bead = document.createElement("span");
    bead.className = i < filled ? "tag-bead is-read" : "tag-bead";
    bead.setAttribute("aria-hidden", "true");
    rail.appendChild(bead);
  }

  stat.appendChild(document.createTextNode(" · "));
  stat.appendChild(rail);
}

/** Quiet margin mark: copy a whole paragraph with source. */
function initParagraphMarks(article: HTMLElement) {
  if (article.dataset.paraMarkBound === "1") return;
  article.dataset.paraMarkBound = "1";

  const paragraphs = Array.from(
    article.querySelectorAll<HTMLElement>(":scope > p")
  ).filter(p => {
    const text = p.textContent?.trim() ?? "";
    return text.length >= 72 && !p.querySelector("img, pre, .marginalia");
  });
  if (paragraphs.length === 0) return;

  for (const p of paragraphs) {
    if (p.dataset.paraMark === "1") continue;
    p.dataset.paraMark = "1";
    p.classList.add("has-para-mark");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "para-mark font-mono";
    btn.textContent = "※";
    btn.setAttribute("aria-label", "复制本段并附出处");
    btn.tabIndex = -1;

    btn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const clone = p.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".para-mark").forEach(el => el.remove());
      const text = clone.textContent?.trim() ?? "";
      if (!text) return;
      const url = window.location.href.split("#")[0] ?? window.location.href;
      const payload = `${text}\n\n— ${SITE_NAME} · ${currentSlug()}\n${url}`;
      try {
        await navigator.clipboard.writeText(payload);
        btn.textContent = "已抄";
        btn.classList.add("is-done");
        window.setTimeout(() => {
          btn.textContent = "※";
          btn.classList.remove("is-done");
        }, 1200);
      } catch {
        // ignore
      }
    });

    p.prepend(btn);
  }
}

function initTimelineReveal(article: HTMLElement) {
  const timelines = Array.from(
    article.querySelectorAll<HTMLElement>(".article-flow-stack")
  );
  if (!timelines.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  for (const timeline of timelines) {
    if (timeline.dataset.revealBound === "1") continue;
    timeline.dataset.revealBound = "1";

    const events = Array.from(
      timeline.querySelectorAll<HTMLElement>(".article-flow-row")
    );
    if (!events.length) continue;

    if (reduced) {
      for (const event of events) event.classList.add("is-in");
      continue;
    }

    timeline.classList.add("is-reveal-ready");

    const reveal = () => {
      for (const [index, event] of events.entries()) {
        window.setTimeout(() => {
          event.classList.add("is-in");
        }, index * 85);
      }
    };

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            observer.disconnect();
            break;
          }
        }
      },
      {
        rootMargin: "0px 0px -18% 0px",
        threshold: 0.2,
      }
    );

    observer.observe(timeline);
  }
}

export function initPostEnhancements() {
  const article = document.getElementById("article");
  if (!article) {
    initColumnProgressDots();
    return;
  }
  initMermaidStamps(article);
  initCopyWithSource(article);
  initReadCompleteHint(article);
  initCodeStamps(article);
  initQuoteSources(article);
  initChapterTrail(article);
  initChapterOutline(article);
  initHashFlash(article);
  initPrintFootnotes(article);
  initJarPourHint(article);
  initFootnotePreviews(article);
  initMidCrease(article);
  initScrollInk(article);
  initResumeBookmark(article);
  initExcerptPick(article);
  initParagraphMarks(article);
  initExternalLinkHints(article);
  initCodeLineNumbers(article);
  initQuoteInkFade(article);
  initImageAltNotes(article);
  initQuoteLinkNotes(article);
  initQuoteCopy(article);
  initTimelineReveal(article);
  initHubSeriesDots(article);
  initPrintSheetHead();
  touchVisitDay();
}

export function bindPostEnhancements() {
  const w = window as unknown as { __postEnhanceBound?: boolean };
  if (!w.__postEnhanceBound) {
    w.__postEnhanceBound = true;
    document.addEventListener(
      "astro:page-load",
      () => {
        const article = document.getElementById("article");
        if (article) initMermaidStamps(article);
      },
      { capture: true }
    );
    document.addEventListener("astro:page-load", initPostEnhancements);
    document.addEventListener("astro:page-load", initColumnProgressDots);
  }
}
