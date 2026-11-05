import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthFrame } from "@/components/auth-frame";
import { PasswordResetForm } from "@/components/auth-forms";
import { getAuthenticatedUser } from "@/lib/auth/current-user";

export const instant = false;

export default async function ResetPasswordPage() {
  await connection();
  if (!(await getAuthenticatedUser())) redirect("/forgot-password");

  return (
    <AuthFrame>
      <PasswordResetForm />
    </AuthFrame>
  );
}
