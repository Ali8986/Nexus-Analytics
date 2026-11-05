CREATE FUNCTION public.create_customer(
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.create_customer(
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
$function$;

CREATE FUNCTION public.update_customer(
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.update_customer(
    p_workspace_id,
    p_customer_id,
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
$function$;

CREATE FUNCTION public.archive_customer(
  p_workspace_id uuid,
  p_customer_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.archive_customer(p_workspace_id, p_customer_id);
$function$;

REVOKE ALL ON FUNCTION public.create_customer(
  uuid, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_customer(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_customer(uuid, uuid)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_customer(
  uuid, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_customer(uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
