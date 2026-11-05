\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE nexus_test_login LOGIN NOINHERIT;
GRANT authenticated TO nexus_test_login;

CREATE ROLE nexus_audit_table_owner NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_audit_writer NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_invitation_manager NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_invitation_acceptor NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE nexus_assertion_verifier NOLOGIN NOINHERIT NOBYPASSRLS;

CREATE SCHEMA private;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA private TO nexus_audit_table_owner,
  nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
GRANT USAGE ON SCHEMA auth TO authenticated,
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

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT NULLIF(
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$function$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,
  nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;

CREATE TABLE private.test_workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE private.test_memberships (
  workspace_id uuid NOT NULL REFERENCES private.test_workspaces (id),
  user_id uuid NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE private.test_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.test_workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE private.test_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.test_memberships FORCE ROW LEVEL SECURITY;

GRANT SELECT ON private.test_workspaces TO nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
GRANT SELECT ON private.test_memberships TO nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;

CREATE POLICY memberships_read_own
ON private.test_memberships
FOR SELECT
TO nexus_invitation_manager,
   nexus_invitation_acceptor,
   nexus_assertion_verifier
USING (user_id = (SELECT auth.uid()));

CREATE POLICY workspaces_read_member
ON private.test_workspaces
FOR SELECT
TO nexus_invitation_manager,
   nexus_invitation_acceptor,
   nexus_assertion_verifier
USING (
  EXISTS (
    SELECT 1
    FROM private.test_memberships AS membership
    WHERE membership.workspace_id = test_workspaces.id
      AND membership.user_id = (SELECT auth.uid())
  )
);

INSERT INTO private.test_workspaces (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'Workspace A'),
  ('00000000-0000-0000-0000-000000000102', 'Workspace B');

INSERT INTO private.test_memberships (workspace_id, user_id)
VALUES
  ('00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000102',
   '00000000-0000-0000-0000-000000000202');

CREATE TABLE private.audit_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (
    event_type IN (
      'workspace.invitation.created',
      'workspace.invitation.accepted'
    )
  ),
  workspace_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

GRANT CREATE ON SCHEMA private TO nexus_audit_table_owner;
ALTER TABLE private.audit_events OWNER TO nexus_audit_table_owner;
GRANT USAGE ON SCHEMA private TO nexus_audit_table_owner;

ALTER TABLE private.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_writer_insert
ON private.audit_events
FOR INSERT
TO nexus_audit_writer
WITH CHECK (
  event_type IN (
    'workspace.invitation.created',
    'workspace.invitation.accepted'
  )
  AND actor_id = (SELECT auth.uid())
);

CREATE POLICY audit_owner_test_access
ON private.audit_events
FOR ALL
TO nexus_audit_table_owner
USING (true)
WITH CHECK (true);

GRANT INSERT (event_id, event_type, workspace_id, actor_id)
ON private.audit_events TO nexus_audit_writer;

CREATE FUNCTION private.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'audit rows are append-only';
END;
$function$;
ALTER FUNCTION private.reject_audit_mutation()
  OWNER TO nexus_audit_table_owner;

CREATE TRIGGER audit_events_no_update_delete
BEFORE UPDATE OR DELETE ON private.audit_events
FOR EACH ROW
EXECUTE FUNCTION private.reject_audit_mutation();

CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON private.audit_events
FOR EACH STATEMENT
EXECUTE FUNCTION private.reject_audit_mutation();

CREATE FUNCTION private.audit_append(
  p_event_type text,
  p_workspace_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_event_type NOT IN (
    'workspace.invitation.created',
    'workspace.invitation.accepted'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'unsupported audit event';
  END IF;

  INSERT INTO private.audit_events (
    event_id,
    event_type,
    workspace_id,
    actor_id
  )
  VALUES (
    pg_catalog.gen_random_uuid(),
    p_event_type,
    p_workspace_id,
    (SELECT auth.uid())
  );

  RETURN pg_catalog.format(
    'current_user=%s;session_user=%s;subject=%s',
    current_user,
    session_user,
    (SELECT auth.uid())
  );
END;
$function$;
ALTER FUNCTION private.audit_append(text, uuid)
  OWNER TO nexus_audit_writer;

CREATE FUNCTION private.verify_probe(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count bigint;
  v_audit_identity text;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_count
  FROM private.test_workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace is not authorized';
  END IF;

  v_audit_identity := private.audit_append(
    'workspace.invitation.created',
    p_workspace_id
  );

  RETURN pg_catalog.format(
    'current_user=%s;session_user=%s;subject=%s;audit={%s}',
    current_user,
    session_user,
    (SELECT auth.uid()),
    v_audit_identity
  );
END;
$function$;
ALTER FUNCTION private.verify_probe(uuid)
  OWNER TO nexus_assertion_verifier;

CREATE FUNCTION public.manager_entry(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count bigint;
  v_nested text;
BEGIN
  SELECT pg_catalog.count(*)
  INTO v_count
  FROM private.test_workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace is not authorized';
  END IF;

  v_nested := private.verify_probe(p_workspace_id);

  RETURN pg_catalog.format(
    'current_user=%s;session_user=%s;subject=%s;after_nested=%s;nested={%s}',
    current_user,
    session_user,
    (SELECT auth.uid()),
    current_user,
    v_nested
  );
END;
$function$;
ALTER FUNCTION public.manager_entry(uuid)
  OWNER TO nexus_invitation_manager;

CREATE FUNCTION public.acceptor_probe(p_workspace_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.count(*)
  FROM private.test_workspaces AS workspace
  WHERE workspace.id = p_workspace_id;
$function$;
ALTER FUNCTION public.acceptor_probe(uuid)
  OWNER TO nexus_invitation_acceptor;

GRANT EXECUTE ON FUNCTION private.audit_append(text, uuid)
  TO nexus_assertion_verifier;
GRANT EXECUTE ON FUNCTION private.verify_probe(uuid)
  TO nexus_invitation_manager;
REVOKE ALL ON FUNCTION public.manager_entry(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.acceptor_probe(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.manager_entry(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.acceptor_probe(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION private.audit_append(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.verify_probe(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reject_audit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_append(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE CREATE ON SCHEMA private FROM nexus_audit_table_owner,
  nexus_audit_writer,
  nexus_invitation_manager,
  nexus_invitation_acceptor,
  nexus_assertion_verifier;
REVOKE CREATE ON SCHEMA public FROM nexus_invitation_manager,
  nexus_invitation_acceptor;

\echo 'BOOTSTRAP PASS: roles, ownership, RLS, functions, and audit table created'
