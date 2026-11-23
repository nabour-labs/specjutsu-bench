## Why

Invoices say when they were issued but not when they must be paid, so a customer can't tell
from an invoice when payment is due. Invoices need payment terms and a way to work out the
due date from them.

## What Changes

- An invoice can carry payment terms: due on receipt, net 15 or net 30.
- A new `dueDate` function works out the date an invoice is due from its issue date and terms.
- `createInvoice` rejects payment terms it doesn't know.

## Capabilities

### New Capabilities

- `payment-terms`: payment terms on an invoice and its due date.

### Modified Capabilities

None.

## Impact

- `src/terms.ts` (new): the terms, `isPaymentTerms` and `dueDate`.
- `src/invoice.ts`: an optional `terms` field on `Invoice`, checked by `createInvoice`.
- `src/index.ts`: exports the new names. No new dependencies.
