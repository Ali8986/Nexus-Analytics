import "server-only";

import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import {
  memberChangeSchema,
  ownershipTransferSchema,
  recordIdSchema,
} from "@/lib/validation/schemas";
import {
  getWorkspace,
  parseInput,
  parseRpcId,
  raiseDatabaseError,
} from "@/lib/services/shared";
import { requireWorkspaceRole } from "@/lib/workspaces/context";
import type { WorkspaceMemberRecord } from "@/lib/services/types";

export async function listMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
  const workspace = await getWorkspace(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_by, created_at, updated_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) raiseDatabaseError(error);
  return data ?? [];
}

export async function changeMemberRole(workspaceId: string, input: unknown) {
  const value = parseInput(memberChangeSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_workspace_member_role", {
    p_workspace_id: workspace.id,
    p_member_user_id: value.memberUserId,
    p_new_role: value.role,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function removeMember(workspaceId: string, memberUserId: string) {
  const id = parseInput(recordIdSchema, memberUserId);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_workspace_member", {
    p_workspace_id: workspace.id,
    p_member_user_id: id,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function transferWorkspaceOwnership(
  workspaceId: string,
  input: unknown,
) {
  const value = parseInput(ownershipTransferSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_workspace_ownership", {
    p_workspace_id: workspace.id,
    p_new_owner_user_id: value.newOwnerUserId,
  });
  if (error) raiseDatabaseError(error);
  if (!data) throw new AppError("DATABASE");
  return parseRpcId(data);
}
