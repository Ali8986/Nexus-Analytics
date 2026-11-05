import "server-only";

import type { User } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === "AuthSessionMissingError" || error.status === 401) {
      return null;
    }
    throw new AppError("DATABASE", error);
  }
  return data.user;
}

export async function requireAuthenticatedUser(): Promise<User> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED");
  }
  return user;
}
