# tiny-invoice

A small invoice library. Amounts are integer cents throughout.

- `createInvoice` validates and builds an invoice from line items.
- `totals` works out the subtotal, bulk discount, shipping, tax and total.
- `renderInvoice` prints an invoice as plain text.

## Pricing rules

- **Bulk discount:** a line item of 10 units or more gets 5% off that line.
- **Shipping:** $7.99, free when the discounted subtotal is $50.00 or more.
- **Tax:** the invoice's tax rate applies to the discounted subtotal plus shipping.

## Tests

```sh
npm test
```
