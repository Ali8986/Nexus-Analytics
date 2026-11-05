import { NextResponse } from "next/server";
import { AppError, publicErrorMessage } from "@/lib/errors/app-error";
import { formatCsv, formatExportDate, formatExportTimestamp } from "@/lib/exports/csv";
import {
  getRevenueTrend,
} from "@/lib/services/analytics";
import { listCustomers } from "@/lib/services/customers";
import { listOrders } from "@/lib/services/orders";
import { listProducts } from "@/lib/services/products";
import type {
  CustomerRecord,
  OrderListRecord,
  ProductRecord,
  RevenueTrendPoint,
} from "@/lib/services/types";
import { requiredDateRangeSchema } from "@/lib/validation/schemas";
import { resolveWorkspaceContext } from "@/lib/workspaces/context";
import { getSelectedWorkspaceId } from "@/lib/workspaces/selection";

const maxPageOffset = 10_000;
const pageSize = 100;

async function loadAllPages<T>(
  loadPage: (offset: number, limit: number) => Promise<T[]>,
): Promise<{ rows: T[]; mayBeTruncated: boolean }> {
  const rows: T[] = [];
  for (let offset = 0; offset <= maxPageOffset; offset += pageSize) {
    const page = await loadPage(offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return { rows, mayBeTruncated: false };
    if (offset === maxPageOffset) return { rows, mayBeTruncated: true };
  }
  return { rows, mayBeTruncated: false };
}

function createCsvResponse(csv: string, filename: string, mayBeTruncated = false): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...(mayBeTruncated
        ? { "X-Export-Notice": "This export reached the 10,100-row service limit and may be incomplete." }
        : {}),
    },
  });
}

function createErrorResponse(error: unknown): Response {
  const status =
    error instanceof AppError
      ? error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "FORBIDDEN"
          ? 403
          : error.code === "INVALID_INPUT"
            ? 400
            : 500
      : 500;
  const message =
    error instanceof AppError
      ? publicErrorMessage(error)
      : "The export could not be generated. Please try again.";
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function todayInTimezone(timezone: string): string {
  return formatExportTimestamp(new Date().toISOString(), timezone).slice(0, 10);
}

function customerCsv(customers: CustomerRecord[], timezone: string): string {
  return formatCsv([
    [
      "Customer ID",
      "Name",
      "Company",
      "Email",
      "Phone",
      "Address line 1",
      "Address line 2",
      "City",
      "Region",
      "Postal code",
      "Country code",
      "Created at",
      "Archived at",
    ],
    ...customers.map((customer) => [
      customer.id,
      customer.name,
      customer.company_name,
      customer.email,
      customer.phone,
      customer.address_line_1,
      customer.address_line_2,
      customer.city,
      customer.region,
      customer.postal_code,
      customer.country_code,
      formatExportTimestamp(customer.created_at, timezone),
      formatExportTimestamp(customer.archived_at, timezone),
    ]),
  ]);
}

function productCsv(products: ProductRecord[], currency: string, timezone: string): string {
  return formatCsv([
    ["Product ID", "Name", "SKU", "Description", "Unit price", "Currency", "Created at", "Archived at"],
    ...products.map((product) => [
      product.id,
      product.name,
      product.sku,
      product.description,
      product.unit_price,
      currency,
      formatExportTimestamp(product.created_at, timezone),
      formatExportTimestamp(product.archived_at, timezone),
    ]),
  ]);
}

function orderCsv(orders: OrderListRecord[], timezone: string): string {
  return formatCsv([
    ["Order ID", "Customer ID", "Customer", "Status", "Created at", "Currency", "Subtotal", "Total", "Item count"],
    ...orders.map((order) => [
      order.id,
      order.customer_id,
      order.customer_name,
      order.status,
      formatExportTimestamp(order.created_at, timezone),
      order.currency_code,
      order.subtotal,
      order.total,
      order.item_count,
    ]),
  ]);
}

function revenueCsv(points: RevenueTrendPoint[], defaultCurrency: string): string {
  return formatCsv([
    ["Report date", "Reporting currency", "Revenue", "Qualifying orders"],
    ...points.map((point) => [
      formatExportDate(point.report_date),
      point.reporting_currency || defaultCurrency,
      point.revenue,
      point.qualifying_order_count,
    ]),
  ]);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ type: string }> },
): Promise<Response> {
  try {
    const { type } = await context.params;
    if (!["customers", "products", "orders", "revenue"].includes(type)) {
      return NextResponse.json({ error: "Choose a supported export." }, { status: 404 });
    }

    const selectedWorkspaceId = await getSelectedWorkspaceId();
    if (!selectedWorkspaceId) throw new AppError("FORBIDDEN");
    const workspace = await resolveWorkspaceContext(selectedWorkspaceId);
    if (!["owner", "admin", "analyst"].includes(workspace.role)) {
      throw new AppError("FORBIDDEN");
    }

    const today = todayInTimezone(workspace.reportingTimezone);
    if (type === "customers") {
      const result = await loadAllPages((offset, limit) =>
        listCustomers(workspace.id, { offset, limit, includeArchived: true }),
      );
      return createCsvResponse(
        customerCsv(result.rows, workspace.reportingTimezone),
        `nexus-customers-${today}.csv`,
        result.mayBeTruncated,
      );
    }

    if (type === "products") {
      const result = await loadAllPages((offset, limit) =>
        listProducts(workspace.id, { offset, limit, includeArchived: true }),
      );
      return createCsvResponse(
        productCsv(result.rows, workspace.reportingCurrency, workspace.reportingTimezone),
        `nexus-products-${today}.csv`,
        result.mayBeTruncated,
      );
    }

    if (type === "orders") {
      const result = await loadAllPages((offset, limit) =>
        listOrders(workspace.id, { offset, limit }),
      );
      return createCsvResponse(
        orderCsv(result.rows, workspace.reportingTimezone),
        `nexus-orders-${today}.csv`,
        result.mayBeTruncated,
      );
    }

    const url = new URL(request.url);
    const parsedRange = requiredDateRangeSchema.safeParse({
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    });
    if (!parsedRange.success) {
      throw new AppError("INVALID_INPUT", parsedRange.error);
    }
    const points = await getRevenueTrend(workspace.id, parsedRange.data);
    return createCsvResponse(
      revenueCsv(points, workspace.reportingCurrency),
      `nexus-revenue-${parsedRange.data.startDate}-to-${parsedRange.data.endDate}.csv`,
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}
