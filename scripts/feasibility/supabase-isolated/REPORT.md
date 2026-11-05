# Isolated Supabase Auth/PostgREST Feasibility Report

## Status and safety event

The Supabase CLI startup command unexpectedly printed generated local API
credentials and signing material in its output. Their values are intentionally
not repeated here. No credentials were used for Auth requests or shared with a
hosted project. To limit further exposure, I immediately stopped the isolated
Supabase project and did not continue with endpoint or migration tests.

The initial startup attempt failed its health check because the isolated
analytics and realtime services were unhealthy. Those services were disabled
in this isolated configuration because Auth and PostgREST identity tests do not
require them. A second startup completed, but emitted the generated credentials
as described above.

## Project and configuration

- Supabase CLI: `2.122.0`
- Project ID: `nexus-auth-feasibility`
- PostgreSQL major version configured: `17`
- Configured local API port: `56321`
- Configured local database port: `56322`
- Configured shadow database port: `56320`
- Configured Studio port: `56323`
- Configured local mail UI port: `56324`
- Configured SMTP / POP3 ports: `56325` / `56326`
- Analytics and Realtime: disabled for the isolated Auth/PostgREST test
- Pooler port: `56329` (pooler disabled)
- No hosted project was linked or accessed.

The CLI completed stack startup on its second attempt, but PostgreSQL version
and Auth/REST/API endpoint health were not queried before the project was
stopped. Therefore, the observed runtime PostgreSQL version and endpoint health
remain unverified.

## Test results

| Test | Expected result | Actual result | Status |
|---|---|---|---|
| Verify unique isolated directory and project ID | Separate project with unique ID | Directory was separate from the Nexus `supabase` directory; ID was set to `nexus-auth-feasibility` | PASS |
| Check proposed names and ports before startup | No name/port conflicts | Exact project-derived names were unused; chosen configured ports were available | PASS |
| Start isolated stack | Local Supabase services start | First attempt failed health checks for analytics/realtime; second attempt completed after those services were disabled | PASS WITH SETUP ISSUE |
| Verify runtime PostgreSQL version | Server reports PostgreSQL 17 | Not queried before safety stop | NOT RUN |
| Verify local Auth, PostgREST, and API endpoints | All required endpoints respond locally | Not queried before safety stop | NOT RUN |
| Create two test Auth users | Local Auth issues distinct user IDs | Not run | BLOCKED |
| Authenticated JWT identity through nested definer chain | `auth.uid()` equals Auth user through every function owner boundary | Not run | BLOCKED |
| Second-user identity isolation | Second JWT yields only second subject | Not run | BLOCKED |
| Cross-workspace reads and writes | Other workspace denied | Not run | BLOCKED |
| RPC grant boundaries | Only intended public RPC callable by authenticated | Not run | BLOCKED |
| Direct verifier/audit helper denial | Internal helper calls denied | Not run | BLOCKED |
| Anonymous, invalid, missing, and altered-subject requests | Requests rejected | Not run | BLOCKED |
| Internal role assumption through API | No application role can assume internal roles | Not run | BLOCKED |
| Isolated CLI migration identity | Migration records actual role and proves required DDL/grants | No migration was created or applied | NOT RUN |
| Stop isolated project | Only isolated stack stops; Nexus remains untouched | CLI stop completed; no isolated containers were listed afterward | PASS |
| Preserve isolated volume | Dedicated volume remains for review | Three Docker volumes with the isolated project ID remain listed | PASS |
| Existing Nexus database remains running | Nexus DB container remains up | `supabase_db_Nexus` remained running with its original observed container ID | PASS |

## Resources and cleanup state

- The isolated project was configured with the project ID above and the
  dedicated port range listed above.
- After the CLI stop command, no Docker containers matching
  `nexus-auth-feasibility` were listed.
- The project-specific Docker volumes
  `supabase_db_nexus-auth-feasibility`,
  `supabase_edge_runtime_nexus-auth-feasibility`, and
  `supabase_storage_nexus-auth-feasibility` remain listed.
- The CLI stop command completed successfully and removed/stopped the
  containers while preserving the listed project-specific volumes.
- No further cleanup or Docker deletion command was issued.
- The previously created plain PostgreSQL feasibility container and volume
  have different names and were not operated on during this task.
- The existing Nexus database container remained running. No command was run
  against its database.

## Migration identity and architecture implications

No migration identity was tested in the isolated Supabase project. The
Supabase CLI startup may initialize its own stack, but that is not evidence
about the role used by a future user migration. An explicit diagnostic
migration and catalog check would be needed in a newly approved isolated run.

No Auth/PostgREST identity conclusion can be drawn from this attempt. The
earlier plain PostgreSQL role/RLS tests remain evidence only for PostgreSQL
mechanics, not for Supabase JWT authenticity or PostgREST role switching.

The HMAC/Vault key-storage blocker remains unresolved. Vault permissions were
not inspected or changed, and no secret values were queried.

## Next-step recommendation

Treat this integration run as **BLOCKED**. The project configuration and
startup demonstrated that a separate local project can be initialized with
distinct ports, but the CLI credential output violated the no-credential-output
requirement, so no further authenticated requests were attempted.

Before any retry, obtain explicit approval for a safer startup/output procedure
that captures CLI-generated credentials without displaying or persisting them.
Then rerun the identity, RLS, direct-RPC, and migration-identity tests in a
fresh isolated project. Do not use any output credentials from this run.
