import "server-only";

import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import {
  dateRangeSchema,
  paginationSchema,
  presetWindowSchema,
  productPerformanceSchema,
  requiredDateRangeSchema,
  topListSchema,
} from "@/lib/validation/schemas";
import {
  getWorkspace,
  optionalDates,
  parseInput,
  raiseDatabaseError,
} from "@/lib/services/shared";
import type {
  AnalyticsOverview,
  CustomerAnalyticsSummary,
  NewCustomerTrendPoint,
  OrderStatusCount,
  OrdersTrendPoint,
  ProductPerformance,
  RecentOrderRecord,
  RevenueTrendPoint,
  TopCustomer,
} from "@/lib/services/types";

export async function getOverview(
  workspaceId: string,
  input: unknown = {},
): Promise<AnalyticsOverview | null> {
  const range = parseInput(dateRangeSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_overview", {
    p_workspace_id: workspace.id,
    ...optionalDates(range),
  });
  if (error) raiseDatabaseError(error);
  return data?.[0] ?? null;
}

export async function getRevenueTrend(
  workspaceId: string,
  input: unknown,
): Promise<RevenueTrendPoint[]> {
  const range = parseInput(requiredDateRangeSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_revenue_trend", {
    p_workspace_id: workspace.id,
    p_start_date: range.startDate,
    p_end_date: range.endDate,
  });
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getRevenuePreset(
  workspaceId: string,
  days: unknown,
): Promise<RevenueTrendPoint[]> {
  const windowSize = parseInput(presetWindowSchema, days);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_revenue_trend_window", {
    p_workspace_id: workspace.id,
    p_days: windowSize,
  });
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getOrderStatusSummary(
  workspaceId: string,
  input: unknown = {},
): Promise<OrderStatusCount[]> {
  const range = parseInput(dateRangeSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "analytics_order_status_breakdown",
    { p_workspace_id: workspace.id, ...optionalDates(range) },
  );
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getOrderTrend(
  workspaceId: string,
  input: unknown,
): Promise<OrdersTrendPoint[]> {
  const range = parseInput(requiredDateRangeSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_orders_over_time", {
    p_workspace_id: workspace.id,
    p_start_date: range.startDate,
    p_end_date: range.endDate,
  });
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getRecentOrders(
  workspaceId: string,
  input: unknown = {},
): Promise<RecentOrderRecord[]> {
  const [range, page] = [
    parseInput(dateRangeSchema, input),
    parseInput(paginationSchema, input),
  ];
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_recent_orders", {
    p_workspace_id: workspace.id,
    ...optionalDates(range),
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getCustomerSummary(
  workspaceId: string,
  input: unknown = {},
): Promise<CustomerAnalyticsSummary | null> {
  const range = parseInput(dateRangeSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_customer_summary", {
    p_workspace_id: workspace.id,
    ...optionalDates(range),
  });
  if (error) raiseDatabaseError(error);
  return data?.[0] ?? null;
}

export async function getNewCustomerTrend(
  workspaceId: string,
  input: unknown,
): Promise<NewCustomerTrendPoint[]> {
  const range = parseInput(requiredDateRangeSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "analytics_new_customers_over_time",
    {
      p_workspace_id: workspace.id,
      p_start_date: range.startDate,
      p_end_date: range.endDate,
    },
  );
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getTopCustomers(
  workspaceId: string,
  input: unknown = {},
): Promise<TopCustomer[]> {
  const filters = parseInput(topListSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "analytics_top_customers_by_revenue",
    {
      p_workspace_id: workspace.id,
      ...optionalDates(filters),
      p_limit: filters.limit,
      p_offset: filters.offset,
    },
  );
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getProductPerformance(
  workspaceId: string,
  input: unknown,
): Promise<ProductPerformance[]> {
  const filters = parseInput(productPerformanceSchema, input);
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "analytics_product_performance",
    {
      p_workspace_id: workspace.id,
      p_start_date: filters.startDate,
      p_end_date: filters.endDate,
      p_sort_by: filters.sortBy,
      p_limit: filters.limit,
      p_offset: filters.offset,
    },
  );
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export function validateAnalyticsRange(input: unknown) {
  const parsed = requiredDateRangeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error);
  return parsed.data;
}
