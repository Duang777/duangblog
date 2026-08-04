/**
 * Prefer a column-ish tag for notebook adjacent labels.
 * Jar columns are listed first so article pages match tag-page bottles.
 */
const COLUMN_PRIORITY = [
  "最新速递",
  "请求过境",
  "MySQL",
  "后端专栏",
  "Agent",
  "拆解",
];

export function pickColumnTag(tags: string[] | undefined): string | undefined {
  if (!tags?.length) return undefined;
  for (const preferred of COLUMN_PRIORITY) {
    if (tags.includes(preferred)) return preferred;
  }
  // Avoid generic leftovers as series labels.
  const first = tags.find(tag => tag !== "others");
  return first;
}
