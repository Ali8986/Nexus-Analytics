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
      'customers/products SQL tests require a privileged session role that bypasses FORCE RLS for fixture setup';
  END IF;

  IF NOT pg_catalog.has_table_privilege(session_user, 'auth.users', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'auth.users', 'DELETE')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspaces', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspace_members', 'INSERT') THEN
    RAISE EXCEPTION
      'customers/products SQL tests require fixture DML privileges on auth.users and workspace tables';
  END IF;
END;
$test_preflight$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e3000001', 'cp-owner-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e3000002', 'cp-admin-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e3000003', 'cp-analyst-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e3000004', 'cp-viewer-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e3000005', 'cp-owner-b@example.invalid', pg_catalog.now(), pg_catalog.now());

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000001',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
  'Customers Products Workspace A',
  'USD',
  'UTC',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000001'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e4000001', 'e8a514e9-5b10-4bf3-a1b0-a301e3000001', 'owner', 'e8a514e9-5b10-4bf3-a1b0-a301e3000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e4000001', 'e8a514e9-5b10-4bf3-a1b0-a301e3000002', 'admin', 'e8a514e9-5b10-4bf3-a1b0-a301e3000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e4000001', 'e8a514e9-5b10-4bf3-a1b0-a301e3000003', 'analyst', 'e8a514e9-5b10-4bf3-a1b0-a301e3000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e4000001', 'e8a514e9-5b10-4bf3-a1b0-a301e3000004', 'viewer', 'e8a514e9-5b10-4bf3-a1b0-a301e3000001');

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000005',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e4000002',
  'Customers Products Workspace B',
  'EUR',
  'Europe/London',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000005'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e4000002',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000005',
  'owner',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000005'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000001',
  true
);
SELECT pg_catalog.set_config(
  'test.customer_a1',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
    'Customer One',
    'Example Company',
    'duplicate@example.invalid',
    '+1-555-0101'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.customer_a2',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
    'Customer Two',
    'Example Company',
    'duplicate@example.invalid',
    '+1-555-0102'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.product_a1',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
    'Widget',
    'SKU-100',
    19.9900::numeric,
    'A test product'
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000002',
  true
);
SELECT private.update_customer(
  'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
  pg_catalog.current_setting('test.customer_a1')::uuid,
  'Customer One Updated',
  'Example Company',
  'duplicate@example.invalid',
  '+1-555-0199'
);
SELECT private.update_product(
  'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
  pg_catalog.current_setting('test.product_a1')::uuid,
  'Widget Updated',
  'SKU-100',
  22.5000::numeric,
  'Updated description'
);
SELECT private.archive_customer(
  'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
  pg_catalog.current_setting('test.customer_a2')::uuid
);
SELECT private.archive_product(
  'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
  pg_catalog.current_setting('test.product_a1')::uuid
);
SELECT pg_catalog.set_config(
  'test.product_a2',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
    'Replacement Widget',
    'SKU-100',
    24.0000::numeric
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e3000005',
  true
);
SELECT pg_catalog.set_config(
  'test.customer_b1',
  private.create_customer(
    'e8a514e9-5b10-4bf3-a1b0-a301e4000002',
    'Workspace B Customer'
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.product_b1',
  private.create_product(
    'e8a514e9-5b10-4bf3-a1b0-a301e4000002',
    'Workspace B Product',
    'SKU-100',
    1.0000::numeric
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_denied boolean;
  v_customer_id uuid;
  v_audit_count bigint;
  v_duplicate_count bigint;
BEGIN
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000001',
    true
  );

  SELECT pg_catalog.count(*)
  INTO v_duplicate_count
  FROM public.customers
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
    AND email = 'duplicate@example.invalid';
  IF v_duplicate_count <> 2 THEN
    RAISE EXCEPTION 'duplicate customer email fixture count was %', v_duplicate_count;
  END IF;

  IF (SELECT archived_at IS NULL
      FROM public.customers
      WHERE id = pg_catalog.current_setting('test.customer_a2')::uuid) THEN
    RAISE EXCEPTION 'customer archive did not set archived_at';
  END IF;

  IF (SELECT archived_at IS NULL
      FROM public.products
      WHERE id = pg_catalog.current_setting('test.product_a1')::uuid) THEN
    RAISE EXCEPTION 'product archive did not set archived_at';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.products
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
        AND sku = 'SKU-100'
        AND archived_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'archived product SKU was not reusable';
  END IF;

  IF (SELECT name FROM public.customers
      WHERE id = pg_catalog.current_setting('test.customer_a1')::uuid)
       IS DISTINCT FROM 'Customer One Updated'
     OR (SELECT unit_price FROM public.products
         WHERE id = pg_catalog.current_setting('test.product_a2')::uuid)
       IS DISTINCT FROM 24.0000::numeric THEN
    RAISE EXCEPTION 'Owner/Admin update or create operation failed';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM public.customers
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
        AND id = pg_catalog.current_setting('test.customer_b1')::uuid) <> 0
     OR (SELECT pg_catalog.count(*)
         FROM public.products
         WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
           AND id = pg_catalog.current_setting('test.product_b1')::uuid) <> 0 THEN
    RAISE EXCEPTION 'workspace RLS exposed another tenant record';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000005',
    true
  );
  IF (SELECT pg_catalog.count(*)
      FROM public.products
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000002'
        AND sku = 'SKU-100'
        AND archived_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'product SKU uniqueness was not scoped to workspace';
  END IF;
  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000001',
    true
  );

  IF (SELECT pg_catalog.count(*)
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
        AND entity_type = 'customer'
        AND entity_id IN (
          pg_catalog.current_setting('test.customer_a1')::uuid,
          pg_catalog.current_setting('test.customer_a2')::uuid
        )
        AND action IN ('created', 'updated', 'deleted')) <> 4 THEN
    RAISE EXCEPTION 'customer create/update/archive audit events are incomplete';
  END IF;

  IF (SELECT pg_catalog.count(*)
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
        AND entity_type = 'product'
        AND entity_id IN (
          pg_catalog.current_setting('test.product_a1')::uuid,
          pg_catalog.current_setting('test.product_a2')::uuid
        )
        AND action IN ('created', 'updated', 'deleted')) <> 4 THEN
    RAISE EXCEPTION 'product create/update/archive audit events are incomplete';
  END IF;

  IF (SELECT actor_user_id
      FROM private.audit_logs
      WHERE entity_type = 'customer'
        AND entity_id = pg_catalog.current_setting('test.customer_a1')::uuid
        AND action = 'updated') IS DISTINCT FROM
         'e8a514e9-5b10-4bf3-a1b0-a301e3000002'::uuid
     OR (SELECT actor_user_id
         FROM private.audit_logs
         WHERE entity_type = 'product'
           AND entity_id = pg_catalog.current_setting('test.product_a1')::uuid
           AND action = 'updated') IS DISTINCT FROM
         'e8a514e9-5b10-4bf3-a1b0-a301e3000002'::uuid THEN
    RAISE EXCEPTION 'audit actor did not come from authenticated context';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.audit_logs AS audit
    WHERE audit.workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
      AND audit.entity_type = 'customer'
      AND audit.entity_id IN (
        pg_catalog.current_setting('test.customer_a1')::uuid,
        pg_catalog.current_setting('test.customer_a2')::uuid
      )
      AND (
        audit.metadata::text ILIKE '%duplicate@example.invalid%'
          OR audit.metadata::text ILIKE '%555-01%'
      )
  ) THEN
    RAISE EXCEPTION 'customer PII was included in audit metadata';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_product(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      'Duplicate SKU',
      'SKU-100',
      1.0000::numeric
    );
  EXCEPTION WHEN unique_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'duplicate active product SKU was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_product(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      'Negative Price',
      'SKU-NEG',
      -1.0000::numeric
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'negative product price was accepted';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000001',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.update_customer(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000002',
      pg_catalog.current_setting('test.customer_b1')::uuid,
      'Unauthorized update'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'workspace owner modified another tenant customer';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_product(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000002',
      pg_catalog.current_setting('test.product_b1')::uuid,
      'Unauthorized update',
      'SKU-100',
      1.0000::numeric
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'workspace owner modified another tenant product';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000003',
    true
  );
  FOREACH v_customer_id IN ARRAY ARRAY[
    pg_catalog.current_setting('test.customer_a1')::uuid
  ] LOOP
    v_denied := false;
    BEGIN
      PERFORM private.update_customer(
        'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
        v_customer_id,
        'Analyst update'
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'analyst updated a customer';
    END IF;
  END LOOP;

  v_denied := false;
  BEGIN
    PERFORM private.create_customer(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      'Analyst customer'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'analyst created a customer';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.archive_product(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      pg_catalog.current_setting('test.product_a2')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'analyst archived a product';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000004',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.create_customer(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      'Viewer customer'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'viewer created a customer';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.update_product(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      pg_catalog.current_setting('test.product_a2')::uuid,
      'Viewer update',
      'SKU-100',
      2.0000::numeric
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'viewer updated a product';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.archive_customer(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      pg_catalog.current_setting('test.customer_a1')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'viewer archived a customer';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e3000001',
    true
  );
  v_denied := false;
  BEGIN
    INSERT INTO public.customers (id, workspace_id, name)
    VALUES (
      pg_catalog.gen_random_uuid(),
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      'Direct write'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated user directly inserted a customer';
  END IF;

  v_denied := false;
  BEGIN
    UPDATE public.products
    SET name = 'Direct write'
    WHERE id = pg_catalog.current_setting('test.product_a2')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'authenticated user directly updated a product';
  END IF;

  IF pg_catalog.has_table_privilege('service_role', 'public.customers', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.customers', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.customers', 'DELETE')
     OR pg_catalog.has_table_privilege('service_role', 'public.products', 'INSERT')
     OR pg_catalog.has_table_privilege('service_role', 'public.products', 'UPDATE')
     OR pg_catalog.has_table_privilege('service_role', 'public.products', 'DELETE') THEN
    RAISE EXCEPTION 'service_role has direct write privileges on customer/product tables';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'private.workspace_owner_admin_authorized(uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'private.append_audit_log(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'private.create_customer(uuid,text,text,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.create_product(uuid,text,text,numeric,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'an application role has access to an internal function';
  END IF;

  SELECT pg_catalog.count(*) INTO v_audit_count
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
    AND entity_type IN ('customer', 'product');
  PERFORM pg_catalog.set_config('test.audit_count_before_rollback', v_audit_count::text, true);

  BEGIN
    PERFORM private.create_customer(
      'e8a514e9-5b10-4bf3-a1b0-a301e4000001',
      'Rollback Customer',
      NULL,
      'rollback@example.invalid'
    );
    RAISE EXCEPTION 'customers/products rollback probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'customers/products rollback probe' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.customers
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
      AND name = 'Rollback Customer'
  ) OR (
    SELECT pg_catalog.count(*)::text
    FROM private.audit_logs
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e4000001'
      AND entity_type IN ('customer', 'product')
  ) IS DISTINCT FROM pg_catalog.current_setting('test.audit_count_before_rollback') THEN
    RAISE EXCEPTION 'customer create and audit event did not roll back together';
  END IF;
END;
$test$;
RESET ROLE;

SELECT pass('Customers and products backend security and behavior assertions passed');
SELECT * FROM finish();

ROLLBACK;
