/**
 * Quiet notebook stamp derived from publish / modify wall-clock time.
 * e.g. "写于周四夜里" / "写于周三午后 · 改于周末"
 */
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function partOfDay(hour: number): string {
  if (hour < 5) return "深夜";
  if (hour < 9) return "清晨";
  if (hour < 12) return "上午";
  if (hour < 14) return "午后";
  if (hour < 18) return "下午";
  if (hour < 22) return "夜里";
  return "深夜";
}

function isWeekend(day: number): boolean {
  return day === 0 || day === 6;
}

function stampFor(date: Date): { weekday: string; part: string; weekend: boolean } {
  return {
    weekday: WEEKDAYS[date.getDay()] ?? "某日",
    part: partOfDay(date.getHours()),
    weekend: isWeekend(date.getDay()),
  };
}

export function formatWrittenStamp(
  pubDatetime: Date | string,
  modDatetime?: Date | string | null
): string {
  const pub = pubDatetime instanceof Date ? pubDatetime : new Date(pubDatetime);
  if (Number.isNaN(pub.getTime())) return "";

  const pubStamp = stampFor(pub);
  const written = `写于${pubStamp.weekday}${pubStamp.part}`;

  if (!modDatetime) return written;
  const mod = modDatetime instanceof Date ? modDatetime : new Date(modDatetime);
  if (Number.isNaN(mod.getTime()) || mod.getTime() <= pub.getTime()) {
    return written;
  }

  const modStamp = stampFor(mod);
  const revised = modStamp.weekend
    ? "改于周末"
    : `改于${modStamp.weekday}${modStamp.part}`;
  return `${written} · ${revised}`;
}
