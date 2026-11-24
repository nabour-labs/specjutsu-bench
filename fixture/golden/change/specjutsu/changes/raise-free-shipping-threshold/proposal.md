## Why

Free shipping starts at a discounted subtotal of $50.00. The threshold is to rise to $100.00,
so orders between $50.00 and $100.00 pay the $7.99 shipping fee again.

## What Changes

- **BREAKING** Shipping is free from a discounted subtotal of $100.00, up from $50.00. Orders
  from $50.00 to $99.99 are charged $7.99.
- The README's pricing rules state the new threshold.

## Capabilities

### New Capabilities

- `shipping`: when an invoice is charged shipping.

### Modified Capabilities

None.

## Impact

- `FREE_SHIPPING_FROM` in `src/invoice.ts`, the shipping tests and the README. No API or
  dependency changes.
