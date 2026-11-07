import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SettingsDashboard, SettingsLoading } from "@/components/settings-dashboard";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export const metadata = { title: "Settings" };
export const instant = false;

async function SettingsContent() {
  await connection();
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) redirect("/workspaces");

  const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
  const fullName = workspace.user.user_metadata.full_name;

  return (
    <SettingsDashboard
      initialData={{
        email: workspace.user.email ?? "",
        emailConfirmedAt: workspace.user.email_confirmed_at ?? null,
        accountCreatedAt: workspace.user.created_at,
        fullName: typeof fullName === "string" ? fullName : "",
        workspaceName: workspace.name,
        reportingCurrency: workspace.reportingCurrency,
        reportingTimezone: workspace.reportingTimezone,
        role: workspace.role,
      }}
    />
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  );
}
