# Supabase Migration Compatibility Audit

## Scope and conclusion

This is a static review of the 15 migration files in timestamp order. No hosted
project was accessed, no migration was applied, and no database was reset.
There were no SQL changes as a result of this audit.

**Conclusion: hosted compatibility is not yet demonstrated.** The migrations
are internally ordered and contain explicit checks for their most sensitive
privilege assumptions, but the audit foundation and membership migrations
require a migration connection that is specifically `postgres`, owns
pre-existing objects, and can create and assume restricted database roles.
Whether the ordinary migration identity on the intended hosted project meets
those requirements must be proven in a disposable-project rehearsal.

The migration chain also requires PostgreSQL 16 or newer: the audit foundation
uses role-membership `SET`, `INHERIT`, and `ADMIN` options in `GRANT`. The local
[`supabase/config.toml`](../supabase/config.toml) sets `major_version = 17`;
this confirms the local target, not the version or privileges of a future
hosted project. PostgreSQL documents these membership options in
[GRANT](https://www.postgresql.org/docs/17/sql-grant.html).

No confirmed SQL defect requiring a migration correction was found. The
identity, version, and privilege requirements below are compatibility gates,
not permission to bypass preflight checks.

## Findings

### High: hosted migration identity has not been verified

`20261102142700_audit_log_foundation.sql` requires, before it creates anything:

- `session_user = current_user = postgres`; a `SET ROLE`-based effective
  identity or a different login role fails the check.
- `postgres` owns schema `private` and tables `public.workspaces` and
  `public.workspace_members`.
- `postgres` has `USAGE` on schema `auth` and `EXECUTE` on `auth.uid()`.
- `postgres` has `CREATEROLE` or is a superuser.
- The migration connection can create the two restricted Nexus roles, grant
  itself their membership with `SET TRUE, INHERIT FALSE, ADMIN FALSE`, and
  assume them.

It then transfers ownership of audit objects to `nexus_audit_table_owner` and
`nexus_audit_writer`. Migration 7 repeats the exact `postgres` session and
ownership requirements, requires `SET` membership in both internal roles, and
checks access to `auth.users.email` and the audit writer functions.

Local success cannot establish that the normal hosted migration connection
passes these checks. Do not remove the guards, change owners to a broader
application role, grant `BYPASSRLS`, or weaken RLS to make a rehearsal pass.

### Version and privilege requirements

- **PostgreSQL 16+:** required for membership option syntax used by migration 4.
  Rehearse on the same major version intended for production; the local config
  currently specifies 17.
- **Database migration identity:** must satisfy the literal `postgres` checks
  in migrations 4 and 7. Use a direct database connection, not a transaction
  pooler or an execution method that changes the session/effective role.
- **Role creation:** migration 4 checks for `CREATEROLE` or superuser before
  creating the two `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS` roles.
  The SQL does not explicitly require superuser when `CREATEROLE` is present.
- **Role membership and ownership:** the migration identity must be able to
  grant itself restricted `SET` membership and switch to each internal role.
  Ownership transfers also require the relevant target-role membership and
  schema `CREATE` privileges. Later migrations temporarily grant and then
  revoke `CREATE` on `private` from `nexus_audit_writer`.
- **Supabase Auth objects:** the chain references `auth.users` and `auth.uid()`.
  The checks verify required Auth access where needed; those objects and grants
  must be available in the target Supabase database.
- **Extensions:** the migrations do not issue `CREATE EXTENSION`. UUID creation
  uses `pg_catalog.gen_random_uuid()`; PostgreSQL 16+ provides it in
  `pg_catalog`.
- **No development fixtures are migration prerequisites.** Migration 3
  installs ISO 4217 reference data, not sample workspace data. The local
  config points to `supabase/seed.sql`, but no seed file is checked in. Do not
  depend on local Auth settings, local SMTP, or test fixtures in production.

## Migration-by-migration status

Status definitions: **Static pass** means ordering and dependencies are
consistent by inspection, not that hosted execution has been proven.
**Conditional / blocked** identifies an unverified environment requirement
that must be satisfied before production approval.

| # | Migration | Status | Compatibility notes |
|---|---|---|---|
| 1 | `20261031203500_foundation_private_schema_and_types.sql` | Static pass; environment-dependent | Creates `private` and `public.workspace_role`. Requires permission to create a schema and type. Revokes default/private schema access. |
| 2 | `20261031203600_workspace_core_and_rls.sql` | Static pass; depends on Supabase Auth | Creates workspaces, memberships, authorization helpers, triggers, and forced RLS. References `auth.users` and `auth.uid()`. Must run after migration 1. |
| 3 | `20261102110000_reporting_currency_timezone_validation.sql` | Static pass; depends on migration 2 | Creates the private ISO 4217 reference table and installs reference rows and reporting-setting validation. Existing workspace data must satisfy the validation when the migration runs. No development/demo rows are inserted. |
| 4 | `20261102142700_audit_log_foundation.sql` | **Conditional / production blocker until rehearsed** | Requires PostgreSQL 16+, session and effective identity `postgres`, ownership of `private`, `public.workspaces`, and `public.workspace_members`, Auth access, and `CREATEROLE` or superuser. Creates restricted audit roles, grants `SET`-only memberships, establishes forced RLS and append-only behavior, and transfers audit table/function ownership. |
| 5 | `20261102185100_customers_products_backend.sql` | Conditional; depends on migration 4 | Requires existing audit roles and `SET` membership, `private` ownership/privileges, and public-schema object-creation capability. Adds customer/product RLS and authorized backend functions; selected functions are owned by `nexus_audit_writer`. |
| 6 | `20261102194200_orders_backend.sql` | Conditional; depends on migrations 4–5 | Requires audit roles and membership. Adds orders and item snapshots, forced RLS, idempotent creation and status operations, and audit integration. Transfers authorized operations to `nexus_audit_writer`. |
| 7 | `20261102195900_workspace_membership_invitations.sql` | **Conditional / production blocker until rehearsed** | Reasserts `session_user = current_user = postgres`, ownership of `private` and `public.workspace_members`, `SET` membership in both audit roles, Auth email-column access, and audit-function privileges. Creates invitation/member operations and transfers their ownership. |
| 8 | `20261102202000_analytics_backend.sql` | Static pass; depends on migrations 2, 5, and 6 | Creates workspace-scoped analytics functions using existing workspace, customer, product, and order objects. No additional roles or extensions are created. |
| 9 | `20261102202500_analytics_revenue_windows.sql` | Static pass; depends on migration 8 | Adds the 7/30/90-day window function and its authenticated execution grant. |
| 10 | `20261104120000_workspace_onboarding.sql` | Conditional; depends on migrations 4 and 7 | Adds the authorized workspace-creation operation and wrapper. Uses the audit writer role and scoped RLS policies/grants, then removes its temporary schema `CREATE` privilege. |
| 11 | `20261104130000_expose_analytics_rpcs.sql` | Static pass; depends on migration 8 | Creates public `SECURITY INVOKER` wrappers for existing private analytics functions. Revokes public/anonymous/service-role execution and grants `authenticated`. |
| 12 | `20261104140000_expose_customer_rpcs.sql` | Static pass; depends on migration 5 | Creates public `SECURITY INVOKER` wrappers for existing private customer operations, with authenticated-only execution. |
| 13 | `20261104150000_expose_product_rpcs.sql` | Static pass; depends on migration 5 | Creates public `SECURITY INVOKER` wrappers for existing private product operations, with authenticated-only execution. |
| 14 | `20261104160000_expose_order_rpcs.sql` | Static pass; depends on migration 6 | Creates public `SECURITY INVOKER` wrappers for existing private order operations, with authenticated-only execution. |
| 15 | `20261104170000_expose_audit_log_read_rpc.sql` | Static pass; depends on migration 4 | Creates an authenticated-only `SECURITY INVOKER` audit-read wrapper. It delegates row visibility to private table privileges and RLS; it does not grant direct browser access to the private schema through the API. |

The wrapper migrations use functions created earlier; the signatures inspected
match their private delegates. They use `SET search_path = ''` and do not
duplicate the private operations. Their creation still requires the migration
identity to have the ordinary schema/object privileges needed to create public
functions.

## Ownership, RLS, and authorization review

- `private.audit_logs` is owned by `nexus_audit_table_owner`, has forced RLS,
  and is configured for owner/admin reads and writer inserts. Mutation
  protection and narrow writer operations are installed by the audit
  foundation.
- `nexus_audit_writer` is explicitly `NOBYPASSRLS`; its table access is scoped
  with policies and column grants. Its `CREATE` privilege on `private` is
  removed after migrations that need it.
- Workspace, membership, invitation, customer, product, order, and order-item
  tables have RLS; migrations apply `FORCE ROW LEVEL SECURITY` to the relevant
  tables. Verify the resulting catalog state rather than relying solely on
  migration text. The private ISO currency reference table is instead protected
  by its private schema and revoked table privileges; it is not configured for
  RLS by these migrations.
- Private functions contain the existing authorization and business rules.
  Public RPCs are invoker wrappers and delegate to those private functions.
  Their authenticated grants do not replace the private authorization checks.
- The audit read wrapper is also invoker mode. Its `SELECT` is constrained by
  the private audit table's RLS policy, and the migration grants private schema
  `USAGE` to `authenticated` while revoking it from `PUBLIC`, `anon`, and
  `service_role`.
- No migration grants `BYPASSRLS` to the Nexus roles or grants the browser a
  service-role credential.

## Disposable-project rehearsal

Perform this rehearsal only after the project owner approves creating a
**disposable Supabase project**. Do not use production, a project with valuable
data, or a project already linked by default. This audit did not create or
connect to one.

### Prepare the target

1. Create a disposable Supabase project on PostgreSQL 16 or newer, preferably
   the same major version planned for production. Do not enable any application
   data imports or seed/demo data.
2. Record the disposable project identity and confirm it independently in the
   Supabase dashboard. Configure no production secrets or email provider.
3. Use the same migration execution method and identity intended for
   production. The connection must be direct and preserve the session identity;
   do not use a transaction pooler or `SET ROLE` to imitate `postgres`.
4. Before applying application migrations, inspect the connection identity and
   version using the read-only queries below. Stop if the session identity,
   effective identity, or PostgreSQL version does not meet requirements.
5. Apply the 15 migration files individually, in the exact order in the table
   above, using the organization's approved migration mechanism. Capture the
   result of each file. Stop on the first failure; do not skip a failed
   migration or continue with later files.
6. Run the catalog verification queries below and review every result.
7. Run the database tests against the explicitly identified disposable project:

   ```powershell
   npx supabase test db --remote="$env:DISPOSABLE_PROJECT_REF"
   ```

   The test command runs database tests remotely and can modify the target
   while executing fixtures. Use only the disposable project reference, never
   a production reference or an implicitly linked project. Confirm every
   database test passes and verify that no test fixtures remain.
8. Save migration output, test output, PostgreSQL version, and catalog query
   results with secrets redacted. Do not include database URLs, passwords,
   access tokens, or user data in the rehearsal record.
9. After the owner accepts the results, delete the disposable project through
   its verified dashboard identity and confirm deletion. Do not delete it
   until logs and results needed for sign-off have been safely recorded.

If the intended migration identity fails any preflight, stop and escalate the
exact error to the database/project owner. Do not manually create the audit
roles, grant broad privileges, alter migration SQL, or run the later migrations
out of order as a workaround.

## Verification SQL

Run these read-only queries after all migrations complete. They inspect the
actual target catalog; expected values are described below each query.

### Version and session identity

```sql
SELECT
  current_setting('server_version') AS server_version,
  current_setting('server_version_num')::integer AS server_version_num,
  session_user::text AS session_user,
  current_user::text AS current_user,
  session_user::text = 'postgres'
    AND current_user::text = 'postgres' AS matches_required_identity,
  current_setting('server_version_num')::integer >= 160000
    AS supports_role_membership_options;
```

For migrations 4 and 7, `matches_required_identity` and
`supports_role_membership_options` must be `true`. Record results from the
actual migration connection, not a separate administrator session.

### Required objects and forced RLS

```sql
WITH expected(schema_name, table_name) AS (
  VALUES
    ('public', 'workspaces'),
    ('public', 'workspace_members'),
    ('public', 'workspace_invitations'),
    ('public', 'customers'),
    ('public', 'products'),
    ('public', 'orders'),
    ('public', 'order_items'),
    ('private', 'audit_logs')
)
SELECT
  expected.schema_name,
  expected.table_name,
  relation.oid IS NOT NULL AS exists,
  relation.relrowsecurity AS rls_enabled,
  relation.relforcerowsecurity AS rls_forced,
  CASE WHEN relation.oid IS NOT NULL
    THEN pg_catalog.pg_get_userbyid(relation.relowner)
  END AS owner
FROM expected
LEFT JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.nspname = expected.schema_name
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.relnamespace = namespace.oid
 AND relation.relname = expected.table_name
 AND relation.relkind IN ('r', 'p')
ORDER BY expected.schema_name, expected.table_name;
```

All listed relations should exist. All listed application/audit tables should
have RLS enabled and forced. `private.audit_logs` should be owned by
`nexus_audit_table_owner`. Confirm its other table owners against the migration
chain rather than inferring them from names. `private.iso_4217_currency_codes`
is not included because the migration protects it through private-schema and
table privileges rather than RLS.

### Audit-role attributes and memberships

```sql
SELECT
  role.rolname,
  role.rolcanlogin,
  role.rolinherit,
  role.rolsuper,
  role.rolcreaterole,
  role.rolbypassrls
FROM pg_catalog.pg_roles AS role
WHERE role.rolname IN ('nexus_audit_table_owner', 'nexus_audit_writer')
ORDER BY role.rolname;

SELECT
  granted.rolname AS granted_role,
  member.rolname AS member_role,
  membership.set_option,
  membership.inherit_option,
  membership.admin_option
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
WHERE granted.rolname IN ('nexus_audit_table_owner', 'nexus_audit_writer')
ORDER BY granted.rolname, member.rolname;
```

Both Nexus roles should be non-login, non-inheriting, non-superuser, and
`NOBYPASSRLS`. The migration identity's membership should have
`set_option = true`, `inherit_option = false`, and `admin_option = false`.
Review all other members and memberships against the approved design.

### Function ownership and security mode

```sql
SELECT
  namespace.nspname AS schema_name,
  procedure.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS arguments,
  pg_catalog.pg_get_userbyid(procedure.proowner) AS owner,
  procedure.prosecdef AS security_definer,
  procedure.proconfig AS function_settings
FROM pg_catalog.pg_proc AS procedure
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname IN ('private', 'public')
  AND procedure.proname IN (
    'audit_current_actor',
    'authenticated_email_matches',
    'append_audit_log',
    'create_workspace',
    'create_customer',
    'update_customer',
    'archive_customer',
    'create_product',
    'update_product',
    'archive_product',
    'create_order',
    'update_order_status',
    'list_workspace_audit_logs'
  )
ORDER BY namespace.nspname, procedure.proname, arguments;
```

Check exact signatures and owners against migrations: the audit actor helper
and `authenticated_email_matches` are owned by `postgres`; authorized
audit-writing and business operations are owned by `nexus_audit_writer`;
`private.audit_logs` is owned by `nexus_audit_table_owner`. Private
authorization operations may be `SECURITY DEFINER`; public RPC wrappers must
be `SECURITY INVOKER`. Confirm that security-definer functions pin
`search_path` as expected.

### Schema and function execution privileges

```sql
SELECT
  pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
    AS authenticated_can_use_private,
  pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
    AS anon_can_use_private,
  pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE')
    AS service_role_can_use_private,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_order(uuid,text,jsonb,uuid)',
    'EXECUTE'
  ) AS authenticated_can_execute_order_wrapper,
  pg_catalog.has_function_privilege(
    'anon',
    'public.create_order(uuid,text,jsonb,uuid)',
    'EXECUTE'
  ) AS anon_can_execute_order_wrapper,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.list_workspace_audit_logs(uuid,integer,integer)',
    'EXECUTE'
  ) AS authenticated_can_execute_audit_wrapper,
  pg_catalog.has_function_privilege(
    'anon',
    'public.list_workspace_audit_logs(uuid,integer,integer)',
    'EXECUTE'
  ) AS anon_can_execute_audit_wrapper;
```

Expected: authenticated has private-schema usage and can execute the
authenticated wrappers; anonymous does not have private usage or wrapper
execution; `service_role` does not have private-schema usage. Investigate any
different result before approval. Also review table/column grants directly:

```sql
SELECT
  pg_catalog.has_table_privilege(
    'authenticated', 'private.audit_logs', 'SELECT'
  ) AS authenticated_can_select_audit_rows,
  pg_catalog.has_table_privilege(
    'authenticated', 'private.audit_logs', 'INSERT'
  ) AS authenticated_can_insert_audit_rows,
  pg_catalog.has_table_privilege(
    'authenticated', 'private.audit_logs', 'UPDATE'
  ) AS authenticated_can_update_audit_rows,
  pg_catalog.has_table_privilege(
    'authenticated', 'private.audit_logs', 'DELETE'
  ) AS authenticated_can_delete_audit_rows,
  pg_catalog.has_table_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'INSERT'
  ) AS writer_can_insert_audit_rows;
```

Authenticated direct insert, update, and delete must not be granted. Compare
the select/insert results with the intended RLS design and audit wrapper. The
writer must have only the grants required by the migrations.

### Migration history

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Verify that all 15 expected versions are present and in timestamp order. If the
target's migration history table differs, use the project's supported
migration-history inspection method; do not manually mark unapplied files as
applied.

## Production approval checklist

- [ ] Confirm intended production PostgreSQL major version is 16 or newer and
      matches the successful disposable-project rehearsal.
- [ ] Confirm the exact approved migration method preserves
      `session_user = current_user = postgres` for migrations 4 and 7.
- [ ] Successfully rehearse all 15 migrations in order on a fresh disposable
      Supabase project using the intended production migration identity.
- [ ] Capture proof that identity, `CREATEROLE`, ownership, Auth privileges,
      role membership options, and object ownership meet the migration
      preflights.
- [ ] Review the verification SQL output, forced-RLS state, role attributes,
      grants, and wrapper security modes.
- [ ] Pass `npx supabase test db --remote="$env:DISPOSABLE_PROJECT_REF"` on that
      disposable project and confirm fixtures are cleaned up.
- [ ] Confirm there is a current production backup and a tested restore plan;
      these migrations are not automatically reversible.
- [ ] Confirm no `seed.sql`, local Auth settings, local SMTP configuration, or
      test fixtures are included in the production migration process.
- [ ] Obtain explicit production owner approval before any production
      connection or migration operation.

Until these checks are complete, classify production migration compatibility
as **unverified and not approved**.
