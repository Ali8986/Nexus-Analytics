import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableSkeleton } from "@/components/ui";

describe("table loading state", () => {
  it("uses accessible skeleton rows that preserve the table headings", () => {
    const markup = renderToStaticMarkup(
      <TableSkeleton headers={["Order", "Customer", "Status"]} label="orders" rows={3} />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading orders");
    expect(markup).toContain("<th scope=\"col\">Order</th>");
    expect(markup).toContain("<th scope=\"col\">Customer</th>");
    expect((markup.match(/class="skeleton table-skeleton-line/g) ?? []).length).toBe(9);
  });
});
