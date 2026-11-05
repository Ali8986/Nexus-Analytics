\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

DO $pgtap_search_path$
DECLARE
  v_pgtap_schema text;
BEGIN
  SELECT namespace.nspname
  INTO v_pgtap_schema
  FROM pg_catalog.pg_extension AS extension
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgtap';

  IF v_pgtap_schema IS NULL THEN
    RAISE EXCEPTION 'pgTAP extension is not installed';
  END IF;

  PERFORM pg_catalog.set_config(
    'search_path',
    pg_catalog.current_setting('search_path') || ',' ||
      pg_catalog.quote_ident(v_pgtap_schema),
    true
  );
END;
$pgtap_search_path$;

SELECT plan(1);

DO $test_preflight$
DECLARE
  v_can_bypass_rls boolean;
BEGIN
  SELECT session_role.rolsuper OR session_role.rolbypassrls
  INTO v_can_bypass_rls
  FROM pg_catalog.pg_roles AS session_role
  WHERE session_role.rolname = session_user::text;

  IF v_can_bypass_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'membership tests require a privileged session role that bypasses FORCE RLS for fixtures';
  END IF;

  IF NOT pg_catalog.has_table_privilege(session_user, 'auth.users', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspaces', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(session_user, 'public.workspace_members', 'INSERT') THEN
    RAISE EXCEPTION
      'membership tests require fixture DML privileges on auth.users and workspace tables';
  END IF;
END;
$test_preflight$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000001', 'membership-owner-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000002', 'membership-admin-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000003', 'membership-analyst-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000004', 'membership-viewer-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000005', 'membership-new-a@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000006', 'membership-new-b@example.invalid', pg_catalog.now(), pg_catalog.now()),
  ('e8a514e9-5b10-4bf3-a1b0-a301e8000007', 'membership-owner-b@example.invalid', pg_catalog.now(), pg_catalog.now());

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
  'Membership Workspace A',
  'USD',
  'UTC',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES
  ('e8a514e9-5b10-4bf3-a1b0-a301e9000001', 'e8a514e9-5b10-4bf3-a1b0-a301e8000001', 'owner', 'e8a514e9-5b10-4bf3-a1b0-a301e8000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e9000001', 'e8a514e9-5b10-4bf3-a1b0-a301e8000002', 'admin', 'e8a514e9-5b10-4bf3-a1b0-a301e8000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e9000001', 'e8a514e9-5b10-4bf3-a1b0-a301e8000003', 'analyst', 'e8a514e9-5b10-4bf3-a1b0-a301e8000001'),
  ('e8a514e9-5b10-4bf3-a1b0-a301e9000001', 'e8a514e9-5b10-4bf3-a1b0-a301e8000004', 'viewer', 'e8a514e9-5b10-4bf3-a1b0-a301e8000001');

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000007',
  true
);
INSERT INTO public.workspaces (
  id, name, reporting_currency, reporting_timezone, created_by
)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e9000002',
  'Membership Workspace B',
  'EUR',
  'Europe/London',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000007'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, created_by)
VALUES (
  'e8a514e9-5b10-4bf3-a1b0-a301e9000002',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000007',
  'owner',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000007'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  true
);
SELECT pg_catalog.set_config(
  'test.invite_admin',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    ' ADMIN-INVITE@EXAMPLE.INVALID ',
    'admin',
    pg_catalog.decode(pg_catalog.repeat('11', 32), 'hex')
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.invite_duplicate',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'viewer-invite@example.invalid',
    'viewer',
    pg_catalog.decode(pg_catalog.repeat('22', 32), 'hex')
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
  true
);
SELECT pg_catalog.set_config(
  'test.invite_admin_created_by_admin',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'membership-new-b@example.invalid',
    'analyst',
    pg_catalog.decode(pg_catalog.repeat('33', 32), 'hex')
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.invite_revoke',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'revoke-me@example.invalid',
    'viewer',
    pg_catalog.decode(pg_catalog.repeat('44', 32), 'hex')
  )::text,
  true
);
SELECT private.revoke_workspace_invitation(
  'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
  pg_catalog.current_setting('test.invite_revoke')::uuid
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  true
);
SELECT pg_catalog.set_config(
  'test.invite_accept',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'membership-new-a@example.invalid',
    'analyst',
    pg_catalog.decode(pg_catalog.repeat('55', 32), 'hex')
  )::text,
  true
);
SELECT pg_catalog.set_config(
  'test.invite_expired',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'expired-invite@example.invalid',
    'viewer',
    pg_catalog.decode(pg_catalog.repeat('77', 32), 'hex')
  )::text,
  true
);
RESET ROLE;

UPDATE public.workspace_invitations
SET created_at = pg_catalog.now() - INTERVAL '8 days',
    expires_at = pg_catalog.now() - INTERVAL '1 second'
WHERE id = pg_catalog.current_setting('test.invite_expired')::uuid;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
  true
);
SELECT pg_catalog.set_config(
  'test.invite_after_expiry',
  private.create_workspace_invitation(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'expired-invite@example.invalid',
    'viewer',
    pg_catalog.decode(pg_catalog.repeat('ff', 32), 'hex')
  )::text,
  true
);
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  v_denied boolean;
  v_invitation_count bigint;
  v_owner_count bigint;
BEGIN
  IF (SELECT invited_email
      FROM public.workspace_invitations
      WHERE id = pg_catalog.current_setting('test.invite_admin')::uuid)
       IS DISTINCT FROM 'admin-invite@example.invalid' THEN
    RAISE EXCEPTION 'invitation email was not normalized';
  END IF;

  IF pg_catalog.has_column_privilege(
    'authenticated',
    'public.workspace_invitations',
    'token_hash',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.workspace_invitations',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_invitations',
    'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_invitations',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'application role can access invitation secrets or write invitation rows';
  END IF;

  IF (SELECT pg_catalog.count(id)
      FROM public.workspace_invitations) <> 7 THEN
    RAISE EXCEPTION 'Owner/Admin cannot list only workspace A invitations';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'duplicate@example.invalid',
      'viewer',
      pg_catalog.decode(pg_catalog.repeat('88', 32), 'hex')
    );
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'duplicate@example.invalid',
      'viewer',
      pg_catalog.decode(pg_catalog.repeat('99', 32), 'hex')
    );
  EXCEPTION WHEN unique_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'duplicate pending invitation was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'cannot-invite-owner@example.invalid',
      'owner',
      pg_catalog.decode(pg_catalog.repeat('aa', 32), 'hex')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Owner invitation was allowed';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'admin-from-admin@example.invalid',
      'admin',
      pg_catalog.decode(pg_catalog.repeat('bb', 32), 'hex')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Admin invited another Admin';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'owner-from-admin@example.invalid',
      'owner',
      pg_catalog.decode(pg_catalog.repeat('cc', 32), 'hex')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Admin invited an Owner';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.revoke_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      pg_catalog.current_setting('test.invite_admin')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Admin revoked an Admin invitation';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000003',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'analyst-invite@example.invalid',
      'viewer',
      pg_catalog.decode(pg_catalog.repeat('dd', 32), 'hex')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Analyst created an invitation';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000004',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.revoke_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      pg_catalog.current_setting('test.invite_duplicate')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Viewer revoked an invitation';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    true
  );

  v_denied := false;
  BEGIN
    PERFORM private.accept_workspace_invitation(
      pg_catalog.decode(pg_catalog.repeat('44', 32), 'hex')
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'revoked invitation was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.accept_workspace_invitation(
      pg_catalog.decode(pg_catalog.repeat('77', 32), 'hex')
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'expired invitation was accepted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_invitations
    WHERE id = pg_catalog.current_setting('test.invite_expired')::uuid
      AND expired_at IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1
    FROM private.audit_logs
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
      AND entity_id = pg_catalog.current_setting('test.invite_expired')::uuid
      AND action = 'expired'
      AND entity_type = 'invitation'
  ) THEN
    RAISE EXCEPTION 'expired invitation was not marked and audited before replacement';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.accept_workspace_invitation(
      pg_catalog.decode(pg_catalog.repeat('ee', 32), 'hex')
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'invalid invitation token was accepted';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.create_workspace_invitation(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'bad-hash@example.invalid',
      'viewer',
      pg_catalog.decode('abcd', 'hex')
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'non-SHA-256-sized invitation hash was accepted';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.accept_workspace_invitation(
      pg_catalog.decode(pg_catalog.repeat('55', 32), 'hex')
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'email-mismatched invitation was accepted';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000005',
    true
  );
  BEGIN
    PERFORM private.accept_workspace_invitation(
      pg_catalog.decode(pg_catalog.repeat('55', 32), 'hex')
    );
    RAISE EXCEPTION 'acceptance rollback probe';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'acceptance rollback probe' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
      AND user_id = 'e8a514e9-5b10-4bf3-a1b0-a301e8000005'
  ) OR EXISTS (
    SELECT 1
    FROM public.workspace_invitations
    WHERE id = pg_catalog.current_setting('test.invite_accept')::uuid
      AND accepted_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM private.audit_logs
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
      AND entity_id = pg_catalog.current_setting('test.invite_accept')::uuid
      AND action = 'accepted'
      AND entity_type = 'invitation'
  ) THEN
    RAISE EXCEPTION 'failed acceptance did not roll back membership, invitation, and audit state';
  END IF;

  PERFORM private.accept_workspace_invitation(
    pg_catalog.decode(pg_catalog.repeat('55', 32), 'hex')
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
      AND user_id = 'e8a514e9-5b10-4bf3-a1b0-a301e8000005'
      AND role = 'analyst'
  ) THEN
    RAISE EXCEPTION 'accepted invitation did not create the invited membership role';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.accept_workspace_invitation(
      pg_catalog.decode(pg_catalog.repeat('55', 32), 'hex')
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'accepted invitation replay succeeded';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    true
  );

  v_denied := false;
  BEGIN
    PERFORM private.change_workspace_member_role(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      'admin'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Owner demotion through ordinary role operation was allowed';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.remove_workspace_member(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Owner removal through ordinary member operation was allowed';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.remove_workspace_member(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Owner self-removal was allowed';
  END IF;

  PERFORM private.change_workspace_member_role(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000003',
    'viewer'
  );

  v_denied := false;
  BEGIN
    PERFORM private.transfer_workspace_ownership(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000006'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'ownership transfer to a non-member was allowed';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002',
    true
  );
  v_denied := false;
  BEGIN
    PERFORM private.transfer_workspace_ownership(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000003'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'non-owner initiated ownership transfer';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.change_workspace_member_role(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
      'viewer'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Admin changed the Owner role';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.remove_workspace_member(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Admin removed the Owner';
  END IF;

  v_denied := false;
  BEGIN
    PERFORM private.change_workspace_member_role(
      'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000003',
      'admin'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Admin promoted a member to Admin';
  END IF;

  PERFORM private.change_workspace_member_role(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000003',
    'analyst'
  );

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000001',
    true
  );
  PERFORM private.transfer_workspace_ownership(
    'e8a514e9-5b10-4bf3-a1b0-a301e9000001',
    'e8a514e9-5b10-4bf3-a1b0-a301e8000002'
  );

  SELECT pg_catalog.count(*)
  INTO v_owner_count
  FROM public.workspace_members
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
    AND role = 'owner';
  IF v_owner_count <> 1
     OR (SELECT role FROM public.workspace_members
         WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
           AND user_id = 'e8a514e9-5b10-4bf3-a1b0-a301e8000001')
       IS DISTINCT FROM 'admin'::public.workspace_role
     OR (SELECT role FROM public.workspace_members
         WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
           AND user_id = 'e8a514e9-5b10-4bf3-a1b0-a301e8000002')
       IS DISTINCT FROM 'owner'::public.workspace_role THEN
    RAISE EXCEPTION 'ownership transfer did not atomically swap Owner and Admin roles';
  END IF;

  IF (SELECT audit.metadata
      FROM private.audit_logs AS audit
      WHERE audit.workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
        AND audit.action = 'transferred'
        AND audit.entity_type = 'ownership') IS DISTINCT FROM
    pg_catalog.jsonb_build_object(
      'previous_owner_id',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000001'::uuid,
      'new_owner_id',
      'e8a514e9-5b10-4bf3-a1b0-a301e8000002'::uuid
    ) THEN
    RAISE EXCEPTION 'ownership transfer audit metadata is incorrect';
  END IF;

  IF (SELECT audit.actor_user_id
      FROM private.audit_logs AS audit
      WHERE audit.workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
        AND audit.action = 'transferred'
        AND audit.entity_type = 'ownership') IS DISTINCT FROM
       'e8a514e9-5b10-4bf3-a1b0-a301e8000001'::uuid THEN
    RAISE EXCEPTION 'ownership transfer audit actor is incorrect';
  END IF;

  IF (SELECT pg_catalog.count(id)
      FROM public.workspace_invitations
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000002') <> 0 THEN
    RAISE EXCEPTION 'workspace invitation RLS crossed tenant boundaries';
  END IF;

  SELECT pg_catalog.count(*) INTO v_invitation_count
  FROM private.audit_logs
  WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
    AND entity_type = 'invitation';
  IF v_invitation_count < 4 THEN
    RAISE EXCEPTION 'invitation create/revoke/accept events were not audited';
  END IF;

  IF (SELECT actor_user_id
      FROM private.audit_logs
      WHERE workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
        AND entity_id = pg_catalog.current_setting('test.invite_accept')::uuid
        AND action = 'accepted'
        AND entity_type = 'invitation') IS DISTINCT FROM
       'e8a514e9-5b10-4bf3-a1b0-a301e8000005'::uuid THEN
    RAISE EXCEPTION 'invitation acceptance audit actor did not use authenticated context';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM private.audit_logs AS audit
    WHERE audit.workspace_id = 'e8a514e9-5b10-4bf3-a1b0-a301e9000001'
      AND audit.entity_type = 'invitation'
      AND (
        audit.metadata::text ILIKE '%membership-new-a@example.invalid%'
        OR audit.metadata::text ILIKE '%1111111111111111%'
        OR audit.metadata::text ILIKE '%2222222222222222%'
      )
  ) THEN
    RAISE EXCEPTION 'invitation email or token material was included in audit metadata';
  END IF;

  IF pg_catalog.has_table_privilege(
    'authenticated',
    'public.workspace_members',
    'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.workspace_members',
    'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated',
    'public.workspace_members',
    'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'service_role',
    'public.workspace_members',
    'DELETE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'private.transfer_workspace_ownership(uuid,uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon',
    'private.accept_workspace_invitation(bytea)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'application roles have unintended membership privileges';
  END IF;

  IF pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.transfer_workspace_ownership(uuid,uuid)'::pg_catalog.regprocedure
    ),
    'FOR UPDATE'
  ) = 0 OR pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.accept_workspace_invitation(bytea)'::pg_catalog.regprocedure
    ),
    'FOR UPDATE'
  ) = 0 THEN
    RAISE EXCEPTION 'ownership transfer or acceptance lacks row-lock serialization';
  END IF;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e8a514e9-5b10-4bf3-a1b0-a301e8000006',
  true
);
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(id) FROM public.workspace_invitations) <> 0
     OR (SELECT pg_catalog.count(workspace_id) FROM public.workspace_members) <> 0 THEN
    RAISE EXCEPTION 'non-member can read workspace invitations or memberships';
  END IF;
END;
$test$;
RESET ROLE;

SELECT pass('Workspace membership and invitation security assertions passed');
SELECT * FROM finish();

ROLLBACK;
