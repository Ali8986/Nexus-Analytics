"use client";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  createOrderAction,
  loadOrderDetails,
  loadOrderOptions,
  loadOrders,
  updateOrderStatusAction,
} from "@/app/actions/orders";
import type {
  OrderCustomerOption,
  OrderDetail,
  OrderListItem,
  OrderProductOption,
} from "@/app/actions/orders";
import { Button, EmptyState, ErrorState, Surface } from "@/components/ui";
import { formatCurrency } from "@/lib/formatting";
import { getAllowedNextOrderStatuses, type MutableOrderStatus } from "@/lib/orders/status";
import { orderCreationSchema } from "@/lib/validation/schemas";

const pageSize = 25;
const orderStatuses = ["pending", "processing", "completed", "cancelled"] as const;

type OrderStatus = (typeof orderStatuses)[number];
type OrderLineInput = { productId: string; quantity: string };

function statusLabel(status: OrderStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function optionProductLabel(product: OrderProductOption): string {
  return `${product.name} · ${product.sku}`;
}

function CreateOrderDialog({
  currency,
  onClose,
  onCreated,
}: {
  currency: string;
  onClose: () => void;
  onCreated: (orderId: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [customers, setCustomers] = useState<OrderCustomerOption[]>([]);
  const [products, setProducts] = useState<OrderProductOption[]>([]);
  const [lines, setLines] = useState<OrderLineInput[]>([{ productId: "", quantity: "1" }]);
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    let active = true;
    void loadOrderOptions()
      .then((result) => {
        if (!active) return;
        if ("error" in result) {
          setMessage(result.error);
          return;
        }
        setCustomers(result.customers);
        setProducts(result.products);
      })
      .catch(() => {
        if (active) setMessage("Order options could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function close() {
    if (pending) return;
    dialogRef.current?.close();
    onClose();
  }

  function updateLine(index: number, patch: Partial<OrderLineInput>) {
    setLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    ));
    setMessage("");
  }

  const selectedProductIds = new Set(lines.map((line) => line.productId).filter(Boolean));
  const previewTotal = lines.reduce((total, line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    const quantity = Number(line.quantity);
    if (!product || !Number.isSafeInteger(quantity) || quantity <= 0) return total;
    return total + Number(product.unit_price) * quantity;
  }, 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = orderCreationSchema.safeParse({
      idempotencyKey: idempotencyKeyRef.current ?? crypto.randomUUID(),
      customerId: customerId || null,
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
      })),
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Add valid products and quantities.");
      return;
    }

    idempotencyKeyRef.current = parsed.data.idempotencyKey;
    setPending(true);
    setMessage("");
    try {
      const result = await createOrderAction(parsed.data);
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      if (!result.orderId) {
        throw new Error("Order creation did not return an order identifier.");
      }
      idempotencyKeyRef.current = null;
      await onCreated(result.orderId);
      dialogRef.current?.close();
      onClose();
    } catch {
      setMessage("The order could not be created. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      aria-labelledby="create-order-title"
      className="customer-dialog order-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      ref={dialogRef}
    >
      <Surface className="customer-dialog-card">
        <div className="customer-dialog-heading">
          <div>
            <p className="auth-eyebrow">NEW ORDER</p>
            <h2 id="create-order-title">Create an order</h2>
            <p className="auth-description">Prices and totals are saved by the workspace database.</p>
          </div>
          <button aria-label="Close dialog" className="icon-button" disabled={pending} onClick={close} type="button">
            <X size={17} />
          </button>
        </div>
        {optionsLoading ? (
          <div aria-busy="true" className="customers-loading" role="status">Loading customers and products…</div>
        ) : products.length === 0 ? (
          <EmptyState
            description="Add an active product to this workspace before creating an order."
            title="No active products available"
          />
        ) : (
          <form className="customer-form" noValidate onSubmit={(event) => void submit(event)}>
            <label className="customer-form-field">
              <span>Customer (optional)</span>
              <select
                disabled={pending}
                onChange={(event) => setCustomerId(event.target.value)}
                value={customerId}
              >
                <option value="">No customer selected</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.email ? ` · ${customer.email}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="order-line-list">
              <div className="order-line-heading">
                <strong>Items</strong>
                <span>Choose each product once</span>
              </div>
              {lines.map((line, index) => {
                const availableProducts = products.filter(
                  (product) => product.id === line.productId || !selectedProductIds.has(product.id),
                );
                const selectedProduct = products.find((product) => product.id === line.productId);
                return (
                  <div className="order-line-input" key={index}>
                    <label className="customer-form-field">
                      <span>Product</span>
                      <select
                        disabled={pending}
                        onChange={(event) => updateLine(index, { productId: event.target.value })}
                        required
                        value={line.productId}
                      >
                        <option value="">Select a product</option>
                        {availableProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {optionProductLabel(product)} · {formatCurrency(Number(product.unit_price), currency, 2)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="customer-form-field order-quantity-field">
                      <span>Quantity</span>
                      <input
                        disabled={pending}
                        inputMode="numeric"
                        max="2147483647"
                        min="1"
                        onChange={(event) => updateLine(index, { quantity: event.target.value })}
                        required
                        type="number"
                        value={line.quantity}
                      />
                    </label>
                    <span className="order-line-preview">
                      {selectedProduct
                        ? formatCurrency(Number(selectedProduct.unit_price) * Number(line.quantity), currency, 2)
                        : "—"}
                    </span>
                    <button
                      aria-label={`Remove item ${index + 1}`}
                      className="icon-button"
                      disabled={pending || lines.length === 1}
                      onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                      type="button"
                    >
                      <X size={15} />
                    </button>
                  </div>
                );
              })}
              <Button
                disabled={pending || lines.length >= 100 || selectedProductIds.size >= products.length}
                onClick={() => setLines((current) => [...current, { productId: "", quantity: "1" }])}
                size="small"
                type="button"
              >
                <Plus size={14} /> Add item
              </Button>
            </div>

            <div className="order-preview-total">
              <span>Estimated total</span>
              <strong>{formatCurrency(previewTotal, currency, 2)}</strong>
              <small>Final total is calculated from saved product price snapshots.</small>
            </div>
            {message ? <p className="customer-form-message" role="alert">{message}</p> : null}
            <div className="customer-dialog-actions">
              <Button disabled={pending} onClick={close} type="button">Cancel</Button>
              <Button disabled={pending || optionsLoading} type="submit" variant="primary">
                {pending ? "Creating…" : "Create order"}
              </Button>
            </div>
          </form>
        )}
        {message && products.length === 0 && !optionsLoading ? (
          <p className="customer-form-message" role="alert">{message}</p>
        ) : null}
      </Surface>
    </dialog>
  );
}

function OrderDetailDialog({
  canManage,
  currency,
  orderId,
  timezone,
  onClose,
  onChanged,
}: {
  canManage: boolean;
  currency: string;
  orderId: string;
  timezone: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingStatus, setPendingStatus] = useState<MutableOrderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    let active = true;
    void loadOrderDetails({ orderId })
      .then((result) => {
        if (!active) return;
        if ("error" in result) setMessage(result.error);
        else setOrder(result);
      })
      .catch(() => {
        if (active) setMessage("Order details could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  function close() {
    if (busy) return;
    dialogRef.current?.close();
    onClose();
  }

  async function confirmStatusChange() {
    if (!order || !pendingStatus) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await updateOrderStatusAction({
        orderId: order.id,
        status: pendingStatus,
      });
      if ("error" in result) {
        setMessage(result.error);
        setPendingStatus(null);
        return;
      }
      const refreshed = await loadOrderDetails({ orderId: order.id });
      if ("error" in refreshed) {
        setMessage(refreshed.error);
      } else {
        setOrder(refreshed);
        setMessage(`Order marked ${statusLabel(pendingStatus).toLowerCase()}.`);
        setPendingStatus(null);
      }
      await onChanged();
    } catch {
      setMessage("The order status could not be changed. Please try again.");
      setPendingStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      aria-labelledby="order-detail-title"
      className="customer-dialog order-dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      ref={dialogRef}
    >
      <Surface className="customer-dialog-card">
        <div className="customer-dialog-heading">
          <div>
            <p className="auth-eyebrow">ORDER DETAILS</p>
            <h2 id="order-detail-title">{order ? `Order #${order.id.slice(0, 8).toUpperCase()}` : "Order details"}</h2>
          </div>
          <button aria-label="Close order details" className="icon-button" disabled={busy} onClick={close} type="button">
            <X size={17} />
          </button>
        </div>
        {loading ? (
          <div aria-busy="true" className="customers-loading" role="status">Loading saved order details…</div>
        ) : order ? (
          <>
            <div className="order-detail-summary">
              <div><span>Customer</span><strong>{order.customer_name || "No customer"}</strong></div>
              <div><span>Placed</span><strong>{formatDate(order.created_at, timezone)}</strong></div>
              <div><span>Status</span><strong className={`order-status order-status-${order.status}`}>{statusLabel(order.status)}</strong></div>
            </div>
            <div className="table-scroll">
              <table className="data-table order-items-table">
                <thead>
                  <tr><th scope="col">Product snapshot</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.product_name}</strong><small>{item.product_sku}</small></td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(Number(item.unit_price), order.currency_code || currency, 2)}</td>
                      <td className="table-amount">{formatCurrency(Number(item.line_total), order.currency_code || currency, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="order-totals">
              <div><span>Subtotal</span><strong>{formatCurrency(Number(order.subtotal), order.currency_code || currency, 2)}</strong></div>
              <div><span>Total</span><strong>{formatCurrency(Number(order.total), order.currency_code || currency, 2)}</strong></div>
            </div>
            {canManage && getAllowedNextOrderStatuses(order.status).length ? (
              <div className="order-status-actions">
                <span>Update status</span>
                {getAllowedNextOrderStatuses(order.status).map((status) => (
                  <Button
                    disabled={busy}
                    key={status}
                    onClick={() => setPendingStatus(status)}
                    size="small"
                    variant={status === "cancelled" ? undefined : "primary"}
                  >
                    {status === "processing" ? "Start processing" : status === "completed" ? "Mark completed" : "Cancel order"}
                  </Button>
                ))}
              </div>
            ) : null}
            {pendingStatus ? (
              <div aria-labelledby="confirm-order-status" className="order-status-confirm" role="alertdialog">
                <strong id="confirm-order-status">Change status to {statusLabel(pendingStatus)}?</strong>
                <p>This action is recorded in the workspace audit log and cannot be reversed.</p>
                <div>
                  <Button disabled={busy} onClick={() => setPendingStatus(null)} size="small" type="button">Keep current status</Button>
                  <Button disabled={busy} onClick={() => void confirmStatusChange()} size="small" type="button" variant="primary">
                    {busy ? "Updating…" : "Confirm status"}
                  </Button>
                </div>
              </div>
            ) : null}
            {message ? <p className="customer-form-message" role={message.startsWith("Order marked") ? "status" : "alert"}>{message}</p> : null}
          </>
        ) : (
          <ErrorState description={message || "This order is not available in the selected workspace."} title="Order unavailable" />
        )}
        <div className="customer-dialog-actions">
          <Button disabled={busy} onClick={close} type="button">Close</Button>
        </div>
      </Surface>
    </dialog>
  );
}

export function OrdersManager({
  canExport,
  canManage,
  currency,
  initialError,
  initialHasMore,
  initialOrders,
  workspaceName,
  workspaceTimezone,
}: {
  canExport: boolean;
  canManage: boolean;
  currency: string;
  initialError: string;
  initialHasMore: boolean;
  initialOrders: OrderListItem[];
  workspaceName: string;
  workspaceTimezone: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [error, setError] = useState(initialError);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  async function refreshList(options?: { status?: OrderStatus | "all"; nextOffset?: number }) {
    const status = options?.status ?? statusFilter;
    const nextOffset = options?.nextOffset ?? offset;
    setError("");
    setPending(true);
    try {
      const result = await loadOrders({
        limit: pageSize,
        offset: nextOffset,
        status: status === "all" ? undefined : status,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOrders(result.orders);
      setHasMore(result.hasMore);
      setSuccessMessage("");
    } catch {
      setError("Orders could not be loaded. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function onOrderCreated(orderId: string) {
    setCreating(false);
    setStatusFilter("all");
    setOffset(0);
    await refreshList({ status: "all", nextOffset: 0 });
    setSuccessMessage("Order created. Its saved totals are shown in the order details.");
    setDetailOrderId(orderId);
  }

  return (
    <div className="customers-page">
      <div className="customers-page-heading">
        <div>
          <p className="eyebrow">WORKSPACE ACTIVITY</p>
          <h1>Orders</h1>
          <p>Review and manage orders in {workspaceName}.</p>
        </div>
        <div className="customers-heading-actions">
          {canExport ? <ExportCsvButton endpoint="/api/exports/orders" /> : null}
          {canManage ? (
            <Button onClick={() => setCreating(true)} variant="primary">
              <Plus size={16} /> Create order
            </Button>
          ) : null}
        </div>
      </div>

      <Surface className="customers-surface">
        <div className="customers-toolbar orders-toolbar">
          <label className="customers-archived-toggle order-status-filter">
            <span>Filter by status</span>
            <select
              disabled={pending}
              onChange={(event) => {
                const status = event.target.value as OrderStatus | "all";
                setStatusFilter(status);
                setOffset(0);
                void refreshList({ status, nextOffset: 0 });
              }}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
          </label>
        </div>

        {successMessage ? <p className="customers-success-message" role="status">{successMessage}</p> : null}
        {error ? (
          <ErrorState description={error} onRetry={() => void refreshList()} title="Orders couldn’t be loaded" />
        ) : pending ? (
          <div aria-busy="true" className="customers-loading" role="status">Loading orders…</div>
        ) : orders.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table orders-table">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Date</th>
                    <th scope="col">Items</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td><strong className="order-number">#{order.id.slice(0, 8).toUpperCase()}</strong></td>
                      <td>{order.customer_name || <span className="customers-muted">No customer</span>}</td>
                      <td className="table-date">{formatDate(order.created_at, workspaceTimezone)}</td>
                      <td>{order.item_count}</td>
                      <td className="table-amount">{formatCurrency(Number(order.total), order.currency_code || currency, 2)}</td>
                      <td><span className={`order-status order-status-${order.status}`}>{statusLabel(order.status)}</span></td>
                      <td>
                        <Button
                          aria-label={`View order ${order.id.slice(0, 8)}`}
                          onClick={() => setDetailOrderId(order.id)}
                          size="small"
                        >
                          <ClipboardList size={14} /> Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="customers-pagination">
              <span>Showing {offset + 1}–{offset + orders.length}</span>
              <div>
                <Button
                  disabled={pending || offset === 0}
                  onClick={() => {
                    const nextOffset = Math.max(0, offset - pageSize);
                    setOffset(nextOffset);
                    void refreshList({ nextOffset });
                  }}
                  size="small"
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <Button
                  disabled={pending || !hasMore}
                  onClick={() => {
                    const nextOffset = offset + pageSize;
                    setOffset(nextOffset);
                    void refreshList({ nextOffset });
                  }}
                  size="small"
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            action={canManage ? (
              <Button onClick={() => setCreating(true)} variant="primary">
                <ShoppingBag size={15} /> Create order
              </Button>
            ) : undefined}
            description={statusFilter === "all"
              ? "Orders created in this workspace will appear here."
              : `No ${statusFilter} orders were found.`}
            title={statusFilter === "all" ? "No orders yet" : "No matching orders"}
          />
        )}
      </Surface>

      {creating ? (
        <CreateOrderDialog
          currency={currency}
          onClose={() => setCreating(false)}
          onCreated={onOrderCreated}
        />
      ) : null}
      {detailOrderId ? (
        <OrderDetailDialog
          canManage={canManage}
          currency={currency}
          onChanged={() => refreshList()}
          onClose={() => setDetailOrderId(null)}
          orderId={detailOrderId}
          timezone={workspaceTimezone}
        />
      ) : null}
    </div>
  );
}
