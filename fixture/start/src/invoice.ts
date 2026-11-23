import { type Cents, percentOf } from "./money.ts";

export interface LineItem {
  sku: string;
  description: string;
  unitPrice: Cents;
  quantity: number;
}

export interface Invoice {
  id: string;
  customer: string;
  /** ISO date, YYYY-MM-DD. */
  issuedOn: string;
  items: LineItem[];
  /** Tax rate in per cent, e.g. 8.25. */
  taxRate: number;
}

export interface Totals {
  subtotal: Cents;
  discount: Cents;
  shipping: Cents;
  tax: Cents;
  total: Cents;
}

/** A line item of this many units or more gets the bulk discount. */
export const BULK_QUANTITY = 10;
export const BULK_DISCOUNT_PERCENT = 5;
export const SHIPPING_FEE: Cents = 799;
/** Shipping is free when the discounted subtotal reaches this amount. */
export const FREE_SHIPPING_FROM: Cents = 5000;

export class InvoiceError extends Error {}

/** Builds an invoice, rejecting empty orders and malformed line items. */
export function createInvoice(invoice: Invoice): Invoice {
  if (invoice.items.length === 0) throw new InvoiceError(`invoice ${invoice.id}: no line items`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.issuedOn)) {
    throw new InvoiceError(`invoice ${invoice.id}: issuedOn must be YYYY-MM-DD, got ${invoice.issuedOn}`);
  }
  if (invoice.taxRate < 0) throw new InvoiceError(`invoice ${invoice.id}: negative tax rate`);
  for (const item of invoice.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new InvoiceError(`${item.sku}: quantity must be a positive whole number`);
    }
    if (!Number.isInteger(item.unitPrice) || item.unitPrice < 0) {
      throw new InvoiceError(`${item.sku}: unit price must be whole cents, not negative`);
    }
  }
  return { ...invoice, items: invoice.items.map((item) => ({ ...item })) };
}

/** The line's price before any discount. */
export function lineGross(item: LineItem): Cents {
  return item.unitPrice * item.quantity;
}

/** The bulk discount on one line, or 0 below the bulk quantity. */
export function lineDiscount(item: LineItem): Cents {
  return item.quantity > BULK_QUANTITY ? percentOf(lineGross(item), BULK_DISCOUNT_PERCENT) : 0;
}

export function totals(invoice: Invoice): Totals {
  const subtotal = invoice.items.reduce((sum, item) => sum + lineGross(item), 0);
  const discount = invoice.items.reduce((sum, item) => sum + lineDiscount(item), 0);
  const discounted = subtotal - discount;
  const shipping = discounted >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  const tax = percentOf(discounted + shipping, invoice.taxRate);
  return { subtotal, discount, shipping, tax, total: discounted + shipping + tax };
}
