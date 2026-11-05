BEGIN;

SELECT plan(1);

DO $test$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_customer(uuid,text,text,text,text,text,text,text,text,text,text)',
    'public.update_customer(uuid,uuid,text,text,text,text,text,text,text,text,text,text)',
    'public.archive_customer(uuid,uuid)'
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
      RAISE EXCEPTION 'customer RPC wrapper permissions or security mode are incorrect: %',
        v_signature;
    END IF;
  END LOOP;
END;
$test$;

SELECT pass('Customer RPC wrappers are invoker-only and authenticated-only');
SELECT * FROM finish();

ROLLBACK;
