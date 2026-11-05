CREATE SCHEMA private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated, service_role;

CREATE TYPE public.workspace_role AS ENUM (
  'owner',
  'admin',
  'analyst',
  'viewer'
);
