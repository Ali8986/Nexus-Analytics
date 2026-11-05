DO $migration_guard$
DECLARE
  v_private_owner text;
  v_workspaces_owner text;
  v_members_owner text;
BEGIN
  IF session_user IN ('anon', 'authenticated', 'service_role', 'authenticator')
     OR current_user IN ('anon', 'authenticated', 'service_role', 'authenticator') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'refusing to grant audit internal-role membership to session role %I or effective role %I',
        session_user,
        current_user
      );
  END IF;

  IF session_user::text IS DISTINCT FROM current_user::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'audit migration requires session_user and current_user to match; session role is %I and effective role is %I',
        session_user,
        current_user
      );
  END IF;

  IF current_user::text <> 'postgres' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'audit actor helper must be owned by postgres; effective migration role is %I',
        current_user
      );
  END IF;

  IF NOT pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
     OR NOT pg_catalog.has_function_privilege(
       current_user,
       'auth.uid()',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'migration role %I must be able to resolve and execute auth.uid() for the trusted audit actor helper',
        current_user
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS migration_role
    WHERE migration_role.rolname = current_user::text
      AND (migration_role.rolsuper OR migration_role.rolcreaterole)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'effective migration role %I must have CREATEROLE to create the dedicated audit roles',
        current_user
      );
  END IF;

  SELECT pg_catalog.pg_get_userbyid(namespace.nspowner)::text
  INTO v_private_owner
  FROM pg_catalog.pg_namespace AS namespace
  WHERE namespace.nspname = 'private';

  SELECT pg_catalog.pg_get_userbyid(relation.relowner)::text
  INTO v_workspaces_owner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'workspaces'
    AND relation.relkind IN ('r', 'p');

  SELECT pg_catalog.pg_get_userbyid(relation.relowner)::text
  INTO v_members_owner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'workspace_members'
    AND relation.relkind IN ('r', 'p');

  IF current_user::text IS DISTINCT FROM v_private_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'effective migration role %I must own schema private to grant and revoke its scoped privileges',
        current_user
      );
  END IF;

  IF current_user::text IS DISTINCT FROM v_workspaces_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'effective migration role %I must own public.workspaces to grant audit-verifier access and create its RLS policy',
        current_user
      );
  END IF;

  IF current_user::text IS DISTINCT FROM v_members_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'effective migration role %I must own public.workspace_members to grant audit-verifier access and create its RLS policy',
        current_user
      );
  END IF;
END;
$migration_guard$;

CREATE ROLE nexus_audit_table_owner
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE nexus_audit_writer
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

DO $migration$
DECLARE
  v_role_name text;
BEGIN
  FOREACH v_role_name IN ARRAY ARRAY[
    'nexus_audit_table_owner',
    'nexus_audit_writer'
  ] LOOP
    BEGIN
      EXECUTE pg_catalog.format(
        'GRANT %I TO %I WITH SET TRUE, INHERIT FALSE, ADMIN FALSE',
        v_role_name,
        session_user
      );
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = pg_catalog.format(
            'migration role %I cannot grant SET-only membership to session identity %I in required audit role %I',
            current_user,
            session_user,
            v_role_name
          );
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS granted_role
        ON granted_role.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member_role
        ON member_role.oid = membership.member
      WHERE granted_role.rolname = v_role_name
        AND member_role.rolname = session_user::text
        AND membership.set_option
        AND NOT membership.inherit_option
        AND NOT membership.admin_option
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = pg_catalog.format(
          'session identity %I lacks the required SET TRUE, INHERIT FALSE, ADMIN FALSE membership in audit role %I',
          session_user,
          v_role_name
        );
    END IF;
  END LOOP;
END;
$migration$;

GRANT USAGE ON SCHEMA private TO nexus_audit_table_owner, nexus_audit_writer;
GRANT CREATE ON SCHEMA private TO nexus_audit_table_owner, nexus_audit_writer;

CREATE FUNCTION private.audit_current_actor()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid();
$function$;
REVOKE ALL ON FUNCTION private.audit_current_actor()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.audit_current_actor()
  TO nexus_audit_writer;

CREATE FUNCTION private.audit_metadata_is_safe(p_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_entry record;
  v_normalized_key text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_metadata) <> 'object' THEN
    RETURN false;
  END IF;

  FOR v_entry IN
    SELECT entry.key, entry.value
    FROM pg_catalog.jsonb_each(p_metadata) AS entry
  LOOP
    v_normalized_key := pg_catalog.regexp_replace(
      pg_catalog.lower(v_entry.key),
      '[^a-z0-9]',
      '',
      'g'
    );

    IF v_normalized_key ~
       '(email|token|password|passwd|secret|apikey|authorization|credential|jwt|signingkey|privatekey)' THEN
      RETURN false;
    END IF;

    IF pg_catalog.jsonb_typeof(v_entry.value) = 'object'
       AND NOT private.audit_metadata_is_safe(v_entry.value) THEN
      RETURN false;
    END IF;

    IF pg_catalog.jsonb_typeof(v_entry.value) = 'array'
       AND EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(v_entry.value) AS item(value)
         WHERE pg_catalog.jsonb_typeof(item.value) IN ('object', 'array')
           AND NOT private.audit_metadata_is_safe(item.value)
       ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION private.audit_metadata_is_safe(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.audit_log_write_authorized(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());

  IF v_actor_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_action = 'created'
     AND p_entity_type = 'workspace'
     AND p_entity_id = p_workspace_id THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = p_workspace_id
        AND workspace.created_by = v_actor_user_id
    );
  END IF;

  IF p_action = 'added'
     AND p_entity_type = 'membership'
     AND p_entity_id = v_actor_user_id
     AND p_metadata ->> 'role' = 'owner'
     AND EXISTS (
       SELECT 1
       FROM public.workspaces AS workspace
       WHERE workspace.id = p_workspace_id
         AND workspace.created_by = v_actor_user_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.workspace_members AS membership
       WHERE membership.workspace_id = p_workspace_id
     ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_members AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = v_actor_user_id
      AND membership.role IN (
        'owner'::public.workspace_role,
        'admin'::public.workspace_role
      )
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.audit_log_write_authorized(
  uuid,
  text,
  text,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.audit_log_reader_authorized(p_workspace_id uuid)
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
REVOKE ALL ON FUNCTION private.audit_log_reader_authorized(uuid)
  FROM PUBLIC, anon, service_role;

GRANT SELECT (id, created_by)
ON TABLE public.workspaces
TO nexus_audit_writer;
GRANT SELECT (workspace_id, user_id, role)
ON TABLE public.workspace_members
TO nexus_audit_writer;

CREATE POLICY workspaces_audit_writer_select
ON public.workspaces
FOR SELECT
TO nexus_audit_writer
USING (true);

CREATE POLICY workspace_members_audit_writer_select
ON public.workspace_members
FOR SELECT
TO nexus_audit_writer
USING (true);

CREATE TABLE private.audit_logs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL
    REFERENCES public.workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  actor_user_id uuid
    REFERENCES auth.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT audit_logs_action_entity_allowed CHECK (
    (action, entity_type) IN (
      ('created', 'workspace'),
      ('updated', 'workspace'),
      ('added', 'membership'),
      ('role_changed', 'membership'),
      ('updated', 'membership'),
      ('removed', 'membership'),
      ('created', 'customer'),
      ('updated', 'customer'),
      ('deleted', 'customer'),
      ('created', 'product'),
      ('updated', 'product'),
      ('deleted', 'product'),
      ('created', 'order'),
      ('updated', 'order'),
      ('status_changed', 'order'),
      ('deleted', 'order'),
      ('created', 'invitation'),
      ('resent', 'invitation'),
      ('accepted', 'invitation'),
      ('revoked', 'invitation'),
      ('expired', 'invitation'),
      ('requested', 'export'),
      ('completed', 'export'),
      ('failed', 'export'),
      ('updated', 'settings')
    )
  ),
  CONSTRAINT audit_logs_metadata_object CHECK (
    pg_catalog.jsonb_typeof(metadata) = 'object'
    AND private.audit_metadata_is_safe(metadata)
  )
);

ALTER TABLE private.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.audit_logs FORCE ROW LEVEL SECURITY;

CREATE INDEX audit_logs_workspace_created_at_idx
  ON private.audit_logs (workspace_id, created_at DESC);

CREATE INDEX audit_logs_workspace_entity_created_at_idx
  ON private.audit_logs (
    workspace_id,
    entity_type,
    entity_id,
    created_at DESC
  );

CREATE INDEX audit_logs_workspace_actor_created_at_idx
  ON private.audit_logs (workspace_id, actor_user_id, created_at DESC);

CREATE POLICY audit_logs_owner_admin_select
ON private.audit_logs
FOR SELECT
TO authenticated
USING (
  (SELECT private.audit_log_reader_authorized(workspace_id))
);

CREATE POLICY audit_logs_writer_insert
ON private.audit_logs
FOR INSERT
TO nexus_audit_writer
WITH CHECK (
  actor_user_id IS NOT DISTINCT FROM (SELECT private.audit_current_actor())
  AND (SELECT private.audit_log_write_authorized(
    workspace_id,
    action,
    entity_type,
    entity_id,
    metadata
  ))
);

REVOKE ALL PRIVILEGES ON TABLE private.audit_logs
  FROM PUBLIC, anon, authenticated, service_role, nexus_audit_writer;
GRANT SELECT ON TABLE private.audit_logs TO authenticated;
GRANT INSERT (
  id,
  workspace_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  metadata
) ON TABLE private.audit_logs TO nexus_audit_writer;

CREATE FUNCTION private.audit_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'audit records are append-only';
END;
$function$;
REVOKE ALL ON FUNCTION private.audit_logs_reject_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.audit_logs_require_append_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF current_user <> 'nexus_audit_writer'
     OR pg_catalog.current_setting('nexus.audit_append_path', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'audit inserts must use the internal append function';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.audit_logs_require_append_path()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_logs_require_append_path
BEFORE INSERT ON private.audit_logs
FOR EACH ROW
EXECUTE FUNCTION private.audit_logs_require_append_path();

CREATE TRIGGER audit_logs_no_update_delete
BEFORE UPDATE OR DELETE ON private.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION private.audit_logs_reject_mutation();

CREATE TRIGGER audit_logs_no_truncate
BEFORE TRUNCATE ON private.audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION private.audit_logs_reject_mutation();

CREATE FUNCTION private.append_audit_log(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_audit_log_id uuid;
  v_previous_append_path text;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());

  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated actor is required for audit events';
  END IF;

  IF NOT private.audit_log_write_authorized(
    p_workspace_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'audit event is not authorized for this workspace';
  END IF;

  v_audit_log_id := pg_catalog.gen_random_uuid();
  v_previous_append_path := pg_catalog.current_setting(
    'nexus.audit_append_path',
    true
  );
  PERFORM pg_catalog.set_config('nexus.audit_append_path', 'on', true);

  INSERT INTO private.audit_logs (
    id,
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    v_audit_log_id,
    p_workspace_id,
    v_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata
  );

  PERFORM pg_catalog.set_config(
    'nexus.audit_append_path',
    COALESCE(v_previous_append_path, ''),
    true
  );

  RETURN v_audit_log_id;
END;
$function$;
REVOKE ALL ON FUNCTION private.append_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.capture_workspace_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());

  IF v_actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM v_actor_user_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'workspace creator must match the authenticated actor';
    END IF;

    PERFORM private.append_audit_log(
      NEW.id,
      'created',
      'workspace',
      NEW.id,
      '{}'::jsonb
    );
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    v_changed_fields := pg_catalog.array_append(v_changed_fields, 'name');
  END IF;
  IF NEW.reporting_currency IS DISTINCT FROM OLD.reporting_currency THEN
    v_changed_fields := pg_catalog.array_append(
      v_changed_fields,
      'reporting_currency'
    );
  END IF;
  IF NEW.reporting_timezone IS DISTINCT FROM OLD.reporting_timezone THEN
    v_changed_fields := pg_catalog.array_append(
      v_changed_fields,
      'reporting_timezone'
    );
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    v_changed_fields := pg_catalog.array_append(v_changed_fields, 'created_by');
  END IF;

  IF pg_catalog.cardinality(v_changed_fields) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM private.append_audit_log(
    NEW.id,
    'updated',
    'workspace',
    NEW.id,
    pg_catalog.jsonb_build_object('changed_fields', v_changed_fields)
  );

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.capture_workspace_audit()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.capture_membership_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_workspace_id uuid;
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());

  IF v_actor_user_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM private.append_audit_log(
      NEW.workspace_id,
      'added',
      'membership',
      NEW.user_id,
      pg_catalog.jsonb_build_object('role', NEW.role::text)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM private.append_audit_log(
      OLD.workspace_id,
      'removed',
      'membership',
      OLD.user_id,
      pg_catalog.jsonb_build_object('role', OLD.role::text)
    );
    RETURN OLD;
  END IF;

  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'membership identity cannot be changed in place';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM private.append_audit_log(
      NEW.workspace_id,
      'role_changed',
      'membership',
      NEW.user_id,
      pg_catalog.jsonb_build_object(
        'from_role',
        OLD.role::text,
        'to_role',
        NEW.role::text
      )
    );
  ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    PERFORM private.append_audit_log(
      NEW.workspace_id,
      'updated',
      'membership',
      NEW.user_id,
      '{"changed_fields":["created_by"]}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.capture_membership_audit()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER workspaces_capture_audit
AFTER INSERT OR UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION private.capture_workspace_audit();

CREATE TRIGGER workspace_members_capture_audit
BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION private.capture_membership_audit();

REVOKE ALL ON FUNCTION private.audit_metadata_is_safe(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_current_actor()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_log_write_authorized(
  uuid,
  text,
  text,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_logs_reject_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_logs_require_append_path()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.append_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.capture_workspace_audit()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.capture_membership_audit()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.audit_metadata_is_safe(jsonb)
  TO nexus_audit_writer;
GRANT EXECUTE ON FUNCTION private.audit_current_actor()
  TO nexus_audit_writer;
GRANT EXECUTE ON FUNCTION private.audit_log_write_authorized(
  uuid,
  text,
  text,
  uuid,
  jsonb
) TO nexus_audit_writer;
GRANT EXECUTE ON FUNCTION private.audit_log_reader_authorized(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.append_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) TO nexus_audit_writer;

COMMENT ON TABLE private.audit_logs IS
  'Append-only workspace audit history. Workspace and actor deletion are restricted while audit records reference them. Future entity/action pairs are reserved but produce no events until trusted operations are implemented.';

COMMENT ON FUNCTION private.append_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) IS
  'Internal transaction-scoped append path. Future trusted business function owners must receive explicit EXECUTE grants in a later migration.';

ALTER FUNCTION private.audit_logs_reject_mutation()
  OWNER TO nexus_audit_table_owner;
ALTER FUNCTION private.audit_logs_require_append_path()
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.append_audit_log(
  uuid,
  text,
  text,
  uuid,
  jsonb
) OWNER TO nexus_audit_writer;
ALTER FUNCTION private.capture_workspace_audit()
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.capture_membership_audit()
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.audit_log_write_authorized(
  uuid,
  text,
  text,
  uuid,
  jsonb
) OWNER TO nexus_audit_writer;
ALTER FUNCTION private.audit_log_reader_authorized(uuid)
  OWNER TO nexus_audit_writer;
ALTER TABLE private.audit_logs OWNER TO nexus_audit_table_owner;

REVOKE CREATE ON SCHEMA private
  FROM nexus_audit_table_owner, nexus_audit_writer;
