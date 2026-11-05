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

SELECT plan(1);

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('a8c514e9-5b10-4bf3-a1b0-a301e1000001', 'workspace-owner-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('a8c514e9-5b10-4bf3-a1b0-a301e1000002', 'workspace-admin-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('a8c514e9-5b10-4bf3-a1b0-a301e1000003', 'workspace-viewer-b@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('a8c514e9-5b10-4bf3-a1b0-a301e1000004', 'workspace-owner-b@example.invalid', pg_catalog.now(), pg_catalog.now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (
  id,
  name,
  reporting_currency,
  reporting_timezone,
  created_by
)
VALUES
  (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000001',
    'Workspace A',
    'USD',
    'UTC',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
  ),
  (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000002',
    'Workspace B',
    'EUR',
    'Europe/London',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000004'
  );

INSERT INTO public.workspace_members (
  workspace_id,
  user_id,
  role,
  created_by
)
VALUES
  (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000001',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001',
    'owner',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
  ),
  (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000001',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000002',
    'admin',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
  ),
  (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000002',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000003',
    'viewer',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000004'
  ),
  (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000002',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000004',
    'owner',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000004'
  );

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a8c514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);

DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.workspaces) <> 1 THEN
    RAISE EXCEPTION 'workspace isolation failed for workspace A owner';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.workspace_members) <> 2 THEN
    RAISE EXCEPTION 'membership visibility failed for workspace A owner';
  END IF;

  IF NOT private.has_workspace_role(
    'a8c514e9-5b10-4bf3-a1b0-a301e2000001',
    ARRAY['owner']::public.workspace_role[]
  ) THEN
    RAISE EXCEPTION 'workspace role helper failed for the owner';
  END IF;

  IF private.has_workspace_role(
    'a8c514e9-5b10-4bf3-a1b0-a301e2000002',
    ARRAY['owner']::public.workspace_role[]
  ) THEN
    RAISE EXCEPTION 'workspace role helper crossed workspace boundaries';
  END IF;

  BEGIN
    INSERT INTO public.workspace_members (
      workspace_id,
      user_id,
      role,
      created_by
    )
    VALUES (
      'a8c514e9-5b10-4bf3-a1b0-a301e2000001',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000003',
      'viewer',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
    );
    RAISE EXCEPTION 'direct membership insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.workspace_members
    SET role = 'viewer'
    WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
      AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000002';
    RAISE EXCEPTION 'direct membership update unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.workspace_members
    WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
      AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000002';
    RAISE EXCEPTION 'direct membership delete unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.workspaces (
      name,
      reporting_currency,
      reporting_timezone,
      created_by
    )
    VALUES (
      'Unaudited workspace',
      'USD',
      'UTC',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
    );
    RAISE EXCEPTION 'direct workspace insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.workspaces
    SET name = 'Unaudited update'
    WHERE id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001';
    RAISE EXCEPTION 'direct workspace update unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a8c514e9-5b10-4bf3-a1b0-a301e1000003',
  true
);

DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.workspaces) <> 1 THEN
    RAISE EXCEPTION 'workspace isolation failed for workspace B viewer';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.workspace_members) <> 2 THEN
    RAISE EXCEPTION 'membership visibility failed for workspace B viewer';
  END IF;

  IF private.has_workspace_role(
    'a8c514e9-5b10-4bf3-a1b0-a301e2000002',
    ARRAY['owner']::public.workspace_role[]
  ) THEN
    RAISE EXCEPTION 'workspace role helper granted owner role to a viewer';
  END IF;
END;
$test$;

SET LOCAL ROLE anon;

DO $test$
DECLARE
  v_workspace_read_denied boolean := false;
  v_membership_read_denied boolean := false;
  v_helper_execution_denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.workspaces;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_workspace_read_denied := true;
  END;

  BEGIN
    PERFORM 1 FROM public.workspace_members;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_membership_read_denied := true;
  END;

  BEGIN
    PERFORM private.is_workspace_member(
      'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_helper_execution_denied := true;
  END;

  IF NOT v_workspace_read_denied OR NOT v_membership_read_denied THEN
    RAISE EXCEPTION 'anonymous role unexpectedly read workspace data';
  END IF;

  IF NOT v_helper_execution_denied THEN
    RAISE EXCEPTION 'anonymous role unexpectedly executed a private helper';
  END IF;
END;
$test$;

SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_member_helper_denied boolean := false;
  v_role_helper_denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.workspaces;
    RAISE EXCEPTION 'service_role unexpectedly read workspaces';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.workspace_members;
    RAISE EXCEPTION 'service_role unexpectedly read workspace memberships';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM private.is_workspace_member(
      'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_member_helper_denied := true;
  END;

  BEGIN
    PERFORM private.has_workspace_role(
      'a8c514e9-5b10-4bf3-a1b0-a301e2000001',
      ARRAY['owner']::public.workspace_role[]
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_role_helper_denied := true;
  END;

  IF NOT v_member_helper_denied OR NOT v_role_helper_denied THEN
    RAISE EXCEPTION 'service_role unexpectedly executed a private helper';
  END IF;
END;
$test$;

RESET ROLE;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'a8c514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);

DO $test$
DECLARE
  v_rejected boolean;
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'private.is_workspace_member(uuid)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated',
    'private.has_workspace_role(uuid,public.workspace_role[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated role cannot execute its intended private helpers';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'private.is_workspace_member(uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'private.has_workspace_role(uuid,public.workspace_role[])',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'private.validate_workspace_reporting_settings()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon role unexpectedly has private helper privileges';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'private.validate_workspace_reporting_settings()',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.validate_workspace_reporting_settings()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'application roles unexpectedly have trigger function privileges';
  END IF;

  IF pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'TRUNCATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'REFERENCES'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspaces',
    'TRIGGER'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'TRUNCATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'REFERENCES'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'TRIGGER'
  ) THEN
    RAISE EXCEPTION 'service_role unexpectedly has workspace table privileges';
  END IF;

  IF pg_catalog.has_table_privilege(
    'authenticated',
    'private.iso_4217_currency_codes',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'private.iso_4217_currency_codes',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'private.iso_4217_currency_codes',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'private.iso_4217_currency_codes',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'anon',
    'private.iso_4217_currency_codes',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'anon',
    'private.iso_4217_currency_codes',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'anon',
    'private.iso_4217_currency_codes',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'anon',
    'private.iso_4217_currency_codes',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'private.iso_4217_currency_codes',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'private.iso_4217_currency_codes',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'private.iso_4217_currency_codes',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'private.iso_4217_currency_codes',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'application roles unexpectedly have currency reference privileges';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM private.iso_4217_currency_codes
    WHERE is_current AND reporting_allowed
  ) < 150 THEN
    RAISE EXCEPTION 'ISO 4217 reporting currency reference data is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM private.iso_4217_currency_codes
    WHERE code = 'USD'
      AND is_current
      AND reporting_allowed
  ) THEN
    RAISE EXCEPTION 'supported USD reporting currency is absent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.iso_4217_currency_codes
    WHERE code IN ('ZZZ', 'XXX')
      AND is_current
      AND reporting_allowed
  ) THEN
    RAISE EXCEPTION 'unsupported currency code is marked reportable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names
    WHERE name = 'Asia/Tokyo'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names
    WHERE name = 'not/a-real-zone'
  ) THEN
    RAISE EXCEPTION 'timezone validation test assumptions do not match PostgreSQL';
  END IF;

  UPDATE public.workspaces
  SET reporting_currency = 'JPY',
      reporting_timezone = 'Asia/Tokyo'
  WHERE id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001';

  UPDATE public.workspaces
  SET reporting_currency = 'USD',
      reporting_timezone = 'UTC'
  WHERE id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001';

  INSERT INTO public.workspaces (
    id,
    name,
    reporting_currency,
    reporting_timezone,
    created_by
  )
  VALUES (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000004',
    'Valid reporting settings workspace',
    'CAD',
    'Asia/Tokyo',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
  );

  INSERT INTO public.workspace_members (
    workspace_id,
    user_id,
    role,
    created_by
  )
  VALUES (
    'a8c514e9-5b10-4bf3-a1b0-a301e2000004',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001',
    'owner',
    'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
  );

  v_rejected := false;
  BEGIN
    INSERT INTO public.workspaces (
      id,
      name,
      reporting_currency,
      reporting_timezone,
      created_by
    )
    VALUES (
      'a8c514e9-5b10-4bf3-a1b0-a301e2000005',
      'Unsupported currency workspace',
      'ZZZ',
      'UTC',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'unsupported ZZZ currency was accepted on workspace creation';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.workspaces (
      id,
      name,
      reporting_currency,
      reporting_timezone,
      created_by
    )
    VALUES (
      'a8c514e9-5b10-4bf3-a1b0-a301e2000006',
      'No-currency workspace',
      'XXX',
      'UTC',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'ISO no-currency code XXX was accepted as a reporting currency';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.workspaces (
      id,
      name,
      reporting_currency,
      reporting_timezone,
      created_by
    )
    VALUES (
      'a8c514e9-5b10-4bf3-a1b0-a301e2000007',
      'Unsupported timezone workspace',
      'USD',
      'not/a-real-zone',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'unsupported timezone was accepted on workspace creation';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.workspaces
    SET reporting_currency = 'ZZZ'
    WHERE id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'unsupported currency was accepted on workspace update';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.workspaces
    SET reporting_timezone = 'not/a-real-zone'
    WHERE id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'unsupported timezone was accepted on workspace update';
  END IF;

  UPDATE public.workspaces
  SET name = name
  WHERE id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001';

  v_rejected := false;
  BEGIN
    INSERT INTO public.workspaces (
      id,
      name,
      reporting_currency,
      reporting_timezone,
      created_by
    )
    VALUES (
      'a8c514e9-5b10-4bf3-a1b0-a301e2000003',
      'Workspace without owner',
      'USD',
      'UTC',
      'a8c514e9-5b10-4bf3-a1b0-a301e1000001'
    );
    SET CONSTRAINTS workspaces_exactly_one_owner IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'workspace without an owner was not rejected';
  END IF;

  v_rejected := false;
  BEGIN
    DELETE FROM public.workspace_members
    WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
      AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000001';
    SET CONSTRAINTS workspace_members_exactly_one_owner IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'removing the only owner was not rejected';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.workspace_members
    SET role = 'admin'
    WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
      AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000001';
    SET CONSTRAINTS workspace_members_exactly_one_owner IMMEDIATE;
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'demoting the only owner was not rejected';
  END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.workspace_members
    SET role = 'owner'
    WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
      AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000002';
  EXCEPTION
    WHEN unique_violation THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'creating a second owner was not rejected';
  END IF;

  UPDATE public.workspace_members
  SET role = 'admin'
  WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
    AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000001';

  UPDATE public.workspace_members
  SET role = 'owner'
  WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
    AND user_id = 'a8c514e9-5b10-4bf3-a1b0-a301e1000002';

  SET CONSTRAINTS workspace_members_exactly_one_owner IMMEDIATE;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.workspace_members
    WHERE workspace_id = 'a8c514e9-5b10-4bf3-a1b0-a301e2000001'
      AND role = 'owner'
  ) <> 1 THEN
    RAISE EXCEPTION 'atomic ownership transfer did not leave exactly one owner';
  END IF;
END;
$test$;

SELECT pass('Workspace core and RLS assertions passed');
SELECT * FROM finish();

ROLLBACK;

\echo 'Workspace core database tests passed; test transaction rolled back.'
