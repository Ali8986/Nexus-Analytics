import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { AppError, mapDatabaseError, publicErrorMessage } from "@/lib/errors/app-error";
import { customerInputSchema, productInputSchema, orderCreationSchema } from "@/lib/validation/schemas";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireWorkspaceRole: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/workspaces/context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/workspaces/context")>();
  return {
    ...original,
    requireWorkspaceRole: mocks.requireWorkspaceRole,
  };
});

import { createCustomer } from "@/lib/services/customers";
import { createProduct } from "@/lib/services/products";
import { createOrder, updateOrderStatus } from "@/lib/services/orders";
import {
  acceptInvitation,
  createInvitation,
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/services/invitations";
import { validateAnalyticsRange } from "@/lib/services/analytics";

describe("service input validation and errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts duplicate customer email values while validating format", () => {
    expect(customerInputSchema.safeParse({ name: "First", email: "same@example.test" }).success).toBe(true);
    expect(customerInputSchema.safeParse({ name: "Second", email: "same@example.test" }).success).toBe(true);
    expect(customerInputSchema.safeParse({ name: "Missing name" }).success).toBe(true);
    expect(customerInputSchema.safeParse({ name: "Bad", email: "not-an-email" }).success).toBe(false);
  });

  it("validates product prices, SKUs and order idempotency/item inputs", () => {
    expect(productInputSchema.safeParse({ name: "A", sku: "SKU-A", unitPrice: "12.3400" }).success).toBe(true);
    expect(productInputSchema.safeParse({ name: "A", sku: " ", unitPrice: "-1" }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: "A", sku: "SKU", unitPrice: 1.25 }).success).toBe(false);
    expect(orderCreationSchema.safeParse({
      idempotencyKey: " retry-1 ",
      items: [{ productId: "81a5428e-81cc-4cd7-9e36-83780eb51993", quantity: 1 }],
    }).success).toBe(true);
    expect(orderCreationSchema.safeParse({
      idempotencyKey: " ",
      items: [{ productId: "invalid", quantity: 0 }],
    }).success).toBe(false);
  });

  it("rejects invalid service input before creating a Supabase client", async () => {
    await expect(createCustomer("workspace", { name: "" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(createProduct("workspace", {
      name: "Product",
      sku: "SKU",
      unitPrice: "-9",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createOrder("workspace", {
      idempotencyKey: "",
      items: [],
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.requireWorkspaceRole).not.toHaveBeenCalled();
  });

  it("requires Owner or Admin workspace role for customer mutations", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.requireWorkspaceRole.mockImplementation(
      async (_workspaceId: string, roles: readonly string[]) => {
        expect(roles).toEqual(["owner", "admin"]);
        throw new AppError("FORBIDDEN");
      },
    );

    await expect(createCustomer("verified-workspace", { name: "Avery" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires Owner or Admin workspace role for product mutations", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.requireWorkspaceRole.mockImplementation(
      async (_workspaceId: string, roles: readonly string[]) => {
        expect(roles).toEqual(["owner", "admin"]);
        throw new AppError("FORBIDDEN");
      },
    );

    await expect(createProduct("verified-workspace", {
      name: "Lamp",
      sku: "LAMP",
      unitPrice: "12.5000",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires Owner or Admin for order creation and status updates", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.requireWorkspaceRole.mockImplementation(
      async (_workspaceId: string, roles: readonly string[]) => {
        expect(roles).toEqual(["owner", "admin"]);
        throw new AppError("FORBIDDEN");
      },
    );

    await expect(createOrder("verified-workspace", {
      idempotencyKey: "create-order",
      items: [
        { productId: "81a5428e-81cc-4cd7-9e36-83780eb51993", quantity: 2 },
        { productId: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738", quantity: 1 },
      ],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateOrderStatus(
      "verified-workspace",
      "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      "processing",
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends order item inputs to the database RPC and rejects pending as an update target", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.requireWorkspaceRole.mockResolvedValue({
      id: "verified-workspace",
      role: "owner",
    });

    await createOrder("verified-workspace", {
      idempotencyKey: "create-order",
      customerId: null,
      items: [
        { productId: "81a5428e-81cc-4cd7-9e36-83780eb51993", quantity: 2 },
        { productId: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738", quantity: 1 },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("create_order", {
      p_workspace_id: "verified-workspace",
      p_idempotency_key: "create-order",
      p_items: [
        { product_id: "81a5428e-81cc-4cd7-9e36-83780eb51993", quantity: 2 },
        { product_id: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738", quantity: 1 },
      ],
      p_customer_id: null,
    });
    await expect(updateOrderStatus(
      "verified-workspace",
      "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      "pending",
    )).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("validates inclusive analytics date ranges and preset choices", () => {
    expect(validateAnalyticsRange({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    })).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(() => validateAnalyticsRange({
      startDate: "2026-01-02",
      endDate: "2026-01-01",
    })).toThrow(AppError);
    expect(() => validateAnalyticsRange({
      startDate: "2025-01-01",
      endDate: "2026-12-31",
    })).toThrow(AppError);
  });

  it("maps database failures to safe messages without exposing SQL details", () => {
    const error = mapDatabaseError({
      code: "23505",
      message: "duplicate key value contains confidential data",
    });
    expect(error.code).toBe("CONFLICT");
    expect(publicErrorMessage(error)).not.toContain("confidential");
    expect(mapDatabaseError({
      code: "22023",
      message: "order status transition from completed to processing is not allowed",
    }).code).toBe("INVALID_STATE");
    expect(mapDatabaseError({
      code: "22023",
      message: "invalid date range",
    }).code).toBe("INVALID_INPUT");
    expect(publicErrorMessage(new Error("raw SQL detail"))).toBe(
      "The request could not be completed. Please try again.",
    );
  });
});

describe("invitation token handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceRole.mockResolvedValue({
      id: "81a5428e-81cc-4cd7-9e36-83780eb51993",
      role: "owner",
    });
  });

  it("generates a URL-safe 32-byte token and hashes its decoded bytes", () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashInvitationToken(token).length).toBe(32);
    expect(hashInvitationToken(token).toString("hex")).toBe(
      createHash("sha256").update(Buffer.from(token, "base64url")).digest("hex"),
    );
    expect(() => hashInvitationToken("short")).toThrow(AppError);
  });

  it("passes only the hash to storage and returns no token to ordinary callers", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "0ca3ae8a-aeee-48f4-a51d-9ac8e9b5b20d",
      error: null,
    });
    mocks.createClient.mockResolvedValue({ rpc });
    let deliveredToken = "";
    const result = await createInvitation(
      "81a5428e-81cc-4cd7-9e36-83780eb51993",
      { email: " Invitee@Example.Test ", role: "viewer" },
      async ({ token }) => {
        deliveredToken = token;
      },
    );

    expect(result).toEqual({ invitationId: "0ca3ae8a-aeee-48f4-a51d-9ac8e9b5b20d" });
    expect(deliveredToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rpc.mock.calls[0][1].p_token_hash).toBe(
      `\\x${hashInvitationToken(deliveredToken).toString("hex")}`,
    );
    expect(rpc.mock.calls[0][1].p_token_hash).not.toContain(deliveredToken);
    expect(JSON.stringify(result)).not.toContain(deliveredToken);
  });

  it("does not propagate delivery exception details that may contain a token", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: "0ca3ae8a-aeee-48f4-a51d-9ac8e9b5b20d",
        error: null,
      })
      .mockResolvedValueOnce({ data: "0ca3ae8a-aeee-48f4-a51d-9ac8e9b5b20d", error: null });
    mocks.createClient.mockResolvedValue({
      rpc,
    });
    await expect(
      createInvitation(
        "81a5428e-81cc-4cd7-9e36-83780eb51993",
        { email: "invitee@example.test", role: "viewer" },
        async () => {
          throw new Error("failed delivering raw token secret");
        },
      ),
    ).rejects.toMatchObject({ code: "DELIVERY" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][0]).toBe("revoke_workspace_invitation");
  });

  it("hashes accepted tokens before calling the database and rejects malformed tokens", async () => {
    const invitationId = "0ca3ae8a-aeee-48f4-a51d-9ac8e9b5b20d";
    const rpc = vi.fn().mockResolvedValue({ data: invitationId, error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "c1b2b47d-9f14-4aeb-a6d2-c24c71fd914f",
              email: "member@example.test",
            },
          },
          error: null,
        }),
      },
      rpc,
    });
    await expect(acceptInvitation("invalid")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(rpc).not.toHaveBeenCalled();

    const token = generateInvitationToken();
    await expect(acceptInvitation(token)).resolves.toBe(invitationId);
    expect(rpc).toHaveBeenCalledWith("accept_workspace_invitation", {
      p_token_hash: `\\x${hashInvitationToken(token).toString("hex")}`,
    });
  });
});
