import "server-only";

import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError, mapDatabaseError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { workspaceIdSchema } from "@/lib/validation/schemas";
import { requireAuthenticatedUser } from "@/lib/auth/current-user";

export type WorkspaceRole = "owner" | "admin" | "analyst" | "viewer";
export type WorkspaceContext = {
  id: string;
  name: string;
  user: User;
  role: WorkspaceRole;
  reportingCurrency: string;
  reportingTimezone: string;
};

const membershipSchema = z.object({
  role: z.enum(["owner", "admin", "analyst", "viewer"]),
});
const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  reporting_currency: z.string(),
  reporting_timezone: z.string(),
});

export async function resolveWorkspaceContext(
  workspaceIdentifier: string,
): Promise<WorkspaceContext> {
  const parsedId = workspaceIdSchema.safeParse(workspaceIdentifier);
  if (!parsedId.success) {
    throw new AppError("INVALID_INPUT", parsedId.error);
  }

  const user = await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw mapDatabaseError(membershipError);
  }
  if (!membership) {
    throw new AppError("FORBIDDEN");
  }

  const parsedMembership = membershipSchema.safeParse(membership);
  if (!parsedMembership.success) {
    throw new AppError("DATABASE", parsedMembership.error);
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, reporting_currency, reporting_timezone")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (workspaceError) {
    throw mapDatabaseError(workspaceError);
  }
  if (!workspace) {
    throw new AppError("NOT_FOUND");
  }

  const parsedWorkspace = workspaceSchema.safeParse(workspace);
  if (!parsedWorkspace.success) {
    throw new AppError("DATABASE", parsedWorkspace.error);
  }

  return {
    id: parsedWorkspace.data.id,
    name: parsedWorkspace.data.name,
    user,
    role: parsedMembership.data.role,
    reportingCurrency: parsedWorkspace.data.reporting_currency,
    reportingTimezone: parsedWorkspace.data.reporting_timezone,
  };
}

export async function requireWorkspaceRole(
  workspaceIdentifier: string,
  allowedRoles: readonly WorkspaceRole[],
): Promise<WorkspaceContext> {
  const context = await resolveWorkspaceContext(workspaceIdentifier);
  if (!allowedRoles.includes(context.role)) {
    throw new AppError("FORBIDDEN");
  }
  return context;
}

export function canWriteWorkspace(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
