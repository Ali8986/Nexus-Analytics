DO $migration_preflight$
BEGIN
  IF pg_catalog.to_regclass('public.orders') IS NULL
     OR pg_catalog.to_regclass('public.order_items') IS NULL
     OR pg_catalog.to_regclass('public.customers') IS NULL
     OR pg_catalog.to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'analytics migration requires workspace, customer, product, and order migrations';
  END IF;

  IF NOT pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated',
       'private.is_workspace_member(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'analytics migration requires authenticated workspace-membership authorization privileges';
  END IF;
END;
$migration_preflight$;

CREATE INDEX customers_workspace_created_idx
  ON public.customers (workspace_id, created_at);

CREATE FUNCTION private.analytics_overview(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (p_start_date IS NULL) <> (p_end_date IS NULL)
     OR (p_start_date IS NOT NULL AND p_end_date < p_start_date)
     OR (p_start_date IS NOT NULL AND p_end_date - p_start_date > 365) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'date range must provide both dates, be ordered, and span no more than 366 days';
  END IF;

  RETURN QUERY
  WITH workspace_context AS (
    SELECT workspace.id, workspace.reporting_currency, workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
      AND private.is_workspace_member(workspace.id)
  ),
  scoped_orders AS (
    SELECT orders.status, orders.total
    FROM workspace_context AS workspace
    JOIN public.orders AS orders
      ON orders.workspace_id = workspace.id
    WHERE (
      p_start_date IS NULL
      OR orders.created_at >= (
        p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
      )
    )
      AND (
        p_end_date IS NULL
        OR orders.created_at < (
          (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
        )
      )
  ),
  order_metrics AS (
    SELECT
      COALESCE(pg_catalog.sum(orders.total)
        FILTER (WHERE orders.status IN ('processing', 'completed')), 0)::numeric AS revenue,
      pg_catalog.count(*)::bigint AS order_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'completed')::bigint AS completed_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'processing')::bigint AS processing_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'pending')::bigint AS pending_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'cancelled')::bigint AS cancelled_count,
      pg_catalog.count(*) FILTER (WHERE orders.status IN ('processing', 'completed'))::bigint
        AS revenue_order_count
    FROM scoped_orders AS orders
  ),
  entity_metrics AS (
    SELECT
      (SELECT pg_catalog.count(*)
       FROM workspace_context AS workspace
       JOIN public.customers AS customer ON customer.workspace_id = workspace.id)::bigint
        AS customer_count,
      (SELECT pg_catalog.count(*)
       FROM workspace_context AS workspace
       JOIN public.customers AS customer
         ON customer.workspace_id = workspace.id
       WHERE customer.archived_at IS NULL)::bigint AS active_customer_count,
      (SELECT pg_catalog.count(*)
       FROM workspace_context AS workspace
       JOIN public.products AS product
         ON product.workspace_id = workspace.id
       WHERE product.archived_at IS NULL)::bigint AS active_product_count
  )
  SELECT
    workspace.reporting_currency,
    workspace.reporting_timezone,
    orders.revenue,
    orders.order_count,
    orders.completed_count,
    orders.processing_count,
    orders.pending_count,
    orders.cancelled_count,
    entities.customer_count,
    entities.active_customer_count,
    entities.active_product_count,
    COALESCE(
      pg_catalog.round(orders.revenue / NULLIF(orders.revenue_order_count, 0), 4),
      0
    )::numeric
  FROM workspace_context AS workspace
  CROSS JOIN order_metrics AS orders
  CROSS JOIN entity_metrics AS entities;
END;
$function$;

CREATE FUNCTION private.analytics_revenue_trend(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR p_end_date - p_start_date > 365 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'revenue trend requires an ordered date range spanning no more than 366 days';
  END IF;

  RETURN QUERY
  WITH workspace_context AS (
    SELECT workspace.id, workspace.reporting_currency, workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
      AND private.is_workspace_member(workspace.id)
  ),
  days AS (
    SELECT series.report_date::date AS report_date
    FROM pg_catalog.generate_series(
      p_start_date::timestamp,
      p_end_date::timestamp,
      INTERVAL '1 day'
    ) AS series(report_date)
  ),
  revenue_by_day AS (
    SELECT
      (orders.created_at AT TIME ZONE workspace.reporting_timezone)::date AS report_date,
      pg_catalog.sum(orders.total)::numeric AS revenue,
      pg_catalog.count(*)::bigint AS order_count
    FROM workspace_context AS workspace
    JOIN public.orders AS orders
      ON orders.workspace_id = workspace.id
    WHERE orders.status IN ('processing', 'completed')
      AND orders.created_at >= (
        p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
      )
      AND orders.created_at < (
        (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
      )
    GROUP BY (orders.created_at AT TIME ZONE workspace.reporting_timezone)::date
  )
  SELECT
    days.report_date,
    workspace.reporting_currency,
    COALESCE(revenue_by_day.revenue, 0)::numeric,
    COALESCE(revenue_by_day.order_count, 0)::bigint
  FROM workspace_context AS workspace
  CROSS JOIN days
  LEFT JOIN revenue_by_day USING (report_date)
  ORDER BY days.report_date;
END;
$function$;

CREATE FUNCTION private.analytics_order_status_breakdown(
  p_workspace_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (status text, order_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (p_start_date IS NULL) <> (p_end_date IS NULL)
     OR (p_start_date IS NOT NULL AND p_end_date < p_start_date)
     OR (p_start_date IS NOT NULL AND p_end_date - p_start_date > 365) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'date range must provide both dates, be ordered, and span no more than 366 days';
  END IF;

  RETURN QUERY
  WITH workspace_context AS (
    SELECT workspace.id, workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
      AND private.is_workspace_member(workspace.id)
  ),
  statuses(status) AS (
    VALUES ('pending'::text), ('processing'::text), ('completed'::text), ('cancelled'::text)
  )
  SELECT
    statuses.status,
    pg_catalog.count(orders.id)::bigint
  FROM statuses
  CROSS JOIN workspace_context AS workspace
  LEFT JOIN public.orders AS orders
    ON orders.workspace_id = workspace.id
   AND orders.status = statuses.status
   AND (
     p_start_date IS NULL
     OR orders.created_at >= (
       p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
     )
   )
   AND (
     p_end_date IS NULL
     OR orders.created_at < (
       (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
     )
   )
  GROUP BY statuses.status
  ORDER BY statuses.status;
END;
$function$;

CREATE FUNCTION private.analytics_orders_over_time(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR p_end_date - p_start_date > 365 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'order trend requires an ordered date range spanning no more than 366 days';
  END IF;

  RETURN QUERY
  WITH workspace_context AS (
    SELECT workspace.id, workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
      AND private.is_workspace_member(workspace.id)
  ),
  days AS (
    SELECT series.report_date::date AS report_date
    FROM pg_catalog.generate_series(
      p_start_date::timestamp,
      p_end_date::timestamp,
      INTERVAL '1 day'
    ) AS series(report_date)
  ),
  orders_by_day AS (
    SELECT
      (orders.created_at AT TIME ZONE workspace.reporting_timezone)::date AS report_date,
      pg_catalog.count(*)::bigint AS total_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'pending')::bigint AS pending_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'processing')::bigint AS processing_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'completed')::bigint AS completed_count,
      pg_catalog.count(*) FILTER (WHERE orders.status = 'cancelled')::bigint AS cancelled_count
    FROM workspace_context AS workspace
    JOIN public.orders AS orders ON orders.workspace_id = workspace.id
    WHERE orders.created_at >= (
      p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
    )
      AND orders.created_at < (
        (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
      )
    GROUP BY (orders.created_at AT TIME ZONE workspace.reporting_timezone)::date
  )
  SELECT
    days.report_date,
    COALESCE(orders_by_day.total_count, 0)::bigint,
    COALESCE(orders_by_day.pending_count, 0)::bigint,
    COALESCE(orders_by_day.processing_count, 0)::bigint,
    COALESCE(orders_by_day.completed_count, 0)::bigint,
    COALESCE(orders_by_day.cancelled_count, 0)::bigint
  FROM workspace_context AS workspace
  CROSS JOIN days
  LEFT JOIN orders_by_day USING (report_date)
  ORDER BY days.report_date;
END;
$function$;

CREATE FUNCTION private.analytics_recent_orders(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (p_start_date IS NULL) <> (p_end_date IS NULL)
     OR (p_start_date IS NOT NULL AND p_end_date < p_start_date)
     OR (p_start_date IS NOT NULL AND p_end_date - p_start_date > 365) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'date range must provide both dates, be ordered, and span no more than 366 days';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'recent order pagination requires limit 1-100 and offset 0-10000';
  END IF;

  RETURN QUERY
  SELECT
    orders.id,
    orders.customer_id,
    orders.status,
    orders.currency_code,
    orders.subtotal,
    orders.total,
    orders.created_at
  FROM public.workspaces AS workspace
  JOIN public.orders AS orders ON orders.workspace_id = workspace.id
  WHERE workspace.id = p_workspace_id
    AND private.is_workspace_member(workspace.id)
    AND (
      p_start_date IS NULL
      OR orders.created_at >= (
        p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
      )
    )
    AND (
      p_end_date IS NULL
      OR orders.created_at < (
        (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
      )
    )
  ORDER BY orders.created_at DESC, orders.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE FUNCTION private.analytics_customer_summary(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (p_start_date IS NULL) <> (p_end_date IS NULL)
     OR (p_start_date IS NOT NULL AND p_end_date < p_start_date)
     OR (p_start_date IS NOT NULL AND p_end_date - p_start_date > 365) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'date range must provide both dates, be ordered, and span no more than 366 days';
  END IF;

  RETURN QUERY
  WITH workspace_context AS (
    SELECT workspace.id, workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
      AND private.is_workspace_member(workspace.id)
  ),
  customer_order_counts AS (
    SELECT customer.id, pg_catalog.count(DISTINCT orders.id)::bigint AS order_count
    FROM workspace_context AS workspace
    JOIN public.customers AS customer ON customer.workspace_id = workspace.id
    LEFT JOIN public.orders AS orders
      ON orders.workspace_id = customer.workspace_id
     AND orders.customer_id = customer.id
     AND orders.status IN ('processing', 'completed')
     AND (
       p_start_date IS NULL
       OR (orders.created_at AT TIME ZONE workspace.reporting_timezone)::date >= p_start_date
     )
     AND (
       p_end_date IS NULL
       OR (orders.created_at AT TIME ZONE workspace.reporting_timezone)::date <= p_end_date
     )
    GROUP BY customer.id
  )
  SELECT
    (SELECT pg_catalog.count(*)
     FROM workspace_context AS workspace
     JOIN public.customers AS customer ON customer.workspace_id = workspace.id)::bigint,
    (SELECT pg_catalog.count(*)
     FROM workspace_context AS workspace
     JOIN public.customers AS customer ON customer.workspace_id = workspace.id
     WHERE customer.archived_at IS NULL)::bigint,
    (SELECT pg_catalog.count(*)
     FROM customer_order_counts AS customer
     WHERE customer.order_count > 0)::bigint,
    (SELECT pg_catalog.count(*)
     FROM workspace_context AS workspace
     JOIN public.customers AS customer ON customer.workspace_id = workspace.id
     WHERE (
       p_start_date IS NULL
       OR customer.created_at >= (
         p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
       )
     )
       AND (
         p_end_date IS NULL
         OR customer.created_at < (
           (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
         )
       ))::bigint
  WHERE EXISTS (SELECT 1 FROM workspace_context);
END;
$function$;

CREATE FUNCTION private.analytics_new_customers_over_time(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (report_date date, new_customer_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR p_end_date - p_start_date > 365 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'customer trend requires an ordered date range spanning no more than 366 days';
  END IF;

  RETURN QUERY
  WITH workspace_context AS (
    SELECT workspace.id, workspace.reporting_timezone
    FROM public.workspaces AS workspace
    WHERE workspace.id = p_workspace_id
      AND private.is_workspace_member(workspace.id)
  ),
  days AS (
    SELECT series.report_date::date AS report_date
    FROM pg_catalog.generate_series(
      p_start_date::timestamp,
      p_end_date::timestamp,
      INTERVAL '1 day'
    ) AS series(report_date)
  ),
  customers_by_day AS (
    SELECT
      (customer.created_at AT TIME ZONE workspace.reporting_timezone)::date AS report_date,
      pg_catalog.count(*)::bigint AS customer_count
    FROM workspace_context AS workspace
    JOIN public.customers AS customer ON customer.workspace_id = workspace.id
    WHERE customer.created_at >= (
      p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
    )
      AND customer.created_at < (
        (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
      )
    GROUP BY (customer.created_at AT TIME ZONE workspace.reporting_timezone)::date
  )
  SELECT days.report_date, COALESCE(customers_by_day.customer_count, 0)::bigint
  FROM workspace_context AS workspace
  CROSS JOIN days
  LEFT JOIN customers_by_day USING (report_date)
  ORDER BY days.report_date;
END;
$function$;

CREATE FUNCTION private.analytics_top_customers_by_revenue(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF (p_start_date IS NULL) <> (p_end_date IS NULL)
     OR (p_start_date IS NOT NULL AND p_end_date < p_start_date)
     OR (p_start_date IS NOT NULL AND p_end_date - p_start_date > 365) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'date range must provide both dates, be ordered, and span no more than 366 days';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'top customer pagination requires limit 1-100 and offset 0-10000';
  END IF;

  RETURN QUERY
  SELECT
    customer.id,
    customer.name,
    customer.archived_at IS NOT NULL,
    pg_catalog.count(orders.id)::bigint,
    pg_catalog.sum(orders.total)::numeric
  FROM public.workspaces AS workspace
  JOIN public.customers AS customer ON customer.workspace_id = workspace.id
  JOIN public.orders AS orders
    ON orders.workspace_id = customer.workspace_id
   AND orders.customer_id = customer.id
   AND orders.status IN ('processing', 'completed')
   AND (
     p_start_date IS NULL
     OR orders.created_at >= (
       p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
     )
   )
   AND (
     p_end_date IS NULL
     OR orders.created_at < (
       (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
     )
   )
  WHERE workspace.id = p_workspace_id
    AND private.is_workspace_member(workspace.id)
  GROUP BY customer.id, customer.name, customer.archived_at
  ORDER BY pg_catalog.sum(orders.total) DESC, pg_catalog.count(orders.id) DESC, customer.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE FUNCTION private.analytics_product_performance(
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR p_end_date - p_start_date > 365 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'product performance requires an ordered date range spanning no more than 366 days';
  END IF;
  IF p_sort_by NOT IN ('revenue', 'units', 'orders') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'product performance sort must be revenue, units, or orders';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'product performance pagination requires limit 1-100 and offset 0-10000';
  END IF;

  RETURN QUERY
  SELECT
    item.product_id,
    item.product_name,
    item.product_sku,
    pg_catalog.sum(item.quantity)::bigint,
    pg_catalog.count(DISTINCT orders.id)::bigint,
    pg_catalog.sum(item.line_total)::numeric
  FROM public.workspaces AS workspace
  JOIN public.orders AS orders ON orders.workspace_id = workspace.id
  JOIN public.order_items AS item
    ON item.workspace_id = orders.workspace_id
   AND item.order_id = orders.id
  WHERE workspace.id = p_workspace_id
    AND private.is_workspace_member(workspace.id)
    AND orders.status IN ('processing', 'completed')
    AND orders.created_at >= (
      p_start_date::timestamp AT TIME ZONE workspace.reporting_timezone
    )
    AND orders.created_at < (
      (p_end_date + 1)::timestamp AT TIME ZONE workspace.reporting_timezone
    )
  GROUP BY item.product_id, item.product_name, item.product_sku
  ORDER BY
    CASE WHEN p_sort_by = 'revenue' THEN pg_catalog.sum(item.line_total) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'units' THEN pg_catalog.sum(item.quantity) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'orders' THEN pg_catalog.count(DISTINCT orders.id) END DESC NULLS LAST,
    item.product_id,
    item.product_name,
    item.product_sku
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION private.analytics_overview(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_revenue_trend(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_order_status_breakdown(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_orders_over_time(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_recent_orders(uuid, date, date, integer, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_customer_summary(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_new_customers_over_time(uuid, date, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_top_customers_by_revenue(uuid, date, date, integer, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION private.analytics_product_performance(uuid, date, date, text, integer, integer)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION private.analytics_overview(uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_revenue_trend(uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_order_status_breakdown(uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_orders_over_time(uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_recent_orders(uuid, date, date, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_customer_summary(uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_new_customers_over_time(uuid, date, date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_top_customers_by_revenue(uuid, date, date, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.analytics_product_performance(uuid, date, date, text, integer, integer)
  TO authenticated;

COMMENT ON FUNCTION private.analytics_overview(uuid, date, date) IS
  'Returns date-filtered order KPIs and all-time customer/product counts for an active workspace member. Revenue and average order value include only processing and completed orders.';
COMMENT ON FUNCTION private.analytics_revenue_trend(uuid, date, date) IS
  'Returns a continuous workspace-local date series using inclusive local dates and current processing/completed order status.';
COMMENT ON FUNCTION private.analytics_product_performance(uuid, date, date, text, integer, integer) IS
  'Ranks historical order-item snapshots for processing/completed orders. Product names, SKUs, and line totals come from stored order-item snapshots, including archived products.';
