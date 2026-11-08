"use server";

import { redirect } from "next/navigation";
import { mapDatabaseError, publicErrorMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { clearSelectedWorkspaceId } from "@/lib/workspaces/selection";

export type LogoutState = Readonly<{ error?: string }>;

export async function logoutAction(previousState: LogoutState): Promise<LogoutState> {
  void previousState;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    if (error.name === "AuthSessionMissingError" || error.status === 401) {
      await clearSelectedWorkspaceId();
      redirect("/login");
    }
    return { error: publicErrorMessage(mapDatabaseError(error)) };
  }
  await clearSelectedWorkspaceId();
  redirect("/login");
}
