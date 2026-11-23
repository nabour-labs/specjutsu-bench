import { describe, expect, it } from "vitest";
import { type Invoice, InvoiceError, type LineItem, createInvoice, lineDiscount, lineGross, totals } from "../src/invoice.ts";

function item(quantity: number, unitPrice: number, sku = "W-1"): LineItem {
  return { sku, description: `Item ${sku}`, unitPrice, quantity };
}

function invoice(items: LineItem[], taxRate = 0): Invoice {
  return createInvoice({ id: "INV-1", customer: "Acme Ltd", issuedOn: "2026-03-01", items, taxRate });
}

describe("createInvoice", () => {
  it("rejects an invoice with no line items", () => {
    expect(() => invoice([])).toThrow(new InvoiceError("invoice INV-1: no line items"));
  });

  it("rejects an issue date that is not YYYY-MM-DD", () => {
    expect(() =>
      createInvoice({ id: "INV-2", customer: "Acme Ltd", issuedOn: "1 March 2026", items: [item(1, 100)], taxRate: 0 }),
    ).toThrow("issuedOn must be YYYY-MM-DD");
  });

  it("rejects a zero or fractional quantity", () => {
    expect(() => invoice([item(0, 100)])).toThrow("W-1: quantity must be a positive whole number");
    expect(() => invoice([item(1.5, 100)])).toThrow("W-1: quantity must be a positive whole number");
  });

  it("rejects a negative unit price", () => {
    expect(() => invoice([item(1, -1)])).toThrow("W-1: unit price must be whole cents, not negative");
  });

  it("copies the line items", () => {
    const items = [item(1, 100)];
    const created = invoice(items);
    items[0].quantity = 99;
    expect(created.items[0].quantity).toBe(1);
  });
});

describe("line items", () => {
  it("prices a line as unit price times quantity", () => {
    expect(lineGross(item(3, 250))).toBe(750);
  });

  it("gives a large line the bulk discount", () => {
    expect(lineDiscount(item(12, 500))).toBe(300);
  });

  it("gives a small line no discount", () => {
    expect(lineDiscount(item(3, 500))).toBe(0);
  });
});

describe("totals", () => {
  it("adds discount, shipping and tax up to the total", () => {
    const t = totals(invoice([item(12, 500, "W-1"), item(2, 1250, "G-1")], 8));
    expect(t).toEqual({ subtotal: 8500, discount: 300, shipping: 799, tax: 720, total: 9719 });
  });

  it("charges shipping below the free-shipping threshold and taxes it", () => {
    const t = totals(invoice([item(1, 2000)], 10));
    expect(t).toEqual({ subtotal: 2000, discount: 0, shipping: 799, tax: 280, total: 3079 });
  });

  // spec: SHIP-002
  it("ships free at exactly the threshold", () => {
    expect(totals(invoice([item(4, 2500)])).shipping).toBe(0);
  });

  // spec: SHIP-001
  it("charges shipping one cent below the threshold", () => {
    expect(totals(invoice([item(1, 9999)])).shipping).toBe(799);
  });

  // spec: SHIP-001
  it("charges shipping at the old $50.00 threshold", () => {
    expect(totals(invoice([item(2, 2500)])).shipping).toBe(799);
  });

  // spec: SHIP-003
  it("measures the threshold after the bulk discount", () => {
    // 12 x $8.50 is $102.00, which the 5% bulk discount takes to $96.90.
    expect(totals(invoice([item(12, 850)])).shipping).toBe(799);
  });
});
