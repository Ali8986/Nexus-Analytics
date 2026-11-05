# Nexus Analytics Security Review

**Review scope:** Milestone 1 database foundation and workspace core  
**Current local migration versions:** `20261031203500`, `20261031203600`  
**Status:** Documentation of review findings and recommendations; no implementation work authorized or applied.

## Confirmed findings

### Medium — reporting currency accepts unsupported codes

The current `workspaces_currency_format` constraint checks only that a value contains three uppercase letters. It therefore accepts arbitrary values such as `ZZZ`, not just supported ISO 4217 currency codes. An unsupported code could result in invalid or misleading reporting.

### Medium — reporting timezone accepts unsupported names

The current timezone constraint rejects blank values but does not check whether PostgreSQL recognizes the supplied timezone. A nonblank invalid name can be stored and may cause timezone-aware reporting queries to fail.

## Service-role privilege review

The current migrations explicitly revoke table privileges on `workspaces` and `workspace_members` from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then grant `SELECT` to `authenticated`. The private authorization helpers are executable by `authenticated` only; `anon` and `service_role` do not have helper execution rights. Local privilege inspection confirmed the service role has no access to these tables or helpers under the current grants.

This is appropriately restrictive for the current schema. Supabase's `service_role` is privileged and bypasses RLS; granting it broad tenant-table privileges would create a path around workspace policies. Normal user operations should use the authenticated user's JWT and appropriately authorized database functions. A future trusted server process may need a service-role credential for Supabase Auth Admin API operations, such as invitation delivery, but that does not by itself require tenant-table access. Any future database-side background task requiring elevated access should receive only the narrowly scoped permissions it needs. Service-role credentials must remain server-side and must never be exposed to browser code.

## Security-test coverage gaps

The existing rollback-only SQL tests cover workspace read isolation, membership visibility, denial of direct workspace and membership writes, anonymous access denial, and Owner invariants. They do not directly assert:

- That `anon` and `service_role` cannot execute the private authorization helpers.
- That `authenticated` can execute only the intended helpers.
- The effective table privileges of `service_role`.
- Acceptance and rejection of reporting currency values.
- Acceptance and rejection of reporting timezone values.

The existing Owner and workspace-isolation tests should be preserved. Add privilege assertions for `anon`, `authenticated`, and `service_role`, and add positive and negative validation cases for the currency and timezone rules.

## Ownership concurrency test

The concurrency harness starts two database sessions and creates a real overlap: the first transaction holds a workspace-row lock during a pause, while the second transaction attempts to acquire that lock. It then verifies that exactly one Owner remains. This demonstrates serialization for that explicitly locked transfer sequence.

Limitations:

- Both transactions explicitly lock the workspace row in the test. The test therefore does not independently establish that the membership trigger's lock alone serializes concurrent ownership changes.
- The test runs with the local `postgres` role, not as an authenticated Owner through an application-facing ownership-transfer RPC. No such audited RPC is in scope yet.
- It exercises a controlled schedule rather than a range of transaction interleavings.

When an audited ownership RPC is implemented, test authorization through that RPC. A supplemental concurrency test can omit explicit parent-row locks in the test statements to verify the trigger-based locking behavior.

## Proposed future improvements

1. Add an additive migration that enforces supported ISO 4217 codes using a maintained database reference set, with a documented policy for current versus withdrawn codes. A foreign key or equivalent database validation should reject unsupported values.
2. Add an additive migration that validates timezone names against PostgreSQL's supported timezone names, for example through a database trigger that checks `pg_catalog.pg_timezone_names`.
3. Before applying validation constraints, check existing workspace values and handle any invalid records explicitly. The inspected local database had no workspace rows at review time.
4. Extend rollback-only database tests with invalid/valid currency and timezone cases and explicit function/table privilege assertions, retaining all existing isolation and Owner tests.
5. Strengthen concurrency coverage to exercise trigger locking without the test explicitly taking the parent lock, then test the eventual audited ownership-transfer RPC under concurrent requests.
6. Preserve least privilege for future service-side tasks. Do not grant broad service-role table access as a substitute for user authorization or RLS.

## Authorization and change status

No implementation changes have been authorized or applied: the findings and recommendations are not implemented. No migration was created or applied, no SQL was executed for this documentation task, and no database reset or hosted-project operation was performed.
