import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CustomersManager } from "@/components/customers-manager";
import { listCustomers } from "@/lib/services/customers";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";
import type { CustomerListItem } from "@/app/actions/customers";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";

export const metadata = { title: "Customers" };
export const instant = false;

export default async function CustomersPage() {
  await connection();
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) redirect("/workspaces");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  const canManage = workspace.role === "owner" || workspace.role === "admin";
  let initialCustomers: CustomerListItem[] = [];
  let initialError = "";
  let initialHasMore = false;
  try {
    const customers = await listCustomers(workspace.id, { limit: 26, offset: 0 });
    initialHasMore = customers.length > 25;
    initialCustomers = customers.slice(0, 25).map((customer) => ({
      id: customer.id,
      name: customer.name,
      company_name: customer.company_name,
      email: customer.email,
      phone: customer.phone,
      address_line_1: customer.address_line_1,
      address_line_2: customer.address_line_2,
      city: customer.city,
      region: customer.region,
      postal_code: customer.postal_code,
      country_code: customer.country_code,
      created_at: customer.created_at,
      archived_at: customer.archived_at,
    }));
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    initialError = publicErrorMessage(error);
  }

  return (
    <CustomersManager
      canExport={workspace.role !== "viewer"}
      canManage={canManage}
      initialCustomers={initialCustomers}
      initialError={initialError}
      initialHasMore={initialHasMore}
      workspaceName={workspace.name}
    />
  );
}
