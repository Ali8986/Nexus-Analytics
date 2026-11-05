SELECT
  pg_catalog.pg_has_role(
    'authenticated', 'nexus_audit_writer', 'MEMBER'
  ) AS writer_member,
  pg_catalog.pg_has_role(
    'authenticated', 'nexus_audit_writer', 'SET'
  ) AS writer_set,
  pg_catalog.pg_has_role(
    'authenticated', 'nexus_audit_table_owner', 'MEMBER'
  ) AS owner_member,
  pg_catalog.pg_has_role(
    'authenticated', 'nexus_audit_table_owner', 'SET'
  ) AS owner_set;