export type TermPost = {
  slug: string;
  title: string;
  href: string;
  description: string;
  tags: string[];
  draft?: boolean;
};

export type TermCtx = {
  postsHref: string;
  aboutHref: string;
  author: string;
  posts: TermPost[];
  ideas: string[];
  guest: boolean;
};

const SOUND_KEY = "term-sound";
const SESSION_KEY = "term-session";
const RESUME_KEY = "term-resume";
const READS_KEY = "term-reads";
const HIST_KEY = "term-cmd-history";
const LAST_POST_KEY = "term-last-post";

const HELP =
  "help · whoami · ls · grep <词> · cat <slug> · open <slug|latest|posts|about> · fortune · today · history · !! · man duang · ssh guest@duang · ps · df -h · tail -f ideas · theme light|dark · sound on|off · clear · exit";

const KNOWN_CMDS = [
  "help",
  "whoami",
  "ls",
  "ls posts",
  "ls posts/",
  "grep",
  "cat",
  "open",
  "fortune",
  "today",
  "history",
  "!!",
  "man",
  "man duang",
  "ssh guest@duang",
  "ssh",
  "ps",
  "df",
  "df -h",
  "tail -f ideas",
  "tail",
  "theme light",
  "theme dark",
  "sound on",
  "sound off",
  "clear",
  "exit",
  "cat about.txt",
];

const CLEAR_POEM = [
  "三清之后，屏幕空了。",
  "笔记还在；草稿也在。",
  "再敲一行，从 open latest 开始。",
];

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function greetingLine(author: string) {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1;

  let part = "现在";
  if (hour < 5) part = "深夜";
  else if (hour < 11) part = "早上";
  else if (hour < 14) part = "中午";
  else if (hour < 18) part = "下午";
  else if (hour < 22) part = "晚上";
  else part = "夜里";

  let season = "日常";
  if (month >= 3 && month <= 5) season = "春天";
  else if (month >= 6 && month <= 8) season = "夏天";
  else if (month >= 9 && month <= 11) season = "秋天";
  else season = "冬天";

  return `${author}，后端 / 全栈。${season}的${part}，还在写拆解和笔记。`;
}

function fortuneLines(author: string): string[] {
  const hour = new Date().getHours();
  return [
    greetingLine(author),
    "先把一次请求走完，再谈抽象。",
    "超时不是配置项，是边界。",
    "读代码比读 README 更省绕路。",
    hour < 6
      ? "夜里适合写草稿，早上再删一半。"
      : "今天挑一篇拆开，比收藏十篇有用。",
    "Context 取消了，查询还在跑，就该回头看驱动。",
    "专栏是地图；文章才是路。",
  ];
}

function promptFor(ctx: TermCtx) {
  return ctx.guest ? "guest@duang:~$" : "duang@blog:~$";
}

function syncChromePrompt(ctx: TermCtx) {
  const label = document.querySelector(
    ".home-term .text-muted-foreground.ms-2, .home-term [data-term-chrome-prompt]"
  );
  if (label) label.textContent = promptFor(ctx);
}

function getReads(): Set<string> {
  try {
    const raw = localStorage.getItem(READS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markPostRead(slug: string) {
  if (!slug) return;
  const reads = getReads();
  reads.add(slug);
  localStorage.setItem(READS_KEY, JSON.stringify([...reads]));
}

/** Remember where a reader just was, so the homepage can greet them back. */
export function rememberLastPost(slug: string) {
  if (!slug) return;
  sessionStorage.setItem(
    LAST_POST_KEY,
    JSON.stringify({ slug, at: Date.now() })
  );
}

/** One-shot: returns the line to print on the homepage, then forgets it. */
function takeReturnNote(posts: TermPost[]): string | null {
  const raw = sessionStorage.getItem(LAST_POST_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LAST_POST_KEY);
  try {
    const data = JSON.parse(raw) as { slug?: string; at?: number };
    if (!data.slug || !data.at || Date.now() - data.at > 30 * 60 * 1000) {
      return null;
    }
    const hit = posts.find(p => p.slug === data.slug);
    if (!hit) return null;
    return `从 ~/posts/${hit.slug}.md 回来`;
  } catch {
    return null;
  }
}

/** Slugs marked read via post pages / terminal — for homepage echo. */
export function getReadSlugs(): string[] {
  return [...getReads()];
}

/** Dim homepage cards that were already opened. */
export function applyReadEcho(root: ParentNode = document) {
  const reads = getReads();
  root.querySelectorAll<HTMLElement>(".post-card[data-term-slug]").forEach(card => {
    const slug = card.dataset.termSlug;
    if (slug && reads.has(slug)) card.classList.add("is-read");
    else card.classList.remove("is-read");
  });
}

function getCmdHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HIST_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pushCmdHistory(cmd: string) {
  const next = [cmd, ...getCmdHistory().filter(c => c !== cmd)].slice(0, 40);
  sessionStorage.setItem(HIST_KEY, JSON.stringify(next));
}

function soundEnabled() {
  return localStorage.getItem(SOUND_KEY) !== "off";
}

function setSoundEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  const btn = document.getElementById("home-term-sound");
  if (btn) {
    btn.textContent = on ? "sound on" : "sound off";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

let audioCtx: AudioContext | null = null;
function beep(kind: "key" | "enter" | "err" = "key") {
  if (!soundEnabled()) return;
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const freq = kind === "err" ? 180 : kind === "enter" ? 520 : 760;
    osc.frequency.setValueAtTime(freq, now);
    osc.type = "square";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      kind === "err" ? 0.012 : 0.008,
      now + 0.01
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.055);
  } catch {
    // Audio may be blocked until a user gesture.
  }
}

function setTheme(mode: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
  localStorage.setItem("theme", mode);
  (window as unknown as { __theme?: { value: string } }).__theme = {
    value: mode,
  };
  const bg = getComputedStyle(document.body).backgroundColor;
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", bg);
  document.querySelector("#theme-btn")?.setAttribute("aria-label", mode);
}

function appendLine(
  body: HTMLElement,
  text: string,
  kind: "cmd" | "out" | "err" = "out"
) {
  const row = document.createElement("div");
  row.className = "home-term-line";
  if (kind === "out") row.classList.add("text-foreground/75");
  if (kind === "err") row.classList.add("text-accent");
  if (kind === "cmd") row.innerHTML = text;
  else row.textContent = text;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
  return row;
}

function flickerTerm() {
  if (reducedMotion()) return;
  const term = document.querySelector(".home-term");
  if (!term) return;
  term.classList.add("is-flicker");
  window.setTimeout(() => term.classList.remove("is-flicker"), 90);
}

function paperWrinkle() {
  if (reducedMotion()) return;
  document.body.classList.add("home-paper-wrinkle");
  window.setTimeout(() => document.body.classList.remove("home-paper-wrinkle"), 180);
}

function saveSession(cmd: string, href: string, guest: boolean) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ cmd, href, at: Date.now() })
  );
  sessionStorage.setItem(
    RESUME_KEY,
    JSON.stringify({ guest, at: Date.now() })
  );
}

function shouldResume(): { guest: boolean } | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { guest?: boolean; at?: number };
    if (!data.at || Date.now() - data.at > 30 * 60 * 1000) {
      sessionStorage.removeItem(RESUME_KEY);
      return null;
    }
    return { guest: !!data.guest };
  } catch {
    return null;
  }
}

function clearResume() {
  sessionStorage.removeItem(RESUME_KEY);
}

function findPost(posts: TermPost[], target: string): TermPost | undefined {
  const t = target.toLowerCase();
  if (t === "latest") return posts[0];
  return (
    posts.find(p => p.slug.toLowerCase() === t) ??
    posts.find(p => p.slug.toLowerCase().includes(t)) ??
    posts.find(p => p.title.toLowerCase().includes(t))
  );
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}

function didYouMean(input: string): string | null {
  const head = input.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!head) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const cmd of KNOWN_CMDS) {
    const token = cmd.split(/\s+/)[0]!;
    const d = levenshtein(head, token);
    if (d < bestDist && d <= 2) {
      bestDist = d;
      best = cmd;
    }
  }
  return best;
}

function columnStats(posts: TermPost[]) {
  const buckets: Record<string, number> = {
    "后端专栏": 0,
    "请求过境": 0,
    Agent: 0,
    其他: 0,
  };
  for (const post of posts) {
    const tags = post.tags.map(t => t.toLowerCase());
    if (tags.some(t => t.includes("请求过境"))) buckets["请求过境"]! += 1;
    else if (tags.some(t => t.includes("后端"))) buckets["后端专栏"]! += 1;
    else if (tags.some(t => t.includes("agent"))) buckets["Agent"]! += 1;
    else buckets["其他"]! += 1;
  }
  return buckets;
}

let clearStreak = 0;
let busy = false;

async function runCommand(
  raw: string,
  body: HTMLElement,
  ctx: TermCtx,
  opts?: { echo?: boolean; still?: () => boolean }
) {
  const echo = opts?.echo !== false;
  const still = opts?.still ?? (() => true);
  let input = raw.trim().replace(/\s+/g, " ");
  const prompt = promptFor(ctx);

  if (input === "!!") {
    const last = getCmdHistory()[0];
    if (!last) {
      if (echo) {
        appendLine(
          body,
          `<span class="text-accent">${prompt}</span> !!`,
          "cmd"
        );
      }
      appendLine(body, "history empty", "err");
      beep("err");
      return;
    }
    input = last;
  }

  if (echo) {
    appendLine(
      body,
      `<span class="text-accent">${prompt}</span> ${escapeHtml(input)}`,
      "cmd"
    );
  }
  if (!input) return;

  const lower = input.toLowerCase();

  if (lower !== "clear") clearStreak = 0;
  if (lower !== "!!") pushCmdHistory(input);

  if (lower === "help") {
    appendLine(body, HELP);
    return;
  }
  if (lower === "whoami") {
    appendLine(
      body,
      ctx.guest
        ? "guest — 只读访客。试试 ls、grep、open。"
        : greetingLine(ctx.author)
    );
    return;
  }
  if (lower === "ls" || lower === "ls posts" || lower === "ls posts/") {
    if (ctx.posts.length === 0) {
      appendLine(body, "(empty)");
      return;
    }
    const reads = getReads();
    for (const post of ctx.posts) {
      const mark = reads.has(post.slug) ? "✓" : " ";
      appendLine(body, `${mark} ${post.slug.padEnd(26)} ${post.title}`);
    }
    return;
  }
  if (lower.startsWith("grep ")) {
    const q = input.slice(5).trim().toLowerCase();
    if (!q) {
      appendLine(body, "usage: grep <词>", "err");
      beep("err");
      return;
    }
    const hits = ctx.posts.filter(
      p =>
        p.slug.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
    );
    if (hits.length === 0) {
      appendLine(body, `no matches for "${q}"`);
      return;
    }
    for (const post of hits) {
      appendLine(body, `${post.slug.padEnd(26)} ${post.title}`);
    }
    appendLine(body, `→ open <slug> 打开，例如 open ${hits[0]!.slug}`);
    return;
  }
  if (lower === "cat about.txt") {
    appendLine(body, "Agent 拆解、全栈笔记，和路上随手记下的东西。");
    return;
  }
  if (lower.startsWith("cat ")) {
    const target = input.slice(4).trim().replace(/\.md$/i, "");
    const hit = findPost(ctx.posts, target);
    if (!hit) {
      appendLine(body, `cat: ${target}: No such file`, "err");
      beep("err");
      return;
    }
    appendLine(body, `# ${hit.title}`);
    appendLine(body, hit.description || "(no description)");
    appendLine(body, `→ open ${hit.slug} 打开全文`);
    return;
  }
  if (lower === "fortune" || lower === "today") {
    if (lower === "today" && ctx.posts.length) {
      const day = Math.floor(Date.now() / 86400000);
      const pick = ctx.posts[day % ctx.posts.length]!;
      appendLine(body, `今日一篇：${pick.slug}`);
      appendLine(body, pick.title);
      appendLine(body, `→ open ${pick.slug}`);
      return;
    }
    const lines = fortuneLines(ctx.author);
    appendLine(body, lines[Math.floor(Math.random() * lines.length)]!);
    return;
  }
  if (lower === "history") {
    const hist = getCmdHistory();
    if (!hist.length) {
      appendLine(body, "(empty)");
      return;
    }
    hist
      .slice()
      .reverse()
      .forEach((cmd, i) => appendLine(body, ` ${(i + 1).toString().padStart(3)}  ${cmd}`));
    return;
  }
  if (lower === "man" || lower === "man duang") {
    appendLine(body, "DUANG(1)                    Blog Commands                   DUANG(1)");
    appendLine(body, "");
    appendLine(body, "NAME");
    appendLine(body, `       ${ctx.author.toLowerCase()} — 后端 / 全栈公开笔记本`);
    appendLine(body, "");
    appendLine(body, "SYNOPSIS");
    appendLine(body, "       open <slug> | grep <词> | cat <slug> | today");
    appendLine(body, "");
    appendLine(body, "DESCRIPTION");
    appendLine(body, "       拆 Agent、记服务端机制，偶尔写路上的想法。");
    appendLine(body, "       终端是入口；文章才是正文。");
    appendLine(body, "");
    appendLine(body, "SEE ALSO");
    appendLine(body, "       help, ls, fortune, ssh guest@duang");
    return;
  }
  if (lower === "ps") {
    const reads = getReads();
    appendLine(body, "  PID STAT  CMD");
    appendLine(body, "  101 run   tty — home hero");
    let pid = 200;
    for (const post of ctx.posts.slice(0, 6)) {
      const stat = post.draft ? "draft" : reads.has(post.slug) ? "read" : "pub";
      appendLine(
        body,
        `  ${pid} ${stat.padEnd(5)} ${post.draft ? "writing" : "published"}: ${post.slug}`
      );
      pid += 1;
    }
    appendLine(body, `  ${pid} sleep ideas.md — ${ctx.ideas.length} notes`);
    return;
  }
  if (lower === "df" || lower === "df -h") {
    const buckets = columnStats(ctx.posts);
    const total = Math.max(1, ctx.posts.length);
    appendLine(
      body,
      "Filesystem      Size  Used  Avail  Use%  Mounted on"
    );
    const rows: [string, string, number][] = [
      ["backend", "/columns/backend", buckets["后端专栏"]!],
      ["request", "/columns/request-crossing", buckets["请求过境"]!],
      ["agent", "/columns/agent", buckets["Agent"]!],
      ["scratch", "/notes/ideas", buckets["其他"]! + ctx.ideas.length],
    ];
    for (const [fs, mount, used] of rows) {
      const size = 10;
      const use = Math.min(size, Math.max(1, Math.round((used / total) * size)));
      const avail = size - use;
      const pct = Math.round((use / size) * 100);
      appendLine(
        body,
        `${fs.padEnd(14)} ${String(size).padStart(3)}G  ${String(use).padStart(3)}.0G  ${String(avail).padStart(3)}.0G  ${String(pct).padStart(3)}%  ${mount}`
      );
    }
    return;
  }
  if (lower === "tail -f ideas" || lower === "tail ideas" || lower === "tail -f ideas.md") {
    appendLine(body, "==> ideas.md <==");
    const lines =
      ctx.ideas.length > 0
        ? ctx.ideas
        : [
            "[念头] 第二次请求偶发断 — IdleTimeout 和代理 idle",
            "[已发] Context 传到 DB — QueryContext 是否真取消",
          ];
    for (const line of lines) {
      if (!still()) return;
      appendLine(body, line);
      if (!reducedMotion()) await sleep(280 + Math.random() * 180);
    }
    appendLine(body, "^C (模拟结束)");
    return;
  }
  if (
    lower === "ssh guest@duang" ||
    lower === "ssh guest@duangblog" ||
    lower === "ssh guest"
  ) {
    if (ctx.guest) {
      appendLine(body, "already logged in as guest");
      return;
    }
    appendLine(body, "connecting to duang…");
    if (!reducedMotion()) await sleep(420);
    if (!still()) return;
    appendLine(body, "guest@duang's password: ********");
    if (!reducedMotion()) await sleep(520);
    if (!still()) return;
    appendLine(body, "Welcome to duangblog.");
    appendLine(body, "访客模式：命令更短，输入 exit 离开。");
    ctx.guest = true;
    syncChromePrompt(ctx);
    beep("enter");
    return;
  }
  if (lower === "exit") {
    if (!ctx.guest) {
      appendLine(body, "logout: not a guest session");
      return;
    }
    ctx.guest = false;
    syncChromePrompt(ctx);
    appendLine(body, "Connection to duang closed.");
    beep("enter");
    return;
  }
  if (lower === "theme light" || lower === "theme dark") {
    const mode = lower.endsWith("dark") ? "dark" : "light";
    setTheme(mode);
    appendLine(body, `theme set to ${mode}`);
    beep("enter");
    return;
  }
  if (lower === "sound on" || lower === "sound off") {
    const on = lower.endsWith("on");
    setSoundEnabled(on);
    appendLine(body, on ? "key click enabled" : "key click muted");
    if (on) beep("enter");
    return;
  }
  if (lower === "clear") {
    clearStreak += 1;
    const brand = body.querySelector("#home-brand");
    body.replaceChildren();
    if (brand) body.appendChild(brand);
    if (clearStreak >= 3) {
      clearStreak = 0;
      for (const line of CLEAR_POEM) appendLine(body, line);
      beep("enter");
    }
    return;
  }
  if (lower === "open posts" || lower === "cd posts" || lower === "cd posts/") {
    saveSession(input, ctx.postsHref, ctx.guest);
    appendLine(body, "opening posts…");
    beep("enter");
    window.location.assign(ctx.postsHref);
    return;
  }
  if (lower === "open about" || lower === "cd about") {
    saveSession(input, ctx.aboutHref, ctx.guest);
    appendLine(body, "opening about…");
    beep("enter");
    window.location.assign(ctx.aboutHref);
    return;
  }
  if (lower.startsWith("open ")) {
    const target = input.slice(5).trim();
    const hit = findPost(ctx.posts, target);
    if (!hit) {
      appendLine(
        body,
        `not found: ${target}. 用 ls 看 slug，例如 open context-to-db`,
        "err"
      );
      beep("err");
      return;
    }
    saveSession(`open ${hit.slug}`, hit.href, ctx.guest);
    appendLine(body, `opening ${hit.slug}…`);
    beep("enter");
    window.location.assign(hit.href);
    return;
  }

  const suggest = didYouMean(input);
  appendLine(
    body,
    suggest
      ? `command not found: ${input}. did you mean: ${suggest}?`
      : `command not found: ${input}. 输入 help 看可用命令。`,
    "err"
  );
  beep("err");
}

function mountPrompt(body: HTMLElement, ctx: TermCtx, still?: () => boolean) {
  body.querySelectorAll(".home-term-prompt-row").forEach(el => el.remove());

  const prompt = promptFor(ctx);
  const row = document.createElement("div");
  row.className = "home-term-line home-term-prompt-row";

  const p = document.createElement("span");
  p.className = "text-accent";
  p.textContent = prompt;

  const input = document.createElement("input");
  input.className = "home-term-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "终端命令");

  const cursor = document.createElement("span");
  cursor.className = "home-term-cursor";
  cursor.setAttribute("aria-hidden", "true");

  row.appendChild(p);
  row.appendChild(input);
  row.appendChild(cursor);
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  const syncWidth = () => {
    if (CSS.supports?.("field-sizing", "content")) return;
    input.style.width = `${Math.max(1, input.value.length + 1)}ch`;
  };
  syncWidth();
  input.addEventListener("input", () => {
    syncWidth();
    beep("key");
    if (Math.random() < 0.08) flickerTerm();
    if (Math.random() < 0.04) paperWrinkle();
  });

  const navHistory = getCmdHistory();
  let histIdx = -1;
  const focusInput = () => input.focus();
  body.addEventListener("click", focusInput);
  focusInput();

  const completions = [
    "help",
    "whoami",
    "ls",
    "ls posts",
    "grep ",
    "cat about.txt",
    "fortune",
    "today",
    "history",
    "!!",
    "man duang",
    "ssh guest@duang",
    "ps",
    "df -h",
    "tail -f ideas",
    "open latest",
    "open posts",
    "open about",
    ...ctx.posts.map(p => `open ${p.slug}`),
    ...ctx.posts.map(p => `cat ${p.slug}`),
    "theme light",
    "theme dark",
    "sound on",
    "sound off",
    "clear",
    "exit",
  ];

  input.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (busy) return;
      const value = input.value;
      histIdx = -1;
      row.remove();
      busy = true;
      try {
        await runCommand(value, body, ctx, { still });
      } finally {
        busy = false;
      }
      if (still && !still()) return;
      mountPrompt(body, ctx, still);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const q = input.value.trim().toLowerCase();
      const hit = completions.find(c => c.startsWith(q));
      if (hit) {
        input.value = hit;
        syncWidth();
        beep("key");
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!navHistory.length) return;
      histIdx = Math.min(navHistory.length - 1, histIdx + 1);
      input.value = navHistory[histIdx] ?? "";
      syncWidth();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      histIdx = Math.max(-1, histIdx - 1);
      input.value = histIdx < 0 ? "" : (navHistory[histIdx] ?? "");
      syncWidth();
    }
  });
}

function bindDropTarget(body: HTMLElement, ctx: TermCtx, still?: () => boolean) {
  if (body.dataset.dropBound === "1") return;
  body.dataset.dropBound = "1";

  body.addEventListener("dragover", e => {
    e.preventDefault();
    body.classList.add("is-drop-target");
  });
  body.addEventListener("dragleave", () => {
    body.classList.remove("is-drop-target");
  });
  body.addEventListener("drop", async e => {
    e.preventDefault();
    body.classList.remove("is-drop-target");
    if (busy) return;
    const slug =
      e.dataTransfer?.getData("text/term-slug") ||
      e.dataTransfer?.getData("text/plain")?.trim();
    if (!slug) return;
    const hit = findPost(ctx.posts, slug.replace(/^open\s+/i, ""));
    if (!hit) {
      appendLine(body, `drop ignored: ${slug}`, "err");
      beep("err");
      return;
    }
    busy = true;
    try {
      body.querySelectorAll(".home-term-prompt-row").forEach(el => el.remove());
      await runCommand(`open ${hit.slug}`, body, ctx, { still });
    } finally {
      busy = false;
    }
  });
}

async function runBoot(
  logEl: HTMLElement,
  postCount: number,
  still: () => boolean
) {
  const lines = [
    "duangboot 0.4",
    "checking fonts .............. ok",
    `loading posts ............... ${postCount}`,
    "mounting tty ................ ok",
    "ready.",
  ];
  if (reducedMotion()) {
    logEl.textContent = lines.join("\n");
    return;
  }
  for (const line of lines) {
    if (!still()) return;
    logEl.textContent += (logEl.textContent ? "\n" : "") + line;
    await sleep(220 + Math.random() * 120);
  }
  if (!still()) return;
  await sleep(280);
}

async function startTerminal(
  body: HTMLElement,
  ctx: TermCtx,
  still: () => boolean,
  returnNote?: string | null
) {
  const brand = body.querySelector("#home-brand");
  body.replaceChildren();
  if (brand) body.appendChild(brand);

  const prompt = promptFor(ctx);
  const bootCmds = [
    { type: "cmd" as const, text: "whoami" },
    { type: "out" as const, text: greetingLine(ctx.author) },
    { type: "cmd" as const, text: "ls posts/" },
    {
      type: "out" as const,
      text:
        ctx.posts.length === 0
          ? "(empty)"
          : ctx.posts
              .slice(0, 4)
              .map(p => p.slug)
              .join("   ") + (ctx.posts.length > 4 ? "   …" : ""),
    },
    { type: "cmd" as const, text: "help" },
    {
      type: "out" as const,
      text: "试一下 grep / cat / today，或把文章拖进终端",
    },
  ];

  if (reducedMotion()) {
    for (const line of bootCmds) {
      if (!still()) return;
      if (line.type === "cmd") {
        appendLine(
          body,
          `<span class="text-accent">${prompt}</span> ${escapeHtml(line.text)}`,
          "cmd"
        );
      } else appendLine(body, line.text);
    }
    if (!still()) return;
    if (returnNote) appendLine(body, returnNote);
    mountPrompt(body, ctx, still);
    return;
  }

  const cursor = document.createElement("span");
  cursor.className = "home-term-cursor";
  cursor.setAttribute("aria-hidden", "true");

  for (const line of bootCmds) {
    if (!still()) return;
    if (line.type === "cmd") {
      const row = document.createElement("div");
      row.className = "home-term-line";
      const p = document.createElement("span");
      p.className = "text-accent";
      p.textContent = prompt + " ";
      const cmd = document.createElement("span");
      row.appendChild(p);
      row.appendChild(cmd);
      row.appendChild(cursor);
      body.appendChild(row);
      for (const ch of line.text) {
        if (!still()) return;
        cmd.textContent += ch;
        beep("key");
        await sleep(28 + Math.random() * 36);
      }
      await sleep(240);
    } else {
      const row = appendLine(body, line.text);
      row.style.opacity = "0";
      row.style.transition = "opacity 0.2s ease";
      body.appendChild(cursor);
      await sleep(16);
      if (!still()) return;
      row.style.opacity = "1";
      await sleep(160);
    }
  }
  if (!still()) return;
  cursor.remove();
  if (returnNote) appendLine(body, returnNote);
  mountPrompt(body, ctx, still);
}

async function resumeTerminal(
  body: HTMLElement,
  ctx: TermCtx,
  still: () => boolean,
  returnNote?: string | null
) {
  const brand = body.querySelector("#home-brand");
  body.replaceChildren();
  if (brand) body.appendChild(brand);
  appendLine(body, "session resumed — boot skipped");
  if (returnNote) appendLine(body, returnNote);
  appendLine(
    body,
    ctx.guest
      ? "仍是 guest。输入 exit 回到 duang@blog。"
      : "接着敲。history / !! / ls 都在。"
  );
  if (!still()) return;
  mountPrompt(body, ctx, still);
}

function watchHeader(hero: HTMLElement) {
  const header = document.querySelector("header");
  if (!header) return;
  (
    hero as HTMLElement & { __headerObserver?: IntersectionObserver }
  ).__headerObserver?.disconnect?.();
  const observer = new IntersectionObserver(
    ([entry]) => {
      header.classList.toggle("home-header-solid", !entry!.isIntersecting);
    },
    { rootMargin: "-64px 0px 0px 0px" }
  );
  observer.observe(hero);
  (
    hero as HTMLElement & { __headerObserver?: IntersectionObserver }
  ).__headerObserver = observer;
}

function watchScrollFade(hero: HTMLElement, stage: HTMLElement) {
  (
    stage as HTMLElement & { __homeScrollCleanup?: () => void }
  ).__homeScrollCleanup?.();
  if (reducedMotion()) return;

  const onScroll = () => {
    const rect = hero.getBoundingClientRect();
    const travel = Math.max(1, rect.height * 0.55);
    const progress = Math.min(1, Math.max(0, -rect.top / travel));
    stage.style.opacity = String(1 - progress);
    stage.style.transform = `translateY(${progress * -56}px)`;
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  (
    stage as HTMLElement & { __homeScrollCleanup?: () => void }
  ).__homeScrollCleanup = () => window.removeEventListener("scroll", onScroll);
}

export async function initHomeHero() {
  const hero = document.getElementById("hero");
  const body = document.getElementById("home-term-body");
  const boot = document.getElementById("home-boot");
  const bootLog = document.getElementById("home-boot-log");
  const stage = document.getElementById("home-hero-stage");
  const scrollCue = document.querySelector(".home-hero-scroll");
  if (!hero || !body || !boot || !bootLog || !stage) return;

  const w = window as unknown as { __homeHeroGen?: number };
  const gen = (w.__homeHeroGen = (w.__homeHeroGen ?? 0) + 1);
  const still = () => gen === w.__homeHeroGen;

  bootLog.textContent = "";
  boot.classList.remove("is-done");
  stage.classList.remove("is-ready");
  stage.style.opacity = "";
  stage.style.transform = "";
  scrollCue?.classList.remove("is-ready");
  const brand = body.querySelector("#home-brand");
  body.replaceChildren();
  if (brand) body.appendChild(brand);
  delete body.dataset.dropBound;

  setSoundEnabled(soundEnabled());
  const soundBtn = document.getElementById("home-term-sound");
  if (soundBtn && !soundBtn.dataset.bound) {
    soundBtn.dataset.bound = "1";
    soundBtn.addEventListener("click", () => {
      const next = !soundEnabled();
      setSoundEnabled(next);
      if (next) beep("enter");
    });
  }

  let posts: TermPost[] = [];
  let ideas: string[] = [];
  try {
    posts = JSON.parse(hero.dataset.posts ?? "[]");
  } catch {
    posts = [];
  }
  try {
    ideas = JSON.parse(hero.dataset.ideas ?? "[]");
  } catch {
    ideas = [];
  }

  const resume = shouldResume();
  const ctx: TermCtx = {
    postsHref: hero.dataset.postsHref ?? "/posts/",
    aboutHref: hero.dataset.aboutHref ?? "/about/",
    author: hero.dataset.author ?? "Duang",
    posts,
    ideas,
    guest: resume?.guest ?? false,
  };

  bindDropTarget(body, ctx, still);
  const returnNote = takeReturnNote(posts);

  if (resume) {
    clearResume();
    syncChromePrompt(ctx);
    boot.classList.add("is-done");
    stage.classList.add("is-ready");
    scrollCue?.classList.add("is-ready");
    await resumeTerminal(body, ctx, still, returnNote);
    if (!still()) return;
    watchHeader(hero);
    watchScrollFade(hero, stage);
    return;
  }

  await runBoot(bootLog, posts.length, still);
  if (!still()) return;

  boot.classList.add("is-done");
  stage.classList.add("is-ready");
  scrollCue?.classList.add("is-ready");
  await sleep(200);
  if (!still()) return;

  await startTerminal(body, ctx, still, returnNote);
  if (!still()) return;

  watchHeader(hero);
  watchScrollFade(hero, stage);
}

export function bindHomeHeroPageLoad() {
  const w = window as unknown as {
    __homeHeroInit?: () => void;
    __homeHeroBound?: boolean;
    __homeTermDragBound?: boolean;
  };
  w.__homeHeroInit = initHomeHero;
  if (!w.__homeHeroBound) {
    w.__homeHeroBound = true;
    document.addEventListener("astro:page-load", () => w.__homeHeroInit?.());
  }
  if (!w.__homeTermDragBound) {
    w.__homeTermDragBound = true;
    document.addEventListener("dragstart", e => {
      const target = (e.target as HTMLElement | null)?.closest?.(
        "[data-term-slug]"
      ) as HTMLElement | null;
      const slug = target?.dataset.termSlug;
      if (!slug || !e.dataTransfer) return;
      e.dataTransfer.setData("text/term-slug", slug);
      e.dataTransfer.setData("text/plain", slug);
      e.dataTransfer.effectAllowed = "copy";
      document
        .getElementById("home-term-body")
        ?.classList.add("is-drop-hint");
    });
    document.addEventListener("dragend", () => {
      document
        .getElementById("home-term-body")
        ?.classList.remove("is-drop-hint");
    });
  }
}
