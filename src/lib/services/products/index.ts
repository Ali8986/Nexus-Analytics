import "server-only";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import {
  productListSchema,
  productIdInputSchema,
  productInputSchema,
  productUpdateSchema,
} from "@/lib/validation/schemas";
import {
  parseInput,
  parseRpcId,
  raiseDatabaseError,
  searchPattern,
} from "@/lib/services/shared";
import { requireWorkspaceRole } from "@/lib/workspaces/context";
import type { ProductRecord } from "@/lib/services/types";

export async function listProducts(
  workspaceId: string,
  input: { limit?: number; offset?: number; search?: string; includeArchived?: boolean } = {},
): Promise<ProductRecord[]> {
  const filters = parseInput(productListSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin", "analyst", "viewer"]);
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("name", { ascending: true })
    .range(filters.offset, filters.offset + filters.limit - 1);
  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.search) {
    const pattern = searchPattern(filters.search);
    query = query.or(`name.ilike.${pattern},sku.ilike.${pattern},description.ilike.${pattern}`);
  }
  const { data, error } = await query;
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function getProduct(workspaceId: string, productId: string): Promise<ProductRecord> {
  const id = parseInput(productIdInputSchema, { productId }).productId;
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin", "analyst", "viewer"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();
  if (error) raiseDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function createProduct(workspaceId: string, input: unknown): Promise<string> {
  const value = parseInput(productInputSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_product", {
    p_workspace_id: workspace.id,
    p_name: value.name,
    p_sku: value.sku,
    p_unit_price: value.unitPrice,
    p_description: value.description ?? null,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function updateProduct(workspaceId: string, input: unknown): Promise<string> {
  const value = parseInput(productUpdateSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_product", {
    p_workspace_id: workspace.id,
    p_product_id: value.productId,
    p_name: value.name,
    p_sku: value.sku,
    p_unit_price: value.unitPrice,
    p_description: value.description ?? null,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function archiveProduct(workspaceId: string, productId: string): Promise<string> {
  const id = parseInput(productIdInputSchema, { productId }).productId;
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_product", {
    p_workspace_id: workspace.id,
    p_product_id: id,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}
