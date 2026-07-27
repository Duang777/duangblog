/**
 * Short phenology line by month — for a quiet homepage corner.
 * Keep these public-safe and season-true; edit once a season if needed.
 */
const LINES: Record<number, string> = {
  1: "小寒前后",
  2: "立春将近",
  3: "春分将至",
  4: "谷雨前后",
  5: "小满将近",
  6: "夏至将至",
  7: "大暑前后",
  8: "立秋将近",
  9: "白露将至",
  10: "霜降前后",
  11: "立冬将近",
  12: "冬至将至",
};

export function getPhenologyLine(date: Date = new Date()): string {
  return LINES[date.getMonth() + 1] ?? "时令平常";
}
