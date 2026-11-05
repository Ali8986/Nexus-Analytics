CREATE FUNCTION public.create_order(
  p_workspace_id uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_customer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.create_order(
    p_workspace_id,
    p_idempotency_key,
    p_items,
    p_customer_id
  );
$function$;

CREATE FUNCTION public.update_order_status(
  p_workspace_id uuid,
  p_order_id uuid,
  p_new_status text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.update_order_status(
    p_workspace_id,
    p_order_id,
    p_new_status
  );
$function$;

REVOKE ALL ON FUNCTION public.create_order(uuid, text, jsonb, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_order_status(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
