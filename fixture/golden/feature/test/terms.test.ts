import { describe, expect, it } from "vitest";
import { type Invoice, InvoiceError, createInvoice } from "../src/invoice.ts";
import { type PaymentTerms, dueDate } from "../src/terms.ts";

function invoice(issuedOn: string, terms?: PaymentTerms): Invoice {
  return createInvoice({
    id: "INV-9",
    customer: "Acme Ltd",
    issuedOn,
    items: [{ sku: "W-1", description: "Widget", unitPrice: 500, quantity: 1 }],
    taxRate: 0,
    terms,
  });
}

describe("dueDate", () => {
  // spec: TERMS-001
  it("is the issue date for an invoice due on receipt", () => {
    expect(dueDate(invoice("2026-03-01", "due-on-receipt"))).toBe("2026-03-01");
  });

  // spec: TERMS-002
  it("is the issue date for an invoice without terms", () => {
    expect(dueDate(invoice("2026-03-01"))).toBe("2026-03-01");
  });

  // spec: TERMS-003
  it("adds 15 days for net 15, across a leap day", () => {
    expect(dueDate(invoice("2028-02-15", "net-15"))).toBe("2028-03-01");
  });

  // spec: TERMS-004
  it("adds 30 days for net 30, across a month end", () => {
    expect(dueDate(invoice("2026-01-31", "net-30"))).toBe("2026-03-02");
  });

  // spec: TERMS-004
  it("adds 30 days for net 30, across a year end", () => {
    expect(dueDate(invoice("2026-12-15", "net-30"))).toBe("2027-01-14");
  });
});

describe("createInvoice with payment terms", () => {
  // spec: TERMS-005
  it("rejects unknown payment terms", () => {
    expect(() => invoice("2026-03-01", "net-60" as PaymentTerms)).toThrow(
      new InvoiceError("invoice INV-9: unknown payment terms net-60"),
    );
  });
});
