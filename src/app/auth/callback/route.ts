import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getSafeDestination(value: string | null, baseUrl: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  const resolved = new URL(value, baseUrl);
  if (resolved.origin !== new URL(baseUrl).origin) return "/";
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = getSafeDestination(
    request.nextUrl.searchParams.get("next"),
    request.url,
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(destination, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
