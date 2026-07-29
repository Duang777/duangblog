import type { CollectionEntry } from "astro:content";
import { getPostSlugPath } from "./getPostPaths";

export type PostLang = "zh-CN" | "en";

export function getPostLang(
  post: CollectionEntry<"posts"> | { data: { lang?: PostLang } }
): PostLang {
  return post.data.lang ?? "zh-CN";
}

/** Normalize Astro locale to post lang. */
export function localeToPostLang(locale: string | undefined): PostLang {
  return locale === "en" ? "en" : "zh-CN";
}

/**
 * Public route slug shared by language twins.
 * File `welcome-en.md` (id `welcome-en`) and `welcome.md` both map to `welcome`.
 */
export function getRouteSlugPath(
  id: string,
  filePath: string | undefined
): string {
  return getPostSlugPath(id, filePath);
}

export function getRouteSlug(
  id: string,
  filePath: string | undefined
): string {
  return `/${getRouteSlugPath(id, filePath)}`;
}
