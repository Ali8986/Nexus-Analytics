"use server";

import { revalidatePath } from "next/cache";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import {
  archiveProduct,
  createProduct,
  listProducts,
  unarchiveProduct,
  updateProduct,
} from "@/lib/services/products";
import type { ProductRecord } from "@/lib/services/types";
import {
  productIdInputSchema,
  productInputSchema,
  productListSchema,
  productUpdateSchema,
} from "@/lib/validation/schemas";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export type ProductListItem = Pick<
  ProductRecord,
  "id" | "name" | "sku" | "description" | "unit_price" | "created_at" | "archived_at"
>;

export type ProductListResult =
  | { products: ProductListItem[]; hasMore: boolean }
  | { error: string };

export type ProductMutationResult =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> };

async function getSelectedWorkspace() {
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");
  return resolveWorkspaceContext(selectedWorkspaceId);
}

function firstValidationError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const issue = error.issues[0];
  if (!issue) return { error: "Review the product information and try again." };
  const field = issue.path[0];
  return {
    error: issue.message,
    fieldErrors:
      typeof field === "string" ? { [field]: issue.message } : undefined,
  };
}

function mutationError(error: unknown): ProductMutationResult {
  if (error instanceof AppError) {
    return { error: publicErrorMessage(error) };
  }
  throw error;
}

export async function loadProducts(input: unknown): Promise<ProductListResult> {
  const filters = productListSchema.safeParse(input);
  if (!filters.success) {
    return { error: filters.error.issues[0]?.message ?? "Choose valid product filters." };
  }

  try {
    const workspace = await getSelectedWorkspace();
    const fetchLimit = Math.min(filters.data.limit + 1, 100);
    const rows = await listProducts(workspace.id, {
      ...filters.data,
      limit: fetchLimit,
    });
    const products = rows.slice(0, filters.data.limit).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      unit_price: product.unit_price,
      created_at: product.created_at,
      archived_at: product.archived_at,
    }));
    return {
      products,
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

export async function createProductAction(
  input: unknown,
): Promise<ProductMutationResult> {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await createProduct(workspace.id, parsed.data);
    revalidatePath("/products");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function updateProductAction(
  input: unknown,
): Promise<ProductMutationResult> {
  const parsed = productUpdateSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await updateProduct(workspace.id, parsed.data);
    revalidatePath("/products");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function archiveProductAction(
  input: unknown,
): Promise<ProductMutationResult> {
  const parsed = productUpdateSchema.pick({ productId: true }).safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await archiveProduct(workspace.id, parsed.data.productId);
    revalidatePath("/products");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function unarchiveProductAction(
  input: unknown,
): Promise<ProductMutationResult> {
  const parsed = productIdInputSchema.safeParse(input);
  if (!parsed.success) return firstValidationError(parsed.error);

  try {
    const workspace = await getSelectedWorkspace();
    await unarchiveProduct(workspace.id, parsed.data.productId);
    revalidatePath("/products");
    return { success: true };
  } catch (error) {
    return mutationError(error);
  }
}
