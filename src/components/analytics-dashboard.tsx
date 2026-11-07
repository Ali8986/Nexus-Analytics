"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRef, useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  LoaderCircle,
  Package,
  ShoppingBag,
  UsersRound,
} from "lucide-react";
import { loadAnalyticsDashboard } from "@/app/actions/analytics";
import type {
  AnalyticsDashboardData,
  AnalyticsProductSort,
} from "@/lib/analytics/dashboard-data";
import type { OverviewRange } from "@/lib/analytics/overview-range";
import { formatCurrency } from "@/lib/formatting";
import {
  Button,
  EmptyState,
  SectionHeading,
  Skeleton,
  Surface,
  TableSkeleton,
} from "@/components/ui";

const rangeOptions: { value: OverviewRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const statusPresentation = {
  pending: { label: "Pending", color: "var(--warning)" },
  processing: { label: "Processing", color: "var(--accent)" },
  completed: { label: "Completed", color: "var(--success)" },
  cancelled: { label: "Cancelled", color: "var(--muted)" },
} as const;

function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function RevenueTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey?: string | number }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label ? formatReportDate(label) : ""}</span>
      <strong>{formatCurrency(Number(payload[0]?.value ?? 0), currency, 2)}</strong>
    </div>
  );
}

function CountTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span>{label ? formatReportDate(label) : ""}</span>
      <strong>{Number(payload[0]?.value ?? 0).toLocaleString("en-US")} {unit}</strong>
    </div>
  );
}

export function AnalyticsLoading() {
  return (
    <div aria-busy="true" className="analytics-loading">
      <div className="analytics-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="loading-kpi" key={index} />)}
      </div>
      <div className="analytics-chart-grid">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="loading-chart" key={index} />)}
      </div>
      <TableSkeleton
        headers={["Product", "SKU", "Revenue", "Units sold", "Orders"]}
        label="product performance"
      />
    </div>
  );
}

export function AnalyticsDashboard({ initialData }: { initialData: AnalyticsDashboardData }) {
  const [data, setData] = useState(initialData);
  const [range, setRange] = useState(initialData.range);
  const [productSort, setProductSort] = useState(initialData.productSort);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  async function load(nextRange: OverviewRange, nextSort: AnalyticsProductSort) {
    const currentRequest = ++requestId.current;
    setRange(nextRange);
    setProductSort(nextSort);
    setPending(true);
    setError("");
    try {
      const result = await loadAnalyticsDashboard({
        range: nextRange,
        productSort: nextSort,
      });
      if (currentRequest !== requestId.current) return;
      if ("error" in result) {
        setError(result.error);
        setRange(data.range);
        setProductSort(data.productSort);
        return;
      }
      setData(result.data);
    } catch {
      if (currentRequest === requestId.current) {
        setError("Analytics could not be loaded. Please try again.");
        setRange(data.range);
        setProductSort(data.productSort);
      }
    } finally {
      if (currentRequest === requestId.current) setPending(false);
    }
  }

  const statusCounts = Object.entries(statusPresentation).map(([status, presentation]) => ({
    status,
    ...presentation,
    count: data.orderStatuses.find((item) => item.status === status)?.order_count ?? 0,
  }));
  const hasOrders = data.orderTrend.some((point) => point.total_orders > 0);
  const hasRevenue = data.revenueTrend.some((point) => point.qualifying_order_count > 0);
  const hasCustomers = data.newCustomerTrend.some((point) => point.new_customer_count > 0);
  const hasStatusData = statusCounts.some((item) => item.count > 0);

  return (
    <div className="analytics-page">
      <div className="analytics-page-heading">
        <div>
          <p className="eyebrow">WORKSPACE PERFORMANCE</p>
          <h1>Analytics</h1>
          <p>
            Revenue includes orders currently Processing or Completed, grouped by order date.
          </p>
        </div>
        <div className="analytics-controls">
          <label>
            <CalendarDays aria-hidden="true" size={15} />
            <span className="sr-only">Reporting period</span>
            <select
              disabled={pending}
              onChange={(event) => void load(event.target.value as OverviewRange, productSort)}
              value={range}
            >
              {rangeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <span className="analytics-period">
            {data.startDate} – {data.endDate} · {data.reportingTimezone}
          </span>
        </div>
      </div>

      {error ? (
        <div className="list-inline-error" role="alert">
          <span>{error} Showing the last successfully loaded results.</span>
          <Button
            disabled={pending}
            onClick={() => void load(range, productSort)}
            size="small"
            type="button"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {pending ? (
        <div aria-live="polite" className="analytics-updating" role="status">
          <LoaderCircle aria-hidden="true" className="inline-spinner" size={15} />
          Updating analytics
        </div>
      ) : null}

      <div aria-busy={pending} className={pending ? "analytics-content analytics-content-pending" : "analytics-content"}>
        <div className="analytics-kpi-grid">
          <Surface className="kpi-card">
            <div className="kpi-topline">
              <span className="kpi-label">Qualifying revenue</span>
              <span className="kpi-icon kpi-icon-revenue"><CircleDollarSign size={17} /></span>
            </div>
            <div className="kpi-value">
              {formatCurrency(Number(data.overview.total_revenue), data.reportingCurrency)}
            </div>
            <div className="kpi-foot">{data.reportingCurrency} · current Processing or Completed orders</div>
          </Surface>
          <Surface className="kpi-card">
            <div className="kpi-topline">
              <span className="kpi-label">Total orders</span>
              <span className="kpi-icon kpi-icon-orders"><ShoppingBag size={17} /></span>
            </div>
            <div className="kpi-value">{data.overview.total_orders.toLocaleString("en-US")}</div>
            <div className="kpi-foot">Orders created during this period</div>
          </Surface>
          <Surface className="kpi-card">
            <div className="kpi-topline">
              <span className="kpi-label">Average order value</span>
              <span className="kpi-icon kpi-icon-average"><Package size={17} /></span>
            </div>
            <div className="kpi-value">
              {formatCurrency(Number(data.overview.average_order_value), data.reportingCurrency, 2)}
            </div>
            <div className="kpi-foot">Per current Processing or Completed order</div>
          </Surface>
          <Surface className="kpi-card">
            <div className="kpi-topline">
              <span className="kpi-label">New customers</span>
              <span className="kpi-icon kpi-icon-customers"><UsersRound size={17} /></span>
            </div>
            <div className="kpi-value">{data.customerSummary.new_customers_in_range.toLocaleString("en-US")}</div>
            <div className="kpi-foot">Added during this reporting period</div>
          </Surface>
        </div>

        <div className="analytics-chart-grid">
          <Surface className="analytics-panel">
            <SectionHeading
              title="Qualifying revenue trend"
              description="By order creation date and workspace reporting timezone"
            />
            <p className="analytics-axis-label">Revenue ({data.reportingCurrency})</p>
            {hasRevenue ? (
              <div aria-label={`Qualifying revenue trend in ${data.reportingCurrency}`} className="analytics-chart" role="img">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueTrend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="report_date" minTickGap={25} tickFormatter={formatReportDate} />
                    <YAxis width={72} />
                    <Tooltip content={<RevenueTooltip currency={data.reportingCurrency} />} />
                    <Area dataKey="revenue" fill="var(--accent-subtle)" stroke="var(--accent)" strokeWidth={2} type="monotone" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState description="Qualifying revenue trends will appear when Processing or Completed orders are created in this period." title="No qualifying revenue" />
            )}
          </Surface>

          <Surface className="analytics-panel">
            <SectionHeading title="Orders over time" description="Daily order counts by creation date" />
            <p className="analytics-axis-label">Orders</p>
            {hasOrders ? (
              <div aria-label="Orders trend" className="analytics-chart" role="img">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.orderTrend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="report_date" minTickGap={25} tickFormatter={formatReportDate} />
                    <YAxis allowDecimals={false} width={36} />
                    <Tooltip content={<CountTooltip unit="orders" />} />
                    <Bar dataKey="total_orders" fill="var(--accent)" maxBarSize={24} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState description="Orders created during this period will appear in the trend." title="No order activity" />
            )}
          </Surface>

          <Surface className="analytics-panel">
            <SectionHeading title="Order status breakdown" description="Current status of orders created in this period" />
            {hasStatusData ? (
              <div className="analytics-status-layout">
                <div aria-label="Order status distribution" className="analytics-donut" role="img">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusCounts} dataKey="count" nameKey="label" innerRadius="58%" outerRadius="84%" paddingAngle={3}>
                        {statusCounts.map((entry) => <Cell fill={entry.color} key={entry.status} />)}
                      </Pie>
                      <Tooltip formatter={(value) => Number(value).toLocaleString("en-US")} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="analytics-status-legend">
                  {statusCounts.map((item) => (
                    <div className="analytics-status-row" key={item.status}>
                      <span className="analytics-status-dot" style={{ background: item.color }} />
                      <span>{item.label}</span>
                      <strong>{item.count.toLocaleString("en-US")}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState description="A status distribution will appear once orders exist in this period." title="No orders to break down" />
            )}
          </Surface>

          <Surface className="analytics-panel">
            <SectionHeading title="New customer trend" description="Customers created in the workspace by reporting date" />
            <p className="analytics-axis-label">New customers</p>
            {hasCustomers ? (
              <div aria-label="New customer trend" className="analytics-chart" role="img">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.newCustomerTrend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="report_date" minTickGap={25} tickFormatter={formatReportDate} />
                    <YAxis allowDecimals={false} width={36} />
                    <Tooltip content={<CountTooltip unit="new customers" />} />
                    <Line dataKey="new_customer_count" dot={false} name="New customers" stroke="var(--success)" strokeWidth={2} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState description="New customer registrations will appear in this period." title="No new customers" />
            )}
          </Surface>
        </div>

        <div className="analytics-insights-grid">
          <Surface className="analytics-panel">
            <SectionHeading title="Product performance" description="Based on stored item snapshots in qualifying orders" />
            <label className="analytics-sort-control">
              <span>Sort by</span>
              <select
                disabled={pending}
                onChange={(event) => void load(range, event.target.value as AnalyticsProductSort)}
                value={productSort}
              >
                <option value="revenue">Revenue</option>
                <option value="units">Units sold</option>
                <option value="orders">Order count</option>
              </select>
            </label>
            {data.productPerformance.length ? (
              <div className="table-scroll">
                <table className="data-table analytics-table">
                  <thead>
                    <tr><th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Revenue</th><th scope="col">Units sold</th><th scope="col">Orders</th></tr>
                  </thead>
                  <tbody>
                    {data.productPerformance.map((product) => (
                      <tr key={product.product_id}>
                        <td>{product.product_name}</td>
                        <td>{product.product_sku}</td>
                        <td className="table-amount">{formatCurrency(Number(product.qualifying_revenue), data.reportingCurrency, 2)}</td>
                        <td>{product.units_sold.toLocaleString("en-US")}</td>
                        <td>{product.qualifying_order_count.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState description="Product activity appears when qualifying orders contain line items." title="No product activity" />
            )}
          </Surface>

          <Surface className="analytics-panel">
            <SectionHeading title="Top customers" description="Ranked by qualifying revenue in this period" />
            {data.topCustomers.length ? (
              <div className="analytics-customer-list">
                {data.topCustomers.map((customer, index) => (
                  <div className="analytics-customer-row" key={customer.customer_id}>
                    <span className="product-rank">{index + 1}</span>
                    <span className="analytics-customer-name">
                      <strong>{customer.customer_name}</strong>
                      <small>{customer.qualifying_order_count.toLocaleString("en-US")} qualifying orders</small>
                    </span>
                    <strong className="analytics-customer-revenue">
                      {formatCurrency(Number(customer.qualifying_revenue), data.reportingCurrency, 2)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState description="Customer rankings appear when customers have qualifying orders in this period." title="No qualifying customer activity" />
            )}
          </Surface>
        </div>
        <p className="analytics-footnote">
          Revenue is a reporting measure, not payment data. It reflects orders currently Processing or Completed and uses {data.reportingCurrency}; no currency conversion is applied.
        </p>
      </div>
    </div>
  );
}
