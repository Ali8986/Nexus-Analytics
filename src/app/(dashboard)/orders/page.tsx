import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { OrderListItem } from "@/app/actions/orders";
import { OrdersManager } from "@/components/orders-manager";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import { listOrders } from "@/lib/services/orders";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export const metadata = { title: "Orders" };
export const instant = false;

export default async function OrdersPage() {
  await connection();
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) redirect("/workspaces");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  let initialOrders: OrderListItem[] = [];
  let initialError = "";
  let initialHasMore = false;
  try {
    const orders = await listOrders(workspace.id, { limit: 26, offset: 0 });
    initialHasMore = orders.length > 25;
    initialOrders = orders.slice(0, 25).map((order) => ({
      id: order.id,
      customer_id: order.customer_id,
      customer_name: order.customer_name,
      status: order.status,
      currency_code: order.currency_code,
      subtotal: order.subtotal,
      total: order.total,
      created_at: order.created_at,
      item_count: order.item_count,
    }));
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    initialError = publicErrorMessage(error);
  }

  return (
    <OrdersManager
      canExport={workspace.role !== "viewer"}
      canManage={workspace.role === "owner" || workspace.role === "admin"}
      currency={workspace.reportingCurrency}
      initialError={initialError}
      initialHasMore={initialHasMore}
      initialOrders={initialOrders}
      workspaceName={workspace.name}
      workspaceTimezone={workspace.reportingTimezone}
    />
  );
}
