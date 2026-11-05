# PostgreSQL 17 Role and RLS Feasibility Test Report

## Scope and isolation

This test used a new, disposable PostgreSQL instance only. It did not connect to
the Nexus Supabase stack or any hosted project. The container used
`--network none`, no published ports, and a dedicated Docker volume. The
container was initialized with local trust authentication because all database
access was through `docker exec`; no test password or hosted credential was
used.

- Image: `postgres:17.11-alpine`
- Server version: PostgreSQL `17.11`
- Container: `nexus-pg17-feasibility`
- Container ID: `8c0fe1c188585772c9107112bc0ee6dba19c989312ce3576cb1c80996e30ce42`
- Dedicated volume: `nexus-pg17-feasibility-data`
- Volume driver: `local`
- Volume mount point: `/var/lib/docker/volumes/nexus-pg17-feasibility-data/_data`
- The exact container was stopped after identity and mount verification.
- The dedicated volume remains present and is preserved for review.

## Results

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Bootstrap roles and test objects | Isolated roles, schemas, tables, functions, policies, and triggers are created | Completed successfully as disposable `postgres` | PASS |
| Internal role attributes | All five internal roles are `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, and nonsuperuser | All checks passed | PASS |
| Application/login role membership | No application or test login can assume an internal role; no unintended membership involves internal roles | No such membership found; `SET ROLE nexus_audit_writer` as `authenticated` was denied | PASS |
| Entrypoint execution grants | Intended entrypoints are executable by `authenticated`; `anon` and `service_role` cannot execute them | Grant checks passed | PASS |
| Function ownership and search path | Each function has its designated owner and `search_path=""` | Manager, acceptor, verifier, and audit helper ownership/settings matched | PASS |
| Application function ownership transfer | `authenticated` cannot transfer entrypoint ownership | Alter-owner attempt was denied | PASS |
| Nested `SECURITY DEFINER` chain | Entry point, verifier, and audit helper run under their designated owners; identity returns to outer owner | Observed manager → verifier → writer; caller session remained `nexus_test_login`; `auth.uid()` stayed the authenticated subject | PASS |
| Forced RLS and workspace isolation | Manager, verifier, and acceptor see only the caller’s workspace | Both users saw their own workspace; cross-workspace manager/verifier operation was denied | PASS |
| Application access to audit | Application roles cannot access audit records or call internal helpers directly | Direct table read and helper calls were denied; privilege checks showed no application table grants | PASS |
| Audit writer append | Writer can append valid permitted events through its helper under forced RLS | Valid inserts succeeded | PASS |
| Audit writer restrictions | Writer cannot read, update, delete, or truncate audit records | All four attempts were denied; only specified insert columns were granted | PASS |
| Invalid audit events | Unsupported event type and malformed event are rejected | Both were rejected | PASS |
| Append-only triggers | Updates, deletes, and truncates are rejected, including when run as the table-owner role | All three trigger checks passed | PASS |
| Transaction rollback | A rolled-back business operation also rolls back its audit insertion | Audit count remained `3` before and after the rollback probe | PASS |
| Actual Supabase Auth/PostgREST context | Real request JWT identity is preserved through nested definer calls | Not run; test used a documented plain-PostgreSQL `auth.uid()` stand-in | BLOCKED |
| Actual Supabase CLI migration identity | Establish the identity that would run future migrations | Not run; no existing Nexus database was accessed | BLOCKED |
| Vault key isolation / HMAC assertions | Verify key access and assertion verification | Not run; Vault access changes and secret reads were explicitly prohibited | BLOCKED |

### Test harness iterations

- The first application-test attempt failed because the test called
  `has_function_privilege` with a schema-qualified text signature while running
  as a role without `private` schema access. The test was corrected to resolve
  function OIDs through catalogs; this was a harness issue, not an architecture
  failure.
- A follow-up membership assertion incorrectly treated the test login
  `nexus_test_login` as an internal role because its name had the `nexus_`
  prefix. The assertion was corrected to use the explicit internal-role list;
  final membership checks passed.
- The first post-test admin metadata query used an incorrect catalog column
  name. The read-only query was corrected and then confirmed the disposable
  `postgres` role was superuser, `CREATEROLE`, and `BYPASSRLS`.
- The first stop-verification attempt safely refused to stop because Docker
  formatted the running flag as lowercase `true`, while the guard expected
  `True`. The identity check was corrected; the exact verified container was
  then stopped, and the dedicated volume remained present.
- No final test remained failed.

## Migration identity and privilege limits

The bootstrap and ownership assignments ran as `postgres` in the disposable
image. That disposable role was confirmed to be a superuser with `CREATEROLE`
and `BYPASSRLS`. This proves the test objects can be created by an administrative
principal; it does **not** prove the Supabase CLI migration identity can perform
the same operations.

Creating roles, granting memberships, transferring table/function ownership,
and creating schemas/policies require appropriate elevated privileges. A
production migration identity must be verified to have the narrow authority
needed for those operations without granting internal roles to application
users. The actual Nexus CLI migration identity remains unverified.

## Supabase-specific and cryptographic limitations

This was a plain PostgreSQL test. The test `auth.uid()` reads a session setting
solely to simulate request identity. It is not evidence that a caller cannot
forge Supabase request context, and it does not prove PostgREST sets or
preserves the claim as expected. A separate disposable Supabase integration
test is required for real Auth JWT and PostgREST behavior.

No HMAC was executed. No Vault permissions or secret values were inspected or
changed. The prior local preflight finding—that `service_role` can access the
Vault decrypted view and management/decryption functions—remains a blocker for
the proposed shared-HMAC key path. This report does not establish a safe
verifier-only Vault design.

## Conclusion

The PostgreSQL role, nested `SECURITY DEFINER`, forced-RLS, tenant-isolation,
and append-only audit mechanics are **feasible in principle** without giving
internal roles `BYPASSRLS` or granting broad table privileges to
`service_role`.

This does not clear the overall Milestone 2 implementation NO-GO. Supabase
Auth/PostgREST integration, the actual migration identity, hosted compatibility,
and a safe key-storage/verifier boundary remain unverified. Do not begin
Milestone 2 implementation on the basis of this test alone.
