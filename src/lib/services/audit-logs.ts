import "server-only";

import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { sanitizeAuditMetadata } from "@/lib/audit-logs/presentation";
import { createClient } from "@/lib/supabase/server";
import { recordIdSchema } from "@/lib/validation/schemas";
import { requireWorkspaceRole } from "@/lib/workspaces/context";

const auditLogRowSchema = z.object({
  id: recordIdSchema,
  actor_user_id: recordIdSchema.nullable(),
  action: z.string().min(1).max(100),
  entity_type: z.string().min(1).max(100),
  entity_id: recordIdSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.iso.datetime({ offset: true }),
});

const auditLogRowsSchema = z.array(auditLogRowSchema);

export const auditLogPageSize = 25;

export type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: ReturnType<typeof sanitizeAuditMetadata>;
  createdAt: string;
};

export type AuditLogPage = {
  events: AuditLogItem[];
  hasMore: boolean;
  reportingTimezone: string;
};

export async function listAuditLogs(
  workspaceId: string,
  offset: number,
): Promise<AuditLogPage> {
  const parsedOffset = z.number().int().min(0).max(10_000).safeParse(offset);
  if (!parsedOffset.success) throw new AppError("INVALID_INPUT", parsedOffset.error);

  const workspace = await requireWorkspaceRole(workspaceId, ["owner", "admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_workspace_audit_logs", {
    p_workspace_id: workspace.id,
    p_limit: auditLogPageSize + 1,
    p_offset: parsedOffset.data,
  });
  if (error) {
    if (error.code === "42501") throw new AppError("FORBIDDEN", error);
    throw new AppError("DATABASE", error);
  }

  const parsedRows = auditLogRowsSchema.safeParse(data);
  if (!parsedRows.success) throw new AppError("DATABASE", parsedRows.error);

  const rows = parsedRows.data;
  return {
    events: rows.slice(0, auditLogPageSize).map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: sanitizeAuditMetadata(row.metadata),
      createdAt: row.created_at,
    })),
    hasMore: rows.length > auditLogPageSize,
    reportingTimezone: workspace.reportingTimezone,
  };
}
