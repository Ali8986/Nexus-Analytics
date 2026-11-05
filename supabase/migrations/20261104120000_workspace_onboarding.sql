CREATE POLICY workspaces_onboarding_writer_select
ON public.workspaces
FOR SELECT
TO nexus_audit_writer
USING (created_by = (SELECT private.audit_current_actor()));

CREATE POLICY workspaces_onboarding_writer_insert
ON public.workspaces
FOR INSERT
TO nexus_audit_writer
WITH CHECK (created_by = (SELECT private.audit_current_actor()));

CREATE POLICY workspace_members_onboarding_writer_select
ON public.workspace_members
FOR SELECT
TO nexus_audit_writer
USING (created_by = (SELECT private.audit_current_actor()));

CREATE POLICY workspace_members_onboarding_writer_insert
ON public.workspace_members
FOR INSERT
TO nexus_audit_writer
WITH CHECK (
  role = 'owner'::public.workspace_role
  AND user_id = (SELECT private.audit_current_actor())
  AND created_by = (SELECT private.audit_current_actor())
  AND EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = workspace_id
      AND workspace.created_by = (SELECT private.audit_current_actor())
  )
);

GRANT SELECT (id, created_by)
  ON TABLE public.workspaces TO nexus_audit_writer;
GRANT INSERT (id, name, reporting_currency, reporting_timezone, created_by)
  ON TABLE public.workspaces TO nexus_audit_writer;
GRANT SELECT (workspace_id, user_id, role, created_by)
  ON TABLE public.workspace_members TO nexus_audit_writer;
GRANT INSERT (workspace_id, user_id, role, created_by)
  ON TABLE public.workspace_members TO nexus_audit_writer;

GRANT CREATE ON SCHEMA private TO nexus_audit_writer;

CREATE FUNCTION private.create_workspace(
  p_name text,
  p_reporting_currency text DEFAULT 'USD',
  p_reporting_timezone text DEFAULT 'UTC'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_workspace_id uuid := pg_catalog.gen_random_uuid();
  v_name text := pg_catalog.btrim(p_name);
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated actor is required to create a workspace';
  END IF;

  IF v_name IS NULL OR pg_catalog.length(v_name) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'workspace name must contain between 1 and 120 characters';
  END IF;

  INSERT INTO public.workspaces (
    id,
    name,
    reporting_currency,
    reporting_timezone,
    created_by
  )
  VALUES (
    v_workspace_id,
    v_name,
    p_reporting_currency,
    p_reporting_timezone,
    v_actor_user_id
  );

  INSERT INTO public.workspace_members (
    workspace_id,
    user_id,
    role,
    created_by
  )
  VALUES (
    v_workspace_id,
    v_actor_user_id,
    'owner'::public.workspace_role,
    v_actor_user_id
  );

  RETURN v_workspace_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_workspace(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.create_workspace(text, text, text)
  TO authenticated;
ALTER FUNCTION private.create_workspace(text, text, text)
  OWNER TO nexus_audit_writer;

CREATE FUNCTION public.create_workspace(
  p_name text,
  p_reporting_currency text DEFAULT 'USD',
  p_reporting_timezone text DEFAULT 'UTC'
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.create_workspace(
    p_name,
    p_reporting_currency,
    p_reporting_timezone
  );
$function$;

REVOKE ALL ON FUNCTION public.create_workspace(text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_workspace(text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_workspace(text, text, text) IS
  'Creates a workspace for the authenticated actor and assigns that actor the Owner role atomically.';

REVOKE CREATE ON SCHEMA private FROM nexus_audit_writer;
