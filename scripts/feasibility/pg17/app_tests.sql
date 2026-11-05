\set ON_ERROR_STOP on

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  false
);
SET ROLE authenticated;

DO $test$
DECLARE
  v_role_count integer;
  v_result text;
  v_denied boolean := false;
  v_cross_workspace_denied boolean := false;
  v_direct_helper_denied boolean := false;
  v_direct_verifier_denied boolean := false;
  v_audit_read_denied boolean := false;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_role_count
  FROM pg_catalog.pg_roles
  WHERE rolname IN (
      'nexus_audit_table_owner',
      'nexus_audit_writer',
      'nexus_invitation_manager',
      'nexus_invitation_acceptor',
      'nexus_assertion_verifier'
    )
    AND NOT rolcanlogin
    AND NOT rolinherit
    AND NOT rolbypassrls
    AND NOT rolsuper;

  IF v_role_count <> 5 THEN
    RAISE EXCEPTION 'internal role attributes failed';
  END IF;
  RAISE NOTICE 'PASS roles are NOLOGIN, NOINHERIT, NOBYPASSRLS, nonsuperuser';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS internal_role
      ON internal_role.oid = membership.roleid
    WHERE internal_role.rolname LIKE 'nexus_%'
      AND membership.member IN (
        SELECT oid
        FROM pg_catalog.pg_roles
        WHERE rolname IN (
          'anon',
          'authenticated',
          'service_role',
          'nexus_test_login'
        )
      )
  ) THEN
    RAISE EXCEPTION 'application or login role can assume an internal role';
  END IF;
  RAISE NOTICE 'PASS no application/login role membership in internal roles';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN (
        'nexus_audit_table_owner',
        'nexus_audit_writer',
        'nexus_invitation_manager',
        'nexus_invitation_acceptor',
        'nexus_assertion_verifier'
      )
       OR granted_role.rolname IN (
        'nexus_audit_table_owner',
        'nexus_audit_writer',
        'nexus_invitation_manager',
        'nexus_invitation_acceptor',
        'nexus_assertion_verifier'
      )
  ) THEN
    RAISE EXCEPTION 'unexpected membership involving an internal role';
  END IF;
  RAISE NOTICE 'PASS no unintended internal role inheritance';

  IF pg_catalog.has_function_privilege(
    'authenticated',
    (
      SELECT procedure.oid
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private'
        AND procedure.proname = 'audit_append'
    ),
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    (
      SELECT procedure.oid
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private'
        AND procedure.proname = 'verify_probe'
    ),
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute an internal helper';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.manager_entry(uuid)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.acceptor_probe(uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.manager_entry(uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'public.manager_entry(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'public entry point grants are incorrect';
  END IF;
  RAISE NOTICE 'PASS only intended public entry points are executable';

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public', 'manager_entry', 'nexus_invitation_manager'),
        ('public', 'acceptor_probe', 'nexus_invitation_acceptor'),
        ('private', 'verify_probe', 'nexus_assertion_verifier'),
        ('private', 'audit_append', 'nexus_audit_writer')
    ) AS expected(schema_name, function_name, owner_name)
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.nspname = expected.schema_name
    JOIN pg_catalog.pg_proc AS procedure
      ON procedure.pronamespace = namespace.oid
     AND procedure.proname = expected.function_name
    JOIN pg_catalog.pg_roles AS function_owner
      ON function_owner.oid = procedure.proowner
    WHERE function_owner.rolname <> expected.owner_name
       OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'function owner or pinned search_path check failed';
  END IF;
  RAISE NOTICE 'PASS function ownership and empty search_path settings';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS relation_owner
      ON relation_owner.oid = relation.relowner
    WHERE namespace.nspname = 'private'
      AND relation.relname = 'audit_events'
      AND relation_owner.rolname <> 'nexus_audit_table_owner'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'private'
      AND relation.relname IN ('audit_events', 'test_workspaces', 'test_memberships')
      AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'table ownership or forced RLS check failed';
  END IF;
  RAISE NOTICE 'PASS audit owner and FORCE ROW LEVEL SECURITY metadata';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'private'
      AND relation.relname = 'audit_events'
      AND (
        pg_catalog.has_table_privilege('anon', relation.oid, 'SELECT')
        OR pg_catalog.has_table_privilege('authenticated', relation.oid, 'SELECT')
        OR pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT')
        OR pg_catalog.has_table_privilege('anon', relation.oid, 'INSERT')
        OR pg_catalog.has_table_privilege('authenticated', relation.oid, 'INSERT')
        OR pg_catalog.has_table_privilege('service_role', relation.oid, 'INSERT')
      )
  ) THEN
    RAISE EXCEPTION 'application role unexpectedly has audit table privileges';
  END IF;
  RAISE NOTICE 'PASS application roles have no direct audit table access';

  BEGIN
    EXECUTE 'ALTER FUNCTION public.manager_entry(uuid) OWNER TO nexus_assertion_verifier';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated altered a function owner';
  END IF;
  RAISE NOTICE 'PASS application role cannot transfer function ownership';
  v_denied := false;

  IF pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'private'
        AND relation.relname = 'audit_events'
    ),
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'private'
        AND relation.relname = 'audit_events'
    ),
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'private'
        AND relation.relname = 'audit_events'
    ),
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'private'
        AND relation.relname = 'audit_events'
    ),
    'TRUNCATE'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer',
    (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'private'
        AND relation.relname = 'audit_events'
    ),
    'event_type',
    'INSERT'
  ) OR pg_catalog.has_column_privilege(
    'nexus_audit_writer',
    (
      SELECT relation.oid
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'private'
        AND relation.relname = 'audit_events'
    ),
    'created_at',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'audit writer privilege boundary failed';
  END IF;
  RAISE NOTICE 'PASS audit writer has insert-only permitted column grants';

  SELECT public.manager_entry(
    '00000000-0000-0000-0000-000000000101'
  )
  INTO v_result;

  IF v_result NOT LIKE
    '%current_user=nexus_invitation_manager;session_user=nexus_test_login;subject=00000000-0000-0000-0000-000000000201;after_nested=nexus_invitation_manager;nested={current_user=nexus_assertion_verifier;session_user=nexus_test_login;subject=00000000-0000-0000-0000-000000000201;audit={current_user=nexus_audit_writer;session_user=nexus_test_login;subject=00000000-0000-0000-0000-000000000201}}%'
  THEN
    RAISE EXCEPTION 'nested SECURITY DEFINER identity chain failed: %', v_result;
  END IF;
  RAISE NOTICE 'PASS nested definer owner changes, return path, session identity, and auth.uid';

  IF public.acceptor_probe(
    '00000000-0000-0000-0000-000000000101'
  ) <> 1 OR public.acceptor_probe(
    '00000000-0000-0000-0000-000000000102'
  ) <> 0 THEN
    RAISE EXCEPTION 'acceptor forced-RLS workspace isolation failed';
  END IF;
  RAISE NOTICE 'PASS acceptor role sees only its member workspace';

  BEGIN
    PERFORM public.manager_entry(
      '00000000-0000-0000-0000-000000000102'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_cross_workspace_denied := true;
  END;
  IF NOT v_cross_workspace_denied THEN
    RAISE EXCEPTION 'manager accessed a different workspace';
  END IF;
  RAISE NOTICE 'PASS manager and nested verifier deny cross-workspace access';

  BEGIN
    PERFORM private.audit_append(
      'workspace.invitation.created',
      '00000000-0000-0000-0000-000000000101'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_direct_helper_denied := true;
  END;
  IF NOT v_direct_helper_denied THEN
    RAISE EXCEPTION 'authenticated directly called audit helper';
  END IF;
  RAISE NOTICE 'PASS application role cannot call internal audit helper';

  BEGIN
    PERFORM private.verify_probe(
      '00000000-0000-0000-0000-000000000101'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_direct_verifier_denied := true;
  END;
  IF NOT v_direct_verifier_denied THEN
    RAISE EXCEPTION 'authenticated directly called verifier helper';
  END IF;
  RAISE NOTICE 'PASS application role cannot call internal verifier';

  BEGIN
    PERFORM 1 FROM private.audit_events;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_audit_read_denied := true;
  END;
  IF NOT v_audit_read_denied THEN
    RAISE EXCEPTION 'authenticated directly read audit table';
  END IF;
  RAISE NOTICE 'PASS application role cannot directly read audit table';

  BEGIN
    EXECUTE 'SET ROLE nexus_audit_writer';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated role assumed internal role';
  END IF;
  RAISE NOTICE 'PASS SET ROLE to internal role is denied';
END;
$test$;

RESET ROLE;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000202',
  false
);
SET ROLE authenticated;

DO $test$
BEGIN
  IF public.acceptor_probe(
    '00000000-0000-0000-0000-000000000102'
  ) <> 1 OR public.acceptor_probe(
    '00000000-0000-0000-0000-000000000101'
  ) <> 0 THEN
    RAISE EXCEPTION 'second user workspace isolation failed';
  END IF;
  RAISE NOTICE 'PASS second user sees only the other workspace';
END;
$test$;

RESET ROLE;
\echo 'APP TESTS PASS'
