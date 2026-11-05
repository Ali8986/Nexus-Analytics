import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";
import { requireAuthenticatedUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  invitationCreateSchema,
  invitationIdSchema,
  invitationTokenSchema,
} from "@/lib/validation/schemas";
import { parseInput, parseRpcId, raiseDatabaseError } from "@/lib/services/shared";
import { requireWorkspaceRole } from "@/lib/workspaces/context";
import type { InvitationRecord } from "@/lib/services/types";

export type InvitationDeliveryRequest = Readonly<{
  invitationId: string;
  workspaceId: string;
  invitedEmail: string;
  invitedRole: "admin" | "analyst" | "viewer";
  token: string;
}>;

export type InvitationDelivery = (
  request: InvitationDeliveryRequest,
) => Promise<void>;

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): Buffer {
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error);
  const bytes = Buffer.from(parsed.data, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== parsed.data) {
    throw new AppError("INVALID_INPUT");
  }
  return createHash("sha256").update(bytes).digest();
}

function postgresBytea(value: Uint8Array): string {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

export async function createInvitation(
  workspaceId: string,
  input: unknown,
  deliver: InvitationDelivery,
): Promise<{ invitationId: string }> {
  const value = parseInput(invitationCreateSchema, input);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace_invitation", {
    p_workspace_id: workspace.id,
    p_invited_email: value.email.toLowerCase(),
    p_invited_role: value.role,
    p_token_hash: postgresBytea(tokenHash),
  });
  if (error) raiseDatabaseError(error);
  const invitationId = parseRpcId(data);

  try {
    await deliver({
      invitationId,
      workspaceId: workspace.id,
      invitedEmail: value.email.toLowerCase(),
      invitedRole: value.role,
      token,
    });
  } catch {
    const { error: revokeError } = await supabase.rpc(
      "revoke_workspace_invitation",
      {
        p_workspace_id: workspace.id,
        p_invitation_id: invitationId,
      },
    );
    if (revokeError) raiseDatabaseError(revokeError);
    throw new AppError("DELIVERY");
  }
  return { invitationId };
}

export async function revokeInvitation(
  workspaceId: string,
  invitationId: string,
) {
  const id = parseInput(invitationIdSchema, invitationId);
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_workspace_invitation", {
    p_workspace_id: workspace.id,
    p_invitation_id: id,
  });
  if (error) raiseDatabaseError(error);
  return parseRpcId(data);
}

export async function acceptInvitation(token: string) {
  await requireAuthenticatedUser();
  const tokenHash = hashInvitationToken(token);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    p_token_hash: postgresBytea(tokenHash),
  });
  if (error) {
    if (error.code === "22023") throw new AppError("INVITATION_INVALID", error);
    raiseDatabaseError(error);
  }
  return parseRpcId(data);
}

export async function listInvitations(workspaceId: string): Promise<InvitationRecord[]> {
  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select(
      "id, workspace_id, invited_email, invited_role, inviter_user_id, expires_at, accepted_at, revoked_at, expired_at, created_at",
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) raiseDatabaseError(error);
  return data ?? [];
}
