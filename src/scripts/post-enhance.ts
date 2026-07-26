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

export function initPostEnhancements() {
  const article = document.getElementById("article");
  if (!article) return;
  initCopyWithSource(article);
  initReadCompleteHint(article);
  initCodeStamps(article);
  initQuoteSources(article);
}

export function bindPostEnhancements() {
  const w = window as unknown as { __postEnhanceBound?: boolean };
  if (!w.__postEnhanceBound) {
    w.__postEnhanceBound = true;
    document.addEventListener("astro:page-load", initPostEnhancements);
  }
}
