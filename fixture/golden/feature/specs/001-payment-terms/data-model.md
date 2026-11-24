# Data Model: Invoice Payment Terms

## PaymentTerms

| Value | Days after issue |
|-------|------------------|
| `due-on-receipt` | 0 |
| `net-15` | 15 |
| `net-30` | 30 |

- Source: `src/terms.ts`, `PAYMENT_TERMS`.
- Validation: any other value is refused by `createInvoice` (FR-004).

## Invoice (changed)

| Field | Type | Rule |
|-------|------|------|
| `terms` | `PaymentTerms`, optional | Absent means due on receipt (FR-003). |

- Source: `src/invoice.ts`, `Invoice`.
- `issuedOn` (existing, YYYY-MM-DD) is the start of the payment period.
