CREATE FUNCTION private.analytics_revenue_trend_window(
  p_workspace_id uuid,
  p_days integer
)
RETURNS TABLE (
  report_date date,
  reporting_currency text,
  revenue numeric,
  qualifying_order_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_local_end_date date;
BEGIN
  IF p_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'revenue trend window must be 7, 30, or 90 days';
  END IF;

  SELECT (pg_catalog.now() AT TIME ZONE workspace.reporting_timezone)::date
  INTO v_local_end_date
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND private.is_workspace_member(workspace.id);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT trend.report_date,
         trend.reporting_currency,
         trend.revenue,
         trend.qualifying_order_count
  FROM private.analytics_revenue_trend(
    p_workspace_id,
    v_local_end_date - (p_days - 1),
    v_local_end_date
  ) AS trend
  ORDER BY trend.report_date;
END;
$function$;

REVOKE ALL ON FUNCTION private.analytics_revenue_trend_window(uuid, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.analytics_revenue_trend_window(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION private.analytics_revenue_trend_window(uuid, integer) IS
  'Returns a continuous 7-, 30-, or 90-local-day revenue series ending on the current date in the workspace timezone.';
