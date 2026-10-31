import { getRelativeLocaleUrl } from "astro:i18n";

/** The blog homepage. `/` belongs to the music landing. */
export function getBlogHomeUrl(locale: string) {
  return getRelativeLocaleUrl(locale, "blog");
}
