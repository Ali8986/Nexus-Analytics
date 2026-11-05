# Nexus Auth/PostgREST Feasibility Retry

## Result

**BLOCKED — integration tests and migration identity were not reached.**

The CLI startup command returned exit code `1` on the two earlier attempts and
on one controlled diagnostic attempt. Standard output and standard error for
the controlled attempt were captured in PowerShell memory and suppressed;
they were not saved or printed. A sanitized classifier categorized the latest
failure as a **migration/bootstrap failure**, but this broad category does not
identify whether the underlying issue is migration SQL, service initialization,
or another bootstrap dependency. The specific cause remains unknown. No
credentials, JWTs, URLs, or key values are included in this report.

No retry-project containers were present after the controlled attempt, so no
additional stop operation was needed. The retry project's ports were free on
the subsequent check. The Nexus database container remained running with its
previously observed ID.

## Isolated project configuration

- Supabase CLI: `2.122.0`
- Project ID: `nexus-auth-feasibility-retry`
- Directory: `E:\Nexus\scripts\feasibility\supabase-isolated-retry`
- API: `57321`
- Database: `57322`
- Shadow database: `57320`
- Studio: `57323`
- Mail UI: `57324`
- Analytics: disabled
- Realtime: disabled
- Pooler: disabled; configured port `57329`
- Inspector: `57328`
- SMTP and POP3: `57325` and `57326`
- All configured ports were checked free before startup.
- Exact project-derived resource names were checked unused before startup.
- The directory is separate from both the Nexus Supabase directory and the
  prior isolated project directory.
- After the controlled diagnostic attempt, ports `57320` through `57329` were
  all free, and no retry-project containers were listed.

No runtime PostgreSQL version or Auth/REST health check was possible because
startup did not complete successfully.

## Diagnostic-only investigation

- Docker Desktop was healthy, and the required Supabase/PostgreSQL images were
  available locally.
- The configured ports were free after the controlled attempt. Earlier
  project preflight also found no port or exact-name collision.
- One controlled `npx supabase@2.122.0 start` attempt was run from this
  isolated directory. Its exit code was `1`; output was captured in memory,
  never printed or written to disk, and then discarded.
- The sanitized output classifier matched only the broad
  migration/bootstrap-failure category. No safe, specific root cause could be
  established, and the startup was not retried.
- Recommended next step: review the isolated diagnostic migration and
  configuration for bootstrap compatibility, then obtain a sanitized,
  category-only startup diagnosis before authorizing any further attempt.
  Do not use the integration harness or apply the migration until a separate
  successful isolated stack is available and explicitly authorized.
- No Auth users, custom migrations, or Auth/PostgREST API requests were
  created or executed during the diagnostic investigation.
- The original `supabase_db_Nexus` container remained running and healthy.
  No original Nexus database or hosted Supabase resource was accessed or
  changed.

## Test outcomes

| Test | Result | Notes |
|---|---|---|
| Verify distinct directory and project ID | PASS | New directory and ID were used. |
| Check dedicated ports and exact resource names | PASS | Preflight checks found no collisions. |
| Start isolated Supabase project | FAIL / BLOCKED | CLI exit code 1 on prior attempts and the single controlled diagnostic; latest output matched only the broad migration/bootstrap category. |
| Verify runtime PostgreSQL version | NOT RUN | No running isolated database remained. |
| Verify local Auth, PostgREST, and API health | NOT RUN | Startup failure prevented endpoint checks. |
| Create two local Auth users | NOT RUN | No requests were made. |
| Verify JWT subject / `auth.uid()` through nested definer functions | NOT RUN | No Auth-issued JWT or PostgREST request was used. |
| Verify nested `current_user` and `session_user` | NOT RUN | No RPC execution occurred. |
| Verify second-user identity | NOT RUN | No Auth users were created. |
| Verify cross-workspace read/write isolation | NOT RUN | No fixture rows or REST calls were made. |
| Verify direct verifier/audit helper denial | NOT RUN | No REST calls were made. |
| Verify anonymous, missing, invalid, or altered-subject requests | NOT RUN | No REST calls were made. |
| Verify internal roles cannot be assumed through the API | NOT RUN | No migration or RPC calls were made. |
| Apply diagnostic migration and verify migration identity | NOT RUN | No migration was applied. |
| Stop isolated stack | PASS | No retry-project containers remained after the controlled attempt; no other stack was stopped. |
| Preserve isolated volumes | BLOCKED | No project-derived volumes remained listed after the stop attempt. |
| Confirm Nexus DB remained running | PASS | The existing `supabase_db_Nexus` container remained running with its original observed ID. |

## Credential handling

The `start` command’s stdout and stderr were captured in memory only. They were
not printed or written to files. No output credentials were parsed or used.
No `.env` or credential file was read. No Auth or database requests were made.

## Files created in the retry directory

- `supabase/config.toml`
- `supabase/migrations/20261102130000_auth_postgrest_probe.sql`
- `auth-postgrest.test.mjs`
- `REPORT.md`

The diagnostic migration and test harness exist only in this isolated
directory and were not applied or run. No Nexus application code, migrations,
configuration, database, or hosted project was modified or accessed.

## Architecture implications

This retry provides **no evidence** about real Supabase Auth/PostgREST request
identity, nested function behavior under PostgREST, or the CLI migration
identity. The prior plain PostgreSQL feasibility results remain limited to
PostgreSQL mechanics.

The HMAC/Vault key-storage blocker also remains unresolved. Vault permissions
and secret values were not inspected or changed.

Do not treat this attempt as a successful integration feasibility test. A
further attempt requires explicit approval and a safe diagnosis of the isolated
CLI startup failure. Do not retry using any credentials from another project.

## Static bootstrap diagnosis

This review was static only. No Supabase, Docker, migration, test, or database
commands were run, and no files other than this report were changed. The
earlier broad “migration/bootstrap failure” category is not proof that SQL
caused startup to fail.

### Findings from the prior static review

| File and line | Finding | Effect |
|---|---|---|
| [`supabase/config.toml`](./supabase/config.toml#L69) | Seeding was enabled and explicitly named `./seed.sql`, but no seed file exists. | Corrected below: seeding is disabled and the seed path list is empty. This was a real config/file mismatch, but not a confirmed cause of the earlier startup failure. |
| [`20261102130000_auth_postgrest_probe.sql`](./supabase/migrations/20261102130000_auth_postgrest_probe.sql#L281) | The prior review incorrectly stated that the public-RPC revoke included `authenticated`. On reinspection, the original SQL already excluded `authenticated`; that finding was inaccurate. | The final SQL now revokes all API roles first and grants `authenticated` to only the two intended RPCs afterward, making the final ACL explicit. |
| [`20261102130000_auth_postgrest_probe.sql`](./supabase/migrations/20261102130000_auth_postgrest_probe.sql#L339) | Capability diagnostic fields previously used hardcoded `true` values. | Corrected below: database/schema privilege checks are used where reliable; unsupported capability checks are NULL (unknown). |

### Potential causes — unverified

- The missing seed file could have explained bootstrap failure if the CLI ran
  the configured seed phase. Seeding is now disabled; static inspection cannot
  establish whether that phase ran during the earlier failed attempt.
- The migration creates roles at lines 1–5 and assigns table/function
  ownership at lines 102, 151, 198, 246, and 275. If the CLI migration
  identity lacks `CREATEROLE`/superuser privileges or is not authorized to
  assign ownership to those roles, the migration can fail at those statements.
  The migration does not grant the executing identity membership in the
  internal roles. The actual CLI migration identity and effective privileges
  remain unknown.
- The audit table is transferred to `nexus_audit_table_owner` at line 102
  before its policies are created at lines 106 and 114. If the migration
  identity is not superuser and is not otherwise authorized as that table
  owner, subsequent policy creation may fail. Whether this applies depends on
  the actual migration identity and role memberships.
- The migration relies on Supabase-initialized `auth.uid()` and the
  `authenticated`, `anon`, and `service_role` roles (migration lines 1–5 and
  14 onward). Those are expected in a Supabase local database, but their
  availability at the exact migration stage was not verified. Missing
  dependencies would make migration statements fail.
- The configuration exposes `private` to PostgREST at
  [`config.toml:13`](./supabase/config.toml#L13). This is intentional for the
  direct-helper denial probe, but broadens the exposed schema surface; its
  safety depends on the function/table grants and revokes being correct.

No definite SQL syntax error was identified by static review of the sole
migration. No migration parser or live database validation was run, per the
static-only restriction.

The harness's authorization-header line (line 25) is redacted in the
inspection output, so its literal syntax could not be verified safely.
Accordingly, no syntax defect is claimed for that line; it should be checked
locally without exposing its token expression before a future harness run.

### Smallest safe corrections recommended

1. Verify and parse-check the harness locally without printing or logging its
   authorization-header expression before attempting integration tests.
2. Once migration identity is known, ensure the migration is run by a
   principal able to create the internal roles and transfer ownership, or
   redesign the setup to use the actual supported privilege model.

**Is another isolated startup attempt worthwhile?** Yes, but only after the
remaining unresolved migration-identity and harness concerns are reviewed,
and with separate authorization for a single isolated attempt. The static
findings did not prove which issue caused the prior startup failure. Do not
run the integration harness or apply the migration until a successful isolated
startup and explicit authorization for those tests.

## Static corrections applied

Only static edits were made, within this isolated project:

- In [`supabase/config.toml`](./supabase/config.toml#L67), database seeding is
  disabled and `sql_paths` is empty. No seed file or data was created.
- In [`20261102130000_auth_postgrest_probe.sql`](./supabase/migrations/20261102130000_auth_postgrest_probe.sql#L281),
  API-role execution is revoked from `PUBLIC`, `anon`, `authenticated`, and
  `service_role` on both public RPCs before `authenticated` is granted
  `EXECUTE` on those two functions only. Internal helper grants remain
  limited to their designated internal roles; application/API-role revokes
  remain in place.
- The migration identity diagnostic checks `CREATEROLE`/superuser from the
  actual current role row, database `CREATE`, and `CREATE` on both relevant
  schemas. Ownership assignment, policy creation, and grant capability are
  recorded as `NULL` (unknown), not asserted as successful. The corresponding
  fields permit NULL.
- Final function permission intent:

  | Function class | `authenticated` | `anon` | `service_role` | `PUBLIC` |
  |---|---:|---:|---:|---:|
  | Two intended public RPC entry points | EXECUTE | None | None | None |
  | Internal verifier and audit helpers | None | None | None | None |

  Internal-to-internal execution grants remain only for the verifier-to-audit
  and manager-to-verifier calls. The public RPC functions remain owned by
  their designated manager and acceptor roles.
- No migration was applied, and no startup, Docker, database, Auth, REST, or
  integration-test command was run for these corrections.
