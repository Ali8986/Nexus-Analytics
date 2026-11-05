import "server-only";

import { cookies } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { workspaceIdSchema } from "@/lib/validation/schemas";

export const selectedWorkspaceCookieName = "nexus-workspace-id";

export async function getSelectedWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(selectedWorkspaceCookieName)?.value;
  const parsed = workspaceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function setSelectedWorkspaceId(workspaceId: string): Promise<void> {
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) throw new AppError("INVALID_INPUT", parsed.error);

  const cookieStore = await cookies();
  cookieStore.set(selectedWorkspaceCookieName, parsed.data, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSelectedWorkspaceId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(selectedWorkspaceCookieName);
}
