CREATE FUNCTION public.analytics_overview(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  reporting_currency text,
  reporting_timezone text,
  total_revenue numeric,
  total_orders bigint,
  completed_orders bigint,
  processing_orders bigint,
  pending_orders bigint,
  cancelled_orders bigint,
  total_customers bigint,
  active_customers bigint,
  total_active_products bigint,
  average_order_value numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_overview(p_workspace_id, p_start_date, p_end_date);
$function$;

CREATE FUNCTION public.analytics_revenue_trend(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  report_date date,
  reporting_currency text,
  revenue numeric,
  qualifying_order_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_revenue_trend(p_workspace_id, p_start_date, p_end_date);
$function$;

CREATE FUNCTION public.analytics_revenue_trend_window(
  p_workspace_id uuid,
  p_days integer
)
RETURNS TABLE (
  report_date date,
  reporting_currency text,
  revenue numeric,
  qualifying_order_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_revenue_trend_window(p_workspace_id, p_days);
$function$;

CREATE FUNCTION public.analytics_order_status_breakdown(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (status text, order_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_order_status_breakdown(p_workspace_id, p_start_date, p_end_date);
$function$;

CREATE FUNCTION public.analytics_orders_over_time(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  report_date date,
  total_orders bigint,
  pending_orders bigint,
  processing_orders bigint,
  completed_orders bigint,
  cancelled_orders bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_orders_over_time(p_workspace_id, p_start_date, p_end_date);
$function$;

CREATE FUNCTION public.analytics_recent_orders(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  order_id uuid,
  customer_id uuid,
  status text,
  reporting_currency text,
  subtotal numeric,
  total numeric,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT *
  FROM private.analytics_recent_orders(
    p_workspace_id,
    p_start_date,
    p_end_date,
    p_limit,
    p_offset
  );
$function$;

CREATE FUNCTION public.analytics_customer_summary(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  total_customers bigint,
  active_customers bigint,
  customers_with_qualifying_orders bigint,
  new_customers_in_range bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_customer_summary(p_workspace_id, p_start_date, p_end_date);
$function$;

CREATE FUNCTION public.analytics_new_customers_over_time(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (report_date date, new_customer_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.analytics_new_customers_over_time(p_workspace_id, p_start_date, p_end_date);
$function$;

CREATE FUNCTION public.analytics_top_customers_by_revenue(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  is_archived boolean,
  qualifying_order_count bigint,
  qualifying_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT *
  FROM private.analytics_top_customers_by_revenue(
    p_workspace_id,
    p_start_date,
    p_end_date,
    p_limit,
    p_offset
  );
$function$;

CREATE FUNCTION public.analytics_product_performance(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_sort_by text DEFAULT 'revenue',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  product_sku text,
  units_sold bigint,
  qualifying_order_count bigint,
  qualifying_revenue numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT *
  FROM private.analytics_product_performance(
    p_workspace_id,
    p_start_date,
    p_end_date,
    p_sort_by,
    p_limit,
    p_offset
  );
$function$;

REVOKE ALL ON FUNCTION public.analytics_overview(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_revenue_trend(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_revenue_trend_window(uuid, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_order_status_breakdown(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_orders_over_time(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_recent_orders(uuid, date, date, integer, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_customer_summary(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_new_customers_over_time(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_top_customers_by_revenue(uuid, date, date, integer, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.analytics_product_performance(uuid, date, date, text, integer, integer)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.analytics_overview(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_trend(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_revenue_trend_window(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_order_status_breakdown(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_orders_over_time(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_recent_orders(uuid, date, date, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_customer_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_new_customers_over_time(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_top_customers_by_revenue(uuid, date, date, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_product_performance(uuid, date, date, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
