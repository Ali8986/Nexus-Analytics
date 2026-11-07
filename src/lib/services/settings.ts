import "server-only";

import { AppError, mapDatabaseError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/current-user";
import type { WorkspaceSettingsInput } from "@/lib/settings/schemas";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";
import { requireWorkspaceRole } from "@/lib/workspaces/context";

export async function updateProfileSettings(fullName: string): Promise<void> {
  await requireAuthenticatedUser();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });
  if (error) throw mapDatabaseError(error);
}

export async function updateWorkspaceSettings(
  input: WorkspaceSettingsInput,
): Promise<void> {
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");

  const workspace = await requireWorkspaceRole(selectedWorkspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_workspace_settings", {
    p_workspace_id: workspace.id,
    p_name: input.name,
    p_reporting_currency: input.reportingCurrency,
    p_reporting_timezone: input.reportingTimezone,
  });
  if (error?.code === "23503" && error.message?.includes("workspaces_reporting_currency_fkey")) {
    throw new AppError("INVALID_INPUT", error);
  }
  if (error) throw mapDatabaseError(error);
}
