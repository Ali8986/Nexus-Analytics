import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  archiveProduct: vi.fn(),
  unarchiveProduct: vi.fn(),
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
vi.mock("@/lib/services/products", () => ({
  listProducts: mocks.listProducts,
  createProduct: mocks.createProduct,
  updateProduct: mocks.updateProduct,
  archiveProduct: mocks.archiveProduct,
  unarchiveProduct: mocks.unarchiveProduct,
}));

import {
  archiveProductAction,
  createProductAction,
  loadProducts,
  unarchiveProductAction,
  updateProductAction,
} from "@/app/actions/products";

const selectedWorkspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const productId = "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738";
const workspace = { id: selectedWorkspaceId, name: "Verified", role: "owner" };
const product = {
  id: productId,
  workspace_id: selectedWorkspaceId,
  name: "Desk Lamp",
  sku: "LAMP-001",
  description: "Adjustable LED lamp",
  unit_price: "49.9500",
  created_at: "2026-10-01T10:00:00.000Z",
  updated_at: "2026-10-01T10:00:00.000Z",
  archived_at: null,
};

describe("product server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(selectedWorkspaceId);
    mocks.resolveWorkspaceContext.mockResolvedValue(workspace);
    mocks.listProducts.mockResolvedValue([product]);
    mocks.createProduct.mockResolvedValue(productId);
    mocks.updateProduct.mockResolvedValue(productId);
    mocks.archiveProduct.mockResolvedValue(productId);
    mocks.unarchiveProduct.mockResolvedValue(productId);
  });

  it("lists products for the verified workspace with search, pagination, and archived filters", async () => {
    await expect(loadProducts({
      limit: 25,
      offset: 25,
      search: "LAMP",
      includeArchived: true,
      workspaceId: "untrusted-workspace",
    })).resolves.toMatchObject({
      products: [{ id: productId, sku: "LAMP-001", unit_price: "49.9500" }],
      hasMore: false,
    });

    expect(mocks.resolveWorkspaceContext).toHaveBeenCalledWith(selectedWorkspaceId);
    expect(mocks.listProducts).toHaveBeenCalledWith(selectedWorkspaceId, {
      limit: 26,
      offset: 25,
      search: "LAMP",
      includeArchived: true,
    });
  });

  it("rejects list access when no workspace is selected", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValue(null);

    await expect(loadProducts({ limit: 25, offset: 0 }))
      .resolves.toEqual({ error: "You do not have permission to perform this action." });
    expect(mocks.resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(mocks.listProducts).not.toHaveBeenCalled();
  });

  it("validates product prices and fields before resolving workspace context", async () => {
    await expect(createProductAction({
      name: "Desk Lamp",
      sku: "LAMP",
      unitPrice: "-1",
    })).resolves.toMatchObject({
      error: expect.any(String),
      fieldErrors: expect.any(Object),
    });
    expect(mocks.getSelectedWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it("creates, updates, archives, and restores using the selected workspace", async () => {
    const input = {
      name: "Desk Lamp",
      sku: "LAMP-001",
      unitPrice: "49.9500",
      description: "Adjustable LED lamp",
    };

    await expect(createProductAction(input)).resolves.toEqual({ success: true });
    await expect(updateProductAction({ ...input, productId }))
      .resolves.toEqual({ success: true });
    await expect(archiveProductAction({ productId })).resolves.toEqual({ success: true });
    await expect(unarchiveProductAction({ productId })).resolves.toEqual({ success: true });

    expect(mocks.createProduct).toHaveBeenCalledWith(selectedWorkspaceId, input);
    expect(mocks.updateProduct).toHaveBeenCalledWith(selectedWorkspaceId, {
      ...input,
      productId,
    });
    expect(mocks.archiveProduct).toHaveBeenCalledWith(selectedWorkspaceId, productId);
    expect(mocks.unarchiveProduct).toHaveBeenCalledWith(selectedWorkspaceId, productId);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(4);
  });

  it("validates restore input before resolving a workspace", async () => {
    await expect(unarchiveProductAction({ productId: "not-an-id" }))
      .resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.getSelectedWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.unarchiveProduct).not.toHaveBeenCalled();
  });

  it("returns safe authorization failures and propagates unexpected errors", async () => {
    mocks.createProduct.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(createProductAction({
      name: "Desk Lamp",
      sku: "LAMP-001",
      unitPrice: "49.9500",
    })).resolves.toEqual({
      error: "You do not have permission to perform this action.",
    });

    mocks.archiveProduct.mockRejectedValueOnce(new Error("unexpected failure"));
    await expect(archiveProductAction({ productId }))
      .rejects.toThrow("unexpected failure");
  });
});
