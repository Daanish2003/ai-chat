const monthDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** A short relative time for the Conversation panel: "just now", "5m ago", …, then "Sep 20". */
export function relativeTime(at: Date, now = new Date()) {
  const seconds = (now.getTime() - at.getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return monthDay.format(at);
}
