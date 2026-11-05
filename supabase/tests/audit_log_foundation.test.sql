\set ON_ERROR_STOP on

BEGIN;

-- pg_prove requires TAP output. Keep the detailed SQL assertions below,
-- but wrap their successful completion in one pgTAP assertion.
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

DO $test_preflight$
DECLARE
  v_can_bypass_rls boolean;
BEGIN
  SELECT session_role.rolsuper OR session_role.rolbypassrls
  INTO v_can_bypass_rls
  FROM pg_catalog.pg_roles AS session_role
  WHERE session_role.rolname = session_user::text;

  IF v_can_bypass_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'audit SQL tests require a privileged session role that bypasses FORCE RLS for fixture setup';
  END IF;

  IF NOT pg_catalog.has_table_privilege(session_user, 'auth.users', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'auth.users',
       'DELETE'
     )
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'public.workspaces',
       'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'public.workspaces',
       'UPDATE'
     )
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'public.workspaces',
       'DELETE'
     )
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'public.workspace_members',
       'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'public.workspace_members',
       'UPDATE'
     )
     OR NOT pg_catalog.has_table_privilege(
       session_user,
       'public.workspace_members',
       'DELETE'
     ) THEN
    RAISE EXCEPTION
      'audit SQL tests require fixture DML privileges on auth.users and workspace tables';
  END IF;
END;
$test_preflight$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e1000001', 'audit-owner-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e1000002', 'audit-admin-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e1000003', 'audit-analyst-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e1000004', 'audit-owner-b@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e1000005', 'audit-viewer-b@example.invalid', pg_catalog.now(), pg_catalog.now());

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);

INSERT INTO public.workspaces (
  id,
  name,
  reporting_currency,
  reporting_timezone,
  created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
  'Audit Workspace A',
  'USD',
  'UTC',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001'
);

INSERT INTO public.workspace_members (
  workspace_id,
  user_id,
  role,
  created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  'owner',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001'
);

INSERT INTO public.workspace_members (
  workspace_id,
  user_id,
  role,
  created_by
)
VALUES
  (
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
    'admin',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000001'
  ),
  (
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000003',
    'analyst',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000001'
  );

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000004',
  true
);

INSERT INTO public.workspaces (
  id,
  name,
  reporting_currency,
  reporting_timezone,
  created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
  'Audit Workspace B',
  'EUR',
  'Europe/London',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000004'
);

INSERT INTO public.workspace_members (
  workspace_id,
  user_id,
  role,
  created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000004',
  'owner',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000004'
);

INSERT INTO public.workspace_members (
  workspace_id,
  user_id,
  role,
  created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000005',
  'viewer',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000004'
);

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $test$
DECLARE
  v_role_count integer;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_role_count
  FROM pg_catalog.pg_roles
  WHERE rolname IN ('nexus_audit_table_owner', 'nexus_audit_writer')
    AND NOT rolsuper
    AND NOT rolcanlogin
    AND NOT rolinherit
    AND NOT rolbypassrls
    AND NOT rolcreatedb
    AND NOT rolcreaterole
    AND NOT rolreplication;

  IF v_role_count <> 2 THEN
    RAISE EXCEPTION 'audit internal role attributes are incorrect';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE granted_role.rolname IN (
        'nexus_audit_table_owner',
        'nexus_audit_writer'
      )
      AND member_role.rolname = session_user::text
      AND membership.set_option
      AND NOT membership.inherit_option
      AND NOT membership.admin_option
  ) <> 2 THEN
    RAISE EXCEPTION 'migration identity lacks the least-privilege SET memberships';
  END IF;

  IF pg_catalog.pg_has_role(
       'authenticated',
       'nexus_audit_writer',
       'SET'
     )
     OR pg_catalog.pg_has_role(
       'authenticated',
       'nexus_audit_table_owner',
       'SET'
     ) THEN
    RAISE EXCEPTION 'authenticated user can assume an audit internal role';
  END IF;

  IF pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    'private.audit_logs',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    'private.audit_logs',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    'private.audit_logs',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    'private.audit_logs',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'nexus_audit_writer',
    'private.audit_logs',
    'TRUNCATE'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'id', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'workspace_id', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'actor_user_id', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'action', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'entity_type', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'entity_id', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'metadata', 'INSERT'
  ) OR pg_catalog.has_column_privilege(
    'nexus_audit_writer', 'private.audit_logs', 'created_at', 'INSERT'
  ) THEN
    RAISE EXCEPTION 'audit writer privileges are not minimal';
  END IF;

  IF (
    SELECT pg_catalog.pg_get_userbyid(relation.relowner)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'private'
      AND relation.relname = 'audit_logs'
  ) <> 'nexus_audit_table_owner'
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_proc AS procedure
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = procedure.pronamespace
       JOIN pg_catalog.pg_roles AS owner_role
         ON owner_role.oid = procedure.proowner
       WHERE namespace.nspname = 'private'
         AND (
           (procedure.proname = 'audit_logs_reject_mutation'
             AND owner_role.rolname = 'nexus_audit_table_owner')
           OR (procedure.proname IN (
             'audit_logs_require_append_path',
             'append_audit_log',
             'capture_workspace_audit',
             'capture_membership_audit',
             'audit_log_write_authorized',
             'audit_log_reader_authorized'
           ) AND owner_role.rolname = 'nexus_audit_writer')
         )
     ) <> 7 THEN
    RAISE EXCEPTION 'audit object ownership is incorrect';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'nexus_audit_writer',
    'private.audit_current_actor()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'audit writer cannot execute its narrowly scoped actor helper';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'private.audit_current_actor()',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'private.audit_current_actor()',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.audit_current_actor()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'an application role can directly execute the trusted actor helper';
  END IF;

  IF (
    SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = 'private.audit_current_actor()'::pg_catalog.regprocedure
  ) IS DISTINCT FROM 'postgres'
     OR NOT (
       SELECT procedure.prosecdef
         AND 'search_path=""' = ANY (procedure.proconfig)
       FROM pg_catalog.pg_proc AS procedure
       WHERE procedure.oid = 'private.audit_current_actor()'::pg_catalog.regprocedure
     ) THEN
    RAISE EXCEPTION 'trusted actor helper owner or SECURITY DEFINER configuration is unsafe';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS acl
    JOIN pg_catalog.pg_roles AS grantee
      ON grantee.oid = acl.grantee
    WHERE procedure.oid = 'auth.uid()'::pg_catalog.regprocedure
      AND grantee.rolname = 'nexus_audit_writer'
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'audit writer has an unnecessary direct auth.uid grant';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'private.audit_logs', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'private.audit_logs', 'INSERT')
     OR pg_catalog.has_table_privilege('anon', 'private.audit_logs', 'UPDATE')
     OR pg_catalog.has_table_privilege('anon', 'private.audit_logs', 'DELETE')
     OR pg_catalog.has_table_privilege('anon', 'private.audit_logs', 'TRUNCATE')
     OR pg_catalog.has_table_privilege('authenticated', 'private.audit_logs', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'private.audit_logs', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'private.audit_logs', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'private.audit_logs', 'TRUNCATE')
     OR pg_catalog.has_table_privilege('service_role', 'private.audit_logs', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'private.audit_logs', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'private.audit_logs', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'private.audit_logs', 'DELETE')
     OR pg_catalog.has_table_privilege('service_role', 'private.audit_logs', 'TRUNCATE') THEN
    RAISE EXCEPTION 'application roles have unintended audit table privileges';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'authenticated',
    'private.audit_logs',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated lacks the RLS-protected read grant';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'private.append_audit_log(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'private.append_audit_log(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.append_audit_log(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'an application role can execute the internal append function';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'public.list_workspace_audit_logs(uuid,integer,integer)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'public.list_workspace_audit_logs(uuid,integer,integer)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'public.list_workspace_audit_logs(uuid,integer,integer)',
    'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname LIKE '%audit%'
      AND (
        procedure.proname <> 'list_workspace_audit_logs'
        OR procedure.prosecdef
      )
  ) THEN
    RAISE EXCEPTION
      'public audit read RPC is missing, over-granted, or not SECURITY INVOKER';
  END IF;

  IF pg_catalog.has_table_privilege('service_role', 'public.workspaces', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspaces', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspaces', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspaces', 'DELETE')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspace_members', 'SELECT')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspace_members', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspace_members', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.workspace_members', 'DELETE') THEN
    RAISE EXCEPTION 'service_role has broad workspace privileges';
  END IF;
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);
DO $test$
DECLARE
  v_denied boolean;
BEGIN
  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
        100,
        0
      )) <> 4 THEN
    RAISE EXCEPTION 'workspace owner cannot read own audit events';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
        100,
        0
      )) <> 0 THEN
    RAISE EXCEPTION 'workspace owner can read another workspace audit events';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
        1,
        1
      )) <> 1 THEN
    RAISE EXCEPTION 'audit RPC pagination did not return the requested page';
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO private.audit_logs (
      workspace_id, actor_user_id, action, entity_type, entity_id
    ) VALUES (
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e1000004',
      'created',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated user directly inserted or forged an audit event';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated user invoked the internal append function';
  END IF;

END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
  true
);
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
        100,
        0
      )) <> 4 THEN
    RAISE EXCEPTION 'workspace admin cannot read own workspace audit events';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000003',
  true
);
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
        100,
        0
      )) <> 0 THEN
    RAISE EXCEPTION 'analyst can read audit events';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000005',
  true
);
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
        100,
        0
      )) <> 0 THEN
    RAISE EXCEPTION 'viewer can read audit events';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000004',
  true
);
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
        100,
        0
      )) <> 3 THEN
    RAISE EXCEPTION 'second workspace owner cannot read own audit events';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.list_workspace_audit_logs(
        'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
        100,
        0
      )) <> 0 THEN
    RAISE EXCEPTION 'second workspace owner can read first workspace events';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);
DO $test$
DECLARE
  v_actor uuid;
BEGIN
  SELECT actor_user_id
  INTO v_actor
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    AND action = 'created'
    AND entity_type = 'workspace';

  IF v_actor IS DISTINCT FROM
     'e8a514e9-5b10-4bf3-a1b0-a301e1000001'::uuid THEN
    RAISE EXCEPTION 'workspace trigger did not derive actor from auth.uid';
  END IF;
END;
$test$;
RESET ROLE;

DO $test$
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
    true
  );

  UPDATE public.workspace_members
  SET role = 'viewer'
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    AND user_id = 'e8a514e9-5b10-4bf3-a1b0-a301e1000003';
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
  true
);
DO $test$
DECLARE
  v_actor uuid;
  v_metadata jsonb;
BEGIN
  SELECT actor_user_id, metadata
  INTO v_actor, v_metadata
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    AND action = 'role_changed'
    AND entity_type = 'membership'
    AND entity_id = 'e8a514e9-5b10-4bf3-a1b0-a301e1000003';

  IF v_actor IS DISTINCT FROM
       'e8a514e9-5b10-4bf3-a1b0-a301e1000002'::uuid
     OR v_metadata IS DISTINCT FROM
       '{"from_role":"analyst","to_role":"viewer"}'::jsonb THEN
    RAISE EXCEPTION 'membership audit actor or role-change metadata is incorrect';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);
SELECT pg_catalog.set_config(
  'test.audit_count_before',
  (
    SELECT pg_catalog.count(*)::text
    FROM private.audit_logs
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
  ),
  true
);
SELECT pg_catalog.set_config(
  'test.workspace_name_before',
  (
    SELECT name
    FROM public.workspaces
    WHERE id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
  ),
  true
);
RESET ROLE;

DO $test$
DECLARE
  v_rejected boolean;
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
    true
  );

  BEGIN
    UPDATE public.workspaces
    SET name = 'Rolled back audit probe'
    WHERE id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001';
    RAISE EXCEPTION 'rollback audit probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'rollback audit probe' THEN
      RAISE;
    END IF;
  END;

  v_rejected := false;
  BEGIN
    DELETE FROM public.workspaces
    WHERE id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001';
  EXCEPTION WHEN foreign_key_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'workspace deletion did not preserve retained audit history';
  END IF;
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);
DO $test$
BEGIN
  IF (
    SELECT pg_catalog.count(*)::text
    FROM private.audit_logs
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
  ) IS DISTINCT FROM pg_catalog.current_setting('test.audit_count_before')
     OR (
       SELECT name
       FROM public.workspaces
       WHERE id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
     ) IS DISTINCT FROM pg_catalog.current_setting('test.workspace_name_before') THEN
    RAISE EXCEPTION 'business rollback did not roll back its audit event';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE nexus_audit_writer;
DO $test$
DECLARE
  v_audit_id uuid;
  v_denied boolean;
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
    true
  );

  v_audit_id := private.append_audit_log(
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
    'updated',
    'workspace',
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
    '{"changed_fields":["name"]}'::jsonb
  );
  PERFORM pg_catalog.set_config('test.audit_log_id', v_audit_id::text, true);

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000002',
      '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'writer appended to an unauthorized workspace';
  END IF;

  v_denied := false;
  BEGIN
    INSERT INTO private.audit_logs (
      workspace_id, actor_user_id, action, entity_type, entity_id
    ) VALUES (
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'writer inserted without the approved append path';
  END IF;

  v_denied := false;
  BEGIN PERFORM 1 FROM private.audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'writer can read audit logs'; END IF;

  v_denied := false;
  BEGIN UPDATE private.audit_logs SET action = 'created';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'writer can update audit logs'; END IF;

  v_denied := false;
  BEGIN DELETE FROM private.audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'writer can delete audit logs'; END IF;

  v_denied := false;
  BEGIN EXECUTE 'TRUNCATE TABLE private.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'writer can truncate audit logs'; END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
  true
);
DO $test$
DECLARE
  v_audit_id uuid;
  v_actor_id uuid;
BEGIN
  v_audit_id := pg_catalog.current_setting('test.audit_log_id')::uuid;
  SELECT actor_user_id
  INTO v_actor_id
  FROM private.audit_logs
  WHERE id = v_audit_id;

  IF v_actor_id IS DISTINCT FROM
     'e8a514e9-5b10-4bf3-a1b0-a301e1000002'::uuid THEN
    RAISE EXCEPTION 'append path did not derive actor from auth.uid';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE nexus_audit_table_owner;
DO $test$
DECLARE
  v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN UPDATE private.audit_logs SET action = 'created';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'table owner bypassed update protection'; END IF;

  v_denied := false;
  BEGIN DELETE FROM private.audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'table owner bypassed delete protection'; END IF;

  v_denied := false;
  BEGIN EXECUTE 'TRUNCATE TABLE private.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'table owner bypassed truncate protection'; END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE nexus_audit_writer;
DO $test$
DECLARE
  v_denied boolean;
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000002',
    true
  );

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'accepted',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'invalid action/entity pair was accepted'; END IF;

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      '[]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'non-object metadata was accepted'; END IF;

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      '{"nested":{"access-token":"not-a-real-token"}}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'prohibited nested metadata key was accepted'; END IF;

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      '{"email":"person@example.invalid"}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'prohibited email metadata was accepted'; END IF;

  v_denied := false;
  BEGIN
    PERFORM private.append_audit_log(
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'updated',
      'workspace',
      'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      '{"password":"not-a-real-password"}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'prohibited password metadata was accepted'; END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $test$
DECLARE
  v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN INSERT INTO private.audit_logs (workspace_id, actor_user_id, action, entity_type)
    VALUES ('e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e1000001', 'updated', 'workspace');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anon inserted an audit event'; END IF;

  v_denied := false;
  BEGIN UPDATE private.audit_logs SET action = 'created';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anon updated audit events'; END IF;

  v_denied := false;
  BEGIN DELETE FROM private.audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anon deleted audit events'; END IF;

  v_denied := false;
  BEGIN EXECUTE 'TRUNCATE TABLE private.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anon truncated audit events'; END IF;

  v_denied := false;
  BEGIN PERFORM private.append_audit_log(
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
    'updated', 'workspace',
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001', '{}'::jsonb
  );
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'anon executed an internal audit function'; END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN UPDATE private.audit_logs SET action = 'created';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'authenticated updated audit events'; END IF;

  v_denied := false;
  BEGIN DELETE FROM private.audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'authenticated deleted audit events'; END IF;

  v_denied := false;
  BEGIN EXECUTE 'TRUNCATE TABLE private.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'authenticated truncated audit events'; END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $test$
DECLARE
  v_denied boolean;
BEGIN
  v_denied := false;
  BEGIN INSERT INTO private.audit_logs (workspace_id, actor_user_id, action, entity_type)
    VALUES ('e8a514e9-5b10-4bf3-a1b0-a301e2000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e1000001', 'updated', 'workspace');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'service_role inserted audit events'; END IF;

  v_denied := false;
  BEGIN UPDATE private.audit_logs SET action = 'created';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'service_role updated audit events'; END IF;

  v_denied := false;
  BEGIN DELETE FROM private.audit_logs;
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'service_role deleted audit events'; END IF;

  v_denied := false;
  BEGIN EXECUTE 'TRUNCATE TABLE private.audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'service_role truncated audit events'; END IF;

  v_denied := false;
  BEGIN PERFORM private.append_audit_log(
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001',
    'updated', 'workspace',
    'e8a514e9-5b10-4bf3-a1b0-a301e2000001', '{}'::jsonb
  );
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'service_role executed an internal audit function'; END IF;
END;
$test$;
RESET ROLE;

DO $test$
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
    true
  );

  DELETE FROM public.workspace_members
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    AND user_id = 'e8a514e9-5b10-4bf3-a1b0-a301e1000002';

  BEGIN
    DELETE FROM auth.users
    WHERE id = 'e8a514e9-5b10-4bf3-a1b0-a301e1000002';
    RAISE EXCEPTION 'auth.users deletion unexpectedly removed a referenced audit actor';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e1000001',
  true
);
DO $test$
DECLARE
  v_actor_id uuid;
BEGIN
  SELECT actor_user_id
  INTO v_actor_id
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e2000001'
    AND action = 'role_changed'
    AND entity_type = 'membership'
    AND entity_id = 'e8a514e9-5b10-4bf3-a1b0-a301e1000003';

  IF v_actor_id IS DISTINCT FROM
     'e8a514e9-5b10-4bf3-a1b0-a301e1000002'::uuid THEN
    RAISE EXCEPTION 'restricted auth.users deletion changed the audit actor';
  END IF;
END;
$test$;
RESET ROLE;

-- Every security and behavior assertion above raises on failure. Reaching
-- this point means the complete audit foundation test passed.
SELECT pass('Audit log foundation security and behavior assertions passed');
SELECT * FROM finish();

ROLLBACK;
