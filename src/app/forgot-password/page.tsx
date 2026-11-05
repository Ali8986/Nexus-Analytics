import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordRecoveryForm } from "@/components/auth-forms";
import { getAuthenticatedUser } from "@/lib/auth/current-user";

export const instant = false;

export default async function ForgotPasswordPage() {
  await connection();
  if (await getAuthenticatedUser()) redirect("/");

  return (
    <AuthFrame>
      <PasswordRecoveryForm />
    </AuthFrame>
  );
}
