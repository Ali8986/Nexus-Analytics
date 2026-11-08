CREATE FUNCTION private.unarchive_customer(
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
      MESSAGE = 'only workspace owners and admins may restore customers';
  END IF;

  UPDATE public.customers
  SET archived_at = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_customer_id
    AND workspace_id = p_workspace_id
    AND archived_at IS NOT NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'archived customer was not found in the authorized workspace';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'updated',
    'customer',
    p_customer_id,
    pg_catalog.jsonb_build_object('changed_fields', ARRAY['archived_at'])
  );

  RETURN p_customer_id;
END;
$function$;

CREATE FUNCTION private.unarchive_product(
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
      MESSAGE = 'only workspace owners and admins may restore products';
  END IF;

  UPDATE public.products
  SET archived_at = NULL,
      updated_at = pg_catalog.now()
  WHERE id = p_product_id
    AND workspace_id = p_workspace_id
    AND archived_at IS NOT NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'archived product was not found in the authorized workspace';
  END IF;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'updated',
    'product',
    p_product_id,
    pg_catalog.jsonb_build_object('changed_fields', ARRAY['archived_at'])
  );

  RETURN p_product_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.unarchive_customer(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.unarchive_product(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.unarchive_customer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.unarchive_product(uuid, uuid) TO authenticated;

CREATE FUNCTION public.unarchive_customer(
  p_workspace_id uuid,
  p_customer_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.unarchive_customer(p_workspace_id, p_customer_id);
$function$;

CREATE FUNCTION public.unarchive_product(
  p_workspace_id uuid,
  p_product_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.unarchive_product(p_workspace_id, p_product_id);
$function$;

REVOKE ALL ON FUNCTION public.unarchive_customer(uuid, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.unarchive_product(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.unarchive_customer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_product(uuid, uuid) TO authenticated;

DO $migration$
DECLARE
  v_had_create boolean := pg_catalog.has_schema_privilege(
    'nexus_audit_writer',
    'private',
    'CREATE'
  );
BEGIN
  IF NOT pg_catalog.pg_has_role(
    current_user,
    'nexus_audit_writer',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration role cannot transfer functions to nexus_audit_writer';
  END IF;

  IF NOT v_had_create THEN
    EXECUTE 'GRANT CREATE ON SCHEMA private TO nexus_audit_writer';
  END IF;

  EXECUTE 'ALTER FUNCTION private.unarchive_customer(uuid, uuid) OWNER TO nexus_audit_writer';
  EXECUTE 'ALTER FUNCTION private.unarchive_product(uuid, uuid) OWNER TO nexus_audit_writer';

  IF NOT v_had_create THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA private FROM nexus_audit_writer';
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
