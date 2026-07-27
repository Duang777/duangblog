/**
 * Small reading touches for post pages: copy-with-source, a gentle
 * end-of-article hint, code-block stamps, and expandable quote sources.
 * Each guard is idempotent so ClientRouter re-runs stay safe.
 */

const SITE_NAME = "duangblog";

function currentSlug(): string {
  const parts = window.location.pathname.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "posts";
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

function initCodeStamps(article: HTMLElement) {
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

    const stamp = document.createElement("span");
    stamp.className = "code-stamp font-mono";
    stamp.textContent = lang;
    stamp.setAttribute("aria-hidden", "true");
    pre.appendChild(stamp);
  }
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
  const links = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[href^='http']")
  );
  for (const link of links) {
    try {
      const url = new URL(link.href);
      if (url.origin === origin) continue;
      const host = url.hostname.replace(/^www\./, "");
      const existing = link.getAttribute("title")?.trim();
      if (!existing) link.setAttribute("title", host);
      else if (!existing.includes(host)) {
        link.setAttribute("title", `${existing} · ${host}`);
      }
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
      (quote as HTMLElement).style.setProperty("--quote-ink", String(1 - dry * 0.55));
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

export function initPostEnhancements() {
  const article = document.getElementById("article");
  if (!article) return;
  initCopyWithSource(article);
  initReadCompleteHint(article);
  initCodeStamps(article);
  initQuoteSources(article);
  initChapterTrail(article);
  initFootnotePreviews(article);
  initMidCrease(article);
  initExcerptPick(article);
  initExternalLinkHints(article);
  initCodeLineNumbers(article);
  initQuoteInkFade(article);
  initImageAltNotes(article);
}

export function bindPostEnhancements() {
  const w = window as unknown as { __postEnhanceBound?: boolean };
  if (!w.__postEnhanceBound) {
    w.__postEnhanceBound = true;
    document.addEventListener("astro:page-load", initPostEnhancements);
  }
}
