# Research: Raise the Free-Shipping Threshold

## Where the threshold lives

- **Decision**: Change `FREE_SHIPPING_FROM` in `src/invoice.ts` from 5000 to 10000 cents; `totals` already compares the discounted subtotal against it.
- **Rationale**: The threshold has one definition, so one constant changes and every caller follows.
- **Alternatives considered**: Making the threshold a parameter of `totals` (an API change the request does not ask for).

No open questions remain.
