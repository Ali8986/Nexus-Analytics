CREATE ROLE nexus_audit_table_owner NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_audit_writer NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_invitation_manager NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_invitation_acceptor NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_assertion_verifier NOLOGIN NOINHERIT NOBYPASSRLS;

CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT USAGE ON SCHEMA auth TO nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
GRANT EXECUTE ON FUNCTION auth.uid() TO nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
GRANT USAGE ON SCHEMA private TO nexus_audit_table_owner,
  nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
GRANT CREATE ON SCHEMA private TO nexus_audit_table_owner,
  nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
GRANT CREATE ON SCHEMA public TO nexus_invitation_manager,
  nexus_invitation_acceptor;

CREATE TABLE public.feas_workspaces (
  id uuid PRIMARY KEY,
  workspace_name text NOT NULL
);

CREATE TABLE public.feas_memberships (
  workspace_id uuid NOT NULL REFERENCES public.feas_workspaces(id),
  user_id uuid NOT NULL,
  member_role text NOT NULL CHECK (member_role IN ('admin', 'viewer')),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE public.feas_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feas_workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE public.feas_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feas_memberships FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.feas_workspaces, public.feas_memberships TO authenticated;
GRANT SELECT ON public.feas_workspaces, public.feas_memberships
  TO nexus_invitation_manager,
     nexus_invitation_acceptor,
     nexus_assertion_verifier;

CREATE POLICY feas_workspace_member_select
ON public.feas_workspaces
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.feas_memberships AS membership
    WHERE membership.workspace_id = feas_workspaces.id
      AND membership.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY feas_membership_member_select
ON public.feas_memberships
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY feas_membership_manager_select
ON public.feas_memberships
FOR SELECT TO nexus_invitation_manager,
  nexus_assertion_verifier,
  nexus_invitation_acceptor
USING (user_id = (SELECT auth.uid()));

CREATE POLICY feas_workspace_manager_select
ON public.feas_workspaces
FOR SELECT TO nexus_invitation_manager,
  nexus_assertion_verifier,
  nexus_invitation_acceptor
USING (
  EXISTS (
    SELECT 1
    FROM public.feas_memberships AS membership
    WHERE membership.workspace_id = feas_workspaces.id
      AND membership.user_id = (SELECT auth.uid())
  )
);

CREATE TABLE private.audit_probe (
  event_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  event_type text NOT NULL CHECK (
    event_type IN ('probe.entry', 'probe.verify')
  ),
  workspace_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  occurred_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

ALTER TABLE private.audit_probe OWNER TO nexus_audit_table_owner;
ALTER TABLE private.audit_probe ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.audit_probe FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_probe_writer_insert
ON private.audit_probe
FOR INSERT TO nexus_audit_writer
WITH CHECK (
  event_type IN ('probe.entry', 'probe.verify')
  AND actor_id = (SELECT auth.uid())
);

CREATE POLICY audit_probe_owner_all
ON private.audit_probe
FOR ALL TO nexus_audit_table_owner
USING (true)
WITH CHECK (true);

GRANT INSERT (event_id, event_type, workspace_id, actor_id, occurred_at)
ON private.audit_probe TO nexus_audit_writer;

CREATE FUNCTION private.audit_probe_write(
  p_event_type text,
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN ('probe.entry', 'probe.verify') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'unsupported probe event';
  END IF;

  INSERT INTO private.audit_probe(event_type, workspace_id, actor_id)
  VALUES (p_event_type, p_workspace_id, (SELECT auth.uid()));

  RETURN pg_catalog.jsonb_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'auth_uid', (SELECT auth.uid()),
    'level', 'audit-writer'
  );
END;
$function$;
ALTER FUNCTION private.audit_probe_write(text, uuid)
  OWNER TO nexus_audit_writer;

CREATE FUNCTION private.assertion_probe(
  p_workspace_id uuid,
  p_subject uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member boolean;
  v_audit jsonb;
BEGIN
  IF p_subject IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'subject mismatch';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.feas_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = (SELECT auth.uid())
  )
  INTO v_member;

  IF NOT v_member THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace access denied';
  END IF;

  v_audit := private.audit_probe_write('probe.verify', p_workspace_id);

  RETURN pg_catalog.jsonb_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'auth_uid', (SELECT auth.uid()),
    'level', 'assertion-verifier',
    'audit', v_audit
  );
END;
$function$;
ALTER FUNCTION private.assertion_probe(uuid, uuid)
  OWNER TO nexus_assertion_verifier;

CREATE FUNCTION public.feasibility_entry(
  p_workspace_id uuid,
  p_subject uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_authorized boolean;
  v_nested jsonb;
BEGIN
  IF p_subject IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'subject mismatch';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.feas_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.member_role = 'admin'
  )
  INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace access denied';
  END IF;

  v_nested := private.assertion_probe(p_workspace_id, p_subject);

  RETURN pg_catalog.jsonb_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'auth_uid', (SELECT auth.uid()),
    'level', 'invitation-manager',
    'nested', v_nested
  );
END;
$function$;
ALTER FUNCTION public.feasibility_entry(uuid, uuid)
  OWNER TO nexus_invitation_manager;

CREATE FUNCTION public.feasibility_acceptor_probe(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.feas_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace access denied';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'auth_uid', (SELECT auth.uid()),
    'level', 'invitation-acceptor'
  );
END;
$function$;
ALTER FUNCTION public.feasibility_acceptor_probe(uuid)
  OWNER TO nexus_invitation_acceptor;

GRANT EXECUTE ON FUNCTION private.audit_probe_write(text, uuid)
  TO nexus_assertion_verifier;
GRANT EXECUTE ON FUNCTION private.assertion_probe(uuid, uuid)
  TO nexus_invitation_manager;
REVOKE ALL ON FUNCTION private.audit_probe_write(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.assertion_probe(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.feasibility_entry(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.feasibility_acceptor_probe(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.audit_probe
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA private FROM nexus_audit_table_owner,
  nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
REVOKE CREATE ON SCHEMA public FROM nexus_invitation_manager,
  nexus_invitation_acceptor;

GRANT EXECUTE ON FUNCTION public.feasibility_entry(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.feasibility_acceptor_probe(uuid)
  TO authenticated;

CREATE TABLE public.feas_migration_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  executed_current_user name NOT NULL,
  executed_session_user name NOT NULL,
  can_create_role boolean NOT NULL,
  is_superuser boolean NOT NULL,
  has_createrole boolean NOT NULL,
  has_bypassrls boolean NOT NULL,
  can_create_schema boolean NOT NULL,
  can_create_function boolean NOT NULL,
  can_assign_owner boolean,
  can_create_policy boolean,
  can_grant_privileges boolean
);

INSERT INTO public.feas_migration_identity (
  executed_current_user,
  executed_session_user,
  can_create_role,
  is_superuser,
  has_createrole,
  has_bypassrls,
  can_create_schema,
  can_create_function,
  can_assign_owner,
  can_create_policy,
  can_grant_privileges
)
SELECT
  current_user,
  session_user,
  role.rolsuper OR role.rolcreaterole,
  role.rolsuper,
  role.rolcreaterole,
  role.rolbypassrls,
  pg_catalog.has_database_privilege(
    current_user,
    current_database(),
    'CREATE'
  ),
  pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
    AND pg_catalog.has_schema_privilege(current_user, 'private', 'CREATE'),
  NULL,
  NULL,
  NULL
FROM pg_catalog.pg_roles AS role
WHERE role.rolname = current_user;
