"use server";

import { revalidatePath } from "next/cache";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import {
  archiveCustomer,
  createCustomer,
  listCustomers,
  unarchiveCustomer,
  updateCustomer,
} from "@/lib/services/customers";
import type { CustomerRecord } from "@/lib/services/types";
import {
  customerIdInputSchema,
  customerInputSchema,
  customerListSchema,
  customerUpdateSchema,
} from "@/lib/validation/schemas";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export type CustomerListItem = Pick<
  CustomerRecord,
  | "id"
  | "name"
  | "company_name"
  | "email"
  | "phone"
  | "address_line_1"
  | "address_line_2"
  | "city"
  | "region"
  | "postal_code"
  | "country_code"
  | "created_at"
  | "archived_at"
>;

export type CustomerListResult =
  | { customers: CustomerListItem[]; hasMore: boolean }
  | { error: string };

export type CustomerMutationResult =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> };

async function getSelectedWorkspace() {
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");
  return resolveWorkspaceContext(selectedWorkspaceId);
}

function firstValidationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const issue = error.issues[0];
  if (!issue) return { error: "Review the customer information and try again." };
  const field = issue.path[0];
  return {
    error: issue.message,
    fieldErrors:
      typeof field === "string" ? { [field]: issue.message } : undefined,
  };
}

function mutationError(error: unknown): CustomerMutationResult {
  if (error instanceof AppError) {
    return { error: publicErrorMessage(error) };
  }
  throw error;
}

export async function loadCustomers(input: unknown): Promise<CustomerListResult> {
  const filters = customerListSchema.safeParse(input);
  if (!filters.success) {
    return { error: filters.error.issues[0]?.message ?? "Choose valid customer filters." };
  }

  try {
    const workspace = await getSelectedWorkspace();
    const fetchLimit = Math.min(filters.data.limit + 1, 100);
    const rows = await listCustomers(workspace.id, {
      ...filters.data,
      limit: fetchLimit,
    });
    const customers = rows.slice(0, filters.data.limit).map((customer) => ({
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
    return {
      customers,
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

export async function createCustomerAction(
  input: unknown,
): Promise<CustomerMutationResult> {
  const parsed = customerInputSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await createCustomer(workspace.id, parsed.data);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function updateCustomerAction(
  input: unknown,
): Promise<CustomerMutationResult> {
  const parsed = customerUpdateSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await updateCustomer(workspace.id, parsed.data);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function archiveCustomerAction(
  input: unknown,
): Promise<CustomerMutationResult> {
  const parsed = customerUpdateSchema.pick({ customerId: true }).safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await archiveCustomer(workspace.id, parsed.data.customerId);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function unarchiveCustomerAction(
  input: unknown,
): Promise<CustomerMutationResult> {
  const parsed = customerIdInputSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await unarchiveCustomer(workspace.id, parsed.data.customerId);
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}
