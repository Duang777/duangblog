/**
 * Compact Chinese relative time for notebook date lines.
 * Examples: "刚刚", "3 小时前", "2 天前", "上周", "3 个月前"
 */
export function formatRelativeTime(
  date: Date | string,
  now: Date = new Date()
): string {
  const then = date instanceof Date ? date : new Date(date);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return "";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨天";
  if (day < 7) return `${day} 天前`;
  if (day < 14) return "上周";
  const month = Math.floor(day / 30);
  if (month < 1) return `${Math.floor(day / 7)} 周前`;
  if (month < 12) return `${month} 个月前`;
  const year = Math.floor(month / 12);
  return year === 1 ? "一年前" : `${year} 年前`;
}
