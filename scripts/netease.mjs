#!/usr/bin/env node
// Keeps src/data/netease.ts in sync with NetEase Cloud Music.
//
//   node scripts/netease.mjs add <song link or id> [note]
//   node scripts/netease.mjs --remove <song link or id>
//   node scripts/netease.mjs playlist <playlist link or id>
//   node scripts/netease.mjs lyrics
//
// Songs are keyed by id, so every command converges: rerunning it with the
// same input leaves the file unchanged. addedAt is kept from the first time a
// song appears; a note is kept unless `add` passes a new one. `add` always puts
// the song first, so adding an existing song again moves it to the top. `playlist`
// replaces the list with the playlist's songs in playlist order.
//
// Every command also converges src/data/lyrics/: one raw LRC file per song
// that plays here and has timed lyrics, nothing else. `lyrics` fetches all of
// them again; `add` and `playlist` fetch only the songs they touched.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = resolve(ROOT, "src/data/netease.ts");
const LYRICS_DIR = resolve(ROOT, "src/data/lyrics");
const ARRAY_START = "export const neteaseSongs: readonly NeteaseSong[] = [";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// fee 0 is free, fee 8 is free at standard quality; both resolve to a media URL.
const PLAYABLE_FEES = new Set([0, 8]);
const DETAIL_BATCH = 200;

function print(text) {
  process.stdout.write(`${text}\n`);
}

function fail(message) {
  process.stderr.write(`netease: ${message}\n`);
  process.exit(1);
}

/** Reads a `kind` id ("song" or "playlist") from a bare id or a music.163.com link. */
function parseId(input, kind) {
  if (/^\d+$/.test(input)) return Number(input);
  let url;
  try {
    url = new URL(input);
  } catch {
    fail(`not a ${kind} id or link: ${input}`);
  }
  const host = url.hostname;
  if (host !== "music.163.com" && !host.endsWith(".music.163.com")) {
    fail(`not a music.163.com link: ${input}`);
  }
  // The web client routes through the hash: https://music.163.com/#/song?id=1
  const route = url.hash.startsWith("#/")
    ? new URL(url.hash.slice(1), url.origin)
    : url;
  const segment = new RegExp(`/${kind}(?:/(\\d+))?/?$`);
  const match = route.pathname.match(segment);
  const id = match ? (match[1] ?? route.searchParams.get("id")) : null;
  if (!id || !/^\d+$/.test(id)) fail(`no ${kind} id in link: ${input}`);
  return Number(id);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: "https://music.163.com/" },
  });
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return response.json();
}

// The API rotates between p1..p4 hosts for the same image; pin one so reruns match.
function pinCover(picUrl) {
  return picUrl.replace(
    /^https?:\/\/p\d\.music\.126\.net\//,
    "https://p1.music.126.net/"
  );
}

function toSong(raw) {
  return {
    id: raw.id,
    title: raw.name,
    artist: raw.artists.map(artist => artist.name).join(" / "),
    album: raw.album.name,
    cover: pinCover(raw.album.picUrl),
    durationMs: raw.duration,
    playable: PLAYABLE_FEES.has(raw.fee),
    fee: raw.fee,
  };
}

// Every song goes through this one endpoint: the playlist endpoint's own track
// objects can point at a different cover image, which would make `add` and
// `playlist` rewrite each other's output.
async function fetchSongs(ids) {
  const songs = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const batch = ids.slice(i, i + DETAIL_BATCH);
    const list = encodeURIComponent(JSON.stringify(batch));
    const body = await getJson(
      `https://music.163.com/api/song/detail/?id=${batch[0]}&ids=${list}`
    );
    songs.push(...(body.songs ?? []).map(toSong));
  }
  const byId = new Map(songs.map(song => [song.id, song]));
  const missing = ids.filter(id => !byId.has(id));
  if (missing.length > 0) fail(`songs not found: ${missing.join(", ")}`);
  return ids.map(id => byId.get(id));
}

async function fetchPlaylist(id) {
  const body = await getJson(
    `https://music.163.com/api/v6/playlist/detail?id=${id}`
  );
  const playlist = body.playlist;
  if (!playlist) fail(`playlist ${id} not found or not public`);
  const ids = playlist.trackIds.map(track => track.id);
  return { name: playlist.name, songs: await fetchSongs(ids) };
}

async function readEntries() {
  const href = `${pathToFileURL(DATA_FILE).href}?t=${Date.now()}`;
  const { neteaseSongs } = await import(href);
  return [...neteaseSongs];
}

function today() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Fresh metadata, plus the note and addedAt the list already had for this id. */
function merge({ fee: _fee, ...song }, previous, note) {
  return {
    ...song,
    // An empty note argument clears the note.
    note: note === undefined ? previous?.note : note || undefined,
    addedAt: previous?.addedAt ?? today(),
  };
}

const FIELD_ORDER = [
  "id",
  "title",
  "artist",
  "album",
  "cover",
  "durationMs",
  "playable",
  "note",
  "addedAt",
];

function serialize(entries) {
  const items = entries.map(entry => {
    const fields = FIELD_ORDER.filter(key => entry[key] !== undefined).map(
      key => `${key}: ${JSON.stringify(entry[key])},`
    );
    return `{\n${fields.join("\n")}\n},`;
  });
  return items.join("\n");
}

async function writeEntries(entries) {
  const source = readFileSync(DATA_FILE, "utf8");
  const start = source.indexOf(ARRAY_START);
  const end = source.lastIndexOf("];");
  if (start === -1 || end < start) {
    fail(`could not find the song array in ${DATA_FILE}`);
  }
  const next =
    source.slice(0, start + ARRAY_START.length) +
    serialize(entries) +
    source.slice(end);
  const options = await prettier.resolveConfig(DATA_FILE);
  const formatted = await prettier.format(next, {
    ...options,
    filepath: DATA_FILE,
  });
  if (formatted === source) return false;
  const temp = `${DATA_FILE}.tmp`;
  writeFileSync(temp, formatted);
  renameSync(temp, DATA_FILE);
  execFileSync(
    resolve(ROOT, "node_modules/.bin/prettier"),
    ["--check", DATA_FILE],
    { cwd: ROOT, stdio: "inherit" }
  );
  return true;
}

async function fetchLyric(id) {
  const body = await getJson(
    `https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`
  );
  const lrc = body.lrc?.lyric ?? "";
  // Untimed text and instrumentals come back without a single [mm:ss] stamp.
  return /\[\d+:\d+/.test(lrc) ? lrc : null;
}

function lyricFile(id) {
  return resolve(LYRICS_DIR, `${id}.lrc`);
}

/** Writes `text` only when it differs; returns whether the file changed. */
function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  const temp = `${file}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
  return true;
}

/**
 * Fetches lyrics for the playable songs among `ids` and removes files for
 * songs that no longer play here. Returns how many files changed.
 */
async function syncLyrics(entries, ids) {
  mkdirSync(LYRICS_DIR, { recursive: true });
  const playable = new Set(entries.filter(e => e.playable).map(e => e.id));
  let changed = 0;
  for (const id of ids.filter(songId => playable.has(songId))) {
    const lrc = await fetchLyric(id);
    if (lrc === null) {
      if (existsSync(lyricFile(id))) {
        rmSync(lyricFile(id));
        changed++;
      }
    } else if (writeIfChanged(lyricFile(id), lrc)) {
      changed++;
    }
  }
  for (const name of readdirSync(LYRICS_DIR)) {
    const id = Number(name.replace(/\.lrc$/, ""));
    if (name.endsWith(".lrc") && !playable.has(id)) {
      rmSync(resolve(LYRICS_DIR, name));
      changed++;
    }
  }
  return changed;
}

function describe(song) {
  return `${song.id} ${song.title} (${song.playable ? "plays here" : "VIP, link-out only"})`;
}

async function add(input, note) {
  const id = parseId(input, "song");
  const [song] = await fetchSongs([id]);
  const entries = await readEntries();
  const index = entries.findIndex(entry => entry.id === id);
  const entry = merge(song, entries[index], note);
  if (index !== -1) entries.splice(index, 1);
  entries.unshift(entry);
  const changed = await writeEntries(entries);
  const verb = index === -1 ? "added" : changed ? "moved to top" : "unchanged";
  print(`${verb} ${describe(song)} in src/data/netease.ts (fee ${song.fee})`);
  const lyrics = await syncLyrics(entries, [id]);
  print(`lyrics: ${lyrics} file(s) changed`);
}

async function remove(input) {
  const id = parseId(input, "song");
  const entries = await readEntries();
  const kept = entries.filter(entry => entry.id !== id);
  if (kept.length === entries.length) {
    print(`song ${id} is not in the list; nothing to remove`);
    return;
  }
  await writeEntries(kept);
  await syncLyrics(kept, []);
  print(`removed song ${id}; ${kept.length} left`);
}

async function syncPlaylist(input) {
  const id = parseId(input, "playlist");
  const { name, songs } = await fetchPlaylist(id);
  const previous = new Map((await readEntries()).map(e => [e.id, e]));
  const entries = songs.map(song => merge(song, previous.get(song.id)));
  const changed = await writeEntries(entries);
  const playable = entries.filter(entry => entry.playable).length;
  const dropped = [...previous.keys()].filter(
    songId => !entries.some(entry => entry.id === songId)
  );
  print(
    `${changed ? "synced" : "unchanged"}: playlist ${id} ${name}, ${entries.length} songs, ${playable} play here, ${entries.length - playable} VIP`
  );
  if (dropped.length > 0) print(`dropped, not in the playlist: ${dropped.join(", ")}`);
  const lyrics = await syncLyrics(entries, entries.map(entry => entry.id));
  print(`lyrics: ${lyrics} file(s) changed`);
}

async function backfillLyrics() {
  const entries = await readEntries();
  const changed = await syncLyrics(entries, entries.map(entry => entry.id));
  const files = readdirSync(LYRICS_DIR).filter(name => name.endsWith(".lrc"));
  print(
    `${changed ? `lyrics: ${changed} file(s) changed` : "lyrics unchanged"}, ${files.length} of ${entries.filter(e => e.playable).length} playable songs have lyrics`
  );
}

const USAGE = [
  "usage:",
  "  node scripts/netease.mjs add <song link or id> [note]",
  "  node scripts/netease.mjs --remove <song link or id>",
  "  node scripts/netease.mjs playlist <playlist link or id>",
  "  node scripts/netease.mjs lyrics",
].join("\n");

const [command, arg, note] = process.argv.slice(2);
if (command === "lyrics") await backfillLyrics();
else if (!arg) fail(USAGE);
else if (command === "add") await add(arg, note);
else if (command === "--remove" || command === "remove") await remove(arg);
else if (command === "playlist") await syncPlaylist(arg);
else fail(USAGE);
