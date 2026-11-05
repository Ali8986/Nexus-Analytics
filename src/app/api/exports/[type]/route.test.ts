import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSelectedWorkspaceId: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  listCustomers: vi.fn(),
  listProducts: vi.fn(),
  listOrders: vi.fn(),
  getRevenueTrend: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/workspaces/selection", () => ({
  getSelectedWorkspaceId: mocks.getSelectedWorkspaceId,
}));
vi.mock("@/lib/workspaces/context", () => ({
  resolveWorkspaceContext: mocks.resolveWorkspaceContext,
}));
vi.mock("@/lib/services/customers", () => ({ listCustomers: mocks.listCustomers }));
vi.mock("@/lib/services/products", () => ({ listProducts: mocks.listProducts }));
vi.mock("@/lib/services/orders", () => ({ listOrders: mocks.listOrders }));
vi.mock("@/lib/services/analytics", () => ({ getRevenueTrend: mocks.getRevenueTrend }));

import { GET } from "@/app/api/exports/[type]/route";

const workspaceId = "e8db3392-ccda-46cc-9a15-faf902420f87";
const customer = {
  id: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
  workspace_id: workspaceId,
  name: '=HYPERLINK("https://example.test","open")',
  company_name: "Acme, Inc.",
  email: "customer@example.test",
  phone: null,
  address_line_1: '42 "Main" Street',
  address_line_2: null,
  city: "Seattle",
  region: "WA",
  postal_code: "98101",
  country_code: "US",
  created_at: "2026-11-04T10:00:00.000Z",
  updated_at: "2026-11-04T10:00:00.000Z",
  archived_at: null,
};

function request(path: string) {
  return new Request(`http://localhost/api/exports/${path}`);
}

function context(type: string) {
  return { params: Promise.resolve({ type }) };
}

describe("official CSV export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSelectedWorkspaceId.mockResolvedValue(workspaceId);
    mocks.resolveWorkspaceContext.mockResolvedValue({
      id: workspaceId,
      role: "owner",
      reportingCurrency: "USD",
      reportingTimezone: "America/Los_Angeles",
    });
    mocks.listCustomers.mockResolvedValue([customer]);
    mocks.listProducts.mockResolvedValue([]);
    mocks.listOrders.mockResolvedValue([]);
    mocks.getRevenueTrend.mockResolvedValue([]);
  });

  it.each(["owner", "admin", "analyst"] as const)(
    "allows %s to export authenticated workspace data",
    async (role) => {
      mocks.resolveWorkspaceContext.mockResolvedValue({
        id: workspaceId,
        role,
        reportingCurrency: "USD",
        reportingTimezone: "America/Los_Angeles",
      });

      const response = await GET(
        new Request("http://localhost/api/exports/customers?workspaceId=forged"),
        context("customers"),
      );

      expect(response.status).toBe(200);
      expect(mocks.resolveWorkspaceContext).toHaveBeenCalledWith(workspaceId);
      expect(mocks.listCustomers).toHaveBeenCalledWith(workspaceId, {
        offset: 0,
        limit: 100,
        includeArchived: true,
      });
      expect(response.headers.get("content-disposition")).toMatch(
        /^attachment; filename="nexus-customers-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
    },
  );

  it("denies Viewer server-side without loading export data", async () => {
    mocks.resolveWorkspaceContext.mockResolvedValue({
      id: workspaceId,
      role: "viewer",
      reportingCurrency: "USD",
      reportingTimezone: "UTC",
    });
    const response = await GET(request("orders"), context("orders"));

    expect(response.status).toBe(403);
    expect(mocks.listOrders).not.toHaveBeenCalled();
  });

  it("exports escaped customer values while excluding internal workspace and update metadata", async () => {
    const response = await GET(request("customers"), context("customers"));
    const csv = await response.text();

    expect(csv).toContain('"Customer ID","Name","Company"');
    expect(csv).toContain(`"'=HYPERLINK(""https://example.test"",""open"")"`);
    expect(csv).toContain('"Acme, Inc."');
    expect(csv).toContain('"42 ""Main"" Street"');
    expect(csv).toContain("2026-11-04 02:00:00");
    expect(csv).not.toContain("workspace_id");
    expect(csv).not.toContain("updated_at");
  });

  it("returns a valid header-only file for an empty dataset", async () => {
    mocks.listProducts.mockResolvedValue([]);
    const response = await GET(request("products"), context("products"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '"Product ID","Name","SKU","Description","Unit price","Currency"',
    );
    expect(mocks.listProducts).toHaveBeenCalledWith(workspaceId, {
      offset: 0,
      limit: 100,
      includeArchived: true,
    });
  });

  it("exports product and order business fields without internal workspace metadata", async () => {
    mocks.listProducts.mockResolvedValue([{
      id: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      workspace_id: workspaceId,
      name: "Lamp",
      sku: "LAMP-1",
      description: null,
      unit_price: "12.3400",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
      archived_at: null,
    }]);
    const productsResponse = await GET(request("products"), context("products"));
    const productsCsv = await productsResponse.text();
    expect(productsCsv).toContain('"Lamp","LAMP-1","","12.3400","USD"');
    expect(productsCsv).not.toContain("workspace_id");
    expect(productsCsv).not.toContain("updated_at");

    mocks.listOrders.mockResolvedValue([{
      id: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      workspace_id: workspaceId,
      customer_id: null,
      customer_name: null,
      status: "pending",
      currency_code: "USD",
      subtotal: "12.3400",
      total: "12.3400",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
      item_count: 1,
      idempotency_key: "private-internal-key",
    }]);
    const ordersResponse = await GET(request("orders"), context("orders"));
    const ordersCsv = await ordersResponse.text();
    expect(ordersCsv).toContain('"pending","2026-11-04 02:00:00","USD","12.3400","12.3400","1"');
    expect(ordersCsv).not.toContain("workspace_id");
    expect(ordersCsv).not.toContain("idempotency");
    expect(ordersCsv).not.toContain("private-internal-key");
  });

  it("validates the analytics range and calls the existing revenue query", async () => {
    mocks.getRevenueTrend.mockResolvedValue([{
      report_date: "2026-10-01",
      reporting_currency: "USD",
      revenue: "12.3400",
      qualifying_order_count: 2,
    }]);
    const response = await GET(
      request("revenue?startDate=2026-10-01&endDate=2026-10-31"),
      context("revenue"),
    );

    expect(response.status).toBe(200);
    expect(mocks.getRevenueTrend).toHaveBeenCalledWith(workspaceId, {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
    expect(response.headers.get("content-disposition")).toContain(
      "nexus-revenue-2026-10-01-to-2026-10-31.csv",
    );
    expect(await response.text()).toContain('"2026-10-01","USD","12.3400","2"');
  });

  it("rejects invalid analytics date ranges and unknown export types", async () => {
    const invalidRange = await GET(
      request("revenue?startDate=not-a-date&endDate=2026-10-01"),
      context("revenue"),
    );
    expect(invalidRange.status).toBe(400);
    expect(mocks.getRevenueTrend).not.toHaveBeenCalled();

    const reversedRange = await GET(
      request("revenue?startDate=2026-10-31&endDate=2026-10-01"),
      context("revenue"),
    );
    expect(reversedRange.status).toBe(400);
    expect(mocks.getRevenueTrend).not.toHaveBeenCalled();

    const unsupported = await GET(request("audit"), context("audit"));
    expect(unsupported.status).toBe(404);
  });

  it("paginates using bounded backend list services", async () => {
    mocks.listCustomers
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({
        ...customer,
        id: `d12412f9-d7f5-4e8d-a5a2-${String(index).padStart(12, "0")}`,
      })))
      .mockResolvedValueOnce([]);

    const response = await GET(request("customers"), context("customers"));
    const csv = await response.text();
    expect(mocks.listCustomers).toHaveBeenNthCalledWith(2, workspaceId, {
      offset: 100,
      limit: 100,
      includeArchived: true,
    });
    expect(csv.split("\r\n")).toHaveLength(102);
  });

  it("warns when an export reaches the existing service pagination boundary", async () => {
    mocks.listProducts.mockResolvedValue(Array.from({ length: 100 }, (_, index) => ({
      id: `d12412f9-d7f5-4e8d-a5a2-${String(index).padStart(12, "0")}`,
      workspace_id: workspaceId,
      name: "Product",
      sku: `SKU-${index}`,
      description: null,
      unit_price: "1.0000",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
      archived_at: null,
    })));

    const response = await GET(request("products"), context("products"));
    expect(mocks.listProducts).toHaveBeenCalledTimes(101);
    expect(response.headers.get("x-export-notice")).toContain("10,100-row service limit");
  }, 15_000);
});
