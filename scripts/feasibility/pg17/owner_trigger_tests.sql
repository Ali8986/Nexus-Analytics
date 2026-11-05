\set ON_ERROR_STOP on

SET ROLE nexus_audit_table_owner;

DO $test$
DECLARE
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
  v_truncate_denied boolean := false;
BEGIN
  BEGIN
    UPDATE private.audit_events
    SET event_type = 'workspace.invitation.created';
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

  IF NOT v_update_denied OR NOT v_delete_denied OR NOT v_truncate_denied THEN
    RAISE EXCEPTION 'append-only enforcement trigger failed';
  END IF;
  RAISE NOTICE 'PASS update/delete/truncate are rejected even for table owner role';
END;
$test$;

RESET ROLE;
\echo 'OWNER TRIGGER TESTS PASS'
