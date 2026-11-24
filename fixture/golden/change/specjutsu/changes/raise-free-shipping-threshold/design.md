## Context

`totals` charges `SHIPPING_FEE` (799 cents) unless the discounted subtotal reaches
`FREE_SHIPPING_FROM`, which is 5000 cents.

## Goals / Non-Goals

**Goals:**

- Free shipping from $100.00 of discounted subtotal.

**Non-Goals:**

- Changing the shipping fee, or measuring the threshold before the discount.

## Decisions

- **Change the constant `FREE_SHIPPING_FROM` to 10000.** Rejected: making the threshold a
  per-invoice setting, which nothing asks for.

## Risks / Trade-offs

- [Orders from $50.00 to $99.99 now pay shipping] → The proposal marks this BREAKING and the
  README states the new rule.
