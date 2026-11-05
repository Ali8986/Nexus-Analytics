\set ON_ERROR_STOP on

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  false
);
SET ROLE nexus_audit_writer;

DO $test$
DECLARE
  v_result text;
  v_select_denied boolean := false;
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
  v_truncate_denied boolean := false;
  v_invalid_event_denied boolean := false;
  v_invalid_shape_denied boolean := false;
BEGIN
  v_result := private.audit_append(
    'workspace.invitation.accepted',
    '00000000-0000-0000-0000-000000000101'
  );
  IF v_result NOT LIKE
    'current_user=nexus_audit_writer;session_user=postgres;subject=00000000-0000-0000-0000-000000000201'
  THEN
    RAISE EXCEPTION 'audit writer function identity failed: %', v_result;
  END IF;
  RAISE NOTICE 'PASS writer appends a valid event under forced RLS';

  BEGIN
    PERFORM 1 FROM private.audit_events;
  EXCEPTION WHEN insufficient_privilege THEN
    v_select_denied := true;
  END;
  BEGIN
    UPDATE private.audit_events SET event_type = 'workspace.invitation.created';
  EXCEPTION WHEN insufficient_privilege THEN
    v_update_denied := true;
  END;
  BEGIN
    DELETE FROM private.audit_events;
  EXCEPTION WHEN insufficient_privilege THEN
    v_delete_denied := true;
  END;
  BEGIN
    EXECUTE 'TRUNCATE TABLE private.audit_events';
  EXCEPTION WHEN insufficient_privilege THEN
    v_truncate_denied := true;
  END;

  IF NOT v_select_denied OR NOT v_update_denied
     OR NOT v_delete_denied OR NOT v_truncate_denied THEN
    RAISE EXCEPTION 'audit writer has read or mutation access';
  END IF;
  RAISE NOTICE 'PASS writer cannot SELECT, UPDATE, DELETE, or TRUNCATE';

  BEGIN
    PERFORM private.audit_append(
      'arbitrary.client.event',
      '00000000-0000-0000-0000-000000000101'
    );
  EXCEPTION WHEN check_violation THEN
    v_invalid_event_denied := true;
  END;
  IF NOT v_invalid_event_denied THEN
    RAISE EXCEPTION 'unsupported audit event was accepted';
  END IF;
  RAISE NOTICE 'PASS unsupported event type is rejected';

  BEGIN
    PERFORM private.audit_append(
      'workspace.invitation.created',
      NULL
    );
  EXCEPTION WHEN not_null_violation THEN
    v_invalid_shape_denied := true;
  END;
  IF NOT v_invalid_shape_denied THEN
    RAISE EXCEPTION 'malformed audit event was accepted';
  END IF;
  RAISE NOTICE 'PASS malformed audit event is rejected';
END;
$test$;

RESET ROLE;
\echo 'AUDIT WRITER TESTS PASS'
