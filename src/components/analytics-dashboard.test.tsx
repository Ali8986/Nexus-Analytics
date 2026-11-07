import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsDashboardData } from "@/lib/analytics/dashboard-data";

vi.mock("@/app/actions/analytics", () => ({
  loadAnalyticsDashboard: vi.fn(),
}));

import { AnalyticsDashboard } from "@/components/analytics-dashboard";

const initialData: AnalyticsDashboardData = {
  range: "7d",
  startDate: "2026-11-01",
  endDate: "2026-11-07",
  workspaceName: "Nexus Test Workspace",
  reportingCurrency: "USD",
  reportingTimezone: "America/Los_Angeles",
  overview: {
    reporting_currency: "USD",
    reporting_timezone: "America/Los_Angeles",
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
  },
  customerSummary: {
    total_customers: 8,
    active_customers: 7,
    customers_with_qualifying_orders: 2,
    new_customers_in_range: 1,
  },
  revenueTrend: [{ report_date: "2026-11-04", reporting_currency: "USD", revenue: "120", qualifying_order_count: 3 }],
  orderTrend: [{ report_date: "2026-11-04", total_orders: 3, pending_orders: 0, processing_orders: 2, completed_orders: 1, cancelled_orders: 0 }],
  orderStatuses: [
    { status: "pending", order_count: 0 },
    { status: "processing", order_count: 2 },
    { status: "completed", order_count: 1 },
    { status: "cancelled", order_count: 0 },
  ],
  newCustomerTrend: [{ report_date: "2026-11-04", new_customer_count: 1 }],
  topCustomers: [{
    customer_id: "e8db3392-ccda-46cc-9a15-faf902420f87",
    customer_name: "Avery Smith",
    is_archived: false,
    qualifying_order_count: 2,
    qualifying_revenue: "120.00",
  }],
  productPerformance: [{
    product_id: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
    product_name: "Desk Lamp",
    product_sku: "LAMP-1",
    units_sold: 3,
    qualifying_order_count: 2,
    qualifying_revenue: "120.00",
  }],
  productSort: "revenue",
};

describe("analytics dashboard presentation", () => {
  it("labels current-status revenue semantics and renders date-scoped insights", () => {
    const markup = renderToStaticMarkup(createElement(AnalyticsDashboard, { initialData }));
    expect(markup).toContain("Qualifying revenue");
    expect(markup).toContain("currently Processing or Completed");
    expect(markup).toContain("not payment data");
    expect(markup).toContain("New customers");
    expect(markup).toContain("Orders over time");
    expect(markup).toContain("Order status breakdown");
    expect(markup).toContain("Last 7 days");
    expect(markup).toContain("USD");
    expect(markup).toContain("Desk Lamp");
    expect(markup).toContain("LAMP-1");
    expect(markup).toContain("Avery Smith");
  });

  it("shows meaningful empty states instead of fabricated chart activity", () => {
    const emptyData: AnalyticsDashboardData = {
      ...initialData,
      overview: {
        ...initialData.overview,
        total_revenue: "0",
        total_orders: 0,
        average_order_value: "0",
      },
      customerSummary: { ...initialData.customerSummary, new_customers_in_range: 0 },
      revenueTrend: [],
      orderTrend: [],
      orderStatuses: [],
      newCustomerTrend: [],
      topCustomers: [],
      productPerformance: [],
    };
    const markup = renderToStaticMarkup(createElement(AnalyticsDashboard, { initialData: emptyData }));
    expect(markup).toContain("No qualifying revenue");
    expect(markup).toContain("No order activity");
    expect(markup).toContain("No orders to break down");
    expect(markup).toContain("No new customers");
    expect(markup).toContain("No product activity");
    expect(markup).toContain("No qualifying customer activity");
  });
});
