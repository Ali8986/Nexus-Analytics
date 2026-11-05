DO $migration_preflight$
DECLARE
  v_private_owner text;
  v_members_owner text;
BEGIN
  IF session_user::text IS DISTINCT FROM current_user::text
     OR current_user::text <> 'postgres' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'membership migration requires session_user=current_user=postgres; session role is %I and effective role is %I',
        session_user,
        current_user
      );
  END IF;

  SELECT pg_catalog.pg_get_userbyid(namespace.nspowner)::text
  INTO v_private_owner
  FROM pg_catalog.pg_namespace AS namespace
  WHERE namespace.nspname = 'private';

  SELECT pg_catalog.pg_get_userbyid(relation.relowner)::text
  INTO v_members_owner
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'workspace_members'
    AND relation.relkind IN ('r', 'p');

  IF v_private_owner IS DISTINCT FROM current_user::text
     OR v_members_owner IS DISTINCT FROM current_user::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'postgres must own the private schema and public.workspace_members';
  END IF;

  IF NOT pg_catalog.pg_has_role(
    current_user,
    'nexus_audit_writer',
    'SET'
  ) OR NOT pg_catalog.pg_has_role(
    current_user,
    'nexus_audit_table_owner',
    'SET'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration identity requires SET membership in both internal audit roles';
  END IF;

  IF NOT pg_catalog.has_column_privilege(
    current_user,
    'auth.users',
    'email',
    'SELECT'
  ) OR NOT pg_catalog.has_function_privilege(
    'nexus_audit_writer',
    'private.audit_current_actor()',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'nexus_audit_writer',
    'private.append_audit_log(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'migration identity lacks the verified auth email or audit writer privileges';
  END IF;
END;
$migration_preflight$;

GRANT CREATE ON SCHEMA private TO nexus_audit_writer;

CREATE TABLE public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL
    REFERENCES public.workspaces (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  invited_email text NOT NULL,
  invited_role public.workspace_role NOT NULL,
  token_hash bytea NOT NULL,
  inviter_user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  accepted_by uuid
    REFERENCES auth.users (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT workspace_invitations_email_normalized CHECK (
    invited_email = pg_catalog.lower(pg_catalog.btrim(invited_email))
    AND invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  CONSTRAINT workspace_invitations_role_not_owner CHECK (
    invited_role <> 'owner'::public.workspace_role
  ),
  CONSTRAINT workspace_invitations_hash_sha256_length CHECK (
    pg_catalog.octet_length(token_hash) = 32
  ),
  CONSTRAINT workspace_invitations_expiration_after_creation CHECK (
    expires_at > created_at
  ),
  CONSTRAINT workspace_invitations_acceptance_consistent CHECK (
    (accepted_at IS NULL AND accepted_by IS NULL)
    OR (accepted_at IS NOT NULL AND accepted_by IS NOT NULL)
  ),
  CONSTRAINT workspace_invitations_single_terminal_state CHECK (
    (accepted_at IS NOT NULL)::integer
    + (revoked_at IS NOT NULL)::integer
    + (expired_at IS NOT NULL)::integer
    <= 1
  )
);

CREATE UNIQUE INDEX workspace_invitations_token_hash_uidx
  ON public.workspace_invitations (token_hash);
CREATE UNIQUE INDEX workspace_invitations_pending_email_uidx
  ON public.workspace_invitations (workspace_id, invited_email)
  WHERE accepted_at IS NULL
    AND revoked_at IS NULL
    AND expired_at IS NULL;
CREATE INDEX workspace_invitations_workspace_created_idx
  ON public.workspace_invitations (workspace_id, created_at DESC);

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_invitations_owner_admin_read
ON public.workspace_invitations
FOR SELECT
TO authenticated
USING (
  (SELECT private.has_workspace_role(
    workspace_id,
    ARRAY['owner', 'admin']::public.workspace_role[]
  ))
);

CREATE POLICY workspace_invitations_writer_all
ON public.workspace_invitations
FOR ALL
TO nexus_audit_writer
USING (true)
WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.workspace_invitations
  FROM PUBLIC, anon, authenticated, service_role, nexus_audit_writer;

GRANT SELECT (
  id,
  workspace_id,
  invited_email,
  invited_role,
  inviter_user_id,
  expires_at,
  accepted_at,
  revoked_at,
  expired_at,
  created_at
) ON TABLE public.workspace_invitations TO authenticated;

GRANT SELECT (
  id,
  workspace_id,
  invited_email,
  invited_role,
  token_hash,
  inviter_user_id,
  accepted_by,
  expires_at,
  accepted_at,
  revoked_at,
  expired_at,
  created_at
) ON TABLE public.workspace_invitations TO nexus_audit_writer;
GRANT INSERT (
  id,
  workspace_id,
  invited_email,
  invited_role,
  token_hash,
  inviter_user_id,
  expires_at
) ON TABLE public.workspace_invitations TO nexus_audit_writer;
GRANT UPDATE (expired_at, accepted_at, accepted_by, revoked_at)
  ON TABLE public.workspace_invitations TO nexus_audit_writer;

GRANT SELECT (id)
  ON TABLE public.workspaces TO nexus_audit_writer;
GRANT UPDATE (updated_at)
  ON TABLE public.workspaces TO nexus_audit_writer;
CREATE POLICY workspaces_membership_writer_update
ON public.workspaces
FOR UPDATE
TO nexus_audit_writer
USING (true)
WITH CHECK (true);

GRANT SELECT (workspace_id, user_id, role, created_by)
  ON TABLE public.workspace_members TO nexus_audit_writer;
GRANT INSERT (workspace_id, user_id, role, created_by)
  ON TABLE public.workspace_members TO nexus_audit_writer;
GRANT UPDATE (role, updated_at)
  ON TABLE public.workspace_members TO nexus_audit_writer;
GRANT DELETE ON TABLE public.workspace_members TO nexus_audit_writer;

CREATE POLICY workspace_members_writer_insert
ON public.workspace_members
FOR INSERT
TO nexus_audit_writer
WITH CHECK (true);

CREATE POLICY workspace_members_writer_update
ON public.workspace_members
FOR UPDATE
TO nexus_audit_writer
USING (true)
WITH CHECK (true);

CREATE POLICY workspace_members_writer_delete
ON public.workspace_members
FOR DELETE
TO nexus_audit_writer
USING (true);

CREATE FUNCTION private.authenticated_email_matches(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    WHERE auth_user.id = (SELECT private.audit_current_actor())
      AND pg_catalog.lower(pg_catalog.btrim(auth_user.email))
        = pg_catalog.lower(pg_catalog.btrim(p_email))
  );
$function$;
REVOKE ALL ON FUNCTION private.authenticated_email_matches(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.authenticated_email_matches(text)
  TO nexus_audit_writer;

CREATE FUNCTION private.workspace_actor_role(p_workspace_id uuid)
RETURNS public.workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT membership.role
  FROM public.workspace_members AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = (SELECT private.audit_current_actor());
$function$;
REVOKE ALL ON FUNCTION private.workspace_actor_role(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.workspace_actor_role(uuid)
  TO nexus_audit_writer;

CREATE FUNCTION private.create_workspace_invitation(
  p_workspace_id uuid,
  p_invited_email text,
  p_invited_role public.workspace_role,
  p_token_hash bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_actor_role public.workspace_role;
  v_invitation_id uuid;
  v_expired record;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_invited_email));
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated actor is required to create an invitation';
  END IF;

  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace membership is required to create an invitation';
  END IF;

  PERFORM workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'workspace was not found';
  END IF;

  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may create invitations';
  END IF;

  IF (v_actor_role = 'admin'::public.workspace_role
      AND p_invited_role NOT IN (
        'analyst'::public.workspace_role,
        'viewer'::public.workspace_role
      ))
     OR (v_actor_role = 'owner'::public.workspace_role
      AND p_invited_role NOT IN (
        'admin'::public.workspace_role,
        'analyst'::public.workspace_role,
        'viewer'::public.workspace_role
      )) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'the requested invitation role is not permitted for this actor';
  END IF;

  IF p_token_hash IS NULL OR pg_catalog.octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation token hash must be a SHA-256 digest';
  END IF;

  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation email address is invalid';
  END IF;

  FOR v_expired IN
    SELECT invitation.id, invitation.invited_role
    FROM public.workspace_invitations AS invitation
    WHERE invitation.workspace_id = p_workspace_id
      AND invitation.invited_email = v_email
      AND invitation.accepted_at IS NULL
      AND invitation.revoked_at IS NULL
      AND invitation.expired_at IS NULL
      AND invitation.expires_at <= pg_catalog.now()
    FOR UPDATE
  LOOP
    UPDATE public.workspace_invitations
    SET expired_at = pg_catalog.now()
    WHERE id = v_expired.id;

    PERFORM private.append_audit_log(
      p_workspace_id,
      'expired',
      'invitation',
      v_expired.id,
      pg_catalog.jsonb_build_object('role', v_expired.invited_role::text)
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_invitations AS invitation
    WHERE invitation.workspace_id = p_workspace_id
      AND invitation.invited_email = v_email
      AND invitation.accepted_at IS NULL
      AND invitation.revoked_at IS NULL
      AND invitation.expired_at IS NULL
      AND invitation.expires_at > pg_catalog.now()
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'an active invitation already exists for this workspace and email';
  END IF;

  v_invitation_id := pg_catalog.gen_random_uuid();
  INSERT INTO public.workspace_invitations (
    id,
    workspace_id,
    invited_email,
    invited_role,
    token_hash,
    inviter_user_id,
    expires_at
  )
  VALUES (
    v_invitation_id,
    p_workspace_id,
    v_email,
    p_invited_role,
    p_token_hash,
    v_actor_user_id,
    pg_catalog.now() + INTERVAL '7 days'
  );

  PERFORM private.append_audit_log(
    p_workspace_id,
    'created',
    'invitation',
    v_invitation_id,
    pg_catalog.jsonb_build_object('role', p_invited_role::text)
  );

  RETURN v_invitation_id;
END;
$function$;

CREATE FUNCTION private.revoke_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_role public.workspace_role;
  v_invitation public.workspace_invitations%ROWTYPE;
BEGIN
  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may revoke invitations';
  END IF;

  PERFORM workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'workspace was not found';
  END IF;

  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may revoke invitations';
  END IF;

  SELECT invitation.*
  INTO v_invitation
  FROM public.workspace_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_invitation.accepted_at IS NOT NULL
     OR v_invitation.revoked_at IS NOT NULL
     OR v_invitation.expired_at IS NOT NULL
     OR v_invitation.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation is not pending and cannot be revoked';
  END IF;

  IF v_actor_role = 'admin'::public.workspace_role
     AND v_invitation.invited_role = 'admin'::public.workspace_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'admins cannot revoke invitations for admin access';
  END IF;

  UPDATE public.workspace_invitations
  SET revoked_at = pg_catalog.now()
  WHERE id = p_invitation_id;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'revoked',
    'invitation',
    p_invitation_id,
    pg_catalog.jsonb_build_object('role', v_invitation.invited_role::text)
  );

  RETURN p_invitation_id;
END;
$function$;

CREATE FUNCTION private.accept_workspace_invitation(p_token_hash bytea)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_invitation public.workspace_invitations%ROWTYPE;
  v_previous_acceptance_context text;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated actor is required to accept an invitation';
  END IF;

  IF p_token_hash IS NULL OR pg_catalog.octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation token is invalid';
  END IF;

  SELECT invitation.*
  INTO v_invitation
  FROM public.workspace_invitations AS invitation
  WHERE invitation.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation token is invalid or no longer active';
  END IF;

  PERFORM workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.id = v_invitation.workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation is no longer valid';
  END IF;

  SELECT invitation.*
  INTO v_invitation
  FROM public.workspace_invitations AS invitation
  WHERE invitation.id = v_invitation.id
    AND invitation.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_invitation.accepted_at IS NOT NULL
     OR v_invitation.revoked_at IS NOT NULL
     OR v_invitation.expired_at IS NOT NULL
     OR v_invitation.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invitation token is invalid, expired, or already used';
  END IF;

  IF NOT private.authenticated_email_matches(v_invitation.invited_email) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authenticated account email does not match the invitation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_members AS membership
    WHERE membership.workspace_id = v_invitation.workspace_id
      AND membership.user_id = v_actor_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'authenticated user is already a workspace member';
  END IF;

  UPDATE public.workspace_invitations
  SET accepted_at = pg_catalog.now(),
      accepted_by = v_actor_user_id
  WHERE id = v_invitation.id;

  v_previous_acceptance_context := pg_catalog.current_setting(
    'nexus.invitation_acceptance',
    true
  );
  PERFORM pg_catalog.set_config(
    'nexus.invitation_acceptance',
    v_invitation.id::text,
    true
  );

  INSERT INTO public.workspace_members (
    workspace_id,
    user_id,
    role,
    created_by
  )
  VALUES (
    v_invitation.workspace_id,
    v_actor_user_id,
    v_invitation.invited_role,
    v_invitation.inviter_user_id
  );

  PERFORM pg_catalog.set_config(
    'nexus.invitation_acceptance',
    COALESCE(v_previous_acceptance_context, ''),
    true
  );

  PERFORM private.append_audit_log(
    v_invitation.workspace_id,
    'accepted',
    'invitation',
    v_invitation.id,
    pg_catalog.jsonb_build_object('role', v_invitation.invited_role::text)
  );

  RETURN v_invitation.id;
END;
$function$;

CREATE FUNCTION private.change_workspace_member_role(
  p_workspace_id uuid,
  p_member_user_id uuid,
  p_new_role public.workspace_role
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_actor_role public.workspace_role;
  v_current_role public.workspace_role;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_user_id IS NULL
     OR v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may change member roles';
  END IF;

  PERFORM workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'workspace was not found';
  END IF;

  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may change member roles';
  END IF;

  IF p_member_user_id = v_actor_user_id
     OR p_new_role = 'owner'::public.workspace_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'self role changes and ordinary promotion to owner are not permitted';
  END IF;

  SELECT membership.role
  INTO v_current_role
  FROM public.workspace_members AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_member_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_current_role = 'owner'::public.workspace_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace owner cannot be changed through ordinary role management';
  END IF;

  IF v_current_role = p_new_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'member already has the requested role';
  END IF;

  IF v_actor_role = 'admin'::public.workspace_role
     AND p_new_role NOT IN (
       'analyst'::public.workspace_role,
       'viewer'::public.workspace_role
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'admins may assign only analyst or viewer roles';
  END IF;

  UPDATE public.workspace_members
  SET role = p_new_role
  WHERE workspace_id = p_workspace_id
    AND user_id = p_member_user_id;

  RETURN p_member_user_id;
END;
$function$;

CREATE FUNCTION private.remove_workspace_member(
  p_workspace_id uuid,
  p_member_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_actor_role public.workspace_role;
  v_target_role public.workspace_role;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_user_id IS NULL
     OR v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may remove members';
  END IF;

  PERFORM workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'workspace was not found';
  END IF;

  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_role NOT IN ('owner'::public.workspace_role, 'admin'::public.workspace_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only workspace owners and admins may remove members';
  END IF;

  IF p_member_user_id = v_actor_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'self-removal is not permitted';
  END IF;

  SELECT membership.role
  INTO v_target_role
  FROM public.workspace_members AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_member_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_role = 'owner'::public.workspace_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace owner cannot be removed';
  END IF;

  DELETE FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_member_user_id;

  RETURN p_member_user_id;
END;
$function$;

CREATE FUNCTION private.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
  v_actor_role public.workspace_role;
  v_target_role public.workspace_role;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());
  v_actor_role := private.workspace_actor_role(p_workspace_id);
  IF v_actor_user_id IS NULL
     OR v_actor_role <> 'owner'::public.workspace_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only the current workspace owner may transfer ownership';
  END IF;

  PERFORM workspace.id
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'workspace was not found';
  END IF;

  SELECT membership.role
  INTO v_actor_role
  FROM public.workspace_members AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = v_actor_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_actor_role <> 'owner'::public.workspace_role THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only the current workspace owner may transfer ownership';
  END IF;

  SELECT membership.role
  INTO v_target_role
  FROM public.workspace_members AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_new_owner_user_id
  FOR UPDATE;

  IF NOT FOUND OR p_new_owner_user_id = v_actor_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new owner must be a different active member of this workspace';
  END IF;

  UPDATE public.workspace_members
  SET role = 'admin'::public.workspace_role
  WHERE workspace_id = p_workspace_id
    AND user_id = v_actor_user_id;

  UPDATE public.workspace_members
  SET role = 'owner'::public.workspace_role
  WHERE workspace_id = p_workspace_id
    AND user_id = p_new_owner_user_id;

  PERFORM private.append_audit_log(
    p_workspace_id,
    'transferred',
    'ownership',
    p_workspace_id,
    pg_catalog.jsonb_build_object(
      'previous_owner_id',
      v_actor_user_id,
      'new_owner_id',
      p_new_owner_user_id
    )
  );

  RETURN p_new_owner_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_workspace_invitation(
  uuid, text, public.workspace_role, bytea
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.revoke_workspace_invitation(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.accept_workspace_invitation(bytea)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.change_workspace_member_role(
  uuid, uuid, public.workspace_role
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.remove_workspace_member(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.transfer_workspace_ownership(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.create_workspace_invitation(
  uuid, text, public.workspace_role, bytea
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.revoke_workspace_invitation(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.accept_workspace_invitation(bytea)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.change_workspace_member_role(
  uuid, uuid, public.workspace_role
) TO authenticated;
GRANT EXECUTE ON FUNCTION private.remove_workspace_member(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.transfer_workspace_ownership(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION private.create_workspace_invitation(
  uuid, text, public.workspace_role, bytea
) IS
  'Accepts only a SHA-256 token hash and returns the invitation ID. A trusted server-side caller must generate a cryptographically random raw token, hash it with SHA-256, pass only the hash here, and retain the raw token solely for future email delivery. This database operation never returns or stores a raw token.';

SET ROLE nexus_audit_table_owner;
ALTER TABLE private.audit_logs
  DROP CONSTRAINT audit_logs_action_entity_allowed;
ALTER TABLE private.audit_logs
  ADD CONSTRAINT audit_logs_action_entity_allowed CHECK (
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
      ('updated', 'settings'),
      ('transferred', 'ownership')
    )
  );
RESET ROLE;

SET ROLE nexus_audit_writer;

CREATE OR REPLACE FUNCTION private.audit_log_write_authorized(
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

  IF p_action = 'accepted'
     AND p_entity_type = 'invitation'
     AND EXISTS (
       SELECT 1
       FROM public.workspace_invitations AS invitation
       JOIN public.workspace_members AS membership
         ON membership.workspace_id = invitation.workspace_id
        AND membership.user_id = invitation.accepted_by
       WHERE invitation.id = p_entity_id
         AND invitation.workspace_id = p_workspace_id
         AND invitation.accepted_at IS NOT NULL
         AND invitation.accepted_by = v_actor_user_id
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

CREATE OR REPLACE FUNCTION private.capture_membership_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid;
BEGIN
  v_actor_user_id := (SELECT private.audit_current_actor());

  IF TG_OP = 'INSERT'
     AND pg_catalog.current_setting(
       'nexus.invitation_acceptance',
       true
     ) = (
       SELECT invitation.id::text
       FROM public.workspace_invitations AS invitation
       WHERE invitation.id = NULLIF(
         pg_catalog.current_setting('nexus.invitation_acceptance', true),
         ''
       )::uuid
         AND invitation.workspace_id = NEW.workspace_id
         AND invitation.accepted_by = NEW.user_id
         AND invitation.accepted_at IS NOT NULL
     ) THEN
    RETURN NEW;
  END IF;

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

RESET ROLE;

ALTER FUNCTION private.authenticated_email_matches(text)
  OWNER TO postgres;
ALTER FUNCTION private.workspace_actor_role(uuid)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.create_workspace_invitation(
  uuid, text, public.workspace_role, bytea
) OWNER TO nexus_audit_writer;
ALTER FUNCTION private.revoke_workspace_invitation(uuid, uuid)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.accept_workspace_invitation(bytea)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.change_workspace_member_role(
  uuid, uuid, public.workspace_role
) OWNER TO nexus_audit_writer;
ALTER FUNCTION private.remove_workspace_member(uuid, uuid)
  OWNER TO nexus_audit_writer;
ALTER FUNCTION private.transfer_workspace_ownership(uuid, uuid)
  OWNER TO nexus_audit_writer;

REVOKE CREATE ON SCHEMA private FROM nexus_audit_writer;
