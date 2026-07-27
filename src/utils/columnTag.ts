/**
 * Prefer a column-ish tag for notebook adjacent labels.
 */
const COLUMN_PRIORITY = ["请求过境", "后端专栏"];

export function pickColumnTag(tags: string[] | undefined): string | undefined {
  if (!tags?.length) return undefined;
  for (const preferred of COLUMN_PRIORITY) {
    if (tags.includes(preferred)) return preferred;
  }
  // Avoid generic leftovers as series labels.
  const first = tags.find(tag => tag !== "others");
  return first;
}
