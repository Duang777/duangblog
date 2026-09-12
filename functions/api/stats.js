import { summary } from "../lib/hits.js";

export async function onRequestGet({ env }) {
  if (!env.HITS) {
    return new Response(JSON.stringify({ ok: false, error: "hits kv missing" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  const data = await summary(env);
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
