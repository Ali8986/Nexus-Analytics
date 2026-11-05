import "server-only";

import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError, mapDatabaseError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/current-user";
import type { WorkspaceRole } from "@/lib/workspaces/context";

const membershipsSchema = z.array(
  z.object({
    workspace_id: z.string().uuid(),
    role: z.enum(["owner", "admin", "analyst", "viewer"]),
  }),
);
const workspacesSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120),
  }),
);

export type WorkspaceSummary = Readonly<{
  id: string;
  name: string;
  role: WorkspaceRole;
}>;

export async function listUserWorkspaces(user: User): Promise<WorkspaceSummary[]> {
  const supabase = await createClient();
  const { data: membershipRows, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id);

  if (membershipError) throw mapDatabaseError(membershipError);
  const memberships = membershipsSchema.safeParse(membershipRows ?? []);
  if (!memberships.success) {
    throw new AppError("DATABASE", memberships.error);
  }
  if (memberships.data.length === 0) return [];

  const { data: workspaceRows, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .in(
      "id",
      memberships.data.map((membership) => membership.workspace_id),
    )
    .order("name", { ascending: true });

  if (workspaceError) throw mapDatabaseError(workspaceError);
  const workspaces = workspacesSchema.safeParse(workspaceRows ?? []);
  if (!workspaces.success || workspaces.data.length !== memberships.data.length) {
    throw new AppError("DATABASE", workspaces.success ? undefined : workspaces.error);
  }

  const roleByWorkspaceId = new Map(
    memberships.data.map(({ workspace_id, role }) => [workspace_id, role]),
  );
  return workspaces.data.map((workspace) => {
    const role = roleByWorkspaceId.get(workspace.id);
    if (!role) throw new AppError("DATABASE");
    return { id: workspace.id, name: workspace.name, role };
  });
}

export async function listCurrentUserWorkspaces(): Promise<WorkspaceSummary[]> {
  return listUserWorkspaces(await requireAuthenticatedUser());
}
