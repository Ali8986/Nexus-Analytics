import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getAnalyticsDashboardData: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/analytics/dashboard-data", () => ({
  getAnalyticsDashboardData: mocks.getAnalyticsDashboardData,
}));

import { loadAnalyticsDashboard } from "@/app/actions/analytics";

describe("analytics dashboard action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAnalyticsDashboardData.mockResolvedValue({ range: "30d", productSort: "revenue" });
  });

  it("validates range and product sort before loading workspace data", async () => {
    await expect(loadAnalyticsDashboard({ range: "30d", productSort: "orders" }))
      .resolves.toEqual({ data: { range: "30d", productSort: "revenue" } });
    expect(mocks.getAnalyticsDashboardData).toHaveBeenCalledWith("30d", "orders");

    await expect(loadAnalyticsDashboard({ range: "all", productSort: "invalid" }))
      .resolves.toEqual({ error: "Choose valid analytics filters." });
    expect(mocks.getAnalyticsDashboardData).toHaveBeenCalledTimes(1);
  });

  it("maps known application errors and surfaces unexpected failures", async () => {
    mocks.getAnalyticsDashboardData.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(loadAnalyticsDashboard({ range: "7d", productSort: "revenue" }))
      .resolves.toMatchObject({ error: expect.any(String) });
    mocks.getAnalyticsDashboardData.mockRejectedValueOnce(new Error("unexpected"));
    await expect(loadAnalyticsDashboard({ range: "7d", productSort: "revenue" }))
      .rejects.toThrow("unexpected");
  });
});
