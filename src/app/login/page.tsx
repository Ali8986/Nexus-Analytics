import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";
import { getAuthenticatedUser } from "@/lib/auth/current-user";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  await connection();
  if (await getAuthenticatedUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <AuthFrame footer="Secure access to your business workspace.">
      <LoginForm callbackError={error === "callback"} />
    </AuthFrame>
  );
}
