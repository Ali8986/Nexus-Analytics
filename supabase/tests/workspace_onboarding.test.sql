\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

DO $pgtap_search_path$
DECLARE
  v_pgtap_schema text;
BEGIN
  SELECT namespace.nspname
  INTO v_pgtap_schema
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgtap';

  IF v_pgtap_schema IS NULL THEN
    RAISE EXCEPTION 'pgTAP extension is not installed';
  END IF;

  PERFORM pg_catalog.set_config(
    'search_path',
    pg_catalog.current_setting('search_path') || ',' ||
      pg_catalog.quote_ident(v_pgtap_schema),
    true
  );
END;
$pgtap_search_path$;

SELECT plan(7);

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  'f8a514e9-5b10-4bf3-a1b0-a301f8000001',
  'workspace-onboarding-owner@example.invalid',
  pg_catalog.now(),
  pg_catalog.now()
);

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '', true);
DO $unauthenticated$
BEGIN
  BEGIN
    PERFORM public.create_workspace('Should not be created');
    RAISE EXCEPTION 'workspace creation unexpectedly accepted a missing actor';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$unauthenticated$;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'f8a514e9-5b10-4bf3-a1b0-a301f8000001',
  true
);
SELECT pg_catalog.set_config(
  'test.workspace_id',
  public.create_workspace('Workspace Onboarding Test')::text,
  true
);

RESET ROLE;

SELECT is(
  (
    SELECT workspace.name
    FROM public.workspaces AS workspace
    WHERE workspace.id = pg_catalog.current_setting('test.workspace_id')::uuid
  ),
  'Workspace Onboarding Test',
  'authenticated creator can create a workspace'
);

SELECT is(
  (
    SELECT workspace.reporting_currency
    FROM public.workspaces AS workspace
    WHERE workspace.id = pg_catalog.current_setting('test.workspace_id')::uuid
  ),
  'USD',
  'workspace creation uses the reporting currency default'
);

SELECT is(
  (
    SELECT workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = pg_catalog.current_setting('test.workspace_id')::uuid
  ),
  'UTC',
  'workspace creation uses the reporting timezone default'
);

SELECT is(
  (
    SELECT membership.role::text
    FROM public.workspace_members AS membership
    WHERE membership.workspace_id =
      pg_catalog.current_setting('test.workspace_id')::uuid
      AND membership.user_id =
        'f8a514e9-5b10-4bf3-a1b0-a301f8000001'
  ),
  'owner',
  'workspace creator is atomically assigned the Owner role'
);

SELECT is(
  (
    SELECT pg_catalog.count(*)::integer
    FROM private.audit_logs AS audit_log
    WHERE audit_log.workspace_id =
      pg_catalog.current_setting('test.workspace_id')::uuid
      AND audit_log.actor_user_id =
        'f8a514e9-5b10-4bf3-a1b0-a301f8000001'
      AND (audit_log.action, audit_log.entity_type) IN (
        ('created', 'workspace'),
        ('added', 'membership')
      )
  ),
  2,
  'workspace and owner membership audit events use the authenticated actor'
);

SELECT ok(
  NOT pg_catalog.has_function_privilege(
    'anon',
    'public.create_workspace(text,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute workspace creation'
);

SELECT ok(
  NOT pg_catalog.has_table_privilege(
    'authenticated',
    'public.workspaces',
    'INSERT'
  )
  AND NOT pg_catalog.has_table_privilege(
    'authenticated',
    'public.workspace_members',
    'INSERT'
  ),
  'authenticated users cannot write workspace tables directly'
);

SELECT * FROM finish();

ROLLBACK;
