import { describe, expect, it } from "vitest";
import { renderInvoice } from "../src/format.ts";
import { createInvoice } from "../src/invoice.ts";

describe("renderInvoice", () => {
  it("renders lines, discounts and totals as fixed-width text", () => {
    const invoice = createInvoice({
      id: "INV-7",
      customer: "Acme Ltd",
      issuedOn: "2026-03-01",
      taxRate: 5,
      items: [
        { sku: "W-1", description: "Widget", unitPrice: 1000, quantity: 12 },
        { sku: "G-1", description: "Gadget", unitPrice: 450, quantity: 2 },
      ],
    });
    expect(renderInvoice(invoice)).toBe(
      [
        "Invoice INV-7",
        "Customer: Acme Ltd",
        "Issued: 2026-03-01",
        "",
        "12 x Widget                              $120.00",
        "  bulk discount                           -$6.00",
        "2 x Gadget                                 $9.00",
        "------------------------------------------------",
        "Subtotal                                 $129.00",
        "Discount                                  -$6.00",
        "Shipping                                    free",
        "Tax (5%)                                   $6.15",
        "Total                                    $129.15",
        "",
      ].join("\n"),
    );
  });
});
