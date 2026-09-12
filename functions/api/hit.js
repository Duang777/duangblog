import { bump, normalizePath } from "../lib/hits.js";

export async function onRequestPost({ request, env }) {
  if (!env.HITS) {
    return json({ ok: false, error: "hits kv missing" }, 500);
  }
  let payload = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return json({ ok: false }, 400);
  }
  const path = normalizePath(payload.p);
  if (!path) return json({ ok: false }, 400);
  await bump(env, path);
  return json({ ok: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
