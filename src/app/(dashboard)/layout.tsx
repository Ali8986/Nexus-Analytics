import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getWorkspaceRouteDecision } from "@/lib/workspaces/routing";
import { listUserWorkspaces } from "@/lib/workspaces/list";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export const instant = false;

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const workspaces = await listUserWorkspaces(user);
  const decision = getWorkspaceRouteDecision(
    workspaces,
    await getSelectedWorkspaceId(),
  );

  if (decision.kind === "onboarding") redirect("/onboarding");
  if (decision.kind === "auto-select" || decision.kind === "select") {
    redirect("/workspaces");
  }

  const workspace = await resolveWorkspaceContext(decision.workspace.id);
  const userName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : user.email ?? "Account";

  return (
    <AppShell
      userEmail={user.email ?? ""}
      userName={userName}
      workspaceName={workspace.name}
      workspaceRole={workspace.role}
    >
      {children}
    </AppShell>
  );
}
