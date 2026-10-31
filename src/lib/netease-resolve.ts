/**
 * Turns a NetEase Cloud Music song id into a media URL the browser can read
 * with CORS. The outer URL answers with a 302 that carries no CORS header, so
 * an `<audio crossOrigin>` pointed at it fails; the media host it redirects to
 * does send `Access-Control-Allow-Origin: *`. Only free songs redirect to
 * media; VIP songs redirect to `music.163.com/404`.
 *
 * Runs in Cloudflare Pages Functions and in the Astro dev server, so it uses
 * only `fetch`, `URL`, `Response` and `Headers`.
 */

export type NeteaseResolution =
  { playable: true; url: string } | { playable: false };

export const NETEASE_API_PATH = "/api/netease/";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// The media URL expires about 25 minutes after it is issued.
const CACHE_SECONDS = 600;

export function parseSongId(raw: string): number | null {
  return /^\d{1,15}$/.test(raw) ? Number(raw) : null;
}

export async function resolveNetease(id: number): Promise<NeteaseResolution> {
  const outer = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  const response = await fetch(outer, {
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT },
  });
  const location = response.headers.get("location");
  if (!location) return { playable: false };
  const media = new URL(location, outer);
  if (!media.hostname.endsWith(".music.126.net")) return { playable: false };
  media.protocol = "https:";
  return { playable: true, url: media.href };
}

function json(status: number, body: unknown, cacheControl: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

/** The whole `/api/netease/<id>` route, shared by production and dev. */
export async function handleNeteaseRequest(rawId: string): Promise<Response> {
  const id = parseSongId(rawId);
  if (id === null) {
    return json(400, { error: "song id must be digits" }, "no-store");
  }
  try {
    const resolution = await resolveNetease(id);
    return json(200, resolution, `public, max-age=${CACHE_SECONDS}`);
  } catch {
    return json(502, { error: "netease did not answer" }, "no-store");
  }
}
