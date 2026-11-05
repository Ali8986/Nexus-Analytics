import "server-only";

import { AppError } from "@/lib/errors/app-error";
import {
  getCustomerSummary,
  getOverview,
  getProductPerformance,
  getRecentOrders,
  getRevenueTrend,
  getOrderStatusSummary,
} from "@/lib/services/analytics";
import type {
  AnalyticsOverview,
  CustomerAnalyticsSummary,
  OrderStatusCount,
  ProductPerformance,
  RecentOrderRecord,
  RevenueTrendPoint,
} from "@/lib/services/types";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";
import { getOverviewDateRange, type OverviewRange } from "./overview-range";

export type OverviewDashboardData = {
  range: OverviewRange;
  startDate: string;
  endDate: string;
  workspaceName: string;
  reportingCurrency: string;
  reportingTimezone: string;
  canExport: boolean;
  overview: AnalyticsOverview;
  customerSummary: CustomerAnalyticsSummary;
  revenueTrend: RevenueTrendPoint[];
  orderStatuses: OrderStatusCount[];
  recentOrders: RecentOrderRecord[];
  topProducts: ProductPerformance[];
};

export async function getOverviewDashboardData(
  range: OverviewRange,
  now: Date = new Date(),
): Promise<OverviewDashboardData> {
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  const dateRange = getOverviewDateRange(range, workspace.reportingTimezone, now);
  const input = { ...dateRange };
  const [
    overview,
    customerSummary,
    revenueTrend,
    orderStatuses,
    recentOrders,
    topProducts,
  ] = await Promise.all([
    getOverview(workspace.id, input),
    getCustomerSummary(workspace.id, input),
    getRevenueTrend(workspace.id, input),
    getOrderStatusSummary(workspace.id, input),
    getRecentOrders(workspace.id, { ...input, limit: 5, offset: 0 }),
    getProductPerformance(workspace.id, {
      ...input,
      sortBy: "revenue",
      limit: 4,
      offset: 0,
    }),
  ]);

  if (!overview || !customerSummary) throw new AppError("DATABASE");

  return {
    range,
    ...dateRange,
    workspaceName: workspace.name,
    reportingCurrency: overview.reporting_currency,
    reportingTimezone: overview.reporting_timezone,
    canExport: workspace.role !== "viewer",
    overview,
    customerSummary,
    revenueTrend,
    orderStatuses,
    recentOrders,
    topProducts,
  };
}
