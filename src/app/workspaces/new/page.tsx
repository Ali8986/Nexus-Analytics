import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceOnboardingForm } from "@/components/workspace-onboarding-form";
import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listUserWorkspaces } from "@/lib/workspaces/list";

export const instant = false;

export default async function NewWorkspacePage() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if ((await listUserWorkspaces(user)).length === 0) redirect("/onboarding");

  const fullName =
    typeof user.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : "there";

  return <WorkspaceOnboardingForm fullName={fullName} />;
}
