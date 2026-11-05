import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";
import { getAuthenticatedUser } from "@/lib/auth/current-user";

export const instant = false;

export default async function SignupPage() {
  await connection();
  if (await getAuthenticatedUser()) redirect("/");

  return (
    <AuthFrame footer="A calm, clear view of your business.">
      <SignupForm />
    </AuthFrame>
  );
}
