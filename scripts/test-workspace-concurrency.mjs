import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const databaseContainer = "supabase_db_Nexus";
const workspaceId = randomUUID();
const ownerId = randomUUID();
const firstAdminId = randomUUID();
const secondAdminId = randomUUID();
const triggerTestMemberId = randomUUID();
const userIds = [ownerId, firstAdminId, secondAdminId, triggerTestMemberId];
const sessions = new Set();
let testFailed = false;
let primaryError;

function psqlArguments() {
  return [
    "exec",
    "-i",
    databaseContainer,
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
}

function waitForClose(closed, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    closed.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function runSql(sql) {
  await execFileAsync("docker", [...psqlArguments(), "-c", sql], {
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

async function querySql(sql) {
  const result = await execFileAsync(
    "docker",
    [...psqlArguments(), "-At", "-c", sql],
    { windowsHide: true },
  );
  return result.stdout.trim();
}

function startSqlSession(sql) {
  const child = spawn("docker", psqlArguments(), {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });

  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  child.once("close", (code, signal) => {
    resolveClosed({ code, signal });
  });

  const completed = closed.then(({ code, signal }) => {
    if (spawnError) {
      throw spawnError;
    }

    if (code !== 0) {
      throw new Error(
        `local psql session exited with status ${code ?? "unknown"}${signal ? ` (${signal})` : ""}: ${stderr.trim() || "no diagnostic output"}`,
      );
    }

    return stdout;
  });
  let completionError;
  completed.catch((error) => {
    completionError = error;
  });

  const session = {
    completed,
    get completionError() {
      return completionError;
    },
    async stopAndWait() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();

        const closedWithinGracePeriod = await waitForClose(closed, 2_000);

        if (!closedWithinGracePeriod) {
          child.kill("SIGKILL");
          const closedAfterForceKill = await waitForClose(closed, 5_000);

          if (!closedAfterForceKill) {
            throw new Error("could not stop a spawned local psql session");
          }
        }
      } else {
        await closed;
      }
    },
  };
  sessions.add(session);
  child.stdin.end(sql);

  return session;
}

function redactSensitiveText(value) {
  return value
    .replace(
      /\b(password|token|secret|api[_-]?key)\b(\s*[=:]\s*|\s+)[^\s,;]+/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /\b(NEXT_PUBLIC_[A-Z0-9_]+|SUPABASE_[A-Z0-9_]+)\s*=\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED]",
    )
    .replace(/\bpostgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[REDACTED]@")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[REDACTED]");
}

function reportError(context, error) {
  const message =
    error instanceof Error ? error.message : String(error);
  console.error(`${context}: ${redactSensitiveText(message)}`);

  if (error instanceof Error && error.stack && error.stack !== error.message) {
    console.error(`Stack: ${redactSensitiveText(error.stack)}`);
  }
}

async function waitForFirstTransferToHoldLock() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = await querySql(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_activity
        WHERE application_name = 'nexus_owner_concurrency_test_a'
          AND state = 'active'
          AND query LIKE '%pg_sleep(1)%'
      );
    `);

    if (active === "t") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("first transfer did not reach its locked pause");
}

async function waitForMembershipTriggerLock() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const waiting = await querySql(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_activity
        WHERE application_name = 'nexus_membership_trigger_waiter'
          AND state = 'active'
          AND wait_event_type = 'Lock'
      );
    `);

    if (waiting === "t") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("second membership write did not wait for the trigger's workspace lock");
}

async function cleanup() {
  const ids = userIds.map((id) => `'${id}'`).join(", ");
  await runSql(
    `DELETE FROM public.workspaces WHERE id = '${workspaceId}'; DELETE FROM auth.users WHERE id IN (${ids});`,
  );
}

try {
  const users = userIds
    .map(
      (id, index) =>
        `('${id}', 'workspace-concurrency-${index}-${id}@example.invalid', pg_catalog.now(), pg_catalog.now())`,
    )
    .join(",\n");

  await runSql(`
    BEGIN;
    INSERT INTO auth.users (id, email, created_at, updated_at) VALUES ${users};
    INSERT INTO public.workspaces (
      id, name, reporting_currency, reporting_timezone, created_by
    ) VALUES (
      '${workspaceId}', 'Concurrency test workspace', 'USD', 'UTC', '${ownerId}'
    );
    INSERT INTO public.workspace_members (
      workspace_id, user_id, role, created_by
    ) VALUES
      ('${workspaceId}', '${ownerId}', 'owner', '${ownerId}'),
      ('${workspaceId}', '${firstAdminId}', 'admin', '${ownerId}'),
      ('${workspaceId}', '${secondAdminId}', 'admin', '${ownerId}'),
      ('${workspaceId}', '${triggerTestMemberId}', 'analyst', '${ownerId}');
    COMMIT;
  `);

  const firstTransfer = startSqlSession(`
    SET application_name = 'nexus_owner_concurrency_test_a';
    SET statement_timeout = '10s';
    BEGIN;
    SELECT id FROM public.workspaces WHERE id = '${workspaceId}' FOR UPDATE;
    UPDATE public.workspace_members
    SET role = 'admin'
    WHERE workspace_id = '${workspaceId}' AND user_id = '${ownerId}';
    UPDATE public.workspace_members
    SET role = 'owner'
    WHERE workspace_id = '${workspaceId}' AND user_id = '${firstAdminId}';
    SELECT pg_catalog.pg_sleep(1);
    COMMIT;
  `);

  await waitForFirstTransferToHoldLock();

  const secondTransfer = startSqlSession(`
    SET statement_timeout = '10s';
    BEGIN;
    SELECT id FROM public.workspaces WHERE id = '${workspaceId}' FOR UPDATE;
    UPDATE public.workspace_members
    SET role = 'admin'
    WHERE workspace_id = '${workspaceId}' AND role = 'owner';
    UPDATE public.workspace_members
    SET role = 'owner'
    WHERE workspace_id = '${workspaceId}' AND user_id = '${secondAdminId}';
    COMMIT;
  `);

  await Promise.all([firstTransfer.completed, secondTransfer.completed]);

  const result = await querySql(`
    SELECT pg_catalog.count(*) || '|' || pg_catalog.min(user_id::text)
    FROM public.workspace_members
    WHERE workspace_id = '${workspaceId}' AND role = 'owner';
  `);

  if (result !== `1|${secondAdminId}`) {
    throw new Error("concurrent transfers did not serialize to exactly one expected owner");
  }

  const triggerLockHolder = startSqlSession(`
    SET application_name = 'nexus_membership_trigger_holder';
    SET statement_timeout = '10s';
    BEGIN;
    UPDATE public.workspace_members
    SET role = 'viewer'
    WHERE workspace_id = '${workspaceId}'
      AND user_id = '${triggerTestMemberId}';
    SELECT pg_catalog.pg_sleep(1);
    COMMIT;
  `);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = await querySql(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_activity
        WHERE application_name = 'nexus_membership_trigger_holder'
          AND state = 'active'
          AND query LIKE '%pg_sleep(1)%'
      );
    `);

    if (active === "t") {
      break;
    }

    if (attempt === 99) {
      throw new Error("membership trigger transaction did not reach its locked pause");
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const triggerLockWaiter = startSqlSession(`
    SET application_name = 'nexus_membership_trigger_waiter';
    SET statement_timeout = '10s';
    BEGIN;
    UPDATE public.workspace_members
    SET role = 'viewer'
    WHERE workspace_id = '${workspaceId}'
      AND user_id = '${firstAdminId}';
    COMMIT;
  `);

  await waitForMembershipTriggerLock();
  await Promise.all([triggerLockHolder.completed, triggerLockWaiter.completed]);

  const finalState = await querySql(`
    SELECT
      (SELECT pg_catalog.count(*)
       FROM public.workspace_members
       WHERE workspace_id = '${workspaceId}' AND role = 'owner')
      || '|'
      || (SELECT role::text
          FROM public.workspace_members
          WHERE workspace_id = '${workspaceId}' AND user_id = '${secondAdminId}')
      || '|'
      || (SELECT role::text
          FROM public.workspace_members
          WHERE workspace_id = '${workspaceId}' AND user_id = '${firstAdminId}')
      || '|'
      || (SELECT role::text
          FROM public.workspace_members
          WHERE workspace_id = '${workspaceId}' AND user_id = '${triggerTestMemberId}');
  `);

  if (finalState !== "1|owner|viewer|viewer") {
    throw new Error("trigger-lock test did not preserve the Owner and both concurrent writes");
  }

  console.log(
    "Concurrent ownership transfers serialized; trigger-based membership writes also serialized.",
  );
} catch (error) {
  primaryError = error;
  reportError("Concurrent ownership test failed", error);
  testFailed = true;
} finally {
  const stopResults = await Promise.allSettled(
    [...sessions].map((session) => session.stopAndWait()),
  );
  const stopErrors = stopResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);

  for (const error of stopErrors) {
    reportError("Failed to stop a spawned local psql session", error);
    testFailed = true;
  }

  for (const session of sessions) {
    if (session.completionError && session.completionError !== primaryError) {
      reportError("Spawned local psql session failed", session.completionError);
      testFailed = true;
    }
  }

  if (stopErrors.length === 0) {
    try {
      await cleanup();

      const remainingFixtures = await querySql(`
        SELECT
          (SELECT pg_catalog.count(*)
           FROM public.workspaces
           WHERE id = '${workspaceId}')
          || '|'
          || (SELECT pg_catalog.count(*)
              FROM auth.users
              WHERE id IN (${userIds.map((id) => `'${id}'`).join(", ")}));
      `);

      if (remainingFixtures !== "0|0") {
        throw new Error(
          `test fixture cleanup incomplete: workspace and user counts are ${remainingFixtures}`,
        );
      }

      console.log("Cleanup verified: generated workspace and auth users were removed.");
    } catch (error) {
      reportError("Local test fixture cleanup failed", error);
      testFailed = true;
    }
  }
}

if (testFailed) {
  process.exitCode = 1;
}
