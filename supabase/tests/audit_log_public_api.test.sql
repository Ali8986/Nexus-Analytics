BEGIN;

SELECT plan(1);

DO $test$
DECLARE
  v_signature constant text :=
    'public.list_workspace_audit_logs(uuid,integer,integer)';
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    v_signature,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    v_signature,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    v_signature,
    'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = v_signature::regprocedure
      AND procedure.prosecdef
  ) THEN
    RAISE EXCEPTION
      'audit read RPC must be SECURITY INVOKER and executable only by authenticated users';
  END IF;

  IF NOT pg_catalog.has_schema_privilege(
    'authenticated',
    'private',
    'USAGE'
  ) OR pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
    OR pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE') THEN
    RAISE EXCEPTION
      'private schema usage must be granted only to authenticated for the invoker wrapper';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
    'authenticated',
    'private.audit_logs',
    'SELECT'
  ) THEN
    RAISE EXCEPTION
      'authenticated role must use the existing RLS-protected audit SELECT grant';
  END IF;
END;
$test$;

SELECT pass('Audit read RPC is invoker-only and uses authenticated RLS access');
SELECT * FROM finish();

ROLLBACK;
