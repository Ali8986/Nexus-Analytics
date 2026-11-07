import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  getSelectedWorkspaceId: vi.fn(),
  requireWorkspaceRole: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));
vi.mock("@/lib/workspaces/selection", () => ({
  getSelectedWorkspaceId: mocks.getSelectedWorkspaceId,
}));
vi.mock("@/lib/workspaces/context", () => ({
  requireWorkspaceRole: mocks.requireWorkspaceRole,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  updateProfileSettings,
  updateWorkspaceSettings,
} from "@/lib/services/settings";

const workspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";

describe("settings services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({ id: "current-user" });
    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.requireWorkspaceRole.mockResolvedValue({ id: workspaceId, role: "owner" });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
      auth: { updateUser: mocks.updateUser },
    });
  });

  it("updates only the current authenticated user metadata", async () => {
    await updateProfileSettings("Avery Smith");
    expect(mocks.requireAuthenticatedUser).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: "Avery Smith" } });
  });

  it("requires the selected workspace owner/admin role before invoking the RPC", async () => {
    await updateWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    });
    expect(mocks.requireWorkspaceRole).toHaveBeenCalledWith(workspaceId, ["owner", "admin"]);
    expect(mocks.rpc).toHaveBeenCalledWith("update_workspace_settings", {
      p_workspace_id: workspaceId,
      p_name: "Nexus",
      p_reporting_currency: "USD",
      p_reporting_timezone: "UTC",
    });
  });

  it("does not call the RPC without a selected workspace or when authorization fails", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValueOnce(null);
    await expect(updateWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.requireWorkspaceRole.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(updateWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces database validation failures without concealing them", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "22023", message: "Unsupported reporting timezone" },
    });
    await expect(updateWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "Invalid/Zone",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
