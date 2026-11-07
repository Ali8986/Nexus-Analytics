import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDetail, OrderListItem } from "@/app/actions/orders";

const actionMocks = vi.hoisted(() => ({
  createOrderAction: vi.fn(),
  loadOrderDetails: vi.fn(),
  loadOrderOptions: vi.fn(),
  loadOrders: vi.fn(),
  updateOrderStatusAction: vi.fn(),
}));

vi.mock("@/app/actions/orders", () => actionMocks);

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLDialogElement: { configurable: true, value: dom.window.HTMLDialogElement },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});

const orderId = "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738";
const listOrder: OrderListItem = {
  id: orderId,
  customer_id: null,
  customer_name: "Avery Smith",
  status: "processing",
  currency_code: "USD",
  subtotal: "50.00",
  total: "50.00",
  created_at: "2026-11-04T10:00:00.000Z",
  item_count: 1,
};
const orderDetails: OrderDetail = {
  ...listOrder,
  items: [{
    id: "4362607d-5b58-4c85-8f20-8c008a18c58c",
    product_name: "Desk Lamp",
    product_sku: "LAMP-1",
    unit_price: "50.00",
    quantity: 1,
    line_total: "50.00",
  }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("order status confirmation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    actionMocks.loadOrderDetails.mockResolvedValue(orderDetails);
    actionMocks.loadOrders.mockResolvedValue({ orders: [listOrder], hasMore: false });
    actionMocks.loadOrderOptions.mockResolvedValue({ customers: [], products: [] });

    dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    dom.window.HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const { OrdersManager } = await import("@/components/orders-manager");
    await act(async () => {
      root.render(createElement(OrdersManager, {
        canExport: false,
        canManage: true,
        currency: "USD",
        initialError: "",
        initialHasMore: false,
        initialOrders: [listOrder],
        workspaceName: "Test Workspace",
        workspaceTimezone: "UTC",
      }));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function openConfirmation() {
    const detailsButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="View order ${orderId.slice(0, 8)}"]`,
    );
    expect(detailsButton).not.toBeNull();
    await act(async () => detailsButton?.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const detailDialog = container.querySelector<HTMLDialogElement>(
      "dialog[aria-labelledby='order-detail-title']",
    );
    expect(detailDialog?.open).toBe(true);
    const markCompletedButton = [...detailDialog!.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Mark completed"));
    expect(markCompletedButton).toBeDefined();
    await act(async () => markCompletedButton?.click());

    const confirmationDialog = container.querySelector<HTMLDialogElement>(
      "dialog[aria-labelledby='confirm-order-status-title']",
    );
    expect(confirmationDialog?.open).toBe(true);
    const confirmButton = [...confirmationDialog!.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Confirm status"));
    expect(confirmButton).toBeDefined();
    return { confirmationDialog: confirmationDialog!, confirmButton: confirmButton! };
  }

  it("holds the dialog open while pending and ignores repeated submissions", async () => {
    const result = deferred<{ success: true }>();
    actionMocks.updateOrderStatusAction.mockReturnValue(result.promise);
    const { confirmationDialog, confirmButton } = await openConfirmation();

    await act(async () => {
      confirmButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      confirmButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(actionMocks.updateOrderStatusAction).toHaveBeenCalledTimes(1);
    expect(actionMocks.updateOrderStatusAction).toHaveBeenCalledWith({
      orderId,
      status: "completed",
    });
    expect(confirmationDialog.open).toBe(true);
    expect(confirmButton.textContent).toContain("Updating");
    expect(confirmButton.disabled).toBe(true);

    await act(async () => {
      result.resolve({ success: true });
      await result.promise;
    });

    expect(confirmationDialog.open).toBe(false);
    expect(container.textContent).toContain("Order marked completed.");
    expect(container.querySelector(".orders-table tbody")?.textContent).toContain("Completed");
    expect(container.querySelector(".orders-table tbody")?.textContent).not.toContain("Processing");
  });

  it("searches visible order references and customer names on the loaded page", async () => {
    const { filterOrdersForSearch } = await import("@/components/orders-manager");
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search orders on this page"]',
    );
    expect(search).not.toBeNull();
    expect(filterOrdersForSearch([listOrder], "avery")).toEqual([listOrder]);
    expect(filterOrdersForSearch([listOrder], orderId.slice(0, 8).toUpperCase())).toEqual([listOrder]);
    expect(filterOrdersForSearch([listOrder], "no matching order")).toEqual([]);
    expect(filterOrdersForSearch([listOrder], " ")).toEqual([listOrder]);
    expect(actionMocks.loadOrders).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with a retryable error after a failed response", async () => {
    actionMocks.updateOrderStatusAction.mockResolvedValueOnce({
      error: "The order status could not be changed. Please try again.",
    });
    const { confirmationDialog, confirmButton } = await openConfirmation();

    await act(async () => confirmButton.click());

    expect(actionMocks.updateOrderStatusAction).toHaveBeenCalledTimes(1);
    expect(confirmationDialog.open).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The order status could not be changed. Please try again.",
    );
    expect(confirmButton.disabled).toBe(false);
    expect(confirmButton.textContent).toContain("Confirm status");

    actionMocks.updateOrderStatusAction.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => confirmButton.click());

    expect(actionMocks.updateOrderStatusAction).toHaveBeenCalledTimes(2);
    expect(confirmationDialog.open).toBe(true);
    expect(confirmButton.disabled).toBe(true);
    expect(confirmButton.textContent).toContain("Updating");
  });
});
