# Contract: payment terms API

Exported from `src/index.ts`:

```ts
export const PAYMENT_TERMS: { "due-on-receipt": 0; "net-15": 15; "net-30": 30 };
export type PaymentTerms = keyof typeof PAYMENT_TERMS;
export function isPaymentTerms(value: string): value is PaymentTerms;
export function dueDate(invoice: Invoice): string; // YYYY-MM-DD
```

- `Invoice` gains `terms?: PaymentTerms`.
- `createInvoice` throws `InvoiceError("invoice <id>: unknown payment terms <terms>")` for any other `terms` value.
- No existing export changes.
