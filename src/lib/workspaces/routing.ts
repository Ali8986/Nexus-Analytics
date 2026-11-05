import type { WorkspaceSummary } from "@/lib/workspaces/list";

export type WorkspaceRouteDecision =
  | { kind: "onboarding" }
  | { kind: "auto-select"; workspace: WorkspaceSummary }
  | { kind: "select" }
  | { kind: "ready"; workspace: WorkspaceSummary };

export function getWorkspaceRouteDecision(
  workspaces: readonly WorkspaceSummary[],
  selectedWorkspaceId: string | null,
): WorkspaceRouteDecision {
  if (workspaces.length === 0) return { kind: "onboarding" };

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  if (selectedWorkspace) {
    return { kind: "ready", workspace: selectedWorkspace };
  }

  if (workspaces.length === 1) {
    return { kind: "auto-select", workspace: workspaces[0] };
  }

  return { kind: "select" };
}
