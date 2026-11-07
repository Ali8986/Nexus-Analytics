import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  getOverview: vi.fn(),
  getCustomerSummary: vi.fn(),
  getRevenueTrend: vi.fn(),
  getOrderTrend: vi.fn(),
  getOrderStatusSummary: vi.fn(),
  getNewCustomerTrend: vi.fn(),
  getTopCustomers: vi.fn(),
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
  getOrderTrend: mocks.getOrderTrend,
  getOrderStatusSummary: mocks.getOrderStatusSummary,
  getNewCustomerTrend: mocks.getNewCustomerTrend,
  getTopCustomers: mocks.getTopCustomers,
  getProductPerformance: mocks.getProductPerformance,
}));

import { getAnalyticsDashboardData } from "@/lib/analytics/dashboard-data";

const workspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const overview = {
  reporting_currency: "USD",
  reporting_timezone: "UTC",
  total_revenue: "120.00",
  total_orders: 3,
  completed_orders: 1,
  processing_orders: 2,
  pending_orders: 0,
  cancelled_orders: 0,
  total_customers: 8,
  active_customers: 7,
  total_active_products: 4,
  average_order_value: "40.00",
};
const customerSummary = {
  total_customers: 8,
  active_customers: 7,
  customers_with_qualifying_orders: 2,
  new_customers_in_range: 1,
};

describe("analytics dashboard aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.resolveWorkspaceContext.mockResolvedValue({
      id: workspaceId,
      name: "Analytics Workspace",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
      role: "owner",
    });
    mocks.getOverview.mockResolvedValue(overview);
    mocks.getCustomerSummary.mockResolvedValue(customerSummary);
    mocks.getRevenueTrend.mockResolvedValue([{ report_date: "2026-11-01", revenue: "120", qualifying_order_count: 3 }]);
    mocks.getOrderTrend.mockResolvedValue([{ report_date: "2026-11-01", total_orders: 3, pending_orders: 0, processing_orders: 2, completed_orders: 1, cancelled_orders: 0 }]);
    mocks.getOrderStatusSummary.mockResolvedValue([{ status: "processing", order_count: 2 }]);
    mocks.getNewCustomerTrend.mockResolvedValue([{ report_date: "2026-11-01", new_customer_count: 1 }]);
    mocks.getTopCustomers.mockResolvedValue([{ customer_id: "customer-1", customer_name: "Avery Smith", is_archived: false, qualifying_order_count: 2, qualifying_revenue: "120" }]);
    mocks.getProductPerformance.mockResolvedValue([{ product_id: "product-1", product_name: "Desk Lamp", product_sku: "LAMP-1", units_sold: 3, qualifying_order_count: 2, qualifying_revenue: "120" }]);
  });

  it("uses the selected workspace-local range and existing queries for dashboard insights", async () => {
    const data = await getAnalyticsDashboardData(
      "7d",
      "units",
      new Date("2026-11-07T12:00:00.000Z"),
    );

    expect(data).toMatchObject({
      range: "7d",
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      workspaceName: "Analytics Workspace",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
      overview,
      customerSummary,
      productSort: "units",
      topCustomers: [{ customer_name: "Avery Smith", qualifying_order_count: 2 }],
      productPerformance: [{ product_name: "Desk Lamp", units_sold: 3 }],
    });
    expect(mocks.resolveWorkspaceContext).toHaveBeenCalledWith(workspaceId);
    expect(mocks.getOverview).toHaveBeenCalledWith(workspaceId, {
      startDate: "2026-11-01",
      endDate: "2026-11-07",
    });
    expect(mocks.getCustomerSummary).toHaveBeenCalledWith(workspaceId, {
      startDate: "2026-11-01",
      endDate: "2026-11-07",
    });
    expect(mocks.getTopCustomers).toHaveBeenCalledWith(workspaceId, {
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      limit: 10,
      offset: 0,
    });
    expect(mocks.getProductPerformance).toHaveBeenCalledWith(workspaceId, {
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      sortBy: "units",
      limit: 100,
      offset: 0,
    });
    expect(data.customerSummary.new_customers_in_range).toBe(1);
    expect(data.overview.total_revenue).toBe("120.00");
  });

  it("requires a server-selected workspace and complete core metrics", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValue(null);
    await expect(getAnalyticsDashboardData("30d", "revenue")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.resolveWorkspaceContext).not.toHaveBeenCalled();

    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.getOverview.mockResolvedValue(null);
    await expect(getAnalyticsDashboardData("30d", "revenue")).rejects.toBeInstanceOf(AppError);
  });
});
