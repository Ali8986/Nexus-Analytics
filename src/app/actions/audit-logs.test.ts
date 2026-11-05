import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  listAuditLogs: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/workspaces/selection", () => ({
  getSelectedWorkspaceId: mocks.getSelectedWorkspaceId,
}));
vi.mock("@/lib/services/audit-logs", () => ({
  listAuditLogs: mocks.listAuditLogs,
}));

import { loadAuditLogs } from "@/app/actions/audit-logs";

const workspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const page = { events: [], hasMore: false, reportingTimezone: "UTC" };

describe("audit log server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.listAuditLogs.mockResolvedValue(page);
  });

  it("loads only for the server-selected workspace and requested offset", async () => {
    await expect(
      loadAuditLogs({ offset: 25, workspaceId: "attacker-controlled-id" }),
    ).resolves.toEqual({ data: page });
    expect(mocks.listAuditLogs).toHaveBeenCalledWith(workspaceId, 25);
  });

  it("returns an empty success page and safe authorization errors", async () => {
    mocks.getSelectedWorkspaceId.mockResolvedValue(null);
    await expect(loadAuditLogs({ offset: 0 })).resolves.toMatchObject({
      error: "You do not have permission to perform this action.",
    });
    expect(mocks.listAuditLogs).not.toHaveBeenCalled();

    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.listAuditLogs.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(loadAuditLogs({ offset: 0 })).resolves.toMatchObject({
      error: "You do not have permission to perform this action.",
    });
  });

  it("does not silently swallow unexpected failures", async () => {
    mocks.listAuditLogs.mockRejectedValueOnce(new Error("unexpected"));
    await expect(loadAuditLogs({ offset: 0 })).rejects.toThrow("unexpected");
  });
});
