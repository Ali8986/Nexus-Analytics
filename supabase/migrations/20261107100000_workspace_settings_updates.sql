CREATE FUNCTION private.update_workspace_settings(
  p_workspace_id uuid,
  p_name text,
  p_reporting_currency text,
  p_reporting_timezone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT private.workspace_owner_admin_authorized(p_workspace_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may update workspace settings';
  END IF;

  IF p_name IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'workspace name must contain between 1 and 120 characters';
  END IF;

  UPDATE public.workspaces
  SET name = pg_catalog.btrim(p_name),
      reporting_currency = p_reporting_currency,
      reporting_timezone = pg_catalog.btrim(p_reporting_timezone)
  WHERE id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'workspace was not found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.update_workspace_settings(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.update_workspace_settings(uuid, text, text, text)
  TO authenticated;
GRANT UPDATE (name, reporting_currency, reporting_timezone, updated_at)
  ON TABLE public.workspaces TO nexus_audit_writer;

GRANT CREATE ON SCHEMA private TO nexus_audit_writer;

ALTER FUNCTION private.update_workspace_settings(uuid, text, text, text)
  OWNER TO nexus_audit_writer;

REVOKE CREATE ON SCHEMA private FROM nexus_audit_writer;

CREATE FUNCTION public.update_workspace_settings(
  p_workspace_id uuid,
  p_name text,
  p_reporting_currency text,
  p_reporting_timezone text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.update_workspace_settings(
    p_workspace_id,
    p_name,
    p_reporting_currency,
    p_reporting_timezone
  );
$function$;

REVOKE ALL ON FUNCTION public.update_workspace_settings(uuid, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_settings(uuid, text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.update_workspace_settings(uuid, text, text, text) IS
  'Updates workspace identity and reporting preferences for an authenticated owner or admin. Existing constraints and audit triggers remain authoritative.';

NOTIFY pgrst, 'reload schema';
