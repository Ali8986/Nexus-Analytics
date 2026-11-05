import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  archiveCustomer: vi.fn(),
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
vi.mock("@/lib/services/customers", () => ({
  listCustomers: mocks.listCustomers,
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  archiveCustomer: mocks.archiveCustomer,
}));

import {
  archiveCustomerAction,
  createCustomerAction,
  loadCustomers,
  updateCustomerAction,
} from "@/app/actions/customers";

const selectedWorkspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const customerId = "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738";
const workspace = { id: selectedWorkspaceId, name: "Verified", role: "owner" };
const customer = {
  id: customerId,
  workspace_id: selectedWorkspaceId,
  name: "Avery Smith",
  company_name: "Northwind",
  email: "avery@example.test",
  phone: null,
  address_line_1: "1 Main Street",
  address_line_2: null,
  city: "Seattle",
  region: "WA",
  postal_code: "98101",
  country_code: "US",
  created_at: "2026-10-01T10:00:00.000Z",
  updated_at: "2026-10-01T10:00:00.000Z",
  archived_at: null,
};

describe("customer server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(selectedWorkspaceId);
    mocks.resolveWorkspaceContext.mockResolvedValue(workspace);
    mocks.listCustomers.mockResolvedValue([customer]);
    mocks.createCustomer.mockResolvedValue(customerId);
    mocks.updateCustomer.mockResolvedValue(customerId);
    mocks.archiveCustomer.mockResolvedValue(customerId);
  });

  it("loads a bounded customer page only for the verified selected workspace", async () => {
    await expect(loadCustomers({
      limit: 25,
      offset: 25,
      search: "Avery",
      includeArchived: true,
      workspaceId: "untrusted-workspace",
    })).resolves.toMatchObject({
      customers: [{ id: customerId, name: "Avery Smith" }],
      hasMore: false,
    });

    expect(mocks.resolveWorkspaceContext).toHaveBeenCalledWith(selectedWorkspaceId);
    expect(mocks.listCustomers).toHaveBeenCalledWith(selectedWorkspaceId, {
      limit: 26,
      offset: 25,
      search: "Avery",
      includeArchived: true,
    });
  });

  it("does not list data if no workspace is selected", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValue(null);

    await expect(loadCustomers({ limit: 25, offset: 0 }))
      .resolves.toEqual({ error: "You do not have permission to perform this action." });
    expect(mocks.resolveWorkspaceContext).not.toHaveBeenCalled();
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });

  it("validates create input before resolving a workspace", async () => {
    await expect(createCustomerAction({ name: "", email: "invalid" }))
      .resolves.toMatchObject({ error: expect.any(String), fieldErrors: expect.any(Object) });
    expect(mocks.getSelectedWorkspaceId).not.toHaveBeenCalled();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it("creates, updates, and archives using the selected workspace context", async () => {
    const input = {
      name: "Avery Smith",
      companyName: "Northwind",
      email: "avery@example.test",
      phone: null,
      addressLine1: "1 Main Street",
      addressLine2: null,
      city: "Seattle",
      region: "WA",
      postalCode: "98101",
      countryCode: "US",
    };

    await expect(createCustomerAction(input)).resolves.toEqual({ success: true });
    await expect(updateCustomerAction({ ...input, customerId }))
      .resolves.toEqual({ success: true });
    await expect(archiveCustomerAction({ customerId })).resolves.toEqual({ success: true });

    expect(mocks.createCustomer).toHaveBeenCalledWith(selectedWorkspaceId, input);
    expect(mocks.updateCustomer).toHaveBeenCalledWith(selectedWorkspaceId, {
      ...input,
      customerId,
    });
    expect(mocks.archiveCustomer).toHaveBeenCalledWith(selectedWorkspaceId, customerId);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it("returns safe authorization errors and does not hide unexpected failures", async () => {
    mocks.createCustomer.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(createCustomerAction({ name: "Avery Smith" }))
      .resolves.toEqual({
        error: "You do not have permission to perform this action.",
      });

    mocks.archiveCustomer.mockRejectedValueOnce(new Error("unexpected failure"));
    await expect(archiveCustomerAction({ customerId }))
      .rejects.toThrow("unexpected failure");
  });
});
