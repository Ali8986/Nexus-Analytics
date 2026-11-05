export type SafeJsonValue =
  | string
  | number
  | boolean
  | null
  | SafeJsonValue[]
  | { [key: string]: SafeJsonValue };

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
