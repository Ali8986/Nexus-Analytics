DO $migration_preflight$
DECLARE
  v_private_owner text;
BEGIN
  IF session_user::text IS DISTINCT FROM current_user::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'orders migration requires session_user and current_user to match; session role is %I and effective role is %I',
        session_user,
        current_user
      );
  END IF;

  SELECT pg_catalog.pg_get_userbyid(namespace.nspowner)::text
  INTO v_private_owner
  FROM pg_catalog.pg_namespace AS namespace
  WHERE namespace.nspname = 'private';

  IF current_user::text IS DISTINCT FROM v_private_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'effective migration role %I must own schema private to grant temporary CREATE privileges',
        current_user
      );
  END IF;

  IF NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration identity requires CREATE on schema public';
  END IF;

  IF NOT pg_catalog.pg_has_role(
    current_user,
    'nexus_audit_writer',
    'SET'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration identity requires SET membership in nexus_audit_writer';
  END IF;

  IF NOT pg_catalog.has_schema_privilege(
    'authenticated',
    'private',
    'USAGE'
  ) OR NOT pg_catalog.has_schema_privilege(
    'nexus_audit_writer',
    'private',
    'USAGE'
  ) OR NOT pg_catalog.has_function_privilege(
    'nexus_audit_writer',
    'private.audit_current_actor()',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'nexus_audit_writer',
    'private.append_audit_log(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'nexus_audit_writer',
    'private.workspace_owner_admin_authorized(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'orders migration requires the authenticated schema and audit writer privileges from prior migrations';
  END IF;

  IF pg_catalog.to_regclass('public.customers') IS NULL
     OR pg_catalog.to_regclass('public.products') IS NULL
     OR pg_catalog.to_regclass('private.audit_logs') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'orders migration requires the customers, products, and audit foundation migrations';
  END IF;
END;
$migration_preflight$;

GRANT CREATE ON SCHEMA private TO nexus_audit_writer;

CREATE UNIQUE INDEX customers_workspace_id_uidx
  ON public.customers (workspace_id, id);
CREATE UNIQUE INDEX products_workspace_id_uidx
  ON public.products (workspace_id, id);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL
    REFERENCES public.workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  customer_id uuid,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  idempotency_payload jsonb NOT NULL,
  currency_code text NOT NULL,
  subtotal numeric(19, 4) NOT NULL,
  total numeric(19, 4) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT orders_customer_workspace_fkey
    FOREIGN KEY (workspace_id, customer_id)
    REFERENCES public.customers (workspace_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT orders_status_allowed CHECK (
    status IN ('pending', 'processing', 'completed', 'cancelled')
  ),
  CONSTRAINT orders_idempotency_key_not_blank CHECK (
    pg_catalog.length(pg_catalog.btrim(idempotency_key)) BETWEEN 1 AND 200
  ),
  CONSTRAINT orders_currency_code_format CHECK (
    currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT orders_subtotal_nonnegative CHECK (subtotal >= 0),
  CONSTRAINT orders_total_nonnegative CHECK (total >= 0),
  CONSTRAINT orders_total_matches_subtotal CHECK (total = subtotal),
  CONSTRAINT orders_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT orders_workspace_idempotency_key_key
    UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX orders_workspace_created_idx
  ON public.orders (workspace_id, created_at DESC);
CREATE INDEX orders_workspace_status_created_idx
  ON public.orders (workspace_id, status, created_at DESC);
CREATE INDEX orders_workspace_customer_created_idx
  ON public.orders (workspace_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  product_sku text NOT NULL,
  unit_price numeric(19, 4) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(19, 4) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT order_items_order_workspace_fkey
    FOREIGN KEY (workspace_id, order_id)
    REFERENCES public.orders (workspace_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT order_items_product_workspace_fkey
    FOREIGN KEY (workspace_id, product_id)
    REFERENCES public.products (workspace_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_nonnegative CHECK (unit_price >= 0),
  CONSTRAINT order_items_line_total_nonnegative CHECK (line_total >= 0),
  CONSTRAINT order_items_line_total_matches CHECK (
    line_total = unit_price * quantity
  )
);

CREATE INDEX order_items_workspace_order_idx
  ON public.order_items (workspace_id, order_id, created_at, id);
CREATE INDEX order_items_workspace_product_idx
  ON public.order_items (workspace_id, product_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

CREATE POLICY orders_member_select
ON public.orders
FOR SELECT
TO authenticated
USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY orders_writer_select
ON public.orders
FOR SELECT
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY orders_writer_insert
ON public.orders
FOR INSERT
TO nexus_audit_writer
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY orders_writer_update
ON public.orders
FOR UPDATE
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)))
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY order_items_member_select
ON public.order_items
FOR SELECT
TO authenticated
USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY order_items_writer_select
ON public.order_items
FOR SELECT
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY order_items_writer_insert
ON public.order_items
FOR INSERT
TO nexus_audit_writer
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

REVOKE ALL PRIVILEGES ON TABLE public.orders
  FROM PUBLIC, anon, authenticated, service_role, nexus_audit_writer;
REVOKE ALL PRIVILEGES ON TABLE public.order_items
  FROM PUBLIC, anon, authenticated, service_role, nexus_audit_writer;

GRANT SELECT (
  id,
  workspace_id,
  customer_id,
  status,
  currency_code,
  subtotal,
  total,
  created_at,
  updated_at
) ON TABLE public.orders TO authenticated;
GRANT SELECT (
  id,
  workspace_id,
  order_id,
  product_id,
  product_name,
  product_sku,
  unit_price,
  quantity,
  line_total,
  created_at
) ON TABLE public.order_items TO authenticated;

GRANT SELECT (
  id,
  workspace_id,
  customer_id,
  status,
  idempotency_key,
  idempotency_payload,
  currency_code,
  subtotal,
  total,
  created_at,
  updated_at
) ON TABLE public.orders TO nexus_audit_writer;
GRANT INSERT (
  id,
  workspace_id,
  customer_id,
  status,
  idempotency_key,
  idempotency_payload,
  currency_code,
  subtotal,
  total
) ON TABLE public.orders TO nexus_audit_writer;
GRANT UPDATE (status, subtotal, total, updated_at)
  ON TABLE public.orders TO nexus_audit_writer;
GRANT INSERT (
  id,
  workspace_id,
  order_id,
  product_id,
  product_name,
  product_sku,
  unit_price,
  quantity,
  line_total
) ON TABLE public.order_items TO nexus_audit_writer;

GRANT SELECT (id, reporting_currency)
  ON TABLE public.workspaces TO nexus_audit_writer;
GRANT SELECT (id, workspace_id, archived_at)
  ON TABLE public.customers TO nexus_audit_writer;
GRANT SELECT (id, workspace_id, name, sku, unit_price, archived_at)
  ON TABLE public.products TO nexus_audit_writer;
GRANT UPDATE (name, sku, description, unit_price, updated_at, archived_at)
  ON TABLE public.products TO nexus_audit_writer;
GRANT UPDATE (
  name,
  company_name,
  email,
  phone,
  address_line_1,
  address_line_2,
  city,
  region,
  postal_code,
  country_code,
  updated_at,
  archived_at
) ON TABLE public.customers TO nexus_audit_writer;

CREATE FUNCTION private.create_order(
  p_workspace_id uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_customer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_order_id uuid;
  v_existing_payload jsonb;
  v_idempotency_payload jsonb;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_quantities integer[] := ARRAY[]::integer[];
  v_product_id uuid;
  v_quantity integer;
  v_product_name text;
  v_product_sku text;
  v_unit_price numeric(19, 4);
  v_line_total numeric(19, 4);
  v_subtotal numeric(19, 4) := 0;
  v_currency_code text;
  v_ordinality bigint;
  v_item_count integer := 0;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated actor is required to create an order';
  END IF;

  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may create orders';
  END IF;

  IF p_idempotency_key IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'idempotency key must contain between 1 and 200 characters';
  END IF;

  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'orders require a non-empty array of product items';
  END IF;

  FOR v_item, v_ordinality IN
    SELECT item.value, item.ordinality
    FROM pg_catalog.jsonb_array_elements(p_items)
      WITH ORDINALITY AS item(value, ordinality)
    ORDER BY item.ordinality
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_item -> 'product_id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_item -> 'quantity') IS DISTINCT FROM 'number'
       OR (v_item ->> 'quantity') !~ '^[1-9][0-9]*$'
       OR (v_item ->> 'quantity')::numeric > 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = pg_catalog.format(
          'order item at position %s must have a product UUID and positive integer quantity',
          v_ordinality
        );
    END IF;

    BEGIN
      v_product_id := (v_item ->> 'product_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = pg_catalog.format(
            'order item at position %s has an invalid product UUID',
            v_ordinality
          );
    END;

    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_product_id = ANY (v_product_ids) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'an order may contain each product only once';
    END IF;

    v_product_ids := pg_catalog.array_append(v_product_ids, v_product_id);
    v_quantities := pg_catalog.array_append(v_quantities, v_quantity);
    v_items := v_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id',
        v_product_id,
        'quantity',
        v_quantity
      )
    );
    v_item_count := v_item_count + 1;
  END LOOP;

  v_idempotency_payload := pg_catalog.jsonb_build_object(
    'customer_id',
    p_customer_id,
    'items',
    v_items
  );

  SELECT orders.id, orders.idempotency_payload
  INTO v_order_id, v_existing_payload
  FROM public.orders AS orders
  WHERE orders.workspace_id = p_workspace_id
    AND orders.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM v_idempotency_payload THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'idempotency key was already used for a different order request';
    END IF;
    RETURN v_order_id;
  END IF;

  SELECT workspace.reporting_currency
  INTO v_currency_code
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'workspace was not found or is not accessible';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    PERFORM 1
    FROM public.customers AS customer
    WHERE customer.id = p_customer_id
      AND customer.workspace_id = p_workspace_id
      AND customer.archived_at IS NULL
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'customer must be active and belong to the order workspace';
    END IF;
  END IF;

  FOR v_product_id IN
    SELECT product_id
    FROM pg_catalog.unnest(v_product_ids) AS product_id
    ORDER BY product_id
  LOOP
    PERFORM 1
    FROM public.products AS product
    WHERE product.id = v_product_id
      AND product.workspace_id = p_workspace_id
      AND product.archived_at IS NULL
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'every product must be active and belong to the order workspace';
    END IF;
  END LOOP;

  v_order_id := pg_catalog.gen_random_uuid();
  INSERT INTO public.orders (
    id,
    workspace_id,
    customer_id,
    status,
    idempotency_key,
    idempotency_payload,
    currency_code,
    subtotal,
    total
  )
  VALUES (
    v_order_id,
    p_workspace_id,
    p_customer_id,
    'pending',
    p_idempotency_key,
    v_idempotency_payload,
    v_currency_code,
    0,
    0
  )
  ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_order_id;

  IF v_order_id IS NULL THEN
    SELECT orders.id, orders.idempotency_payload
    INTO v_order_id, v_existing_payload
    FROM public.orders AS orders
    WHERE orders.workspace_id = p_workspace_id
      AND orders.idempotency_key = p_idempotency_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'order idempotency conflict could not be resolved; retry the request';
    END IF;

    IF v_existing_payload IS DISTINCT FROM v_idempotency_payload THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'idempotency key was already used for a different order request';
    END IF;
    RETURN v_order_id;
  END IF;

  FOR v_ordinality IN 1..v_item_count LOOP
    v_product_id := v_product_ids[v_ordinality];
    v_quantity := v_quantities[v_ordinality];

    SELECT product.name, product.sku, product.unit_price
    INTO v_product_name, v_product_sku, v_unit_price
    FROM public.products AS product
    WHERE product.id = v_product_id
      AND product.workspace_id = p_workspace_id
      AND product.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'a product became unavailable while the order was being created';
    END IF;

    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (
      id,
      workspace_id,
      order_id,
      product_id,
      product_name,
      product_sku,
      unit_price,
      quantity,
      line_total
    )
    VALUES (
      pg_catalog.gen_random_uuid(),
      p_workspace_id,
      v_order_id,
      v_product_id,
      v_product_name,
      v_product_sku,
      v_unit_price,
      v_quantity,
      v_line_total
    );
  END LOOP;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      total = v_subtotal,
      updated_at = pg_catalog.now()
  WHERE id = v_order_id
    AND workspace_id = p_workspace_id;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'created',
    'order',
    v_order_id,
    '{}'::jsonb
  );

  RETURN v_order_id;
END;
$function$;

CREATE FUNCTION private.update_order_status(
  p_workspace_id uuid,
  p_order_id uuid,
  p_new_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_previous_status text;
  v_rows_updated bigint;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated actor is required to update an order';
  END IF;

  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may update orders';
  END IF;

  IF p_new_status NOT IN ('processing', 'completed', 'cancelled') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'requested order status is invalid';
  END IF;

  SELECT orders.status
  INTO v_previous_status
  FROM public.orders AS orders
  WHERE orders.id = p_order_id
    AND orders.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'order was not found in the authorized workspace';
  END IF;

  IF NOT (
    (v_previous_status = 'pending'
      AND p_new_status IN ('processing', 'cancelled'))
    OR (v_previous_status = 'processing'
      AND p_new_status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = pg_catalog.format(
        'order status transition from %s to %s is not allowed',
        v_previous_status,
        p_new_status
      );
  END IF;

  UPDATE public.orders
  SET status = p_new_status,
      updated_at = pg_catalog.now()
  WHERE id = p_order_id
    AND workspace_id = p_workspace_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'order status update lost a concurrent modification; retry the request';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'status_changed',
    'order',
    p_order_id,
    pg_catalog.jsonb_build_object(
      'from_status',
      v_previous_status,
      'to_status',
      p_new_status
    )
  );

  RETURN p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_order(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_order_status(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.create_order(uuid, text, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_order_status(uuid, uuid, text)
  TO authenticated;

ALTER FUNCTION private.create_order(uuid, text, jsonb, uuid)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.update_order_status(uuid, uuid, text)
  OWNER TO nexus_audit_writer;

REVOKE CREATE ON SCHEMA private FROM nexus_audit_writer;
