import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
  listProducts: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/workspaces/selection", () => ({
  getSelectedWorkspaceId: mocks.getSelectedWorkspaceId,
}));
vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspaceContext: mocks.resolveWorkspaceContext,
}));
vi.mock("@/lib/services/orders", () => ({
  listOrders: mocks.listOrders,
  getOrder: mocks.getOrder,
  createOrder: mocks.createOrder,
  updateOrderStatus: mocks.updateOrderStatus,
}));
vi.mock("@/lib/services/customers", () => ({
  getCustomer: mocks.getCustomer,
  listCustomers: mocks.listCustomers,
}));
vi.mock("@/lib/services/products", () => ({
  listProducts: mocks.listProducts,
}));

import {
  createOrderAction,
  loadOrderDetails,
  loadOrderOptions,
  loadOrders,
  updateOrderStatusAction,
} from "@/app/actions/orders";
import { getAllowedNextOrderStatuses } from "@/lib/orders/status";

const workspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const orderId = "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738";
const firstProductId = "985e76d2-e02a-4f66-9a78-c920be84d9ed";
const secondProductId = "bb235bd8-2f30-4652-96a1-191fe8dc5b97";
const customerId = "28993f46-13b4-40e8-92a3-5fc1cebfac25";
const workspace = { id: workspaceId, name: "Verified", role: "owner" };

const order = {
  id: orderId,
  workspace_id: workspaceId,
  customer_id: customerId,
  customer_name: "Avery Smith",
  status: "pending" as const,
  currency_code: "USD",
  subtotal: "151.2300",
  total: "151.2300",
  created_at: "2026-11-04T10:00:00.000Z",
  updated_at: "2026-11-04T10:00:00.000Z",
  item_count: 2,
};

const details = {
  ...order,
  items: [
    {
      id: "4362607d-5b58-4c85-8f20-8c008a18c58c",
      order_id: orderId,
      product_id: firstProductId,
      product_name: "Desk Lamp Snapshot",
      product_sku: "LAMP-1",
      unit_price: "50.4100",
      quantity: 2,
      line_total: "100.8200",
      created_at: "2026-11-04T10:00:00.000Z",
    },
    {
      id: "36ce990b-5d4c-44bd-8dd5-4f026d76933b",
      order_id: orderId,
      product_id: secondProductId,
      product_name: "Notebook Snapshot",
      product_sku: "BOOK-2",
      unit_price: "50.4100",
      quantity: 1,
      line_total: "50.4100",
      created_at: "2026-11-04T10:00:01.000Z",
    },
  ],
};

describe("order server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.resolveWorkspaceContext.mockResolvedValue(workspace);
    mocks.listOrders.mockResolvedValue([order]);
    mocks.getOrder.mockResolvedValue(details);
    mocks.getCustomer.mockResolvedValue({ id: customerId, name: "Avery Smith" });
    mocks.listCustomers.mockResolvedValue([{ id: customerId, name: "Avery Smith", email: null }]);
    mocks.listProducts.mockResolvedValue([
      { id: firstProductId, name: "Desk Lamp", sku: "LAMP-1", unit_price: "50.4100" },
    ]);
    mocks.createOrder.mockResolvedValue(orderId);
    mocks.updateOrderStatus.mockResolvedValue(orderId);
  });

  it("loads filtered and paginated orders only for the verified selected workspace", async () => {
    await expect(loadOrders({
      status: "processing",
      limit: 25,
      offset: 25,
      workspaceId: "untrusted-workspace",
    })).resolves.toMatchObject({
      orders: [{ id: orderId, customer_name: "Avery Smith", item_count: 2 }],
      hasMore: false,
    });

    expect(mocks.resolveWorkspaceContext).toHaveBeenCalledWith(workspaceId);
    expect(mocks.listOrders).toHaveBeenCalledWith(workspaceId, {
      status: "processing",
      limit: 26,
      offset: 25,
    });
  });

  it("returns an error without querying orders when no workspace is selected", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValue(null);
    await expect(loadOrders({ limit: 25, offset: 0 })).resolves.toEqual({
      error: "You do not have permission to perform this action.",
    });
    expect(mocks.listOrders).not.toHaveBeenCalled();
  });

  it("loads active customer and product choices from the verified workspace", async () => {
    await expect(loadOrderOptions()).resolves.toEqual({
      customers: [{ id: customerId, name: "Avery Smith", email: null }],
      products: [{ id: firstProductId, name: "Desk Lamp", sku: "LAMP-1", unit_price: "50.4100" }],
    });
    expect(mocks.listCustomers).toHaveBeenCalledWith(workspaceId, { limit: 100 });
    expect(mocks.listProducts).toHaveBeenCalledWith(workspaceId, { limit: 100 });
  });

  it("creates orders with multiple validated line items and the selected workspace", async () => {
    await expect(createOrderAction({
      idempotencyKey: "create-order-1",
      customerId,
      items: [
        { productId: firstProductId, quantity: 2 },
        { productId: secondProductId, quantity: 1 },
      ],
    })).resolves.toEqual({ success: true, orderId });

    expect(mocks.createOrder).toHaveBeenCalledWith(workspaceId, {
      idempotencyKey: "create-order-1",
      customerId,
      items: [
        { productId: firstProductId, quantity: 2 },
        { productId: secondProductId, quantity: 1 },
      ],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
  });

  it("rejects invalid quantities before workspace resolution or service calls", async () => {
    await expect(createOrderAction({
      idempotencyKey: "invalid-quantity",
      items: [{ productId: firstProductId, quantity: 0 }],
    })).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.getSelectedWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("passes the database-saved total and product snapshots through unchanged", async () => {
    const result = await loadOrderDetails({ orderId });
    expect(result).toMatchObject({
      id: orderId,
      subtotal: "151.2300",
      total: "151.2300",
      items: [
        { product_name: "Desk Lamp Snapshot", unit_price: "50.4100", line_total: "100.8200" },
        { product_name: "Notebook Snapshot", unit_price: "50.4100", line_total: "50.4100" },
      ],
    });
    expect(mocks.getOrder).toHaveBeenCalledWith(workspaceId, orderId);
  });

  it("accepts only permitted requested statuses and leaves transition authority to the service", async () => {
    await expect(updateOrderStatusAction({ orderId, status: "processing" }))
      .resolves.toEqual({ success: true });
    expect(mocks.updateOrderStatus).toHaveBeenCalledWith(workspaceId, orderId, "processing");
    await expect(updateOrderStatusAction({ orderId, status: "pending" }))
      .resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.updateOrderStatus).toHaveBeenCalledTimes(1);

    mocks.updateOrderStatus.mockRejectedValueOnce(new AppError("INVALID_STATE"));
    await expect(updateOrderStatusAction({ orderId, status: "cancelled" }))
      .resolves.toMatchObject({ error: expect.any(String) });
  });

  it("matches the existing state-machine transitions and keeps terminal states closed", () => {
    expect(getAllowedNextOrderStatuses("pending")).toEqual(["processing", "cancelled"]);
    expect(getAllowedNextOrderStatuses("processing")).toEqual(["completed", "cancelled"]);
    expect(getAllowedNextOrderStatuses("completed")).toEqual([]);
    expect(getAllowedNextOrderStatuses("cancelled")).toEqual([]);
  });
});
