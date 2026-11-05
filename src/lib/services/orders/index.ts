import "server-only";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import {
  orderCreationSchema,
  orderIdInputSchema,
  orderListFilterSchema,
  orderStatusSchema,
} from "@/lib/validation/schemas";
import {
  parseInput,
  parseRpcId,
  raiseDatabaseError,
  workspaceDateBoundary,
} from "@/lib/services/shared";
import { requireWorkspaceRole } from "@/lib/workspaces/context";
import type { OrderItemRecord, OrderListRecord, OrderRecord } from "@/lib/services/types";

export async function createOrder(workspaceId: string, input: unknown): Promise<string> {
  const value = parseInput(orderCreationSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_workspace_id: workspace.id,
    p_idempotency_key: value.idempotencyKey,
    p_items: value.items.map(({ productId, quantity }) => ({
      product_id: productId,
      quantity,
    })),
    p_customer_id: value.customerId ?? null,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function getOrder(
  workspaceId: string,
  orderId: string,
): Promise<OrderRecord & { items: OrderItemRecord[] }> {
  const id = parseInput(orderIdInputSchema, { orderId }).orderId;
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin", "analyst", "viewer"]);
  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, workspace_id, customer_id, status, currency_code, subtotal, total, created_at, updated_at")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (orderError) raiseDatabaseError(orderError);
  if (!order) throw new AppError("NOT_FOUND");

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, product_name, product_sku, unit_price, quantity, line_total, created_at")
    .eq("workspace_id", workspace.id)
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  if (itemsError) raiseDatabaseError(itemsError);
  return { ...order, items };
}

export async function listOrders(
  workspaceId: string,
  input: {
    startDate?: string;
    endDate?: string;
    status?: "pending" | "processing" | "completed" | "cancelled";
    customerId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<OrderListRecord[]> {
  const filters = parseInput(orderListFilterSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin", "analyst", "viewer"]);
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(`
      id, workspace_id, customer_id, status, currency_code, subtotal, total, created_at, updated_at,
      customer:customers!orders_customer_workspace_fkey(name),
      item_counts:order_items!order_items_order_workspace_fkey(count)
    `)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);
  if (filters.startDate && filters.endDate) {
    query = query.gte(
      "created_at",
      workspaceDateBoundary(filters.startDate, workspace.reportingTimezone),
    );
    query = query.lt(
      "created_at",
      workspaceDateBoundary(
        new Date(Date.parse(`${filters.endDate}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10),
        workspace.reportingTimezone,
      ),
    );
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  const { data, error } = await query;
  if (error) raiseDatabaseError(error);
  return (data ?? []).map((order) => {
    const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
    return {
      id: order.id,
      workspace_id: order.workspace_id,
      customer_id: order.customer_id,
      status: order.status,
      currency_code: order.currency_code,
      subtotal: order.subtotal,
      total: order.total,
      created_at: order.created_at,
      updated_at: order.updated_at,
      customer_name: customer?.name ?? null,
      item_count: order.item_counts?.[0]?.count ?? 0,
    };
  });
}

export async function updateOrderStatus(
  workspaceId: string,
  orderId: string,
  requestedStatus: unknown,
): Promise<string> {
  const id = parseInput(orderIdInputSchema, { orderId }).orderId;
  const status = parseInput(orderStatusSchema, requestedStatus);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_order_status", {
    p_workspace_id: workspace.id,
    p_order_id: id,
    p_new_status: status,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}
