import type { CollectionEntry } from "astro:content";
import { postFilter } from "./postFilter";
import { getPostLang, localeToPostLang, type PostLang } from "./postLang";

/**
 * Returns posts that are eligible to be shown to users, sorted by “last updated”
 * descending (uses `modDatetime` when present, otherwise `pubDatetime`).
 *
 * When `locale` is set, only posts for that language are returned.
 */
export function getSortedPosts(
  posts: CollectionEntry<"posts">[],
  locale?: string
) {
  const lang: PostLang | undefined =
    locale === undefined ? undefined : localeToPostLang(locale);

  return posts
    .filter(postFilter)
    .filter(post => (lang ? getPostLang(post) === lang : true))
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
}
