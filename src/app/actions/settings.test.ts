import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors/app-error";

const mocks = vi.hoisted(() => ({
  updateProfileSettings: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/services/settings", () => ({
  updateProfileSettings: mocks.updateProfileSettings,
  updateWorkspaceSettings: mocks.updateWorkspaceSettings,
}));

import {
  saveProfileSettings,
  saveWorkspaceSettings,
} from "@/app/actions/settings";

describe("settings server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates profile names before updating the authenticated profile", async () => {
    await expect(saveProfileSettings({ fullName: " " })).resolves.toMatchObject({
      error: expect.any(String),
    });
    expect(mocks.updateProfileSettings).not.toHaveBeenCalled();

    await expect(saveProfileSettings({ fullName: "  Avery Smith  " })).resolves.toEqual({
      success: true,
    });
    expect(mocks.updateProfileSettings).toHaveBeenCalledWith("Avery Smith");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("validates workspace settings and maps permission failures", async () => {
    await expect(saveWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "US",
      reportingTimezone: "UTC",
    })).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.updateWorkspaceSettings).not.toHaveBeenCalled();

    mocks.updateWorkspaceSettings.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(saveWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    })).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports success and allows unexpected save failures to surface", async () => {
    await expect(saveWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    })).resolves.toEqual({ success: true });
    expect(mocks.updateWorkspaceSettings).toHaveBeenCalledWith({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");

    mocks.updateProfileSettings.mockRejectedValueOnce(new Error("unexpected"));
    await expect(saveProfileSettings({ fullName: "Avery Smith" })).rejects.toThrow("unexpected");
  });

  it("returns retryable save errors from both profile and workspace updates", async () => {
    mocks.updateProfileSettings.mockRejectedValueOnce(new AppError("DATABASE"));
    await expect(saveProfileSettings({ fullName: "Avery Smith" })).resolves.toMatchObject({
      error: expect.any(String),
    });

    mocks.updateWorkspaceSettings.mockRejectedValueOnce(new AppError("INVALID_INPUT"));
    await expect(saveWorkspaceSettings({
      name: "Nexus",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    })).resolves.toMatchObject({
      error: expect.any(String),
    });
  });
});
