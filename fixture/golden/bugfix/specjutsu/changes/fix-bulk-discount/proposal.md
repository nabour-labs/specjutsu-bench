## Why

The bulk discount skips line items of exactly 10 units. The rule is 10 units or more, so a
customer who orders exactly 10 of something is overcharged.

Kind: bug

## Current Behaviour

- A line of 10 units at $5.00 gets no discount.

## Expected Behaviour

- A line of 10 units at $5.00 gets the 5% bulk discount, $2.50.

## Unchanged Behaviour

- A line of 9 units at $5.00 still gets no discount.

## Impact

- `lineDiscount` in `src/invoice.ts`. No API or dependency changes.
