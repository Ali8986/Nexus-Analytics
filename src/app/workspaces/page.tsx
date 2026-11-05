import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AutoSelectWorkspace } from "@/components/auto-select-workspace";
import { Button } from "@/components/ui";
import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listUserWorkspaces } from "@/lib/workspaces/list";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";
import { getWorkspaceRouteDecision } from "@/lib/workspaces/routing";
import { selectWorkspaceAction } from "@/app/actions/workspaces";

export const instant = false;

export default async function WorkspacesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ error?: string }>;
}>) {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const workspaces = await listUserWorkspaces(user);
  if (workspaces.length === 0) redirect("/onboarding");

  const decision = getWorkspaceRouteDecision(
    workspaces,
    await getSelectedWorkspaceId(),
  );
  if (decision.kind === "auto-select") {
    return <AutoSelectWorkspace workspace={decision.workspace} />;
  }

  const { error } = await searchParams;

  return (
    <main className="workspace-selection-page">
      <section className="workspace-selection-card">
        <p className="auth-eyebrow">YOUR WORKSPACES</p>
        <h1>Choose a workspace</h1>
        <p className="auth-description">
          Select the workspace you want to open. You can switch at any time.
        </p>
        {error === "selection" ? (
          <p className="form-message form-message-error" role="alert">
            We couldn’t select that workspace. Please choose one you belong to.
          </p>
        ) : null}
        <div className="workspace-option-list">
          {workspaces.map((workspace) => (
            <form action={selectWorkspaceAction} key={workspace.id}>
              <input name="workspaceId" type="hidden" value={workspace.id} />
              <div className="workspace-option-copy">
                <strong>{workspace.name}</strong>
                <span>{workspace.role[0].toUpperCase() + workspace.role.slice(1)}</span>
              </div>
              <Button type="submit" variant="secondary">
                Open workspace
              </Button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
