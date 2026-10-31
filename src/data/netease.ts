/**
 * Songs from NetEase Cloud Music, listed under 曲目 on the landing.
 * Managed by `node scripts/netease.mjs`; the array below is rewritten by it.
 */
export type NeteaseSong = {
  /** NetEase Cloud Music song id. */
  readonly id: number;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  /** NetEase album picUrl, without size params. */
  readonly cover: string;
  readonly durationMs: number;
  /**
   * Free at sync time (fee 0 or 8), so it can play in the site player. A
   * runtime refusal from NetEase still wins.
   */
  readonly playable: boolean;
  readonly note?: string;
  /** ISO date, e.g. 2026-10-31. */
  readonly addedAt?: string;
};

export const neteaseSongs: readonly NeteaseSong[] = [
  {
    id: 2673161004,
    title: "Off The Hook",
    artist: "Jeff Jarvis",
    album: "Off The Hook",
    cover:
      "https://p1.music.126.net/JEEfaL_65DtcGy6QB-OtJA==/109951173701860911.jpg",
    durationMs: 232569,
    playable: true,
    addedAt: "2026-10-31",
  },
  {
    id: 1952885918,
    title: "I Like You (A Happier Song)",
    artist: "Post Malone / Doja Cat",
    album: "Twelve Carat Toothache",
    cover:
      "https://p1.music.126.net/8xQJnFHFAEJaKKwwuuBgCw==/109951169873094934.jpg",
    durationMs: 192840,
    playable: false,
    addedAt: "2026-10-31",
  },
  {
    id: 2624657565,
    title: "Anyone",
    artist: "Crystal Bats / TRONICBOX",
    album: "Anyone(80's Version)",
    cover:
      "https://p1.music.126.net/DvOuQucxoUibM2YagSPBqw==/109951169687468003.jpg",
    durationMs: 217999,
    playable: true,
    addedAt: "2026-10-31",
  },
  {
    id: 472973563,
    title: "So Sick",
    artist: "Ne-Yo",
    album: "So Sick",
    cover:
      "https://p1.music.126.net/5Flu_4Jrnm0uTBCANmCeCQ==/17746117672730424.jpg",
    durationMs: 211546,
    playable: false,
    addedAt: "2026-10-31",
  },
];
