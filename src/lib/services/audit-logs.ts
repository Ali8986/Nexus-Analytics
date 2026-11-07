import "server-only";

import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { sanitizeAuditMetadata } from "@/lib/audit-logs/presentation";
import { raiseDatabaseError } from "@/lib/services/shared";
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
  resourceName: string | null;
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
  const events = rows.slice(0, auditLogPageSize);
  const customerIds = [...new Set(events
    .filter((row) => row.entity_type === "customer" && row.entity_id)
    .map((row) => row.entity_id!))];
  const productIds = [...new Set(events
    .filter((row) => row.entity_type === "product" && row.entity_id)
    .map((row) => row.entity_id!))];
  const [customers, products] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("workspace_id", workspace.id)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("products")
          .select("id, name, sku")
          .eq("workspace_id", workspace.id)
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customers.error) raiseDatabaseError(customers.error);
  if (products.error) raiseDatabaseError(products.error);

  const customerRows = z.array(z.object({ id: recordIdSchema, name: z.string() }))
    .safeParse(customers.data ?? []);
  const productRows = z.array(z.object({
    id: recordIdSchema,
    name: z.string(),
    sku: z.string(),
  })).safeParse(products.data ?? []);
  if (!customerRows.success || !productRows.success) {
    throw new AppError("DATABASE", !customerRows.success ? customerRows.error : productRows.error);
  }
  const customerNames = new Map(customerRows.data.map((customer) => [customer.id, customer.name]));
  const productNames = new Map(productRows.data.map((product) => [
    product.id,
    `${product.name} (${product.sku})`,
  ]));

  return {
    events: events.map((row) => {
      const resourceName = row.entity_type === "customer" && row.entity_id
        ? customerNames.get(row.entity_id) ?? null
        : row.entity_type === "product" && row.entity_id
          ? productNames.get(row.entity_id) ?? null
          : row.entity_type === "workspace" && row.entity_id === workspace.id
            ? workspace.name
            : null;
      return {
        id: row.id,
        actorUserId: row.actor_user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        resourceName,
        metadata: sanitizeAuditMetadata(row.metadata),
        createdAt: row.created_at,
      };
    }),
    hasMore: rows.length > auditLogPageSize,
    reportingTimezone: workspace.reportingTimezone,
  };
}
