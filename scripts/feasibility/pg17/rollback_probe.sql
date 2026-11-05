\set ON_ERROR_STOP on

BEGIN;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  true
);
SET LOCAL ROLE authenticated;
SELECT public.manager_entry(
  '00000000-0000-0000-0000-000000000101'
);
ROLLBACK;
\echo 'ROLLBACK PROBE COMPLETE'
