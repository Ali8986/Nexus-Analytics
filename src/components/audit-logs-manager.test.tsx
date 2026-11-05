import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuditLogsManager } from "@/components/audit-logs-manager";

vi.mock("@/app/actions/audit-logs", () => ({
  loadAuditLogs: vi.fn(),
}));

describe("audit log viewer states", () => {
  const sharedProps = {
    initialEvents: [],
    initialHasMore: false,
    reportingTimezone: "UTC",
    workspaceName: "Nexus Test Workspace",
  };

  it("renders a clear empty state", () => {
    const html = renderToStaticMarkup(
      <AuditLogsManager {...sharedProps} initialError="" />,
    );
    expect(html).toContain("No audit events yet");
    expect(html).toContain("append-only activity history");
  });

  it("renders the existing error state without pretending the list is empty", () => {
    const html = renderToStaticMarkup(
      <AuditLogsManager
        {...sharedProps}
        initialError="The request could not be completed. Please try again."
      />,
    );
    expect(html).toContain("Audit logs couldn’t be loaded");
    expect(html).toContain("role=\"alert\"");
    expect(html).not.toContain("No audit events yet");
  });
});
