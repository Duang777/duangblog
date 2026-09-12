const MAX_PATH = 180;

export function siteName(env) {
  return String(env.SITE || "duangblog");
}

export function shanghaiDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function normalizePath(raw) {
  if (typeof raw !== "string") return null;
  let path = raw.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) {
    // keep trailing slash; blogs use it
  }
  if (path.length > MAX_PATH) return null;
  if (path.startsWith("/api/")) return null;
  if (path === "/traffic" || path === "/traffic/") return null;
  return path;
}

function num(value) {
  const n = parseInt(value || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

export async function bump(env, path) {
  const site = siteName(env);
  const day = shanghaiDate();
  const dayKey = `pv:${site}:${day}:${path}`;
  const totalKey = `total:${site}:${path}`;
  const [dayVal, totalVal] = await Promise.all([
    env.HITS.get(dayKey),
    env.HITS.get(totalKey),
  ]);
  await Promise.all([
    env.HITS.put(dayKey, String(num(dayVal) + 1), {
      expirationTtl: 60 * 60 * 24 * 400,
    }),
    env.HITS.put(totalKey, String(num(totalVal) + 1)),
  ]);
}

async function listCounts(env, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await env.HITS.list({ prefix, cursor, limit: 1000 });
    for (const key of page.keys) {
      out.push(key.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  if (!out.length) return [];
  const values = await Promise.all(out.map(name => env.HITS.get(name)));
  return out.map((name, i) => ({
    name,
    n: num(values[i]),
  }));
}

export async function summary(env) {
  const site = siteName(env);
  const today = shanghaiDate();
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date();
    d.setTime(d.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(shanghaiDate(d));
  }

  const [totals, ...daily] = await Promise.all([
    listCounts(env, `total:${site}:`),
    ...days.map(day => listCounts(env, `pv:${site}:${day}:`)),
  ]);

  const todayMap = new Map(
    daily[0].map(item => [item.name.slice(`pv:${site}:${today}:`.length), item.n])
  );
  const paths = totals
    .map(item => {
      const path = item.name.slice(`total:${site}:`.length);
      return {
        path,
        total: item.n,
        today: todayMap.get(path) || 0,
      };
    })
    .sort((a, b) => b.today - a.today || b.total - a.total)
    .slice(0, 40);

  return {
    site,
    today,
    todayTotal: daily[0].reduce((sum, item) => sum + item.n, 0),
    rangeTotal: daily.reduce(
      (sum, items) => sum + items.reduce((s, item) => s + item.n, 0),
      0
    ),
    days: days.map((date, i) => ({
      date,
      total: daily[i].reduce((sum, item) => sum + item.n, 0),
    })),
    paths,
  };
}
