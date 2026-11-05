import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import {
  getAuthenticatedUser,
  requireAuthenticatedUser,
} from "@/lib/auth/current-user";
import {
  canWriteWorkspace,
  requireWorkspaceRole,
  resolveWorkspaceContext,
} from "@/lib/workspaces/context";
import { AppError } from "@/lib/errors/app-error";
import { workspaceDateBoundary } from "@/lib/services/shared";

const testUser = {
  id: "c1b2b47d-9f14-4aeb-a6d2-c24c71fd914f",
  email: "member@example.test",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};

function setupClient(
  membership: { role: string } | null,
  workspace: {
    id: string;
    name: string;
    reporting_currency: string;
    reporting_timezone: string;
  } | null,
) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValueOnce({ data: membership, error: null })
    .mockResolvedValueOnce({ data: workspace, error: null });
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: testUser }, error: null }) },
    from: vi.fn().mockReturnValue(builder),
  });
  return { builder, maybeSingle };
}

describe("server authentication and workspace context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses auth.getUser as trusted identity and returns the user", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: testUser }, error: null });
    const getSession = vi.fn();
    mocks.createClient.mockResolvedValue({
      auth: { getUser, getSession },
    });

    await expect(getAuthenticatedUser()).resolves.toEqual(testUser);
    expect(getUser).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects a missing authenticated user", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("treats a missing Supabase session as an unauthenticated route state", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: {
            name: "AuthSessionMissingError",
            status: 400,
          },
        }),
      },
    });

    await expect(getAuthenticatedUser()).resolves.toBeNull();
  });

  it("resolves role and reporting context only for a verified workspace member", async () => {
    const workspaceId = "81a5428e-81cc-4cd7-9e36-83780eb51993";
    setupClient(
      { role: "analyst" },
      {
        id: workspaceId,
        name: "Northstar",
        reporting_currency: "USD",
        reporting_timezone: "America/Los_Angeles",
      },
    );

    await expect(resolveWorkspaceContext(workspaceId)).resolves.toMatchObject({
      id: workspaceId,
      role: "analyst",
      reportingCurrency: "USD",
      reportingTimezone: "America/Los_Angeles",
      user: { id: testUser.id },
    });
  });

  it("denies missing membership and role escalation", async () => {
    const workspaceId = "81a5428e-81cc-4cd7-9e36-83780eb51993";
    setupClient(null, null);
    await expect(resolveWorkspaceContext(workspaceId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    setupClient(
      { role: "viewer" },
      {
        id: workspaceId,
        name: "Northstar",
        reporting_currency: "USD",
        reporting_timezone: "UTC",
      },
    );
    await expect(
      requireWorkspaceRole(workspaceId, ["owner", "admin"]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("recognizes only Owner and Admin as writers", () => {
    expect(canWriteWorkspace("owner")).toBe(true);
    expect(canWriteWorkspace("admin")).toBe(true);
    expect(canWriteWorkspace("analyst")).toBe(false);
    expect(canWriteWorkspace("viewer")).toBe(false);
  });

  it("converts local calendar boundaries across daylight-saving changes", () => {
    expect(
      workspaceDateBoundary("2026-03-08", "America/Los_Angeles"),
    ).toBe("2026-03-08T08:00:00.000Z");
    expect(
      workspaceDateBoundary("2026-03-09", "America/Los_Angeles"),
    ).toBe("2026-03-09T07:00:00.000Z");
  });
});
