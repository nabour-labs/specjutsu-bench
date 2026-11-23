## Context

An `Invoice` has an issue date (`issuedOn`, YYYY-MM-DD) and no payment terms. Amounts are
integer cents and every rule lives in `src/invoice.ts`.

## Goals / Non-Goals

**Goals:**

- Three payment terms, due on receipt, net 15 and net 30, and a due date worked out from them.

**Non-Goals:**

- Business days, holidays or terms other than these three.
- Late fees or overdue checks.

## Decisions

- **Terms are a map from name to days** (`PAYMENT_TERMS` in `src/terms.ts`), so adding a term
  is one line and the names are a type. Rejected: a separate function per term.
- **`terms` is optional on `Invoice`, and no terms means due on receipt**, so existing invoices
  keep working unchanged. Rejected: a required field, which breaks every caller.
- **Days are added in UTC**, so the due date never shifts with the machine's time zone.
  Rejected: local dates, which move across daylight-saving changes.

## Risks / Trade-offs

- [Callers passing terms from untyped data] → `createInvoice` rejects unknown terms with an
  `InvoiceError`.
