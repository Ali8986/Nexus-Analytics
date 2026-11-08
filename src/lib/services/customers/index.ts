import "server-only";

import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import {
  customerIdInputSchema,
  customerInputSchema,
  customerListSchema,
  customerUpdateSchema,
} from "@/lib/validation/schemas";
import {
  parseInput,
  parseRpcId,
  raiseDatabaseError,
  searchPattern,
} from "@/lib/services/shared";
import { requireWorkspaceRole } from "@/lib/workspaces/context";
import type { CustomerRecord } from "@/lib/services/types";

export async function listCustomers(
  workspaceId: string,
  input: { limit?: number; offset?: number; search?: string; includeArchived?: boolean } = {},
): Promise<CustomerRecord[]> {
  const filters = parseInput(customerListSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin", "analyst", "viewer"]);
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("name", { ascending: true })
    .range(filters.offset, filters.offset + filters.limit - 1);

  if (!filters.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (filters.search) {
    const pattern = searchPattern(filters.search);
    query = query.or(
      `name.ilike.${pattern},company_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getCustomer(workspaceId: string, customerId: string): Promise<CustomerRecord> {
  const id = parseInput(customerIdInputSchema, { customerId }).customerId;
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin", "analyst", "viewer"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (error) raiseDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function createCustomer(workspaceId: string, input: unknown): Promise<string> {
  const value = parseInput(customerInputSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p_workspace_id: workspace.id,
    p_name: value.name,
    p_company_name: value.companyName ?? null,
    p_email: value.email ?? null,
    p_phone: value.phone ?? null,
    p_address_line_1: value.addressLine1 ?? null,
    p_address_line_2: value.addressLine2 ?? null,
    p_city: value.city ?? null,
    p_region: value.region ?? null,
    p_postal_code: value.postalCode ?? null,
    p_country_code: value.countryCode?.toUpperCase() ?? null,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function updateCustomer(workspaceId: string, input: unknown): Promise<string> {
  const value = parseInput(customerUpdateSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_customer", {
    p_workspace_id: workspace.id,
    p_customer_id: value.customerId,
    p_name: value.name,
    p_company_name: value.companyName ?? null,
    p_email: value.email ?? null,
    p_phone: value.phone ?? null,
    p_address_line_1: value.addressLine1 ?? null,
    p_address_line_2: value.addressLine2 ?? null,
    p_city: value.city ?? null,
    p_region: value.region ?? null,
    p_postal_code: value.postalCode ?? null,
    p_country_code: value.countryCode?.toUpperCase() ?? null,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function archiveCustomer(workspaceId: string, customerId: string): Promise<string> {
  const id = parseInput(customerIdInputSchema, { customerId }).customerId;
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_customer", {
    p_workspace_id: workspace.id,
    p_customer_id: id,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function unarchiveCustomer(workspaceId: string, customerId: string): Promise<string> {
  const id = parseInput(customerIdInputSchema, { customerId }).customerId;
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unarchive_customer", {
    p_workspace_id: workspace.id,
    p_customer_id: id,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}
