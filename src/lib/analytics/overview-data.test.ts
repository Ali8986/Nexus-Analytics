import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  getOverview: vi.fn(),
  getCustomerSummary: vi.fn(),
  getRevenueTrend: vi.fn(),
  getOrderStatusSummary: vi.fn(),
  getRecentOrders: vi.fn(),
  getProductPerformance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/workspaces/selection", () => ({
  getSelectedWorkspaceId: mocks.getSelectedWorkspaceId,
}));
vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspaceContext: mocks.resolveWorkspaceContext,
}));
vi.mock("@/lib/services/analytics", () => ({
  getOverview: mocks.getOverview,
  getCustomerSummary: mocks.getCustomerSummary,
  getRevenueTrend: mocks.getRevenueTrend,
  getOrderStatusSummary: mocks.getOrderStatusSummary,
  getRecentOrders: mocks.getRecentOrders,
  getProductPerformance: mocks.getProductPerformance,
}));

import { getOverviewDashboardData } from "@/lib/analytics/overview-data";

const workspaceId = "3e496f30-5815-4e51-94a1-6e9241fcc845";
const workspace = {
  id: workspaceId,
  name: "Verified workspace",
  reportingCurrency: "USD",
  reportingTimezone: "America/Los_Angeles",
};

describe("overview dashboard data loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.resolveWorkspaceContext.mockResolvedValue(workspace);
    mocks.getOverview.mockResolvedValue({
      reporting_currency: "USD",
      reporting_timezone: workspace.reportingTimezone,
      total_revenue: "120.50",
      total_orders: 3,
      completed_orders: 2,
      processing_orders: 1,
      pending_orders: 0,
      cancelled_orders: 0,
      total_customers: 2,
      active_customers: 2,
      total_active_products: 1,
      average_order_value: "60.25",
    });
    mocks.getCustomerSummary.mockResolvedValue({
      total_customers: 2,
      active_customers: 2,
      customers_with_qualifying_orders: 1,
      new_customers_in_range: 1,
    });
    mocks.getRevenueTrend.mockResolvedValue([]);
    mocks.getOrderStatusSummary.mockResolvedValue([]);
    mocks.getRecentOrders.mockResolvedValue([]);
    mocks.getProductPerformance.mockResolvedValue([]);
  });

  it("queries every dashboard section using the server-selected verified workspace", async () => {
    const data = await getOverviewDashboardData(
      "7d",
      new Date("2026-03-08T07:30:00.000Z"),
    );
    const range = { startDate: "2026-03-01", endDate: "2026-03-07" };

    expect(mocks.resolveWorkspaceContext).toHaveBeenCalledWith(workspaceId);
    expect(mocks.getOverview).toHaveBeenCalledWith(workspaceId, range);
    expect(mocks.getCustomerSummary).toHaveBeenCalledWith(workspaceId, range);
    expect(mocks.getRevenueTrend).toHaveBeenCalledWith(workspaceId, range);
    expect(mocks.getOrderStatusSummary).toHaveBeenCalledWith(workspaceId, range);
    expect(mocks.getRecentOrders).toHaveBeenCalledWith(workspaceId, {
      ...range,
      limit: 5,
      offset: 0,
    });
    expect(mocks.getProductPerformance).toHaveBeenCalledWith(workspaceId, {
      ...range,
      sortBy: "revenue",
      limit: 4,
      offset: 0,
    });
    expect(data.workspaceName).toBe(workspace.name);
    expect(data.revenueTrend).toEqual([]);
    expect(data.recentOrders).toEqual([]);
    expect(data.topProducts).toEqual([]);
  });

  it("applies a newly selected 90-day range to all range-sensitive queries", async () => {
    await getOverviewDashboardData(
      "90d",
      new Date("2026-03-08T07:30:00.000Z"),
    );
    const range = { startDate: "2025-12-08", endDate: "2026-03-07" };

    expect(mocks.getOverview).toHaveBeenCalledWith(workspaceId, range);
    expect(mocks.getRevenueTrend).toHaveBeenCalledWith(workspaceId, range);
    expect(mocks.getOrderStatusSummary).toHaveBeenCalledWith(workspaceId, range);
  });

  it("rejects a missing selected workspace before issuing analytics queries", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValue(null);

    await expect(getOverviewDashboardData("30d")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(mocks.getOverview).not.toHaveBeenCalled();
  });

  it("surfaces unavailable overview results instead of substituting sample values", async () => {
    mocks.getOverview.mockResolvedValue(null);

    await expect(getOverviewDashboardData("30d")).rejects.toMatchObject({
      code: "DATABASE",
    });
  });
});
