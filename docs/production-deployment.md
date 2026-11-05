# Production Deployment Guide

This guide prepares Nexus Analytics for a standard Next.js hosting platform
(for example, Vercel). It is not a deployment record. No hosted Supabase
project is configured or modified by this guide, and no credentials or
production URLs are supplied here.

## Readiness summary

| Area | Repository status | Still required |
|---|---|---|
| Application build | `npm run build` is the production build command | Run it in the deployment environment |
| Node.js | Next.js 16.4.3; `package.json` declares Node `>=20.9.0` | Select a supported LTS runtime; Node 24 LTS is recommended |
| Package install | `package-lock.json` is present | Use `npm ci` |
| Output | Next.js default managed output | Do not configure static export or a custom output directory |
| Runtime | Supabase server clients, server actions, and route handlers require a server runtime | Deploy as a Node.js Next.js app, not static-only hosting |
| Environment | Two public Supabase variables are validated | Provision production project values and platform environment |
| Database | 15 ordered migrations are present | Review migration prerequisites and obtain approval before production application |
| Authentication email | Local SMTP is not configured for production delivery | Configure and verify a production email provider |

## Prerequisites

- A production deployment account and production domain.
- A dedicated production Supabase project with database backups and access
  controls appropriate to the business.
- Authorized production project credentials for the operator running
  provisioning and deployment.
- A production SMTP/email provider with verified sender/domain and credentials.
- A reviewed release commit and a tested rollback/recovery procedure.

Do not use the local Supabase project URL, local credentials, local accounts, or
local development Auth settings for production.

## Environment variables

The application currently requires only:

| Variable | Visibility | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public, included in browser configuration | HTTPS URL of the production Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public, included in browser configuration | Supabase publishable key for that project |

Set both in the deployment platform’s production environment configuration.
Also provide them to preview or staging environments only when those
environments are intended to use their respective Supabase projects.
Because `NEXT_PUBLIC_*` values are bundled into browser code at build time,
configure the correct project values before each environment’s build. Rebuild
after changing them.

The publishable key is designed for browser use; it does not grant authorization
by itself. Row-level security and server-side workspace/role checks remain
required. The application must **not** receive a service-role key, database
password, SMTP password, JWT signing secret, or other privileged credential in
either `NEXT_PUBLIC_*` variables or client code. No server-only Supabase secret
is currently required by the app.

Use the same origin for the deployment URL and browser-driven Auth redirects.
Never put credentials in this document, source control, build logs, or issue
reports. The root `.env.example` is a placeholder template; `.env.local` is
ignored by Git and must not be copied into deployment configuration.

## Production Supabase setup

1. Provision a separate production Supabase project. Record its project URL and
   publishable key in the deployment platform’s protected environment settings.
2. Confirm database region, PostgreSQL version compatibility, backups/PITR,
   monitoring, and account recovery with the project owner.
3. Configure Auth in the production Supabase project rather than copying the
   development Auth values from [`supabase/config.toml`](../supabase/config.toml).
4. Configure production Auth settings:
   - Site URL: the HTTPS production origin, for example
     `https://<production-domain>`.
   - Redirect URL allowlist: add the exact production callback URL
     `https://<production-domain>/auth/callback`.
   - Signup and email confirmation: choose and approve the intended account
     policy. For a public registration deployment, require confirmed email
     addresses unless the product owner explicitly approves another policy.
   - Password policy: use at least the application’s eight-character minimum;
     review stronger Supabase password requirements and rate limits.
   - Keep refresh token rotation enabled unless a documented security
     requirement dictates otherwise.
5. Configure a production SMTP provider in Supabase Auth. Verify sender
   ownership, delivery, bounce handling, quotas/rate limits, and the signup,
   password recovery, and invitation templates before opening registration.
   SMTP credentials belong only in Supabase’s protected provider settings.
6. Configure any provider-specific email templates and ensure links preserve
   the callback query parameters generated by the application.

### Callback and email redirects

The app constructs callback URLs from the current origin:

- Signup: `/auth/callback?next=%2Fonboarding`
- Password recovery: `/auth/callback?next=%2Freset-password`

Both use the same callback path `/auth/callback`; the `next` values select an
internal post-auth destination. The callback rejects external and protocol-
relative destinations. Supabase’s redirect allowlist should contain the exact
origin plus callback path. Do not add broad wildcards or localhost URLs to the
production project unless separately justified.

Test email links from the actual production hostname. If using a custom domain,
configure it consistently as the Site URL, redirect allowlist origin, and
deployment URL. HTTPS is required in production so session cookies can use the
secure attribute. The selected-workspace cookie is HTTP-only, same-site, and
path-scoped; Supabase SSR session cookies are refreshed by the Next.js 16
`src/proxy.ts` entrypoint. Session refresh is not the authorization boundary:
server-side workspace membership checks and database RLS remain authoritative.

## Migration history and production order

The repository contains these 15 timestamp-ordered migrations. Apply them in
the order shown; do not cherry-pick later migrations or edit already-applied
migrations:

1. `20261031203500_foundation_private_schema_and_types.sql` — private schema
   and workspace-role type.
2. `20261031203600_workspace_core_and_rls.sql` — workspaces, memberships,
   foundational RLS and authorization helpers.
3. `20261102110000_reporting_currency_timezone_validation.sql` — reporting
   currency/timezone validation.
4. `20261102142700_audit_log_foundation.sql` — append-only audit foundation,
   isolated database roles, policies, and triggers.
5. `20261102185100_customers_products_backend.sql` — customer and product
   tables, policies, and authorized operations.
6. `20261102194200_orders_backend.sql` — orders, item snapshots, idempotency,
   status transitions, and audit integration.
7. `20261102195900_workspace_membership_invitations.sql` — workspace
   invitations and membership operations.
8. `20261102202000_analytics_backend.sql` — workspace-scoped analytics
   functions.
9. `20261102202500_analytics_revenue_windows.sql` — revenue-window behavior.
10. `20261104120000_workspace_onboarding.sql` — authorized workspace creation.
11. `20261104130000_expose_analytics_rpcs.sql` — authenticated analytics
    wrappers.
12. `20261104140000_expose_customer_rpcs.sql` — authenticated customer
    wrappers.
13. `20261104150000_expose_product_rpcs.sql` — authenticated product wrappers.
14. `20261104160000_expose_order_rpcs.sql` — authenticated order wrappers.
15. `20261104170000_expose_audit_log_read_rpc.sql` — authenticated
    RLS-constrained audit read wrapper.

### Migration preflight risks

- The audit foundation migration creates dedicated PostgreSQL roles, configures
  least-privilege role membership, and transfers ownership of private objects.
  It has explicit checks for migration identity, `CREATEROLE`, schema/table
  ownership, `auth.uid()` access, and PostgreSQL role membership options. Do
  not assume that a hosted migration connection has the same capabilities as
  the local database identity.
- Before production, rehearse the complete migration chain on a disposable
  production-like Supabase project running the supported PostgreSQL major
  version. Confirm the audit migration succeeds under the actual hosted
  migration role and review all privilege/ownership results. This repository’s
  passing local tests do not prove hosted migration compatibility.
- Do not bypass a failing preflight by weakening RLS, granting broad schema
  access, using service-role access from the app, or editing an old migration.
  Resolve the role/ownership requirement with the database owner and a reviewed
  additive migration or approved migration procedure.
- The repository has no `supabase/seed.sql` or other committed seed SQL file.
  `supabase/config.toml` references `./seed.sql`; this path currently has no
  checked-in file. Do not add local fixtures, demo accounts, or test data to
  production. SQL tests use disposable fixtures and transaction rollbacks; run
  the database suite only against local/isolated test databases.
- `supabase/config.toml` contains local URLs, local redirect allowlist entries,
  development signup/confirmation choices, and local SMTP testing defaults.
  These are not production Auth settings. Do not deploy them wholesale or
  apply local config to hosted Supabase without an independent review.

### Safe migration release checklist

- [ ] Complete the production Auth/email setup and production migration
      rehearsal before deploying the release that depends on the new schema.
- [ ] Confirm the target project by an independently verified project identity;
      do not rely on a remembered CLI link or shell default.
- [ ] Confirm a current backup and a tested restore/rollback path.
- [ ] Review the full migration diff, especially role creation, ownership
      changes, grants, RLS policies, and constraints.
- [ ] Rehearse all migrations in order on a disposable hosted-equivalent
      project using the intended production migration identity.
- [ ] Run `npx supabase test db --local` and relevant application tests before
      release; local success is necessary but not a hosted rehearsal.
- [ ] Obtain explicit production change approval and coordinate a maintenance
      window if the rehearsal shows locks or data migration impact.
- [ ] Apply migrations using the organization’s approved, target-verified
      production process. This repository task does not run `db push`, link a
      project, or apply any remote migration.
- [ ] Verify applied migration versions, database grants/RLS, Auth settings,
      and PostgREST schema refresh before deploying code that calls new RPCs.

## Deployment platform settings

For Vercel or a comparable Next.js platform:

- Framework preset: Next.js.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Output: platform-managed Next.js output; leave output-directory override
  unset. Do not use `output: "export"` because auth, server actions, route
  handlers, and cookies require a server runtime.
- Runtime: Node.js; select Node 24 LTS (or another supported Node version
  satisfying `>=20.9.0`).
- Configure the two required Supabase variables for the Production environment
  before the first build.
- Use a custom production domain and HTTPS. Ensure Preview deployments do not
  accidentally use production credentials or share production authentication
  sessions.
- No extra deployment package or custom `vercel.json` is required by the
  current project configuration.

## Release and post-deployment smoke tests

1. Confirm the production build and deployment health check succeed.
2. Open the production origin and confirm the sign-in page loads over HTTPS.
3. Create or use an approved test account. Verify signup email delivery,
   confirmation, callback to onboarding, sign-in, and protected-route behavior.
4. Verify password recovery email delivery, return through
   `/auth/callback?next=%2Freset-password`, password update, and sign-in with
   the new password.
5. Verify an Owner/Admin can create/read workspace data and view audit logs;
   verify Analyst/Viewer restrictions are enforced server-side, not only
   hidden in navigation.
6. Verify customer/product/order operations, status transitions, exports, and
   analytics are isolated to the selected workspace.
7. Confirm workspace timezone and currency behavior using approved test data.
8. Check application, Auth, database, and email-provider logs for failures;
   do not copy credentials, tokens, or private metadata into support logs.
9. Remove or disable temporary production test accounts/data using approved
   administrative procedures, mindful that audit records are append-only.

## Rollback and recovery

- Keep the prior application release available for redeployment.
- Database migrations are not automatically reversible. Prefer forward fixes
  for additive changes; use a reviewed restore/repair plan for destructive or
  incompatible changes.
- Confirm backup/PITR restore procedures and responsible operators before
  release. A code rollback does not roll back schema changes.
- If a migration or smoke test fails, stop subsequent rollout, preserve
  diagnostic logs with secrets redacted, and follow the approved incident and
  database recovery procedure.

## Approval still required

This work only prepares project documentation and build metadata. The
production owner must still choose and provision the Supabase project, domain,
email provider, Auth policy, secrets, backups, migration window, and deployment
platform settings. Any hosted project inspection, configuration, migration,
or deployment requires separate authorization and credentials.
