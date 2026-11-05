import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnv;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
loadEnvConfig(projectRoot, true, undefined, true);

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!projectUrl || !publishableKey) {
  console.log("HTTP status: not sent");
  console.log("Connection: failed (required Supabase configuration is missing)");
  process.exitCode = 1;
} else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
  console.log("HTTP status: not sent");
  console.log("Connection: failed (publishable key configuration is invalid)");
  process.exitCode = 1;
} else {
  let endpoint;

  try {
    const parsedUrl = new URL(projectUrl);
    if (
      parsedUrl.protocol !== "https:" &&
      !(
        parsedUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)
      )
    ) {
      throw new Error("invalid protocol");
    }

    if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
      throw new Error("invalid URL components");
    }

    endpoint = new URL("/auth/v1/health", parsedUrl);
  } catch {
    console.log("HTTP status: not sent");
    console.log("Connection: failed (Supabase URL configuration is invalid)");
    process.exitCode = 1;
  }

  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          Accept: "application/json",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });

      console.log(`HTTP status: ${response.status}`);
      if (response.ok) {
        console.log("Connection: succeeded");
      } else {
        const explanation =
          response.status === 401 || response.status === 403
            ? "Supabase Auth rejected the publishable-key request"
            : response.status >= 500
              ? "Supabase Auth reported a server error"
              : response.status >= 300 && response.status < 400
                ? "the endpoint redirected; redirects are not followed"
                : "the Supabase Auth health endpoint returned an unsuccessful status";
        console.log(`Connection: failed (${explanation})`);
        process.exitCode = 1;
      }
    } catch (error) {
      const code = error?.cause?.code;
      const reason =
        code === "ENOTFOUND" || code === "EAI_AGAIN"
          ? "DNS lookup failed"
          : code === "ECONNREFUSED"
            ? "connection was refused"
            : code === "ETIMEDOUT" || error?.name === "TimeoutError"
              ? "request timed out"
              : "network request failed";
      console.log("HTTP status: unavailable");
      console.log(`Connection: failed (${reason})`);
      process.exitCode = 1;
    }
  }
}
