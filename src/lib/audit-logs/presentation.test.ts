import { describe, expect, it } from "vitest";
import {
  formatAuditTimestamp,
  sanitizeAuditMetadata,
} from "@/lib/audit-logs/presentation";

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
});
