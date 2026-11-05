BEGIN;

SELECT plan(1);

DO $test$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_product(uuid,text,text,numeric,text)',
    'public.update_product(uuid,uuid,text,text,numeric,text)',
    'public.archive_product(uuid,uuid)'
  ]
  LOOP
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
      RAISE EXCEPTION 'product RPC wrapper permissions or security mode are incorrect: %',
        v_signature;
    END IF;
  END LOOP;
END;
$test$;

SELECT pass('Product RPC wrappers are invoker-only and authenticated-only');
SELECT * FROM finish();

ROLLBACK;
