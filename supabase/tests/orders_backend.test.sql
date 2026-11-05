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
      'orders SQL tests require a privileged session role that bypasses FORCE RLS for fixture setup';
  END IF;

  IF NOT pg_catalog.has_table_privilege(session_user, 'auth.users', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspaces', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspace_members', 'INSERT') THEN
    RAISE EXCEPTION
      'orders SQL tests require fixture DML privileges on auth.users and workspace tables';
  END IF;
END;
$test_preflight$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e5000001', 'orders-owner-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e5000002', 'orders-admin-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e5000003', 'orders-analyst-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e5000004', 'orders-viewer-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e5000005', 'orders-owner-b@example.invalid', pg_catalog.now(), pg_catalog.now());

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000001',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
  'Orders Workspace A',
  'USD',
  'UTC',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000001'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e6000001', 'e8a514e9-5b10-4bf3-a1b0-a301e5000001', 'owner', 'e8a514e9-5b10-4bf3-a1b0-a301e5000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e6000001', 'e8a514e9-5b10-4bf3-a1b0-a301e5000002', 'admin', 'e8a514e9-5b10-4bf3-a1b0-a301e5000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e6000001', 'e8a514e9-5b10-4bf3-a1b0-a301e5000003', 'analyst', 'e8a514e9-5b10-4bf3-a1b0-a301e5000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e6000001', 'e8a514e9-5b10-4bf3-a1b0-a301e5000004', 'viewer', 'e8a514e9-5b10-4bf3-a1b0-a301e5000001');

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000005',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e6000002',
  'Orders Workspace B',
  'EUR',
  'Europe/London',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000005'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e6000002',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000005',
  'owner',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000005'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000001',
  true
);
SELECT pg_catalog.set_config(
  'test.orders_customer_a',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'Orders Customer'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_archived_customer_a',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'Archived Orders Customer'
  )::text,
  true
);
SELECT private.archive_customer(
  'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
  pg_catalog.current_setting('test.orders_archived_customer_a')::uuid
);
SELECT pg_catalog.set_config(
  'test.orders_product_a1',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'Order Product One',
    'ORD-SKU-1',
    12.5000::numeric
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_product_a2',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'Order Product Two',
    'ORD-SKU-2',
    3.2500::numeric
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_archived_product_a',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'Archived Order Product',
    'ORD-SKU-3',
    1.0000::numeric
  )::text,
  true
);
SELECT private.archive_product(
  'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
  pg_catalog.current_setting('test.orders_archived_product_a')::uuid
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000005',
  true
);
SELECT pg_catalog.set_config(
  'test.orders_customer_b',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000002',
    'Other Workspace Customer'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_product_b',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000002',
    'Other Workspace Product',
    'ORD-SKU-1',
    99.0000::numeric
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_b',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000002',
    'orders-test-workspace-b',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_b'),
        'quantity',
        1
      )
    ),
    pg_catalog.current_setting('test.orders_customer_b')::uuid
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000001',
  true
);
SELECT pg_catalog.set_config(
  'test.orders_primary',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'orders-test-primary-key',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a1'),
        'quantity',
        2
      ),
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a2'),
        'quantity',
        3
      )
    ),
    pg_catalog.current_setting('test.orders_customer_a')::uuid
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_idempotent_retry',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'orders-test-primary-key',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a1'),
        'quantity',
        2
      ),
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a2'),
        'quantity',
        3
      )
    ),
    pg_catalog.current_setting('test.orders_customer_a')::uuid
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_optional_customer',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'orders-test-optional-customer',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a2'),
        'quantity',
        1
      )
    )
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.orders_cancelled',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'orders-test-cancelled',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a1'),
        'quantity',
        1
      )
    )
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e5000002',
  true
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
  pg_catalog.current_setting('test.orders_primary')::uuid,
  'processing'
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
  pg_catalog.current_setting('test.orders_primary')::uuid,
  'completed'
);
SELECT private.update_order_status(
  'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
  pg_catalog.current_setting('test.orders_cancelled')::uuid,
  'cancelled'
);
SELECT pg_catalog.set_config(
  'test.orders_admin',
  private.create_order(
    'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
    'orders-test-admin-create',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        pg_catalog.current_setting('test.orders_product_a2'),
        'quantity',
        1
      )
    )
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_denied boolean;
  v_rows bigint;
  v_order_id uuid;
  v_subtotal numeric(19, 4);
  v_currency_code text;
  v_status text;
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e5000001',
    true
  );

  IF pg_catalog.current_setting('test.orders_primary') <>
     pg_catalog.current_setting('test.orders_idempotent_retry') THEN
    RAISE EXCEPTION 'idempotent retry did not return the existing order';
  END IF;

  SELECT orders.subtotal, orders.currency_code, orders.status
  INTO v_subtotal, v_currency_code, v_status
  FROM public.orders AS orders
  WHERE orders.id = pg_catalog.current_setting('test.orders_primary')::uuid;
  IF v_subtotal <> 34.7500::numeric THEN
    RAISE EXCEPTION 'server-calculated order subtotal was incorrect';
  END IF;

  IF (SELECT orders.total
      FROM public.orders AS orders
      WHERE orders.id = pg_catalog.current_setting('test.orders_primary')::uuid)
       IS DISTINCT FROM 34.7500::numeric
     OR v_currency_code IS DISTINCT FROM 'USD'
     OR v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'order total, reporting currency, or current status is incorrect';
  END IF;

  IF (SELECT orders.customer_id
      FROM public.orders AS orders
      WHERE orders.id = pg_catalog.current_setting('test.orders_optional_customer')::uuid)
       IS NOT NULL THEN
    RAISE EXCEPTION 'optional customer was not stored as NULL';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.order_items AS item
      WHERE item.order_id = pg_catalog.current_setting('test.orders_primary')::uuid) <> 2
     OR NOT EXISTS (
       SELECT 1
       FROM public.order_items AS item
       WHERE item.order_id = pg_catalog.current_setting('test.orders_primary')::uuid
         AND item.product_id = pg_catalog.current_setting('test.orders_product_a1')::uuid
         AND item.product_name = 'Order Product One'
         AND item.product_sku = 'ORD-SKU-1'
         AND item.unit_price = 12.5000
         AND item.quantity = 2
         AND item.line_total = 25.0000
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.order_items AS item
       WHERE item.order_id = pg_catalog.current_setting('test.orders_primary')::uuid
         AND item.product_id = pg_catalog.current_setting('test.orders_product_a2')::uuid
         AND item.product_name = 'Order Product Two'
         AND item.product_sku = 'ORD-SKU-2'
         AND item.unit_price = 3.2500
         AND item.quantity = 3
         AND item.line_total = 9.7500
     ) THEN
    RAISE EXCEPTION 'product snapshots, quantities, or line totals were incorrect';
  END IF;

  SELECT pg_catalog.count(*) INTO v_rows
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
    AND entity_type = 'order'
    AND entity_id = pg_catalog.current_setting('test.orders_primary')::uuid
    AND action = 'created';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'idempotent order retry created duplicate audit events';
  END IF;

  IF (SELECT actor_user_id
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
        AND entity_id = pg_catalog.current_setting('test.orders_primary')::uuid
        AND action = 'created') IS DISTINCT FROM
         'e8a514e9-5b10-4bf3-a1b0-a301e5000001'::uuid THEN
    RAISE EXCEPTION 'order audit actor did not use authenticated context';
  END IF;

  IF (SELECT actor_user_id
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
        AND entity_id = pg_catalog.current_setting('test.orders_admin')::uuid
        AND action = 'created') IS DISTINCT FROM
         'e8a514e9-5b10-4bf3-a1b0-a301e5000002'::uuid THEN
    RAISE EXCEPTION 'Admin order creation or actor identity failed';
  END IF;

  IF (SELECT metadata
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
        AND entity_id = pg_catalog.current_setting('test.orders_primary')::uuid
        AND action = 'created') IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'order audit metadata unexpectedly contains client data';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
        AND entity_id = pg_catalog.current_setting('test.orders_primary')::uuid
        AND action = 'status_changed') <> 2 THEN
    RAISE EXCEPTION 'order status audit events are missing';
  END IF;

  IF (SELECT status FROM public.orders
      WHERE id = pg_catalog.current_setting('test.orders_cancelled')::uuid)
       IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Pending to Cancelled transition failed';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-primary-key',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_a1'),
          'quantity',
          9
        )
      ),
      pg_catalog.current_setting('test.orders_customer_a')::uuid
    );
  EXCEPTION WHEN unique_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'idempotency key reuse with a different payload was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-empty-items',
      '[]'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'empty order items were accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-zero-quantity',
      '[{"product_id":"e8a514e9-5b10-4bf3-a1b0-a301e7000001","quantity":0}]'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'zero order quantity was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-negative-quantity',
      '[{"product_id":"e8a514e9-5b10-4bf3-a1b0-a301e7000001","quantity":-1}]'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'negative order quantity was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-fractional-quantity',
      '[{"product_id":"e8a514e9-5b10-4bf3-a1b0-a301e7000001","quantity":1.5}]'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'fractional order quantity was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-archived-product',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_archived_product_a'),
          'quantity',
          1
        )
      )
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'archived product was accepted into an order';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-cross-workspace-product',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_b'),
          'quantity',
          1
        )
      )
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'cross-workspace product was accepted into an order';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-archived-customer',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_a1'),
          'quantity',
          1
        )
      ),
      pg_catalog.current_setting('test.orders_archived_customer_a')::uuid
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'archived customer was accepted into an order';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-cross-workspace-customer',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_a1'),
          'quantity',
          1
        )
      ),
      pg_catalog.current_setting('test.orders_customer_b')::uuid
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'cross-workspace customer was accepted into an order';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_order_status(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      pg_catalog.current_setting('test.orders_optional_customer')::uuid,
      'completed'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Pending to Completed transition was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_order_status(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      pg_catalog.current_setting('test.orders_primary')::uuid,
      'cancelled'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Completed to Cancelled terminal transition was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_order_status(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      pg_catalog.current_setting('test.orders_cancelled')::uuid,
      'processing'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Cancelled terminal transition was accepted';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e5000003',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-analyst-create',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_a1'),
          'quantity',
          1
        )
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Analyst created an order';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_order_status(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      pg_catalog.current_setting('test.orders_optional_customer')::uuid,
      'processing'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Analyst updated an order';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.orders) <> 4 THEN
    RAISE EXCEPTION 'Analyst could not read exactly its own workspace orders';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e5000004',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-viewer-create',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_a1'),
          'quantity',
          1
        )
      )
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Viewer created an order';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_order_status(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      pg_catalog.current_setting('test.orders_cancelled')::uuid,
      'processing'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Viewer updated an order';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.orders) <> 4
     OR (SELECT pg_catalog.count(*) FROM public.order_items) <> 5
     OR EXISTS (
       SELECT 1
       FROM public.orders
       WHERE id = pg_catalog.current_setting('test.orders_b')::uuid
     ) THEN
    RAISE EXCEPTION 'Viewer could not read own workspace orders and items';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e5000001',
    true
  );

  v_denied := false;
  BEGIN
    INSERT INTO public.orders (
      id, workspace_id, idempotency_key, idempotency_payload,
      currency_code, subtotal, total
    )
    VALUES (
      pg_catalog.gen_random_uuid(),
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'direct-write',
      '{}'::jsonb,
      'USD',
      0,
      0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated user directly inserted an order';
  END IF;

  v_denied := false;
  BEGIN
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = pg_catalog.current_setting('test.orders_optional_customer')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated user directly updated an order';
  END IF;

  IF pg_catalog.has_table_privilege('service_role', 'public.orders', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.orders', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.order_items', 'INSERT')
     OR pg_catalog.has_function_privilege(
       'service_role',
       'private.create_order(uuid,text,jsonb,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated',
       'private.workspace_owner_admin_authorized(uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'private.create_order(uuid,text,jsonb,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'application roles have unintended order privileges';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_index AS index
    JOIN pg_catalog.pg_class AS relation ON relation.oid = index.indexrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'orders_workspace_idempotency_key_key'
      AND index.indisunique
  ) <> 1 THEN
    RAISE EXCEPTION 'orders lack the unique workspace idempotency constraint needed for concurrent retry arbitration';
  END IF;

  IF pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.update_order_status(uuid,uuid,text)'::pg_catalog.regprocedure
    ),
    'FOR UPDATE'
  ) = 0 THEN
    RAISE EXCEPTION 'order status transitions do not serialize concurrent updates';
  END IF;

  SELECT pg_catalog.count(*) INTO v_rows
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
    AND entity_type = 'order';
  PERFORM pg_catalog.set_config('test.order_audit_count_before_rollback', v_rows::text, true);

  BEGIN
    PERFORM private.create_order(
      'e8a514e9-5b10-4bf3-a1b0-a301e6000001',
      'orders-test-rollback',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'product_id',
          pg_catalog.current_setting('test.orders_product_a1'),
          'quantity',
          1
        )
      )
    );
    RAISE EXCEPTION 'order rollback probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'order rollback probe' THEN
      RAISE;
    END IF;
  END;

  IF (SELECT pg_catalog.count(*) FROM public.orders) <> 4 OR (
    SELECT pg_catalog.count(*)::text
    FROM private.audit_logs
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e6000001'
      AND entity_type = 'order'
  ) IS DISTINCT FROM pg_catalog.current_setting('test.order_audit_count_before_rollback') THEN
    RAISE EXCEPTION 'order and audit event did not roll back together';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated',
    'private.create_order(uuid,text,jsonb,uuid)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated',
    'private.update_order_status(uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated role cannot execute the public-facing order operations';
  END IF;
END;
$test$;
RESET ROLE;

SELECT pass('Orders backend security, idempotency, and behavior assertions passed');
SELECT * FROM finish();

ROLLBACK;
