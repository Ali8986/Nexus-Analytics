CREATE FUNCTION public.list_workspace_audit_logs(
  p_workspace_id uuid,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  actor_user_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    audit_log.id,
    audit_log.actor_user_id,
    audit_log.action,
    audit_log.entity_type,
    audit_log.entity_id,
    audit_log.metadata,
    audit_log.created_at
  FROM private.audit_logs AS audit_log
  WHERE audit_log.workspace_id = p_workspace_id
  ORDER BY audit_log.created_at DESC, audit_log.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

REVOKE ALL ON FUNCTION public.list_workspace_audit_logs(uuid, integer, integer)
  FROM PUBLIC, anon, service_role;
REVOKE USAGE ON SCHEMA private FROM PUBLIC, anon, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workspace_audit_logs(uuid, integer, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
