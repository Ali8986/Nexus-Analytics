import "server-only";

import { z } from "zod";
import { AppError, mapDatabaseError } from "@/lib/errors/app-error";
import type { WorkspaceContext } from "@/lib/workspaces/context";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { workspaceIdSchema } from "@/lib/validation/schemas";

export async function getWorkspace(
  workspaceIdentifier: string,
): Promise<WorkspaceContext> {
  const parsed = workspaceIdSchema.safeParse(workspaceIdentifier);
  if (!parsed.success) {
    throw new AppError("INVALID_INPUT", parsed.error);
  }
  return resolveWorkspaceContext(parsed.data);
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError("INVALID_INPUT", parsed.error);
  }
  return parsed.data;
}

export function raiseDatabaseError(error: {
  code?: string;
  message?: string;
}): never {
  throw mapDatabaseError(error);
}

export function parseRpcId(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new AppError("DATABASE", parsed.error);
  }
  return parsed.data;
}

export function searchPattern(value: string): string {
  return `%${value.replace(/[\\%_,()"]/g, "\\$&")}%`;
}

export function optionalDates(range: {
  startDate?: string;
  endDate?: string;
}): { p_start_date: string | null; p_end_date: string | null } {
  return {
    p_start_date: range.startDate ?? null,
    p_end_date: range.endDate ?? null,
  };
}

export function workspaceDateBoundary(
  localDate: string,
  timezone: string,
): string {
  const desiredUtc = Date.parse(`${localDate}T00:00:00.000Z`);
  let guess = desiredUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    );
    const adjustment = desiredUtc - representedUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(guess).toISOString();
}
