import { type Invoice, lineDiscount, lineGross, totals } from "./invoice.ts";
import { formatCents } from "./money.ts";

const WIDTH = 48;

function row(label: string, amount: string): string {
  return label.padEnd(WIDTH - amount.length) + amount;
}

/** Renders an invoice as fixed-width plain text. */
export function renderInvoice(invoice: Invoice): string {
  const lines = [`Invoice ${invoice.id}`, `Customer: ${invoice.customer}`, `Issued: ${invoice.issuedOn}`, ""];
  for (const item of invoice.items) {
    lines.push(row(`${item.quantity} x ${item.description}`, formatCents(lineGross(item))));
    const discount = lineDiscount(item);
    if (discount > 0) lines.push(row("  bulk discount", formatCents(-discount)));
  }
  const t = totals(invoice);
  lines.push(
    "-".repeat(WIDTH),
    row("Subtotal", formatCents(t.subtotal)),
    ...(t.discount > 0 ? [row("Discount", formatCents(-t.discount))] : []),
    row("Shipping", t.shipping === 0 ? "free" : formatCents(t.shipping)),
    row(`Tax (${invoice.taxRate}%)`, formatCents(t.tax)),
    row("Total", formatCents(t.total)),
  );
  return lines.join("\n") + "\n";
}
