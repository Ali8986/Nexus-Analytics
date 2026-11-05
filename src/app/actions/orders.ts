"use server";

import { revalidatePath } from "next/cache";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import { createOrder, getOrder, listOrders, updateOrderStatus } from "@/lib/services/orders";
import { getCustomer, listCustomers } from "@/lib/services/customers";
import { listProducts } from "@/lib/services/products";
import type {
  CustomerRecord,
  OrderItemRecord,
  OrderListRecord,
  ProductRecord,
} from "@/lib/services/types";
import {
  orderCreationSchema,
  orderIdInputSchema,
  orderListFilterSchema,
  orderStatusSchema,
} from "@/lib/validation/schemas";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export type OrderListItem = Pick<
  OrderListRecord,
  | "id"
  | "customer_id"
  | "customer_name"
  | "status"
  | "currency_code"
  | "subtotal"
  | "total"
  | "created_at"
  | "item_count"
>;

export type OrderListResult =
  | { orders: OrderListItem[]; hasMore: boolean }
  | { error: string };

export type OrderDetail = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  status: OrderListRecord["status"];
  currency_code: string;
  subtotal: OrderListRecord["subtotal"];
  total: OrderListRecord["total"];
  created_at: string;
  items: Pick<
    OrderItemRecord,
    "id" | "product_name" | "product_sku" | "unit_price" | "quantity" | "line_total"
  >[];
};

export type OrderCustomerOption = Pick<CustomerRecord, "id" | "name" | "email">;
export type OrderProductOption = Pick<ProductRecord, "id" | "name" | "sku" | "unit_price">;
export type OrderOptionsResult =
  | { customers: OrderCustomerOption[]; products: OrderProductOption[] }
  | { error: string };
export type OrderMutationResult =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> };
export type CreateOrderResult =
  | { success: true; orderId: string }
  | { error: string; fieldErrors?: Record<string, string> };

async function getSelectedWorkspace() {
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");
  return resolveWorkspaceContext(selectedWorkspaceId);
}

function firstValidationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const issue = error.issues[0];
  if (!issue) return { error: "Review the order information and try again." };
  const field = issue.path[0];
  return {
    error: issue.message,
    fieldErrors: typeof field === "string" ? { [field]: issue.message } : undefined,
  };
}

function actionError(error: unknown): { error: string } {
  if (error instanceof AppError) return { error: publicErrorMessage(error) };
  throw error;
}

export async function loadOrders(input: unknown): Promise<OrderListResult> {
  const filters = orderListFilterSchema.safeParse(input);
  if (!filters.success) {
    return { error: filters.error.issues[0]?.message ?? "Choose valid order filters." };
  }

  try {
    const workspace = await getSelectedWorkspace();
    const rows = await listOrders(workspace.id, {
      ...filters.data,
      limit: Math.min(filters.data.limit + 1, 100),
    });
    return {
      orders: rows.slice(0, filters.data.limit).map((order) => ({
        id: order.id,
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        status: order.status,
        currency_code: order.currency_code,
        subtotal: order.subtotal,
        total: order.total,
        created_at: order.created_at,
        item_count: order.item_count,
      })),
      hasMore:
        filters.data.limit === 100
          ? rows.length === 100
          : rows.length > filters.data.limit,
    };
  } catch (error) {
    if (error instanceof AppError) return { error: publicErrorMessage(error) };
    throw error;
  }
}

export async function loadOrderDetails(input: unknown): Promise<OrderDetail | { error: string }> {
  const parsed = orderIdInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a valid order." };

  try {
    const workspace = await getSelectedWorkspace();
    const order = await getOrder(workspace.id, parsed.data.orderId);
    let customerName: string | null = null;
    if (order.customer_id) {
      try {
        customerName = (await getCustomer(workspace.id, order.customer_id)).name;
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "NOT_FOUND") throw error;
      }
    }

    return {
      id: order.id,
      customer_id: order.customer_id,
      customer_name: customerName,
      status: order.status,
      currency_code: order.currency_code,
      subtotal: order.subtotal,
      total: order.total,
      created_at: order.created_at,
      items: order.items.map((item) => ({
        id: item.id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        unit_price: item.unit_price,
        quantity: item.quantity,
        line_total: item.line_total,
      })),
    };
  } catch (error) {
    if (error instanceof AppError) return { error: publicErrorMessage(error) };
    throw error;
  }
}

export async function loadOrderOptions(): Promise<OrderOptionsResult> {
  try {
    const workspace = await getSelectedWorkspace();
    const [customers, products] = await Promise.all([
      listCustomers(workspace.id, { limit: 100 }),
      listProducts(workspace.id, { limit: 100 }),
    ]);
    return {
      customers: customers.map(({ id, name, email }) => ({ id, name, email })),
      products: products.map(({ id, name, sku, unit_price }) => ({
        id,
        name,
        sku,
        unit_price,
      })),
    };
  } catch (error) {
    if (error instanceof AppError) return { error: publicErrorMessage(error) };
    throw error;
  }
}

export async function createOrderAction(input: unknown): Promise<CreateOrderResult> {
  const parsed = orderCreationSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    const orderId = await createOrder(workspace.id, parsed.data);
    revalidatePath("/orders");
    return { success: true, orderId };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOrderStatusAction(input: unknown): Promise<OrderMutationResult> {
  const parsed = orderIdInputSchema
    .extend({ status: orderStatusSchema })
    .safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await updateOrderStatus(workspace.id, parsed.data.orderId, parsed.data.status);
    revalidatePath("/orders");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
