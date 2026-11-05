BEGIN;

SELECT plan(1);

DO $test$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT *
    FROM (VALUES
      ('public.analytics_overview(uuid,date,date)'),
      ('public.analytics_revenue_trend(uuid,date,date)'),
      ('public.analytics_revenue_trend_window(uuid,integer)'),
      ('public.analytics_order_status_breakdown(uuid,date,date)'),
      ('public.analytics_orders_over_time(uuid,date,date)'),
      ('public.analytics_recent_orders(uuid,date,date,integer,integer)'),
      ('public.analytics_customer_summary(uuid,date,date)'),
      ('public.analytics_new_customers_over_time(uuid,date,date)'),
      ('public.analytics_top_customers_by_revenue(uuid,date,date,integer,integer)'),
      ('public.analytics_product_performance(uuid,date,date,text,integer,integer)')
    ) AS analytics_functions(signature)
  LOOP
    IF NOT pg_catalog.has_function_privilege(
      'authenticated',
      v_function.signature,
      'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'anon',
      v_function.signature,
      'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
      'service_role',
      v_function.signature,
      'EXECUTE'
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = v_function.signature::regprocedure
        AND procedure.prosecdef
    ) THEN
      RAISE EXCEPTION 'analytics API wrapper permissions or security mode are incorrect: %',
        v_function.signature;
    END IF;
  END LOOP;
END;
$test$;

SELECT pass('Public analytics RPC wrappers are invoker-only and authenticated-only');
SELECT * FROM finish();

ROLLBACK;
