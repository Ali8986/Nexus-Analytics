import { describe, expect, it } from "vitest";
import { getOverviewDateRange } from "@/lib/analytics/overview-range";

describe("overview reporting date ranges", () => {
  const now = new Date("2026-03-08T07:30:00.000Z");

  it.each([
    ["7d", "2026-03-01"],
    ["30d", "2026-02-06"],
    ["90d", "2025-12-08"],
  ] as const)("builds the inclusive %s range in workspace timezone", (range, startDate) => {
    expect(getOverviewDateRange(range, "America/Los_Angeles", now)).toEqual({
      startDate,
      endDate: "2026-03-07",
    });
  });

  it("uses the workspace-local date when UTC has already crossed midnight", () => {
    expect(
      getOverviewDateRange("7d", "America/Los_Angeles", new Date("2026-03-08T07:30:00Z")),
    ).toEqual({ startDate: "2026-03-01", endDate: "2026-03-07" });
  });
});
