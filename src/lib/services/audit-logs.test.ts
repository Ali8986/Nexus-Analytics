import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  requireWorkspaceRole: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/workspaces/context", () => ({
  requireWorkspaceRole: mocks.requireWorkspaceRole,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { listAuditLogs } from "@/lib/services/audit-logs";

const workspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const eventId = "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738";
const eventRow = {
  id: eventId,
  actor_user_id: null,
  action: "created",
  entity_type: "workspace",
  entity_id: eventId,
  metadata: { name: "Workspace", nested: { api_key: "redacted", region: "west" } },
  created_at: "2026-11-04T12:00:00.000Z",
};

describe("audit log service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceRole.mockResolvedValue({
      id: workspaceId,
      role: "owner",
      reportingTimezone: "UTC",
    });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: [eventRow], error: null });
  });

  it("uses the verified workspace, fixed page size, and pagination offset", async () => {
    await expect(listAuditLogs(workspaceId, 25)).resolves.toMatchObject({
      events: [{ id: eventId }],
      hasMore: false,
      reportingTimezone: "UTC",
    });
    expect(mocks.requireWorkspaceRole).toHaveBeenCalledWith(workspaceId, ["owner", "admin"]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_workspace_audit_logs", {
      p_workspace_id: workspaceId,
      p_limit: 26,
      p_offset: 25,
    });
  });

  it("requests only Owner/Admin authorization and denies Analyst/Viewer roles", async () => {
    for (const role of ["analyst", "viewer"] as const) {
      expect(["owner", "admin"]).not.toContain(role);
      mocks.requireWorkspaceRole.mockRejectedValueOnce(new AppError("FORBIDDEN"));
      await expect(listAuditLogs(workspaceId, 0)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mocks.requireWorkspaceRole).toHaveBeenLastCalledWith(
        workspaceId,
        ["owner", "admin"],
      );
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  });

  it("does not pass through a browser workspace and omits unsafe stored metadata", async () => {
    await listAuditLogs(workspaceId, 0);
    expect(mocks.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_workspace_id: workspaceId,
    });

    const result = await listAuditLogs(workspaceId, 0);
    expect(result.events[0]?.metadata).toEqual({
      name: "Workspace",
      nested: { region: "west" },
    });
  });

  it("handles empty pages and maps database authorization errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(listAuditLogs(workspaceId, 0)).resolves.toMatchObject({
      events: [],
      hasMore: false,
    });

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    await expect(listAuditLogs(workspaceId, 0)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("uses the extra row only to determine whether another page exists", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: Array.from({ length: 26 }, (_, index) => ({
        ...eventRow,
        id: `d12412f9-d7f5-4e8d-a5a2-f1bdbb8047${String(index).padStart(2, "0")}`,
      })),
      error: null,
    });

    const result = await listAuditLogs(workspaceId, 0);
    expect(result.events).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });

  it("rejects invalid offsets before authorization or database access", async () => {
    await expect(listAuditLogs(workspaceId, -1)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(mocks.requireWorkspaceRole).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
