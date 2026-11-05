DO $migration_preflight$
DECLARE
  v_private_owner text;
BEGIN
  IF session_user::text IS DISTINCT FROM current_user::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'customers/products migration requires session_user and current_user to match; session role is %I and effective role is %I',
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

  IF pg_catalog.to_regrole('nexus_audit_table_owner') IS NULL
     OR pg_catalog.to_regrole('nexus_audit_writer') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = 'customers/products migration requires the audit foundation roles';
  END IF;

  IF NOT pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration identity requires CREATE on schema public to create customer and product tables';
  END IF;

  IF NOT pg_catalog.pg_has_role(
    current_user,
    'nexus_audit_table_owner',
    'SET'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration identity requires SET membership in nexus_audit_table_owner';
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
    'nexus_audit_writer',
    'private',
    'USAGE'
  ) OR NOT pg_catalog.has_schema_privilege(
    'authenticated',
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
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer',
    'public.workspace_members',
    'workspace_id',
    'SELECT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer',
    'public.workspace_members',
    'user_id',
    'SELECT'
  ) OR NOT pg_catalog.has_column_privilege(
    'nexus_audit_writer',
    'public.workspace_members',
    'role',
    'SELECT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'audit foundation schema, actor, append, or workspace authorization privileges are missing';
  END IF;
END;
$migration_preflight$;

GRANT CREATE ON SCHEMA private TO nexus_audit_writer;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL
    REFERENCES public.workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  name text NOT NULL,
  company_name text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country_code text,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  archived_at timestamp with time zone,
  CONSTRAINT customers_name_not_blank CHECK (
    pg_catalog.length(pg_catalog.btrim(name)) BETWEEN 1 AND 200
  )
);

CREATE INDEX customers_workspace_active_name_idx
  ON public.customers (workspace_id, name)
  WHERE archived_at IS NULL;
CREATE INDEX customers_workspace_archived_idx
  ON public.customers (workspace_id, archived_at);

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL
    REFERENCES public.workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  name text NOT NULL,
  sku text NOT NULL,
  description text,
  unit_price numeric(19, 4) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  archived_at timestamp with time zone,
  CONSTRAINT products_name_not_blank CHECK (
    pg_catalog.length(pg_catalog.btrim(name)) BETWEEN 1 AND 200
  ),
  CONSTRAINT products_sku_not_blank CHECK (
    pg_catalog.length(pg_catalog.btrim(sku)) BETWEEN 1 AND 100
  ),
  CONSTRAINT products_unit_price_nonnegative CHECK (unit_price >= 0)
);

CREATE UNIQUE INDEX products_workspace_active_sku_uidx
  ON public.products (workspace_id, sku)
  WHERE archived_at IS NULL;
CREATE INDEX products_workspace_active_name_idx
  ON public.products (workspace_id, name)
  WHERE archived_at IS NULL;
CREATE INDEX products_workspace_archived_idx
  ON public.products (workspace_id, archived_at);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

CREATE FUNCTION private.workspace_owner_admin_authorized(
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = (SELECT private.audit_current_actor())
      AND membership.role IN (
        'owner'::public.workspace_role,
        'admin'::public.workspace_role
      )
  );
$function$;
REVOKE ALL ON FUNCTION private.workspace_owner_admin_authorized(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.workspace_owner_admin_authorized(uuid)
  TO nexus_audit_writer;

CREATE POLICY customers_member_select
ON public.customers
FOR SELECT
TO authenticated
USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY customers_writer_select
ON public.customers
FOR SELECT
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY customers_writer_insert
ON public.customers
FOR INSERT
TO nexus_audit_writer
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY customers_writer_update
ON public.customers
FOR UPDATE
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)))
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY products_member_select
ON public.products
FOR SELECT
TO authenticated
USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY products_writer_select
ON public.products
FOR SELECT
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY products_writer_insert
ON public.products
FOR INSERT
TO nexus_audit_writer
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

CREATE POLICY products_writer_update
ON public.products
FOR UPDATE
TO nexus_audit_writer
USING ((SELECT private.workspace_owner_admin_authorized(workspace_id)))
WITH CHECK ((SELECT private.workspace_owner_admin_authorized(workspace_id)));

REVOKE ALL PRIVILEGES ON TABLE public.customers
  FROM PUBLIC, anon, authenticated, service_role, nexus_audit_writer;
REVOKE ALL PRIVILEGES ON TABLE public.products
  FROM PUBLIC, anon, authenticated, service_role, nexus_audit_writer;
GRANT SELECT ON TABLE public.customers, public.products TO authenticated;

GRANT SELECT (id, workspace_id, archived_at)
  ON TABLE public.customers TO nexus_audit_writer;
GRANT INSERT (
  id,
  workspace_id,
  name,
  company_name,
  email,
  phone,
  address_line_1,
  address_line_2,
  city,
  region,
  postal_code,
  country_code
) ON TABLE public.customers TO nexus_audit_writer;
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

GRANT SELECT (id, workspace_id, archived_at)
  ON TABLE public.products TO nexus_audit_writer;
GRANT INSERT (
  id,
  workspace_id,
  name,
  sku,
  description,
  unit_price
) ON TABLE public.products TO nexus_audit_writer;
GRANT UPDATE (
  name,
  sku,
  description,
  unit_price,
  updated_at,
  archived_at
) ON TABLE public.products TO nexus_audit_writer;

CREATE FUNCTION private.create_customer(
  p_workspace_id uuid,
  p_name text,
  p_company_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address_line_1 text DEFAULT NULL,
  p_address_line_2 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_country_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_customer_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may create customers';
  END IF;

  INSERT INTO public.customers (
    id,
    workspace_id,
    name,
    company_name,
    email,
    phone,
    address_line_1,
    address_line_2,
    city,
    region,
    postal_code,
    country_code
  )
  VALUES (
    v_customer_id,
    p_workspace_id,
    p_name,
    p_company_name,
    p_email,
    p_phone,
    p_address_line_1,
    p_address_line_2,
    p_city,
    p_region,
    p_postal_code,
    p_country_code
  );

  PERFORM private.append_audit_log(
    p_workspace_id,
    'created',
    'customer',
    v_customer_id,
    '{}'::jsonb
  );

  RETURN v_customer_id;
END;
$function$;

CREATE FUNCTION private.update_customer(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_name text,
  p_company_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address_line_1 text DEFAULT NULL,
  p_address_line_2 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_country_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows_updated bigint;
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may update customers';
  END IF;

  UPDATE public.customers
  SET name = p_name,
      company_name = p_company_name,
      email = p_email,
      phone = p_phone,
      address_line_1 = p_address_line_1,
      address_line_2 = p_address_line_2,
      city = p_city,
      region = p_region,
      postal_code = p_postal_code,
      country_code = p_country_code,
      updated_at = pg_catalog.now()
  WHERE id = p_customer_id
    AND workspace_id = p_workspace_id
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'active customer was not found in the authorized workspace';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'updated',
    'customer',
    p_customer_id,
    '{}'::jsonb
  );

  RETURN p_customer_id;
END;
$function$;

CREATE FUNCTION private.archive_customer(
  p_workspace_id uuid,
  p_customer_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows_updated bigint;
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may archive customers';
  END IF;

  UPDATE public.customers
  SET archived_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_customer_id
    AND workspace_id = p_workspace_id
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'active customer was not found in the authorized workspace';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'deleted',
    'customer',
    p_customer_id,
    '{}'::jsonb
  );

  RETURN p_customer_id;
END;
$function$;

CREATE FUNCTION private.create_product(
  p_workspace_id uuid,
  p_name text,
  p_sku text,
  p_unit_price numeric,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may create products';
  END IF;

  INSERT INTO public.products (
    id,
    workspace_id,
    name,
    sku,
    unit_price,
    description
  )
  VALUES (
    v_product_id,
    p_workspace_id,
    p_name,
    p_sku,
    p_unit_price,
    p_description
  );

  PERFORM private.append_audit_log(
    p_workspace_id,
    'created',
    'product',
    v_product_id,
    '{}'::jsonb
  );

  RETURN v_product_id;
END;
$function$;

CREATE FUNCTION private.update_product(
  p_workspace_id uuid,
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_unit_price numeric,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows_updated bigint;
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may update products';
  END IF;

  UPDATE public.products
  SET name = p_name,
      sku = p_sku,
      unit_price = p_unit_price,
      description = p_description,
      updated_at = pg_catalog.now()
  WHERE id = p_product_id
    AND workspace_id = p_workspace_id
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'active product was not found in the authorized workspace';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'updated',
    'product',
    p_product_id,
    '{}'::jsonb
  );

  RETURN p_product_id;
END;
$function$;

CREATE FUNCTION private.archive_product(
  p_workspace_id uuid,
  p_product_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_rows_updated bigint;
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may archive products';
  END IF;

  UPDATE public.products
  SET archived_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_product_id
    AND workspace_id = p_workspace_id
    AND archived_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'active product was not found in the authorized workspace';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'deleted',
    'product',
    p_product_id,
    '{}'::jsonb
  );

  RETURN p_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_customer(
  uuid, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_customer(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.archive_customer(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.create_product(
  uuid, text, text, numeric, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_product(
  uuid, uuid, text, text, numeric, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.archive_product(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.create_customer(
  uuid, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_customer(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.archive_customer(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_product(
  uuid, text, text, numeric, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_product(
  uuid, uuid, text, text, numeric, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.archive_product(uuid, uuid)
  TO authenticated;

ALTER FUNCTION private.workspace_owner_admin_authorized(uuid)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.create_customer(
  uuid, text, text, text, text, text, text, text, text, text, text
) OWNER TO nexus_audit_writer;
ALTER FUNCTION private.update_customer(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
) OWNER TO nexus_audit_writer;
ALTER FUNCTION private.archive_customer(uuid, uuid)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.create_product(uuid, text, text, numeric, text)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.update_product(uuid, uuid, text, text, numeric, text)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.archive_product(uuid, uuid)
  OWNER TO nexus_audit_writer;

REVOKE CREATE ON SCHEMA private FROM nexus_audit_writer;
