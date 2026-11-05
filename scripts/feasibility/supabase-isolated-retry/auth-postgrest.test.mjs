import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const apiUrl = process.env.ISOLATED_SUPABASE_API_URL;
const publishableKey = process.env.ISOLATED_SUPABASE_PUBLISHABLE_KEY;
const dbContainer = "supabase_db_nexus-auth-feasibility-retry";

if (!apiUrl || !publishableKey) {
  console.error("[BLOCKED] Required in-memory local API configuration unavailable.");
  process.exit(2);
}

let failures = 0;
const outcomes = [];

function record(name, passed, details = "") {
  const status = passed ? "PASS" : "FAIL";
  outcomes.push({ name, status, details });
  console.log(`[${status}] ${name}${details ? ` — ${details}` : ""}`);
  if (!passed) failures += 1;
}

async function request(path, { token, profile, method = "GET", body } = {}) {
  const headers = { apikey: publishableKey };
  if (token) headers.authorization = `Bearer ${token}`;
  if (profile) {
    headers["accept-profile"] = profile;
    if (method !== "GET") headers["content-profile"] = profile;
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(new URL(path, apiUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

async function expectDenied(name, path, options = {}) {
  try {
    const { response } = await request(path, options);
    record(name, !response.ok, `HTTP ${response.status}`);
  } catch {
    record(name, false, "request failed without exposing response content");
  }
}

function runPsqlFixture(userA, userB) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(userA) || !uuidPattern.test(userB) || userA === userB) {
    throw new Error("Auth returned invalid or duplicate test user identities.");
  }

  const sql = `
    INSERT INTO public.feas_workspaces (id, workspace_name)
    VALUES
      ('00000000-0000-0000-0000-000000000101', 'Integration Workspace A'),
      ('00000000-0000-0000-0000-000000000102', 'Integration Workspace B');
    INSERT INTO public.feas_memberships (workspace_id, user_id, member_role)
    VALUES
      ('00000000-0000-0000-0000-000000000101', '${userA}', 'admin'),
      ('00000000-0000-0000-0000-000000000102', '${userB}', 'viewer');
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        dbContainer,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
      ],
      { stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", () => reject(new Error("Fixture process could not start.")));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Fixture SQL failed (exit ${code ?? "unknown"}). ${stderr.trim().slice(0, 300)}`));
    });
    child.stdin.end(sql);
  });
}

async function createUser(label) {
  const email = `nexus-feasibility-${label}-${randomBytes(8).toString("hex")}@example.com`;
  const password = randomBytes(32).toString("base64url");
  const signup = await request("/auth/v1/signup", {
    method: "POST",
    body: { email, password },
  });
  if (!signup.response.ok || !signup.data?.user?.id) {
    throw new Error(`Local Auth signup failed (HTTP ${signup.response.status}).`);
  }

  let user = signup.data.user;
  let accessToken = signup.data.access_token;
  if (!accessToken) {
    const signIn = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    if (!signIn.response.ok || !signIn.data?.access_token) {
      throw new Error(`Local Auth sign-in failed (HTTP ${signIn.response.status}).`);
    }
    user = signIn.data.user;
    accessToken = signIn.data.access_token;
  }

  const verified = await request("/auth/v1/user", { token: accessToken });
  if (!verified.response.ok || verified.data?.id !== user.id) {
    throw new Error(`Local Auth user lookup failed (HTTP ${verified.response.status}).`);
  }
  return { id: user.id, accessToken };
}

try {
  const health = await request("/auth/v1/health");
  record("Local Auth health", health.response.ok, `HTTP ${health.response.status}`);

  const restHealth = await request("/rest/v1/");
  record("Local REST endpoint health", restHealth.response.ok, `HTTP ${restHealth.response.status}`);

  const userA = await createUser("a");
  const userB = await createUser("b");
  record("Create two local Auth users and verify via Auth lookup", userA.id !== userB.id);

  await runPsqlFixture(userA.id, userB.id);
  record("Create two workspace and membership fixtures", true);

  const entryA = await request("/rest/v1/rpc/feasibility_entry", {
    method: "POST",
    token: userA.accessToken,
    body: {
      p_workspace_id: "00000000-0000-0000-0000-000000000101",
      p_subject: userA.id,
    },
  });

  const chain = entryA.data;
  const nested = chain?.nested;
  const audit = nested?.audit;
  const identityMatches =
    entryA.response.ok &&
    chain?.auth_uid === userA.id &&
    nested?.auth_uid === userA.id &&
    audit?.auth_uid === userA.id;
  record("Auth-issued JWT subject matches auth.uid through nested functions", identityMatches);

  const ownerChain =
    chain?.current_user === "nexus_invitation_manager" &&
    nested?.current_user === "nexus_assertion_verifier" &&
    audit?.current_user === "nexus_audit_writer";
  record("Nested SECURITY DEFINER current_user ownership", ownerChain);

  const sessions = [chain?.session_user, nested?.session_user, audit?.session_user];
  record(
    "session_user remains stable through nested functions",
    sessions.every(Boolean) && sessions.every((value) => value === sessions[0]),
    sessions[0] ? `connection identity ${sessions[0]}` : "",
  );

  const userBCall = await request("/rest/v1/rpc/feasibility_acceptor_probe", {
    method: "POST",
    token: userB.accessToken,
    body: { p_workspace_id: "00000000-0000-0000-0000-000000000102" },
  });
  record(
    "Second Auth user receives its own auth.uid",
    userBCall.response.ok && userBCall.data?.auth_uid === userB.id,
  );

  const crossRead = await request(
    "/rest/v1/feas_workspaces?id=eq.00000000-0000-0000-0000-000000000102&select=id",
    { token: userA.accessToken },
  );
  record(
    "Cross-workspace REST read is isolated",
    crossRead.response.ok && Array.isArray(crossRead.data) && crossRead.data.length === 0,
    `HTTP ${crossRead.response.status}`,
  );

  const crossWrite = await request(
    "/rest/v1/feas_memberships?workspace_id=eq.00000000-0000-0000-0000-000000000102",
    {
      method: "PATCH",
      token: userA.accessToken,
      body: { member_role: "admin" },
    },
  );
  record("Cross-workspace membership write is denied", !crossWrite.response.ok, `HTTP ${crossWrite.response.status}`);

  const anonCall = await request("/rest/v1/rpc/feasibility_entry", {
    method: "POST",
    body: {
      p_workspace_id: "00000000-0000-0000-0000-000000000101",
      p_subject: userA.id,
    },
  });
  record("Anonymous invocation of protected RPC is denied", !anonCall.response.ok, `HTTP ${anonCall.response.status}`);

  const missingJwt = await request("/rest/v1/rpc/feasibility_entry", {
    method: "POST",
    body: {
      p_workspace_id: "00000000-0000-0000-0000-000000000101",
      p_subject: userA.id,
    },
  });
  record("Missing JWT is denied", !missingJwt.response.ok, `HTTP ${missingJwt.response.status}`);

  const invalidJwt = await request("/rest/v1/rpc/feasibility_entry", {
    method: "POST",
    token: "invalid-test-token",
    body: {
      p_workspace_id: "00000000-0000-0000-0000-000000000101",
      p_subject: userA.id,
    },
  });
  record("Invalid JWT is denied", !invalidJwt.response.ok, `HTTP ${invalidJwt.response.status}`);

  await expectDenied(
    "Altered subject cannot impersonate another user",
    "/rest/v1/rpc/feasibility_entry",
    {
      method: "POST",
      token: userA.accessToken,
      body: {
        p_workspace_id: "00000000-0000-0000-0000-000000000101",
        p_subject: userB.id,
      },
    },
  );

  await expectDenied(
    "Direct verifier invocation is denied",
    "/rest/v1/rpc/assertion_probe",
    {
      method: "POST",
      token: userA.accessToken,
      profile: "private",
      body: {
        p_workspace_id: "00000000-0000-0000-0000-000000000101",
        p_subject: userA.id,
      },
    },
  );

  await expectDenied(
    "Direct audit-helper invocation is denied",
    "/rest/v1/rpc/audit_probe_write",
    {
      method: "POST",
      token: userA.accessToken,
      profile: "private",
      body: {
        p_event_type: "probe.entry",
        p_workspace_id: "00000000-0000-0000-0000-000000000101",
      },
    },
  );

  const allPassed = failures === 0;
  console.log(`SUMMARY ${outcomes.filter((item) => item.status === "PASS").length} passed, ${failures} failed.`);
  process.exitCode = allPassed ? 0 : 1;
} catch (error) {
  const safeMessage =
    error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300) : "Unknown sanitized test error.";
  console.error(`[BLOCKED] Integration harness stopped: ${safeMessage}`);
  process.exitCode = 2;
}
