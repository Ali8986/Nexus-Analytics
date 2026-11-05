import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnvironment } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseEnvironment", () => {
  it("returns a valid public Supabase configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_example-key",
    );

    expect(getSupabaseEnvironment()).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_example-key",
    });
  });

  it("reports missing configuration with a safe message", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(() => getSupabaseEnvironment()).toThrow(
      "Missing required environment variable NEXT_PUBLIC_SUPABASE_URL.",
    );
  });

  it("rejects insecure remote URLs and non-publishable keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_not-public");

    expect(() => getSupabaseEnvironment()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL",
    );

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    expect(() => getSupabaseEnvironment()).toThrowError(
      new Error(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key beginning with sb_publishable_.",
      ),
    );
  });
});
