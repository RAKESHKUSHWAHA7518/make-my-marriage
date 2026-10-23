/** Calendar days in the wedding's timezone, not elapsed 24-hour periods. */
export function daysUntilWedding(
  weddingDate: string | undefined,
  timezone: string,
  now: Date,
) {
  if (!weddingDate || !/^\d{4}-\d{2}-\d{2}$/.test(weddingDate)) return null;
  const target = new Date(`${weddingDate}T00:00:00Z`);
  if (
    !Number.isFinite(target.getTime()) ||
    target.toISOString().slice(0, 10) !== weddingDate ||
    !Number.isFinite(now.getTime())
  )
    return null;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const value = (type: string) =>
      parts.find((part) => part.type === type)!.value;
    const today = Date.parse(
      `${value("year").padStart(4, "0")}-${value("month")}-${value("day")}T00:00:00Z`,
    );
    return Math.round((target.getTime() - today) / 86400000);
  } catch {
    return null;
  }
}
