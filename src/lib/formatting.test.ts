import { describe, expect, it } from "vitest";
import { formatCurrency } from "./formatting";

describe("formatCurrency", () => {
  it("formats dollar amounts without fractional digits", () => {
    expect(formatCurrency(48294)).toBe("$48,294");
  });
 
  it("rounds fractional amounts to the nearest dollar", () => {
    expect(formatCurrency(33.82)).toBe("$34");
  });

  it("formats zero safely", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats amounts in the workspace currency with fractional precision", () => {
    expect(formatCurrency(33.82, "EUR", 2)).toBe("€33.82");
  });
});
