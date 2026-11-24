# Proposal

## Why

Invoices say when they were issued but not when they must be paid. Customers on credit get
net 15 or net 30 terms, and callers have to work out the due date by hand.

## What Changes

- An invoice can carry payment terms: due on receipt, net 15 or net 30. An invoice without
  terms is due on receipt.
- `createInvoice` rejects unknown payment terms.
- A new `dueDate` function returns the date an invoice is due, as YYYY-MM-DD.

## Capabilities

### New Capabilities
- `payment-terms`: the payment terms an invoice may carry and the due date they give.

### Modified Capabilities

## Impact

- `src/invoice.ts`: optional `terms` field on `Invoice`, validated by `createInvoice`.
- New `src/terms.ts` with the terms and `dueDate`, exported from `src/index.ts`.
- New tests in `test/terms.test.ts`. No new dependencies.
