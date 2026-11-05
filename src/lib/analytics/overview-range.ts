import type { z } from "zod";
import type { overviewRangeSchema } from "@/lib/validation/schemas";

export type OverviewRange = z.infer<typeof overviewRangeSchema>;

const rangeDays: Record<OverviewRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function dateInTimezone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function getOverviewDateRange(
  range: OverviewRange,
  timezone: string,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const endDate = dateInTimezone(now, timezone);
  const [year, month, day] = endDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day - rangeDays[range] + 1));
  const startDate = [
    start.getUTCFullYear().toString().padStart(4, "0"),
    (start.getUTCMonth() + 1).toString().padStart(2, "0"),
    start.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
  return { startDate, endDate };
}
