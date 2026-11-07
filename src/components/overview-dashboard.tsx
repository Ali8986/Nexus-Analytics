"use client";

import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  LoaderCircle,
  Package,
  ShoppingBag,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadOverviewDashboard } from "@/app/actions/overview";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  Button,
  EmptyState,
  SectionHeading,
  StatusBadge,
  Surface,
  Skeleton,
} from "@/components/ui";
import { formatCurrency } from "@/lib/formatting";
import type { OverviewDashboardData } from "@/lib/analytics/overview-data";
import type { OverviewRange } from "@/lib/analytics/overview-range";
import type { OrderStatusCount } from "@/lib/services/types";

const rangeOptions: { value: OverviewRange; label: string; days: string }[] = [
  { value: "7d", label: "Last 7 days", days: "7 days" },
  { value: "30d", label: "Last 30 days", days: "30 days" },
  { value: "90d", label: "Last 90 days", days: "90 days" },
];

const statuses: {
  value: OrderStatusCount["status"];
  label: string;
  color: string;
}[] = [
  { value: "completed", label: "Completed", color: "green" },
  { value: "processing", label: "Processing", color: "violet" },
  { value: "pending", label: "Pending", color: "amber" },
  { value: "cancelled", label: "Cancelled", color: "gray" },
];

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
  const revenue = payload.find((entry) => entry.dataKey === "revenue")?.value ?? 0;
  return (
    <div className="chart-tooltip">
      <span>{label}</span>
      <strong>Revenue · {formatCurrency(revenue, currency, 2)}</strong>
    </div>
  );
}

function formatReportDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatTimestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatCompactCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function OverviewLoading() {
  return (
    <div aria-busy="true" className="overview-loading">
      <p role="status">Loading analytics for this reporting period…</p>
      <div className="loading-kpis">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="loading-kpi" key={index} />
        ))}
      </div>
      <div className="loading-panels">
        <Skeleton className="loading-chart" />
        <Skeleton className="loading-activity" />
      </div>
    </div>
  );
}

export function OverviewDashboard({
  initialData,
}: {
  initialData: OverviewDashboardData;
}) {
  const [data, setData] = useState<OverviewDashboardData | null>(initialData);
  const [range, setRange] = useState<OverviewRange>(initialData.range);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const rangeSelectRef = useRef<HTMLDivElement>(null);
  const rangeTriggerRef = useRef<HTMLButtonElement>(null);
  const rangeMenuRef = useRef<HTMLDivElement>(null);
  const rangeRequestRef = useRef(0);
  const restoreRangeFocusRef = useRef(false);
  const selectedRange =
    rangeOptions.find((option) => option.value === range)?.label ?? "Last 30 days";

  useEffect(() => {
    if (!rangeMenuOpen) return;
    rangeMenuRef.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();
  }, [rangeMenuOpen]);

  useEffect(() => {
    if (isPending || !restoreRangeFocusRef.current) return;
    rangeTriggerRef.current?.focus();
    restoreRangeFocusRef.current = false;
  }, [isPending]);

  useEffect(() => {
    if (!rangeMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rangeSelectRef.current?.contains(event.target as Node)) {
        setRangeMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [rangeMenuOpen]);

  function handleRangeMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setRangeMenuOpen(false);
      rangeTriggerRef.current?.focus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(
      rangeMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (options.length === 0) return;
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const selectedIndex = rangeOptions.findIndex((option) => option.value === range);
    const index = currentIndex < 0 ? selectedIndex : currentIndex;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
    options[nextIndex]?.focus();
  }

  function requestRange(nextRange: OverviewRange) {
    const requestId = ++rangeRequestRef.current;
    setIsPending(true);
    setLoadError("");
    void (async () => {
      try {
        const result = await loadOverviewDashboard(nextRange);
        if (requestId !== rangeRequestRef.current) return;
        if ("error" in result) {
          setLoadError(result.error);
          return;
        }
        setData(result.data);
        setRange(nextRange);
      } catch {
        if (requestId === rangeRequestRef.current) {
          setLoadError("Analytics could not be loaded. Please try again.");
        }
      } finally {
        if (requestId === rangeRequestRef.current) setIsPending(false);
      }
    })();
  }

  const headingDate = data
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
        .format(new Date(`${data.endDate}T00:00:00Z`))
        .toUpperCase()
    : "";
  const statusCounts = statuses.map((status) => ({
    ...status,
    count:
      data?.orderStatuses.find((item) => item.status === status.value)
        ?.order_count ?? 0,
  }));
  const statusTotal = statusCounts.reduce((total, item) => total + item.count, 0);
  const revenueChartData =
    data?.revenueTrend.map((point) => ({
      ...point,
      revenue: Number(point.revenue),
    })) ?? [];

  return (
    <div className="dashboard-page">
      <div className="demo-banner">
        <span className="demo-banner-mark" aria-hidden="true">
          <span />
        </span>
        <span>
          <strong>Live workspace data</strong> — {data?.workspaceName ?? "Workspace"}
        </span>
      </div>

      <div className="page-heading">
        <div>
          <div className="eyebrow">{headingDate || "OVERVIEW"}</div>
          <h1>Workspace overview <span aria-hidden="true">✦</span></h1>
          <p>Here&apos;s what&apos;s happening in your business.</p>
        </div>
        <div className="page-heading-actions">
          <div className="range-select-wrap" ref={rangeSelectRef}>
            <button
              aria-controls="overview-range-options"
              aria-expanded={rangeMenuOpen}
              aria-haspopup="listbox"
              className="button button-secondary range-select"
              disabled={isPending}
              onClick={() => setRangeMenuOpen((open) => !open)}
              ref={rangeTriggerRef}
              type="button"
            >
              <CalendarDays size={16} aria-hidden="true" />
              {selectedRange}
              {isPending
                ? <LoaderCircle aria-hidden="true" className="button-spinner" size={14} />
                : <ChevronDown size={14} aria-hidden="true" />}
            </button>
            {rangeMenuOpen ? (
              <div
                aria-label="Select date range"
                className="range-menu"
                id="overview-range-options"
                onKeyDown={handleRangeMenuKeyDown}
                ref={rangeMenuRef}
                role="listbox"
                tabIndex={-1}
              >
                {rangeOptions.map((option) => (
                  <button
                    aria-selected={range === option.value}
                    className={range === option.value ? "range-menu-active" : ""}
                    key={option.value}
                    onClick={() => {
                      setRangeMenuOpen(false);
                      rangeTriggerRef.current?.focus();
                      if (option.value !== range) {
                        restoreRangeFocusRef.current = true;
                        requestRange(option.value);
                      }
                    }}
                    role="option"
                    tabIndex={range === option.value ? 0 : -1}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {data?.canExport ? (
            <ExportCsvButton
              disabled={!data || isPending}
              endpoint={`/api/exports/revenue?startDate=${encodeURIComponent(data.startDate)}&endDate=${encodeURIComponent(data.endDate)}`}
            />
          ) : null}
        </div>
      </div>
      {loadError ? (
        <div className="list-inline-error" role="alert">
          <span>{loadError} Showing the last successfully loaded reporting period.</span>
          <Button onClick={() => requestRange(range)} size="small">Try again</Button>
        </div>
      ) : null}
      {!data ? (
        <OverviewLoading />
      ) : (
        <div aria-busy={isPending} className={isPending ? "overview-refreshing" : undefined}>
          <div className="kpi-grid">
            <Surface className="kpi-card">
              <div className="kpi-topline">
                <span className="kpi-label">Total revenue</span>
                <span className="kpi-icon kpi-icon-revenue"><CircleDollarSign size={17} /></span>
              </div>
              <div className="kpi-value">
                {formatCurrency(Number(data.overview.total_revenue), data.reportingCurrency)}
              </div>
              <div className="kpi-foot">{selectedRange} · qualifying orders</div>
            </Surface>
            <Surface className="kpi-card">
              <div className="kpi-topline">
                <span className="kpi-label">Total orders</span>
                <span className="kpi-icon kpi-icon-orders"><ShoppingBag size={17} /></span>
              </div>
              <div className="kpi-value">{data.overview.total_orders.toLocaleString("en-US")}</div>
              <div className="kpi-foot">{selectedRange}</div>
            </Surface>
            <Surface className="kpi-card">
              <div className="kpi-topline">
                <span className="kpi-label">Average order value</span>
                <span className="kpi-icon kpi-icon-average"><Package size={17} /></span>
              </div>
              <div className="kpi-value">
                {formatCurrency(Number(data.overview.average_order_value), data.reportingCurrency, 2)}
              </div>
              <div className="kpi-foot">{selectedRange} · qualifying orders</div>
            </Surface>
            <Surface className="kpi-card">
              <div className="kpi-topline">
                <span className="kpi-label">Active customers</span>
                <span className="kpi-icon kpi-icon-customers"><UsersRound size={17} /></span>
              </div>
              <div className="kpi-value">{data.overview.active_customers.toLocaleString("en-US")}</div>
              <div className="kpi-foot">
                {data.customerSummary.new_customers_in_range.toLocaleString("en-US")} new in {selectedRange.toLowerCase()}
              </div>
            </Surface>
          </div>

          <div className="overview-primary-grid">
            <Surface className="revenue-card">
              <div className="card-heading revenue-heading">
                <div>
                  <div className="card-title-row"><h2>Revenue over time</h2></div>
                  <p>Qualifying revenue by workspace reporting date</p>
                </div>
              </div>
              <div className="revenue-summary">
                <strong>
                  {formatCurrency(Number(data.overview.total_revenue), data.reportingCurrency)}
                </strong>
                <span className="summary-period">{selectedRange}</span>
              </div>
              {revenueChartData.some(
                (point) => point.qualifying_order_count > 0,
              ) ? (
                <>
                  <div className="chart-legend">
                    <span><i className="legend-dot legend-violet" />Revenue</span>
                  </div>
                  <div
                    aria-label={`Revenue trend for ${selectedRange}`}
                    className="revenue-chart"
                    role="img"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={revenueChartData}
                        margin={{ top: 14, right: 6, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.17} />
                            <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                        <XAxis
                          axisLine={false}
                          dataKey="report_date"
                          minTickGap={24}
                          tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                          tickFormatter={(value: string) => formatReportDate(value)}
                          tickLine={false}
                          tickMargin={12}
                        />
                        <YAxis
                          axisLine={false}
                          tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                          tickFormatter={(value: number) =>
                            value >= 1000
                              ? formatCompactCurrency(value, data.reportingCurrency)
                              : formatCurrency(value, data.reportingCurrency)
                          }
                          tickLine={false}
                          tickMargin={9}
                          width={58}
                        />
                        <Tooltip
                          content={<RevenueTooltip currency={data.reportingCurrency} />}
                          cursor={{ stroke: "var(--border-strong)", strokeDasharray: "4 4" }}
                        />
                        <Area
                          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                          dataKey="revenue"
                          fill="url(#revenueFill)"
                          stroke="var(--accent)"
                          strokeWidth={2.2}
                          type="monotone"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No revenue data"
                  description="Revenue trends will appear when there is activity in this period."
                />
              )}
              <div className="chart-caption">
                {data.reportingCurrency} · {data.reportingTimezone}
              </div>
            </Surface>

            <Surface className="activity-card">
              <div className="card-heading">
                <div>
                  <h2>Order activity</h2>
                  <p>Orders by status · {selectedRange}</p>
                </div>
              </div>
              <div className="activity-total">
                <strong>{data.overview.total_orders.toLocaleString("en-US")}</strong>
                <span>total orders</span>
              </div>
              {statusTotal > 0 ? (
                <>
                  <div aria-label="Order distribution by status" className="activity-bars">
                    {statusCounts.filter((item) => item.count > 0).map((item) => (
                      <span
                        className={`activity-bar activity-${item.color}`}
                        key={item.value}
                        style={{ width: `${(item.count / statusTotal) * 100}%` }}
                        title={`${item.label}: ${item.count}`}
                      />
                    ))}
                  </div>
                  <div className="activity-legend">
                    {statusCounts.filter((item) => item.count > 0).map((item) => (
                      <div className="activity-legend-row" key={item.value}>
                        <span className={`activity-legend-dot activity-${item.color}`} />
                        <span className="activity-legend-name">{item.label}</span>
                        <span className="activity-legend-value">{item.count.toLocaleString("en-US")}</span>
                        <span className="activity-legend-percent">
                          {Math.round((item.count / statusTotal) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No orders yet"
                  description="Orders will appear in this breakdown when they are created."
                />
              )}
              <Link className="card-footer-link" href="/orders">
                View all orders <ArrowUpRight size={14} />
              </Link>
            </Surface>
          </div>

          <div className="overview-secondary-grid">
            <Surface className="orders-card">
              <SectionHeading
                title="Recent orders"
                description={`Latest orders in ${selectedRange.toLowerCase()}`}
                action={<Link className="text-link" href="/orders">View all <ArrowUpRight size={14} /></Link>}
              />
              {data.recentOrders.length ? (
                <div className="table-scroll">
                  <table className="data-table orders-table">
                    <thead>
                      <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Customer</th>
                        <th scope="col">Date</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((order) => (
                        <tr key={order.order_id}>
                          <td>
                            <Link className="order-id-link" href="/orders">
                              #{order.order_id.slice(0, 8)}
                            </Link>
                          </td>
                          <td>
                            <div className="customer-cell">
                              <span className="customer-avatar">
                                {order.customer_id ? order.customer_id.slice(0, 2).toUpperCase() : "—"}
                              </span>
                              <span>
                                <strong>
                                  {order.customer_id
                                    ? `Customer ${order.customer_id.slice(0, 8)}`
                                    : "Unassigned"}
                                </strong>
                                <small>{order.customer_id ? "Workspace customer" : "No customer assigned"}</small>
                              </span>
                            </div>
                          </td>
                          <td className="table-date">{formatTimestamp(order.created_at, data.reportingTimezone)}</td>
                          <td className="table-amount">
                            {formatCurrency(Number(order.total), order.reporting_currency, 2)}
                          </td>
                          <td><StatusBadge status={order.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No orders yet"
                  description="New orders will show up here once they come in."
                />
              )}
            </Surface>

            <Surface className="products-card">
              <SectionHeading
                title="Top products"
                description={`Best performers · ${selectedRange.toLowerCase()}`}
                action={
                  <Link className="icon-button card-more-button" href="/products" aria-label="View all products">
                    <ArrowUpRight size={17} />
                  </Link>
                }
              />
              {data.topProducts.length ? (
                <div className="product-list">
                  {data.topProducts.map((product, index) => (
                    <Link className="product-row" href="/products" key={product.product_id}>
                      <span className={`product-rank product-rank-${index + 1}`}>{index + 1}</span>
                      <span className="product-main">
                        <span className="product-thumb product-thumb-violet">
                          <Package size={17} strokeWidth={1.7} />
                        </span>
                        <span className="product-info">
                          <strong>{product.product_name}</strong>
                          <small>{product.product_sku} · {product.units_sold.toLocaleString("en-US")} sold</small>
                        </span>
                      </span>
                      <span className="product-revenue">
                        {formatCurrency(Number(product.qualifying_revenue), data.reportingCurrency, 2)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No product sales"
                  description="Top products will appear when qualifying orders include products."
                />
              )}
              <div className="product-footnote">Based on qualifying orders in this reporting period</div>
            </Surface>
          </div>

          <div className="dashboard-bottom-note">
            <span>Metrics follow your workspace&apos;s analytics rules.</span>
            <span>
              Currency: {data.reportingCurrency}
              <span className="bottom-note-separator">·</span>
              Reporting period: {selectedRange.toLowerCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
