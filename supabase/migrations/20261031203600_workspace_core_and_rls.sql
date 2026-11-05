CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL,
  reporting_currency text NOT NULL,
  reporting_timezone text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT workspaces_name_not_blank CHECK (
    pg_catalog.length(pg_catalog.btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT workspaces_currency_format CHECK (
    reporting_currency ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT workspaces_timezone_not_blank CHECK (
    pg_catalog.length(pg_catalog.btrim(reporting_timezone)) BETWEEN 1 AND 100
  )
);

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL
    REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  role public.workspace_role NOT NULL,
  created_by uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_members_user_workspace_idx
  ON public.workspace_members (user_id, workspace_id);

CREATE UNIQUE INDEX workspace_members_one_owner_idx
  ON public.workspace_members (workspace_id)
  WHERE role = 'owner'::public.workspace_role;

CREATE FUNCTION private.is_workspace_member(p_workspace_id uuid)
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
      AND membership.user_id = (SELECT auth.uid())
  );
$function$;

CREATE FUNCTION private.has_workspace_role(
  p_workspace_id uuid,
  p_allowed_roles public.workspace_role[]
)
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
      AND membership.user_id = (SELECT auth.uid())
      AND membership.role = ANY (p_allowed_roles)
  );
$function$;

CREATE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.lock_workspace_membership_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM workspace.id
    FROM public.workspaces AS workspace
    WHERE workspace.id = NEW.workspace_id
    FOR UPDATE;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM workspace.id
    FROM public.workspaces AS workspace
    WHERE workspace.id = OLD.workspace_id
    FOR UPDATE;
    RETURN OLD;
  END IF;

  FOR v_workspace_id IN
    SELECT workspace.id
    FROM public.workspaces AS workspace
    WHERE workspace.id IN (OLD.workspace_id, NEW.workspace_id)
    ORDER BY workspace.id
    FOR UPDATE
  LOOP
    NULL;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.enforce_exactly_one_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_workspace_id uuid;
  v_workspace_ids uuid[];
  v_owner_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN NULL;
    END IF;
    v_workspace_ids := ARRAY[NEW.id];
  ELSIF TG_OP = 'INSERT' THEN
    v_workspace_ids := ARRAY[NEW.workspace_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_workspace_ids := ARRAY[OLD.workspace_id];
  ELSE
    v_workspace_ids := ARRAY[OLD.workspace_id, NEW.workspace_id];
  END IF;

  FOREACH v_workspace_id IN ARRAY v_workspace_ids LOOP
    IF EXISTS (
      SELECT 1
      FROM public.workspaces AS workspace
      WHERE workspace.id = v_workspace_id
    ) THEN
      SELECT pg_catalog.count(*)
      INTO v_owner_count
      FROM public.workspace_members AS membership
      WHERE membership.workspace_id = v_workspace_id
        AND membership.role = 'owner'::public.workspace_role;

      IF v_owner_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'Each workspace must have exactly one active owner';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER workspaces_set_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER workspace_members_set_updated_at
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER workspace_members_lock_parent
BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION private.lock_workspace_membership_parent();

CREATE CONSTRAINT TRIGGER workspaces_exactly_one_owner
AFTER INSERT OR UPDATE ON public.workspaces
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.enforce_exactly_one_workspace_owner();

CREATE CONSTRAINT TRIGGER workspace_members_exactly_one_owner
AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.enforce_exactly_one_workspace_owner();

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces FORCE ROW LEVEL SECURITY;

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members FORCE ROW LEVEL SECURITY;

CREATE POLICY workspaces_member_select
ON public.workspaces
FOR SELECT
TO authenticated
USING ((SELECT private.is_workspace_member(id)));

CREATE POLICY workspace_members_member_select
ON public.workspace_members
FOR SELECT
TO authenticated
USING ((SELECT private.is_workspace_member(workspace_id)));

REVOKE ALL PRIVILEGES ON TABLE public.workspaces
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_members
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.workspaces TO authenticated;
GRANT SELECT ON TABLE public.workspace_members TO authenticated;

GRANT USAGE ON SCHEMA private TO authenticated;

REVOKE ALL ON FUNCTION private.is_workspace_member(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.has_workspace_role(
  uuid,
  public.workspace_role[]
) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.lock_workspace_membership_parent()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_exactly_one_workspace_owner()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_workspace_role(
  uuid,
  public.workspace_role[]
) TO authenticated;
