export type SupabaseEnvironment = Readonly<{
  url: string;
  publishableKey: string;
}>;

const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]+$/;

export function getSupabaseEnvironment(): SupabaseEnvironment {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Missing required environment variable NEXT_PUBLIC_SUPABASE_URL. Set it in .env.local.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.",
    );
  }

  const isLocalhost =
    parsedUrl.hostname === "localhost" ||
    parsedUrl.hostname === "127.0.0.1" ||
    parsedUrl.hostname === "[::1]";
  if (
    (parsedUrl.protocol !== "https:" &&
      !(parsedUrl.protocol === "http:" && isLocalhost)) ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL (HTTP is allowed for localhost).",
    );
  }

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    throw new Error(
      "Missing required environment variable NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Set it in .env.local.",
    );
  }

  if (!publishableKeyPattern.test(publishableKey)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key beginning with sb_publishable_.",
    );
  }

  return { url, publishableKey };
}
