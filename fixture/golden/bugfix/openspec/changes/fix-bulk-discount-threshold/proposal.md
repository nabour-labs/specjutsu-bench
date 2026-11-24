# Proposal

## Why

The bulk discount rule is 10 units or more, but `lineDiscount` compares with `>`, so a line
item of exactly 10 units gets no discount and the customer is overcharged.

## What Changes

- A line item of exactly the bulk quantity (10 units) gets the 5% bulk discount.
- A line item one unit short (9 units) still gets none.

## Capabilities

### New Capabilities
- `bulk-discount`: which line items get the bulk discount and how much it is.

### Modified Capabilities

## Impact

- `src/invoice.ts`: `lineDiscount` compares with `>=`.
- Two new cases in `test/invoice.test.ts`. No API change.
