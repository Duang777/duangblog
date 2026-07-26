/**
 * Global search hotkeys: `/` focuses the search box (jumping to the
 * search page first if needed), `Esc` clears it. Skips key presses
 * that happen while typing in any input, e.g. the home terminal.
 */
function getSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    ".pagefind-ui__search-input"
  );
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return;

  const target = event.target as HTMLElement | null;
  const typing = target?.closest(
    "input, textarea, select, [contenteditable='true'], [contenteditable='']"
  );

  if (event.key === "/") {
    if (typing) return;
    event.preventDefault();
    const input = getSearchInput();
    if (input) {
      input.focus();
    } else {
      const href = document.body.dataset.searchHref;
      if (href) window.location.assign(href);
    }
    return;
  }

  if (event.key === "Escape") {
    const input = getSearchInput();
    if (!input || document.activeElement !== input) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function bindSearchHotkey() {
  const w = window as unknown as { __searchHotkeyBound?: boolean };
  if (w.__searchHotkeyBound) return;
  w.__searchHotkeyBound = true;
  document.addEventListener("keydown", onKeydown);
}
