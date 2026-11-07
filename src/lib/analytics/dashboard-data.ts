import "server-only";

import { AppError } from "@/lib/errors/app-error";
import {
  getCustomerSummary,
  getNewCustomerTrend,
  getOrderStatusSummary,
  getOrderTrend,
  getOverview,
  getProductPerformance,
  getRevenueTrend,
  getTopCustomers,
} from "@/lib/services/analytics";
import type {
  AnalyticsOverview,
  CustomerAnalyticsSummary,
  NewCustomerTrendPoint,
  OrderStatusCount,
  OrdersTrendPoint,
  ProductPerformance,
  RevenueTrendPoint,
  TopCustomer,
} from "@/lib/services/types";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";
import { getOverviewDateRange, type OverviewRange } from "./overview-range";

export type AnalyticsProductSort = "revenue" | "units" | "orders";

export type AnalyticsDashboardData = {
  range: OverviewRange;
  startDate: string;
  endDate: string;
  workspaceName: string;
  reportingCurrency: string;
  reportingTimezone: string;
  overview: AnalyticsOverview;
  customerSummary: CustomerAnalyticsSummary;
  revenueTrend: RevenueTrendPoint[];
  orderTrend: OrdersTrendPoint[];
  orderStatuses: OrderStatusCount[];
  newCustomerTrend: NewCustomerTrendPoint[];
  topCustomers: TopCustomer[];
  productPerformance: ProductPerformance[];
  productSort: AnalyticsProductSort;
};

export async function getAnalyticsDashboardData(
  range: OverviewRange,
  productSort: AnalyticsProductSort,
  now: Date = new Date(),
): Promise<AnalyticsDashboardData> {
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  const dateRange = getOverviewDateRange(range, workspace.reportingTimezone, now);
  const input = { ...dateRange };
  const [
    overview,
    customerSummary,
    revenueTrend,
    orderTrend,
    orderStatuses,
    newCustomerTrend,
    topCustomers,
    productPerformance,
  ] = await Promise.all([
    getOverview(workspace.id, input),
    getCustomerSummary(workspace.id, input),
    getRevenueTrend(workspace.id, input),
    getOrderTrend(workspace.id, input),
    getOrderStatusSummary(workspace.id, input),
    getNewCustomerTrend(workspace.id, input),
    getTopCustomers(workspace.id, { ...input, limit: 10, offset: 0 }),
    getProductPerformance(workspace.id, {
      ...input,
      sortBy: productSort,
      limit: 100,
      offset: 0,
    }),
  ]);

  if (!overview || !customerSummary) throw new AppError("DATABASE");

  return {
    range,
    ...dateRange,
    workspaceName: workspace.name,
    reportingCurrency: workspace.reportingCurrency,
    reportingTimezone: workspace.reportingTimezone,
    overview,
    customerSummary,
    revenueTrend,
    orderTrend,
    orderStatuses,
    newCustomerTrend,
    topCustomers,
    productPerformance,
    productSort,
  };
}
