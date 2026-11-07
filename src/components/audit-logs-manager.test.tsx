import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogItem } from "@/lib/services/audit-logs";

const mocks = vi.hoisted(() => ({ loadAuditLogs: vi.fn() }));
vi.mock("@/app/actions/audit-logs", () => mocks);

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLDialogElement: { configurable: true, value: dom.window.HTMLDialogElement },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});

const orderEvent: AuditLogItem = {
  id: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
  actorUserId: "e8db3392-ccda-46cc-9a15-faf902420f87",
  action: "status_changed",
  entityType: "order",
  entityId: "4362607d-5b58-4c85-8f20-8c008a18c58c",
  resourceName: null,
  metadata: { from_status: "processing", to_status: "completed" },
  createdAt: "2026-11-04T12:00:00.000Z",
};

describe("audit log experience", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    dom.window.HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
  });

  it("renders a clear empty state and useful error state", async () => {
    const { AuditLogsManager } = await import("@/components/audit-logs-manager");
    const shared = {
      initialEvents: [],
      initialHasMore: false,
      reportingTimezone: "UTC",
      workspaceName: "Nexus Test Workspace",
    };
    const emptyHtml = renderToStaticMarkup(
      createElement(AuditLogsManager, { ...shared, initialError: "" }),
    );
    expect(emptyHtml).toContain("No audit events yet");
    expect(emptyHtml).toContain("append-only activity history");

    const errorHtml = renderToStaticMarkup(
      createElement(AuditLogsManager, {
        ...shared,
        initialError: "The request could not be completed. Please try again.",
      }),
    );
    expect(errorHtml).toContain("Audit logs couldn’t be loaded");
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).not.toContain("No audit events yet");
  });

  it("keeps resource identifiers out of the table and exposes them in accessible event details", async () => {
    const { AuditLogsManager } = await import("@/components/audit-logs-manager");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(AuditLogsManager, {
        initialError: "",
        initialEvents: [orderEvent],
        initialHasMore: false,
        reportingTimezone: "UTC",
        workspaceName: "Nexus Test Workspace",
      }));
    });

    expect(container.textContent).toContain("Order status changed");
    expect(container.textContent).toContain("Workspace member");
    const table = container.querySelector("table.audit-table");
    expect(table?.textContent).toContain("Order");
    expect(table?.textContent).not.toContain("4362607D");
    expect(table?.textContent).not.toContain(orderEvent.entityId);
    expect(container.textContent).not.toContain(orderEvent.id);
    expect(container.textContent).not.toContain(orderEvent.actorUserId);
    expect(container.textContent).not.toContain(orderEvent.entityId);
    expect(container.querySelector('[role="region"][aria-label="Audit events table"]')).not.toBeNull();

    const detailsButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("View details"));
    expect(detailsButton).toBeDefined();
    expect(detailsButton?.getAttribute("aria-label")).toBe("View Order status changed details");
    await act(async () => detailsButton?.click());

    const dialog = container.querySelector<HTMLDialogElement>(".audit-detail-dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain("Previous Status");
    expect(dialog?.textContent).toContain("Processing");
    expect(dialog?.textContent).toContain("Current Status");
    expect(dialog?.textContent).toContain("Completed");
    expect(dialog?.textContent).not.toContain(orderEvent.id);
    expect(dialog?.textContent).not.toContain(orderEvent.actorUserId);
    expect(dialog?.textContent).not.toContain(orderEvent.entityId);
    expect(dialog?.textContent).not.toContain("from_status");
    expect(dialog?.textContent).not.toContain("to_status");
    expect(dialog?.textContent).not.toContain("Technical references");
    expect(dialog?.textContent).not.toContain("Recorded metadata");
    expect(dialog?.querySelector('[aria-label="Previous Status: Processing"]')).not.toBeNull();
    expect(dialog?.querySelector('[aria-label="Current Status: Completed"]')).not.toBeNull();
    const statusItems = dialog?.querySelectorAll(".audit-status-change");
    expect(statusItems).toHaveLength(2);
    expect(statusItems?.[0]?.querySelector(".audit-status-label")?.textContent).toBe("Previous Status");
    expect(statusItems?.[0]?.querySelector(".audit-status-chip")?.textContent).toBe("Processing");
    expect(statusItems?.[0]?.querySelector(".audit-status-chip")?.classList.contains("audit-status-processing")).toBe(true);
    expect(statusItems?.[1]?.querySelector(".audit-status-label")?.textContent).toBe("Current Status");
    expect(statusItems?.[1]?.querySelector(".audit-status-chip")?.textContent).toBe("Completed");
    expect(statusItems?.[1]?.querySelector(".audit-status-chip")?.classList.contains("audit-status-completed")).toBe(true);
    expect(dialog?.querySelector("pre")).toBeNull();
  });

  it("uses the matching presentation class for all order statuses", async () => {
    const { AuditLogsManager } = await import("@/components/audit-logs-manager");
    const pendingToCancelledEvent: AuditLogItem = {
      ...orderEvent,
      id: "c12412f9-d7f5-4e8d-a5a2-f1bdbb804740",
      entityId: "b12412f9-d7f5-4e8d-a5a2-f1bdbb804741",
      metadata: { from_status: "pending", to_status: "cancelled" },
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(AuditLogsManager, {
        initialError: "",
        initialEvents: [orderEvent, pendingToCancelledEvent],
        initialHasMore: false,
        reportingTimezone: "UTC",
        workspaceName: "Nexus Test Workspace",
      }));
    });

    const detailsButtons = [...container.querySelectorAll("button")]
      .filter((button) => button.textContent?.includes("View details"));
    await act(async () => detailsButtons[0]?.click());
    const dialog = container.querySelector<HTMLDialogElement>(".audit-detail-dialog");
    expect(dialog?.querySelector(".audit-status-pending")).toBeNull();
    expect(dialog?.querySelector(".audit-status-processing")?.textContent).toBe("Processing");
    expect(dialog?.querySelector(".audit-status-completed")?.textContent).toBe("Completed");

    const closeButton = [...(dialog?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent?.includes("Close"));
    await act(async () => closeButton?.click());
    await act(async () => detailsButtons[1]?.click());

    expect(dialog?.querySelector(".audit-status-pending")?.textContent).toBe("Pending");
    expect(dialog?.querySelector(".audit-status-cancelled")?.textContent).toBe("Cancelled");
    expect(dialog?.querySelector(".audit-status-processing")).toBeNull();
    expect(dialog?.querySelector(".audit-status-completed")).toBeNull();
  });

  it("shows a resolved resource name and omits the change section when metadata is empty", async () => {
    const { AuditLogsManager } = await import("@/components/audit-logs-manager");
    const customerEvent: AuditLogItem = {
      ...orderEvent,
      action: "created",
      entityType: "customer",
      entityId: "a12412f9-d7f5-4e8d-a5a2-f1bdbb804739",
      resourceName: "Avery Smith",
      metadata: {},
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(AuditLogsManager, {
        initialError: "",
        initialEvents: [customerEvent],
        initialHasMore: false,
        reportingTimezone: "UTC",
        workspaceName: "Nexus Test Workspace",
      }));
    });

    const detailsButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("View details"));
    await act(async () => detailsButton?.click());

    const dialog = container.querySelector<HTMLDialogElement>(".audit-detail-dialog");
    expect(dialog?.textContent).toContain("Customer · Avery Smith");
    expect(dialog?.textContent).not.toContain(customerEvent.id);
    expect(dialog?.textContent).not.toContain(customerEvent.entityId);
    expect(dialog?.querySelector('[aria-label="Recorded changes"]')).toBeNull();
    expect(dialog?.textContent).not.toContain("Changes");
  });
});
