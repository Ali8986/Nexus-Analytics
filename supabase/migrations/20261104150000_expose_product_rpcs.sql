CREATE FUNCTION public.create_product(
  p_workspace_id uuid,
  p_name text,
  p_sku text,
  p_unit_price numeric,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.create_product(
    p_workspace_id,
    p_name,
    p_sku,
    p_unit_price,
    p_description
  );
$function$;

CREATE FUNCTION public.update_product(
  p_workspace_id uuid,
  p_product_id uuid,
  p_name text,
  p_sku text,
  p_unit_price numeric,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.update_product(
    p_workspace_id,
    p_product_id,
    p_name,
    p_sku,
    p_unit_price,
    p_description
  );
$function$;

CREATE FUNCTION public.archive_product(
  p_workspace_id uuid,
  p_product_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.archive_product(p_workspace_id, p_product_id);
$function$;

REVOKE ALL ON FUNCTION public.create_product(uuid, text, text, numeric, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_product(uuid, uuid, text, text, numeric, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_product(uuid, uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_product(uuid, text, text, numeric, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, uuid, text, text, numeric, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_product(uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
