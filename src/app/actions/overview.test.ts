import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getOverviewDashboardData: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/overview-data", () => ({
  getOverviewDashboardData: mocks.getOverviewDashboardData,
}));

import { loadOverviewDashboard } from "@/app/actions/overview";

describe("overview range action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOverviewDashboardData.mockImplementation(async (range) => ({ range }));
  });

  it.each(["7d", "30d", "90d"] as const)(
    "loads real dashboard data for the selected %s range",
    async (range) => {
      await expect(loadOverviewDashboard(range)).resolves.toEqual({
        data: { range },
      });
      expect(mocks.getOverviewDashboardData).toHaveBeenCalledWith(range);
      expect(mocks.getOverviewDashboardData).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects invalid client input before loading any workspace data", async () => {
    await expect(loadOverviewDashboard({ range: "all", workspaceId: "untrusted" }))
      .resolves.toEqual({ error: "Choose a valid reporting period." });
    expect(mocks.getOverviewDashboardData).not.toHaveBeenCalled();
  });

  it("returns a safe visible error for expected analytics failures", async () => {
    mocks.getOverviewDashboardData.mockRejectedValue(new AppError("DATABASE"));

    await expect(loadOverviewDashboard("30d")).resolves.toEqual({
      error: "The request could not be completed. Please try again.",
    });
  });
});
