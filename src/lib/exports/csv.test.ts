import { describe, expect, it } from "vitest";
import { escapeCsvCell, formatCsv, formatExportDate, formatExportTimestamp } from "./csv";

describe("CSV formatting", () => {
  it("escapes quotes and delimiters and prefixes spreadsheet formula values", () => {
    expect(escapeCsvCell('A "quoted", value')).toBe('"A ""quoted"", value"');
    expect(escapeCsvCell(" =1+1")).toBe('"\' =1+1"');
    expect(formatCsv([["Header"], ["line one\nline two"]])).toBe(
      '\uFEFF"Header"\r\n"line one\nline two"\r\n',
    );
  });

  it("formats timestamps in the requested workspace timezone and date-only values consistently", () => {
    expect(formatExportTimestamp("2026-11-04T10:00:00.000Z", "America/Los_Angeles"))
      .toBe("2026-11-04 02:00:00");
    expect(formatExportDate("2026-11-04")).toBe("2026-11-04");
  });
});
