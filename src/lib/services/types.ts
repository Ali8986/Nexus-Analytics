export type DatabaseNumeric = number | string;

export type CustomerRecord = {
  id: string;
  workspace_id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProductRecord = {
  id: string;
  workspace_id: string;
  name: string;
  sku: string;
  description: string | null;
  unit_price: DatabaseNumeric;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type OrderRecord = {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  status: "pending" | "processing" | "completed" | "cancelled";
  currency_code: string;
  subtotal: DatabaseNumeric;
  total: DatabaseNumeric;
  created_at: string;
  updated_at: string;
};

export type OrderListRecord = OrderRecord & {
  customer_name: string | null;
  item_count: number;
};

export type OrderItemRecord = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_price: DatabaseNumeric;
  quantity: number;
  line_total: DatabaseNumeric;
  created_at: string;
};

export type RecentOrderRecord = {
  order_id: string;
  customer_id: string | null;
  status: OrderRecord["status"];
  reporting_currency: string;
  subtotal: DatabaseNumeric;
  total: DatabaseNumeric;
  created_at: string;
};

export type InvitationRecord = {
  id: string;
  workspace_id: string;
  invited_email: string;
  invited_role: "admin" | "analyst" | "viewer";
  inviter_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expired_at: string | null;
  created_at: string;
};

export type WorkspaceMemberRecord = {
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type AnalyticsOverview = {
  reporting_currency: string;
  reporting_timezone: string;
  total_revenue: DatabaseNumeric;
  total_orders: number;
  completed_orders: number;
  processing_orders: number;
  pending_orders: number;
  cancelled_orders: number;
  total_customers: number;
  active_customers: number;
  total_active_products: number;
  average_order_value: DatabaseNumeric;
};

export type RevenueTrendPoint = {
  report_date: string;
  reporting_currency: string;
  revenue: DatabaseNumeric;
  qualifying_order_count: number;
};

export type OrderStatusCount = {
  status: "pending" | "processing" | "completed" | "cancelled";
  order_count: number;
};

export type OrdersTrendPoint = {
  report_date: string;
  total_orders: number;
  pending_orders: number;
  processing_orders: number;
  completed_orders: number;
  cancelled_orders: number;
};

export type CustomerAnalyticsSummary = {
  total_customers: number;
  active_customers: number;
  customers_with_qualifying_orders: number;
  new_customers_in_range: number;
};

export type NewCustomerTrendPoint = {
  report_date: string;
  new_customer_count: number;
};

export type TopCustomer = {
  customer_id: string;
  customer_name: string;
  is_archived: boolean;
  qualifying_order_count: number;
  qualifying_revenue: DatabaseNumeric;
};

export type ProductPerformance = {
  product_id: string;
  product_name: string;
  product_sku: string;
  units_sold: number;
  qualifying_order_count: number;
  qualifying_revenue: DatabaseNumeric;
};
