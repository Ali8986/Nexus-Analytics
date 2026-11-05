import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ProductListItem } from "@/app/actions/products";
import { ProductsManager } from "@/components/products-manager";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import { listProducts } from "@/lib/services/products";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export const metadata = { title: "Products" };
export const instant = false;

export default async function ProductsPage() {
  await connection();
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) redirect("/workspaces");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  const canManage = workspace.role === "owner" || workspace.role === "admin";
  let initialProducts: ProductListItem[] = [];
  let initialError = "";
  let initialHasMore = false;
  try {
    const products = await listProducts(workspace.id, { limit: 26, offset: 0 });
    initialHasMore = products.length > 25;
    initialProducts = products.slice(0, 25).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      unit_price: product.unit_price,
      created_at: product.created_at,
      archived_at: product.archived_at,
    }));
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    initialError = publicErrorMessage(error);
  }

  return (
    <ProductsManager
      canExport={workspace.role !== "viewer"}
      canManage={canManage}
      currency={workspace.reportingCurrency}
      initialError={initialError}
      initialHasMore={initialHasMore}
      initialProducts={initialProducts}
      workspaceName={workspace.name}
    />
  );
}
