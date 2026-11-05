"use server";

import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import {
  listAuditLogs,
  type AuditLogPage,
} from "@/lib/services/audit-logs";
import { auditLogPageSchema } from "@/lib/validation/schemas";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

export type AuditLogResult = { data: AuditLogPage } | { error: string };

export async function loadAuditLogs(input: unknown): Promise<AuditLogResult> {
  const parsedInput = auditLogPageSchema.safeParse(input ?? {});
  if (!parsedInput.success) {
    return { error: "Choose a valid audit-log page." };
  }
  const selectedWorkspaceId = await getSelectedWorkspaceId();
  if (!selectedWorkspaceId) {
    return { error: publicErrorMessage(new AppError("FORBIDDEN")) };
  }

  try {
    return {
      data: await listAuditLogs(selectedWorkspaceId, parsedInput.data.offset),
    };
  } catch (error) {
    if (error instanceof AppError) return { error: publicErrorMessage(error) };
    throw error;
  }
}
