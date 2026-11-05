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
      'analytics SQL tests require a privileged session role that bypasses FORCE RLS for fixtures';
  END IF;

  IF NOT pg_catalog.has_table_privilege(session_user, 'auth.users', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspaces', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspace_members', 'INSERT') THEN
    RAISE EXCEPTION
      'analytics SQL tests require fixture DML privileges on auth.users and workspace tables';
  END IF;
END;
$test_preflight$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e7000001', 'analytics-owner-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e7000002', 'analytics-admin-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e7000003', 'analytics-analyst-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e7000004', 'analytics-viewer-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e7000005', 'analytics-owner-b@example.invalid', pg_catalog.now(), pg_catalog.now());

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000001',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  'Analytics Workspace A',
  'USD',
  'America/Los_Angeles',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000001'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000001', 'e8a514e9-5b10-4bf3-a1b0-a301e7000001', 'owner', 'e8a514e9-5b10-4bf3-a1b0-a301e7000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000001', 'e8a514e9-5b10-4bf3-a1b0-a301e7000002', 'admin', 'e8a514e9-5b10-4bf3-a1b0-a301e7000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000001', 'e8a514e9-5b10-4bf3-a1b0-a301e7000003', 'analyst', 'e8a514e9-5b10-4bf3-a1b0-a301e7000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000001', 'e8a514e9-5b10-4bf3-a1b0-a301e7000004', 'viewer', 'e8a514e9-5b10-4bf3-a1b0-a301e7000001');

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000005',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
  'Analytics Workspace B',
  'EUR',
  'Europe/London',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000005'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000005',
  'owner',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000005'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000001',
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_customer_a',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'Analytics Customer Alpha'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_customer_b',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'Analytics Customer Beta'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_customer_archived',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'Analytics Archived Customer'
  )::text,
  true
);
SELECT private.archive_customer(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_customer_archived')::uuid
);
SELECT pg_catalog.set_config(
  'test.analytics_product_a',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'Active Historical Product A',
    'ANALYTICS-A',
    10.0000::numeric
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_product_b',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'Snapshot Product B',
    'ANALYTICS-B',
    5.0000::numeric
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000005',
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_customer_b_workspace',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
    'Other Workspace Customer'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_product_b_workspace',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
    'Other Workspace Product',
    'OTHER-ANALYTICS',
    999.0000::numeric
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_order_b_workspace',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
    'analytics-workspace-b-order',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.analytics_product_b_workspace'),
        'quantity',
        1
      )
    ),
    pg_catalog.current_setting('test.analytics_customer_b_workspace')::uuid
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000001',
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_order_processing',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'analytics-processing-order',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.analytics_product_a'),
        'quantity',
        1
      )
    ),
    pg_catalog.current_setting('test.analytics_customer_a')::uuid
  )::text,
  true
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_order_processing')::uuid,
  'processing'
);
SELECT pg_catalog.set_config(
  'test.analytics_order_completed',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'analytics-completed-order',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.analytics_product_b'),
        'quantity',
        4
      )
    ),
    pg_catalog.current_setting('test.analytics_customer_b')::uuid
  )::text,
  true
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_order_completed')::uuid,
  'processing'
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_order_completed')::uuid,
  'completed'
);
SELECT pg_catalog.set_config(
  'test.analytics_order_pending',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'analytics-pending-order',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.analytics_product_a'),
        'quantity',
        3
      )
    ),
    pg_catalog.current_setting('test.analytics_customer_a')::uuid
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.analytics_order_cancelled',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'analytics-cancelled-order',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.analytics_product_b'),
        'quantity',
        2
      )
    ),
    pg_catalog.current_setting('test.analytics_customer_b')::uuid
  )::text,
  true
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_order_cancelled')::uuid,
  'cancelled'
);
SELECT pg_catalog.set_config(
  'test.analytics_order_before_range',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    'analytics-before-range-order',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.analytics_product_a'),
        'quantity',
        10
      )
    ),
    pg_catalog.current_setting('test.analytics_customer_b')::uuid
  )::text,
  true
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_order_before_range')::uuid,
  'processing'
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_order_before_range')::uuid,
  'completed'
);
SELECT private.update_product(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_product_b')::uuid,
  'Renamed Product B',
  'RENAMED-B',
  25.0000::numeric
);
SELECT private.archive_product(
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  pg_catalog.current_setting('test.analytics_product_b')::uuid
);
RESET ROLE;

UPDATE public.orders
SET created_at = CASE id
  WHEN pg_catalog.current_setting('test.analytics_order_processing')::uuid
    THEN '2026-03-08 08:30:00+00'::timestamp with time zone
  WHEN pg_catalog.current_setting('test.analytics_order_completed')::uuid
    THEN '2026-03-09 07:30:00+00'::timestamp with time zone
  WHEN pg_catalog.current_setting('test.analytics_order_pending')::uuid
    THEN '2026-03-10 19:00:00+00'::timestamp with time zone
  WHEN pg_catalog.current_setting('test.analytics_order_cancelled')::uuid
    THEN '2026-03-10 20:00:00+00'::timestamp with time zone
  WHEN pg_catalog.current_setting('test.analytics_order_before_range')::uuid
    THEN '2026-03-08 07:30:00+00'::timestamp with time zone
END
WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e8000001';

UPDATE public.customers
SET created_at = CASE id
  WHEN pg_catalog.current_setting('test.analytics_customer_a')::uuid
    THEN '2026-03-08 08:00:00+00'::timestamp with time zone
  WHEN pg_catalog.current_setting('test.analytics_customer_b')::uuid
    THEN '2026-03-09 08:00:00+00'::timestamp with time zone
  WHEN pg_catalog.current_setting('test.analytics_customer_archived')::uuid
    THEN '2026-03-10 08:00:00+00'::timestamp with time zone
END
WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e8000001';

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e7000001',
  true
);
DO $test$
DECLARE
  v_row record;
  v_denied boolean;
  v_expected_customer uuid;
  v_expected_product uuid;
  v_authorized_reads integer := 0;
BEGIN
  SELECT *
  INTO v_row
  FROM private.analytics_overview(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    '2026-03-08'::date,
    '2026-03-10'::date
  );
  IF v_row.reporting_currency IS DISTINCT FROM 'USD'
     OR v_row.reporting_timezone IS DISTINCT FROM 'America/Los_Angeles'
     OR v_row.total_revenue IS DISTINCT FROM 30.0000::numeric
     OR v_row.total_orders <> 4
     OR v_row.completed_orders <> 1
     OR v_row.processing_orders <> 1
     OR v_row.pending_orders <> 1
     OR v_row.cancelled_orders <> 1
     OR v_row.total_customers <> 3
     OR v_row.active_customers <> 2
     OR v_row.total_active_products <> 1
     OR v_row.average_order_value IS DISTINCT FROM 15.0000::numeric THEN
    RAISE EXCEPTION 'overview KPI values, date filtering, currency, or entity counts were incorrect: %', v_row;
  END IF;

  SELECT *
  INTO v_row
  FROM private.analytics_overview(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    '2026-03-11'::date,
    '2026-03-11'::date
  );
  IF v_row.total_revenue IS DISTINCT FROM 0::numeric
     OR v_row.total_orders <> 0
     OR v_row.average_order_value IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'zero-order date range did not return zero revenue, counts, and average order value';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_revenue_trend(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10'
      )) <> 3 THEN
    RAISE EXCEPTION 'revenue trend did not include every local calendar date';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_revenue_trend_window(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        7
      )) <> 7
     OR (SELECT pg_catalog.count(*)
         FROM private.analytics_revenue_trend_window(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           30
         )) <> 30
     OR (SELECT pg_catalog.count(*)
         FROM private.analytics_revenue_trend_window(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           90
         )) <> 90 THEN
    RAISE EXCEPTION 'preset revenue trend windows did not return 7, 30, and 90 local dates';
  END IF;

  IF (SELECT trend.revenue
      FROM private.analytics_revenue_trend(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10'
      ) AS trend
      WHERE trend.report_date = '2026-03-08') IS DISTINCT FROM 10.0000::numeric
     OR (SELECT trend.revenue
         FROM private.analytics_revenue_trend(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10'
         ) AS trend
         WHERE trend.report_date = '2026-03-09') IS DISTINCT FROM 20.0000::numeric
     OR (SELECT trend.revenue
         FROM private.analytics_revenue_trend(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10'
         ) AS trend
         WHERE trend.report_date = '2026-03-10') IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'workspace-local revenue dates, range boundaries, or zero-fill are incorrect';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_order_status_breakdown(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10'
      )) <> 4
     OR (SELECT breakdown.order_count
         FROM private.analytics_order_status_breakdown(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10'
         ) AS breakdown
         WHERE breakdown.status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'order status breakdown omitted statuses or returned wrong counts';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_orders_over_time(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10'
      )) <> 3
     OR (SELECT trend.total_orders
      FROM private.analytics_orders_over_time(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10'
      ) AS trend
      WHERE trend.report_date = '2026-03-10') <> 2
     OR (SELECT trend.total_orders
         FROM private.analytics_orders_over_time(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10'
         ) AS trend
         WHERE trend.report_date = '2026-03-07') IS NOT NULL THEN
    RAISE EXCEPTION 'order trend local-date aggregation or requested range bounds were incorrect';
  END IF;

  SELECT *
  INTO v_row
  FROM private.analytics_customer_summary(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    '2026-03-08',
    '2026-03-10'
  );
  IF v_row.total_customers <> 3
     OR v_row.active_customers <> 2
     OR v_row.customers_with_qualifying_orders <> 2
     OR v_row.new_customers_in_range <> 3 THEN
    RAISE EXCEPTION 'customer summary counts were incorrect';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_new_customers_over_time(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10'
      )) <> 3
     OR (SELECT trend.new_customer_count
         FROM private.analytics_new_customers_over_time(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10'
         ) AS trend
         WHERE trend.report_date = '2026-03-10') <> 1 THEN
    RAISE EXCEPTION 'new customer trend did not use continuous workspace-local dates';
  END IF;

  SELECT top_customer.customer_id
  INTO v_expected_customer
  FROM private.analytics_top_customers_by_revenue(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    '2026-03-08',
    '2026-03-10',
    10,
    0
  ) AS top_customer
  ORDER BY top_customer.qualifying_revenue DESC
  LIMIT 1;
  IF v_expected_customer IS DISTINCT FROM
     pg_catalog.current_setting('test.analytics_customer_b')::uuid
     OR (SELECT top_customer.qualifying_revenue
         FROM private.analytics_top_customers_by_revenue(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10',
           10,
           0
         ) AS top_customer
         WHERE top_customer.customer_id =
           pg_catalog.current_setting('test.analytics_customer_b')::uuid) <> 20.0000::numeric THEN
    RAISE EXCEPTION 'top customer rank or qualifying revenue was incorrect';
  END IF;

  SELECT product.product_id
  INTO v_expected_product
  FROM private.analytics_product_performance(
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    '2026-03-08',
    '2026-03-10',
    'revenue',
    10,
    0
  ) AS product
  ORDER BY product.qualifying_revenue DESC
  LIMIT 1;
  IF v_expected_product IS DISTINCT FROM
       pg_catalog.current_setting('test.analytics_product_b')::uuid
     OR NOT EXISTS (
       SELECT 1
       FROM private.analytics_product_performance(
         'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
         '2026-03-08',
         '2026-03-10',
         'revenue',
         10,
         0
       ) AS product
       WHERE product.product_id =
           pg_catalog.current_setting('test.analytics_product_b')::uuid
         AND product.product_name = 'Snapshot Product B'
         AND product.product_sku = 'ANALYTICS-B'
         AND product.units_sold = 4
         AND product.qualifying_order_count = 1
         AND product.qualifying_revenue = 20.0000::numeric
     ) THEN
    RAISE EXCEPTION 'product ranking did not use historical snapshots or include archived product sales';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_product_performance(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10',
        'units',
        1,
        0
      )) <> 1
     OR (SELECT page.product_id
         FROM private.analytics_product_performance(
           'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
           '2026-03-08',
           '2026-03-10',
           'units',
           1,
           0
         ) AS page) IS DISTINCT FROM
           pg_catalog.current_setting('test.analytics_product_b')::uuid THEN
    RAISE EXCEPTION 'product units ranking or page-size bound was incorrect';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_recent_orders(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10',
        100,
        0
      )) <> 4 THEN
    RAISE EXCEPTION 'recent orders returned an incorrect bounded page or ignored date boundaries';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.analytics_recent_orders(
        'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
        '2026-03-08',
        '2026-03-10',
        10,
        10000
      )) <> 0 THEN
    RAISE EXCEPTION 'recent order maximum offset did not remain bounded';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.analytics_overview(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      '2026-03-10',
      '2026-03-08'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'reversed analytics date range was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.analytics_revenue_trend(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      '2025-01-01',
      '2026-03-08'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'unreasonably wide revenue trend range was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.analytics_revenue_trend_window(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      14
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'unsupported preset revenue trend window was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.analytics_recent_orders(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      NULL,
      NULL,
      101,
      0
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'recent order page size above 100 was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.analytics_top_customers_by_revenue(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      NULL,
      NULL,
      10,
      10001
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'top customer offset above 10000 was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.analytics_product_performance(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      '2026-03-08',
      '2026-03-10',
      'cost',
      10,
      0
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'unsupported product ranking selector was accepted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.analytics_recent_orders(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      NULL,
      NULL,
      100,
      0
    ) AS recent_order
    WHERE recent_order.order_id =
      pg_catalog.current_setting('test.analytics_order_b_workspace')::uuid
  ) OR EXISTS (
    SELECT 1
    FROM private.analytics_product_performance(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      '2026-03-08',
      '2026-03-10',
      'revenue',
      100,
      0
    ) AS product
    WHERE product.product_name = 'Other Workspace Product'
  ) THEN
    RAISE EXCEPTION 'analytics results leaked another workspace data';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.analytics_overview(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
      '2026-03-08',
      '2026-03-10'
    )
  ) THEN
    RAISE EXCEPTION 'non-member received a workspace B analytics row';
  END IF;

  FOR v_expected_customer IN
    SELECT actor.user_id
    FROM (VALUES
      ('e8a514e9-5b10-4bf3-a1b0-a301e7000001'::uuid),
      ('e8a514e9-5b10-4bf3-a1b0-a301e7000002'::uuid),
      ('e8a514e9-5b10-4bf3-a1b0-a301e7000003'::uuid),
      ('e8a514e9-5b10-4bf3-a1b0-a301e7000004'::uuid)
    ) AS actor(user_id)
  LOOP
    PERFORM pg_catalog.set_config(
      'request.jwt.claim.sub',
      v_expected_customer::text,
      true
    );
    IF (SELECT pg_catalog.count(*)
        FROM private.analytics_overview(
          'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
          '2026-03-08',
          '2026-03-10'
        )) <> 1
       OR (SELECT pg_catalog.count(*)
           FROM private.analytics_revenue_trend(
             'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
             '2026-03-08',
             '2026-03-10'
           )) <> 3 THEN
      RAISE EXCEPTION 'an authorized workspace role could not read analytics';
    END IF;
    v_authorized_reads := v_authorized_reads + 1;
  END LOOP;
  IF v_authorized_reads <> 4 THEN
    RAISE EXCEPTION 'not all four workspace roles were verified for analytics reads';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon',
    'private.analytics_overview(uuid,date,date)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.analytics_overview(uuid,date,date)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'private.analytics_overview(uuid,date,date)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'analytics execution grants are broader or narrower than intended';
  END IF;
  IF pg_catalog.has_function_privilege(
    'anon',
    'private.analytics_revenue_trend_window(uuid,integer)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.analytics_revenue_trend_window(uuid,integer)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated',
    'private.analytics_revenue_trend_window(uuid,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'preset revenue trend execution grants are incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure.proname LIKE 'analytics_%'
      AND procedure.prosecdef
  ) THEN
    RAISE EXCEPTION 'analytics unexpectedly uses SECURITY DEFINER';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $unauthenticated_test$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM private.analytics_overview(
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      '2026-03-08',
      '2026-03-10'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'unauthenticated role executed analytics';
  END IF;
END;
$unauthenticated_test$;
RESET ROLE;

SELECT pass('Workspace analytics correctness, timezone, authorization, and isolation assertions passed');
SELECT * FROM finish();

ROLLBACK;
