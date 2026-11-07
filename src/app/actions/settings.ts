"use server";

import { revalidatePath } from "next/cache";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import {
  profileSettingsSchema,
  workspaceSettingsSchema,
} from "@/lib/settings/schemas";
import {
  updateProfileSettings,
  updateWorkspaceSettings,
} from "@/lib/services/settings";

export type SettingsActionResult =
  | { success: true }
  | { error: string };

export async function saveProfileSettings(input: unknown): Promise<SettingsActionResult> {
  const parsed = profileSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid profile name." };
  }

  try {
    await updateProfileSettings(parsed.data.fullName);
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) return { error: publicErrorMessage(error) };
    throw error;
  }
}

export async function saveWorkspaceSettings(input: unknown): Promise<SettingsActionResult> {
  const parsed = workspaceSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter valid workspace settings." };
  }

  try {
    await updateWorkspaceSettings(parsed.data);
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) return { error: publicErrorMessage(error) };
    throw error;
  }
}
