import type { Invoice } from "./invoice.ts";

/** How long a customer has to pay, counted in calendar days from the issue date. */
export const PAYMENT_TERMS = { "due-on-receipt": 0, "net-15": 15, "net-30": 30 } as const;

export type PaymentTerms = keyof typeof PAYMENT_TERMS;

export function isPaymentTerms(value: string): value is PaymentTerms {
  return Object.hasOwn(PAYMENT_TERMS, value);
}

/** The date an invoice is due, YYYY-MM-DD. An invoice without terms is due on receipt. */
export function dueDate(invoice: Invoice): string {
  const days = PAYMENT_TERMS[invoice.terms ?? "due-on-receipt"];
  const due = new Date(`${invoice.issuedOn}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}
