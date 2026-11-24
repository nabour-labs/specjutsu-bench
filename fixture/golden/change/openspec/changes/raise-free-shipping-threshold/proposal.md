# Proposal

## Why

Free shipping from $50.00 costs more than it earns. The threshold rises to $100.00 of
discounted subtotal.

## What Changes

- Shipping is free when the discounted subtotal is $100.00 or more, and $7.99 below that.
- An order of $50.00 to $99.99 now pays shipping. **BREAKING** for callers relying on the old
  threshold.
- The README's pricing rules state the new threshold.

## Capabilities

### New Capabilities
- `shipping`: the shipping fee and when shipping is free.

### Modified Capabilities

## Impact

- `src/invoice.ts`: `FREE_SHIPPING_FROM` becomes 10000 cents.
- `test/invoice.test.ts`: threshold cases move to $100.00; one totals case now pays shipping.
- `README.md`: pricing rules.
