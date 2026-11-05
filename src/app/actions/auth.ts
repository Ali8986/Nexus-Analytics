"use server";

import { redirect } from "next/navigation";
import { mapDatabaseError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { clearSelectedWorkspaceId } from "@/lib/workspaces/selection";

export async function logoutAction(): Promise<never> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    if (error.name === "AuthSessionMissingError" || error.status === 401) {
      await clearSelectedWorkspaceId();
      redirect("/login");
    }
    throw mapDatabaseError(error);
  }
  await clearSelectedWorkspaceId();
  redirect("/login");
}
