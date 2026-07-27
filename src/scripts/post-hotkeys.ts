function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el?.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']"
    )
  );
}

function shouldIgnoreHotkeys(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return true;
  if (isTyping(target)) return true;
  if (
    el.closest(
      "pre, code, .home-term, .site-hotkey-sheet, [role='dialog'], .pagefind-ui"
    )
  ) {
    return true;
  }
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return true;
  return false;
}

function seriesNavAvailable() {
  const main = document.querySelector<HTMLElement>("#main-content");
  return Boolean(main?.dataset.seriesPrev || main?.dataset.seriesNext);
}

function cheatSheetHtml() {
  const series = seriesNavAvailable();
  return `
    <div class="site-hotkey-sheet-panel font-mono">
      <p class="site-hotkey-sheet-title">快捷键</p>
      <ul>
        <li><kbd>/</kbd> 搜索</li>
        <li><kbd>?</kbd> 本表</li>
        <li><kbd>Esc</kbd> 清空搜索 / 关闭</li>
        ${
          series
            ? `<li><kbd>j</kbd> 下一篇（正文区，未选中文字时）</li><li><kbd>k</kbd> 上一篇</li>`
            : ""
        }
      </ul>
      <p class="site-hotkey-sheet-hint">再按 ? 或 Esc 关闭</p>
    </div>
  `;
}

function toggleCheatSheet(show?: boolean) {
  let sheet = document.querySelector<HTMLElement>(".site-hotkey-sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.className = "site-hotkey-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "快捷键");
    document.body.appendChild(sheet);
    sheet.addEventListener("click", e => {
      if (e.target === sheet) toggleCheatSheet(false);
    });
    document.addEventListener(
      "astro:before-swap",
      () => sheet?.remove(),
      { once: true }
    );
  }
  sheet.innerHTML = cheatSheetHtml();
  const open = show ?? !sheet.classList.contains("is-open");
  sheet.classList.toggle("is-open", open);
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return;

  if (event.key === "?") {
    if (shouldIgnoreHotkeys(event.target)) return;
    event.preventDefault();
    toggleCheatSheet();
    return;
  }

  if (event.key === "Escape") {
    const sheet = document.querySelector(".site-hotkey-sheet.is-open");
    if (sheet) {
      event.preventDefault();
      toggleCheatSheet(false);
    }
    return;
  }

  if (event.key !== "j" && event.key !== "k") return;
  if (shouldIgnoreHotkeys(event.target)) return;

  const main = document.querySelector<HTMLElement>("#main-content");
  const article = document.getElementById("article");
  if (!article || !main?.contains(article)) return;

  if (event.key === "j" && main.dataset.seriesNext) {
    event.preventDefault();
    window.location.assign(main.dataset.seriesNext);
    return;
  }
  if (event.key === "k" && main.dataset.seriesPrev) {
    event.preventDefault();
    window.location.assign(main.dataset.seriesPrev);
  }
}

export function bindPostHotkeys() {
  const w = window as unknown as { __postHotkeysBound?: boolean };
  if (w.__postHotkeysBound) return;
  w.__postHotkeysBound = true;
  document.addEventListener("keydown", onKeydown);
}
