import { describe, expect, it } from "vitest";
import {
  auditActionKey,
  describeAuditEvent,
  filterAuditEvents,
  formatAuditTimestamp,
  presentAuditMetadata,
  sanitizeAuditMetadata,
} from "@/lib/audit-logs/presentation";
import type { AuditEventForPresentation } from "@/lib/audit-logs/presentation";

describe("audit log presentation helpers", () => {
  it("removes sensitive metadata keys recursively and retains safe values", () => {
    expect(
      sanitizeAuditMetadata({
        status: "updated",
        email_address: "private@example.test",
        nested: {
          recordId: "abc",
          access_token: "do-not-show",
        },
        entries: [{ note: "safe", password: "do-not-show" }],
      }),
    ).toEqual({
      status: "updated",
      nested: { recordId: "abc" },
      entries: [{ note: "safe" }],
    });
  });

  it("formats timestamps using the supplied workspace timezone", () => {
    expect(
      formatAuditTimestamp("2026-11-04T12:00:00.000Z", "America/Los_Angeles"),
    ).toBe("Nov 4, 2026, 4:00 AM");
  });

  it("returns an empty object for non-object metadata", () => {
    expect(sanitizeAuditMetadata(["unexpected"])).toEqual({});
    expect(sanitizeAuditMetadata(null)).toEqual({});
  });

  it("maps recorded order and archive events to accurate readable labels", () => {
    const statusChange = describeAuditEvent({
      action: "status_changed",
      entityType: "order",
      entityId: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
      actorUserId: "e8db3392-ccda-46cc-9a15-faf902420f87",
      metadata: { from_status: "processing", to_status: "completed" },
      createdAt: "2026-11-04T12:00:00.000Z",
    });
    expect(statusChange).toEqual({
      actionLabel: "Order status changed",
      resourceTypeLabel: "Order",
      resourceLabel: "Order",
      detail: "Status changed from Processing to Completed.",
      knownAction: true,
    });
    expect(describeAuditEvent({
      action: "deleted",
      entityType: "product",
      entityId: "4362607d-5b58-4c85-8f20-8c008a18c58c",
      resourceName: "Daybreak Coffee (COF-001)",
      actorUserId: null,
      metadata: {},
      createdAt: "2026-11-04T12:00:00.000Z",
    })).toMatchObject({
      actionLabel: "Product archived",
      resourceTypeLabel: "Product",
      resourceLabel: "Product · Daybreak Coffee (COF-001)",
    });
  });

  it("presents known order and membership changes with human-readable labels", () => {
    expect(presentAuditMetadata({
      action: "status_changed",
      entityType: "order",
      metadata: { from_status: "processing", to_status: "completed" },
    })).toEqual([
      { label: "Previous Status", value: "Processing", kind: "status" },
      { label: "Current Status", value: "Completed", kind: "status" },
    ]);

    expect(presentAuditMetadata({
      action: "role_changed",
      entityType: "membership",
      metadata: { from_role: "analyst", to_role: "admin", user_id: "private-id" },
    })).toEqual([
      { label: "Previous Role", value: "Analyst", kind: "text" },
      { label: "Current Role", value: "Admin", kind: "text" },
    ]);

    expect(presentAuditMetadata({
      action: "created",
      entityType: "invitation",
      metadata: { role: "viewer", invited_email: "private@example.test" },
    })).toEqual([{ label: "Role", value: "Viewer", kind: "text" }]);
  });

  it("shows only recognized workspace fields and omits unknown or missing metadata", () => {
    expect(presentAuditMetadata({
      action: "updated",
      entityType: "workspace",
      metadata: { changed_fields: ["name", "reporting_timezone", "created_by", "unknown"] },
    })).toEqual([{
      label: "Updated",
      value: "Workspace name, Reporting time zone",
      kind: "text",
    }]);
    expect(presentAuditMetadata({
      action: "status_changed",
      entityType: "order",
      metadata: { to_status: "completed", from_status: "unexpected", resource_id: "secret-id" },
    })).toEqual([{ label: "Current Status", value: "Completed", kind: "status" }]);
    expect(presentAuditMetadata({
      action: "status_changed",
      entityType: "order",
      metadata: { from_status: "not-a-status", to_status: "also-unknown" },
    })).toEqual([]);
    expect(presentAuditMetadata({
      action: "created",
      entityType: "customer",
      metadata: { customer_id: "secret-id", arbitrary: "private" },
    })).toEqual([]);
  });

  it("uses a neutral fallback for unsupported event values", () => {
    const unknown = {
      action: "signed_in",
      entityType: "session",
      entityId: null,
      actorUserId: null,
      metadata: {},
      createdAt: "2026-11-04T12:00:00.000Z",
    };
    expect(describeAuditEvent(unknown)).toMatchObject({
      actionLabel: "Workspace activity recorded",
      resourceLabel: "Workspace item",
      knownAction: false,
    });
    expect(auditActionKey(unknown)).toBe("signed_in:session");
  });

  it("filters loaded events by action, resource, actor, reference, and workspace-local date", () => {
    const events: AuditEventForPresentation[] = [
      {
        action: "status_changed",
        entityType: "order",
        entityId: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
        actorUserId: "e8db3392-ccda-46cc-9a15-faf902420f87",
        metadata: { from_status: "processing", to_status: "completed" },
        createdAt: "2026-11-05T01:00:00.000Z",
      },
      {
        action: "created",
        entityType: "customer",
        entityId: "4362607d-5b58-4c85-8f20-8c008a18c58c",
        resourceName: "Avery Smith",
        actorUserId: null,
        metadata: {},
        createdAt: "2026-11-05T18:00:00.000Z",
      },
    ];
    const filters = {
      query: "e8db3392",
      action: "status_changed:order",
      resourceType: "order",
      fromDate: "2026-11-04",
      toDate: "2026-11-04",
    };
    expect(filterAuditEvents(events, filters, "America/Los_Angeles")).toEqual([events[0]]);
    expect(filterAuditEvents(events, { ...filters, query: "no match" }, "UTC")).toEqual([]);
    expect(filterAuditEvents(events, {
      ...filters,
      query: "d12412f9-d7f5-4e8d-a5a2-f1bdbb804738",
    }, "America/Los_Angeles")).toEqual([events[0]]);
    expect(filterAuditEvents(events, {
      ...filters,
      query: "avery smith",
      action: "",
      resourceType: "",
      fromDate: "",
      toDate: "",
    }, "UTC")).toEqual([events[1]]);
  });
});
