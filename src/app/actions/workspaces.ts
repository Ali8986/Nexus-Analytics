"use server";

import { redirect } from "next/navigation";
import { AppError, mapDatabaseError, publicErrorMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/current-user";
import {
  workspaceCreationSchema,
  workspaceIdSchema,
} from "@/lib/validation/schemas";
import { listCurrentUserWorkspaces } from "@/lib/workspaces/list";
import { setSelectedWorkspaceId } from "@/lib/workspaces/selection";
import { parseRpcId } from "@/lib/services/shared";

export type WorkspaceCreationState = Readonly<{
  error?: string;
  success?: boolean;
}>;

const defaultReportingCurrency = "USD";
const defaultReportingTimezone = "UTC";

export async function createWorkspaceAction(
  _previousState: WorkspaceCreationState,
  formData: FormData,
): Promise<WorkspaceCreationState> {
  const parsed = workspaceCreationSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Enter a valid workspace name.",
    };
  }

  await requireAuthenticatedUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_reporting_currency: defaultReportingCurrency,
    p_reporting_timezone: defaultReportingTimezone,
  });
  if (error) {
    const mappedError = mapDatabaseError(error);
    return { error: publicErrorMessage(mappedError) };
  }

  try {
    const workspaceId = parseRpcId(data);
    await setSelectedWorkspaceId(workspaceId);
  } catch (error) {
    if (error instanceof AppError) {
      return { error: publicErrorMessage(error) };
    }
    throw error;
  }

  return { success: true };
}

export async function selectWorkspaceAction(formData: FormData): Promise<never> {
  try {
    const parsedId = workspaceIdSchema.safeParse(formData.get("workspaceId"));
    if (!parsedId.success) throw new AppError("INVALID_INPUT", parsedId.error);

    const memberships = await listCurrentUserWorkspaces();
    if (!memberships.some((workspace) => workspace.id === parsedId.data)) {
      throw new AppError("FORBIDDEN");
    }

    await setSelectedWorkspaceId(parsedId.data);
  } catch (error) {
    if (error instanceof AppError) {
      redirect("/workspaces?error=selection");
    }
    throw error;
  }

  redirect("/");
}
