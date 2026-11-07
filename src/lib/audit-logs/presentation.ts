export type SafeJsonValue =
  | string
  | number
  | boolean
  | null
  | SafeJsonValue[]
  | { [key: string]: SafeJsonValue };

export type AuditEventForPresentation = {
  action: string;
  entityType: string;
  entityId: string | null;
  resourceName?: string | null;
  actorUserId: string | null;
  metadata: Record<string, SafeJsonValue>;
  createdAt: string;
};

const actionLabels: Record<string, string> = {
  "created:workspace": "Workspace created",
  "updated:workspace": "Workspace details updated",
  "added:membership": "Workspace member added",
  "role_changed:membership": "Workspace member role changed",
  "updated:membership": "Workspace membership updated",
  "removed:membership": "Workspace member removed",
  "created:customer": "Customer created",
  "updated:customer": "Customer updated",
  "deleted:customer": "Customer archived",
  "created:product": "Product created",
  "updated:product": "Product updated",
  "deleted:product": "Product archived",
  "created:order": "Order created",
  "updated:order": "Order updated",
  "status_changed:order": "Order status changed",
  "deleted:order": "Order deleted",
  "created:invitation": "Workspace invitation created",
  "resent:invitation": "Workspace invitation resent",
  "accepted:invitation": "Workspace invitation accepted",
  "revoked:invitation": "Workspace invitation revoked",
  "expired:invitation": "Workspace invitation expired",
  "requested:export": "Data export requested",
  "completed:export": "Data export completed",
  "failed:export": "Data export failed",
  "updated:settings": "Workspace settings updated",
};

const entityLabels: Record<string, string> = {
  workspace: "Workspace",
  membership: "Member",
  customer: "Customer",
  product: "Product",
  order: "Order",
  invitation: "Invitation",
  export: "Data export",
  settings: "Workspace settings",
};

function metadataText(event: Pick<AuditEventForPresentation, "action" | "entityType" | "metadata">): string {
  const { action, entityType, metadata } = event;
  if (entityType === "order" && action === "status_changed") {
    const from = metadata.from_status;
    const to = metadata.to_status;
    if (typeof from === "string" && typeof to === "string") {
      return `Status changed from ${humanize(from)} to ${humanize(to)}.`;
    }
  }
  if (entityType === "membership" && action === "role_changed") {
    const from = metadata.from_role;
    const to = metadata.to_role;
    if (typeof from === "string" && typeof to === "string") {
      return `Role changed from ${humanize(from)} to ${humanize(to)}.`;
    }
  }
  if (
    (entityType === "membership" || entityType === "invitation") &&
    typeof metadata.role === "string"
  ) {
    return `Role: ${humanize(metadata.role)}.`;
  }
  if (Array.isArray(metadata.changed_fields)) {
    const fields = metadata.changed_fields.filter((field): field is string => typeof field === "string");
    if (fields.length) return `Changed: ${fields.map(humanize).join(", ")}.`;
  }
  return "No additional details recorded.";
}

export type AuditMetadataItem = {
  label: string;
  value: string;
  kind: "status" | "text";
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
};

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

const changedFieldLabels: Record<string, string> = {
  name: "Workspace name",
  reporting_currency: "Reporting currency",
  reporting_timezone: "Reporting time zone",
};

export function presentAuditMetadata(
  event: Pick<AuditEventForPresentation, "action" | "entityType" | "metadata">,
): AuditMetadataItem[] {
  const { action, entityType, metadata } = event;
  if (entityType === "order" && action === "status_changed") {
    const items: AuditMetadataItem[] = [];
    if (typeof metadata.from_status === "string" && statusLabels[metadata.from_status]) {
      items.push({
        label: "Previous Status",
        value: statusLabels[metadata.from_status],
        kind: "status",
      });
    }
    if (typeof metadata.to_status === "string" && statusLabels[metadata.to_status]) {
      items.push({
        label: "Current Status",
        value: statusLabels[metadata.to_status],
        kind: "status",
      });
    }
    return items;
  }

  if (entityType === "membership" && action === "role_changed") {
    const items: AuditMetadataItem[] = [];
    if (typeof metadata.from_role === "string" && roleLabels[metadata.from_role]) {
      items.push({ label: "Previous Role", value: roleLabels[metadata.from_role], kind: "text" });
    }
    if (typeof metadata.to_role === "string" && roleLabels[metadata.to_role]) {
      items.push({ label: "Current Role", value: roleLabels[metadata.to_role], kind: "text" });
    }
    return items;
  }

  if (
    (entityType === "membership" || entityType === "invitation") &&
    typeof metadata.role === "string" &&
    roleLabels[metadata.role]
  ) {
    return [{ label: "Role", value: roleLabels[metadata.role], kind: "text" }];
  }

  if (entityType === "workspace" && Array.isArray(metadata.changed_fields)) {
    const fields = [...new Set(metadata.changed_fields)]
      .filter((field): field is string => typeof field === "string" && field in changedFieldLabels)
      .map((field) => changedFieldLabels[field]);
    return fields.length
      ? [{ label: "Updated", value: fields.join(", "), kind: "text" }]
      : [];
  }

  return [];
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function auditActionKey(event: Pick<AuditEventForPresentation, "action" | "entityType">): string {
  return `${event.action}:${event.entityType}`;
}

export function describeAuditEvent(event: AuditEventForPresentation) {
  const key = auditActionKey(event);
  const actionLabel = actionLabels[key] ?? "Workspace activity recorded";
  const resourceTypeLabel = entityLabels[event.entityType] ?? "Workspace item";
  return {
    actionLabel,
    resourceTypeLabel,
    resourceLabel: [resourceTypeLabel, event.resourceName].filter(Boolean).join(" · "),
    detail: metadataText(event),
    knownAction: key in actionLabels,
  };
}

export type AuditEventFilters = {
  query: string;
  action: string;
  resourceType: string;
  fromDate: string;
  toDate: string;
};

function eventDateInTimezone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function filterAuditEvents<T extends AuditEventForPresentation>(
  events: T[],
  filters: AuditEventFilters,
  timeZone: string,
): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return events.filter((event) => {
    const presentation = describeAuditEvent(event);
    if (filters.action && auditActionKey(event) !== filters.action) return false;
    if (filters.resourceType && event.entityType !== filters.resourceType) return false;
    const date = eventDateInTimezone(event.createdAt, timeZone);
    if (filters.fromDate && date < filters.fromDate) return false;
    if (filters.toDate && date > filters.toDate) return false;
    if (!query) return true;
    const searchable = [
      presentation.actionLabel,
      presentation.resourceLabel,
      presentation.detail,
      event.actorUserId ?? "system",
      event.entityId ?? "",
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
}

const sensitiveKeyPattern =
  /(email|token|password|passwd|secret|apikey|authorization|credential|jwt|signingkey|privatekey)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, depth: number): SafeJsonValue {
  if (depth > 8) return "[truncated]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (isRecord(value)) {
    return sanitizeAuditMetadata(value, depth + 1);
  }
  return "[unavailable]";
}

export function sanitizeAuditMetadata(
  metadata: unknown,
  depth = 0,
): Record<string, SafeJsonValue> {
  if (!isRecord(metadata) || depth > 8) return {};

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        return !sensitiveKeyPattern.test(normalizedKey);
      })
      .map(([key, value]) => [key, sanitizeValue(value, depth)]),
  );
}

export function formatAuditTimestamp(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatAuditTimestampWithZone(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}
