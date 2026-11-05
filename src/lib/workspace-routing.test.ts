import { describe, expect, it } from "vitest";
import { getWorkspaceRouteDecision } from "@/lib/workspaces/routing";
import type { WorkspaceSummary } from "@/lib/workspaces/list";

const oneWorkspace: WorkspaceSummary = {
  id: "81a5428e-81cc-4cd7-9e36-83780eb51993",
  name: "Northstar",
  role: "owner",
};
const secondWorkspace: WorkspaceSummary = {
  id: "91a5428e-81cc-4cd7-9e36-83780eb51993",
  name: "Bluebird",
  role: "analyst",
};

describe("workspace route decisions", () => {
  it("sends users with no memberships to onboarding", () => {
    expect(getWorkspaceRouteDecision([], null)).toEqual({ kind: "onboarding" });
  });

  it("auto-selects a single membership", () => {
    expect(getWorkspaceRouteDecision([oneWorkspace], null)).toEqual({
      kind: "auto-select",
      workspace: oneWorkspace,
    });
  });

  it("uses only a selected workspace present in the verified membership list", () => {
    expect(
      getWorkspaceRouteDecision([oneWorkspace, secondWorkspace], oneWorkspace.id),
    ).toEqual({ kind: "ready", workspace: oneWorkspace });
    expect(
      getWorkspaceRouteDecision([oneWorkspace, secondWorkspace], "unverified"),
    ).toEqual({ kind: "select" });
  });
});
