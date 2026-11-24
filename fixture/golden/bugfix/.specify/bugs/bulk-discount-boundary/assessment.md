# Bug Assessment: Bulk discount skips lines of exactly 10 units

- **Slug**: bulk-discount-boundary
- **Created**: 2026-11-22
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> Fix the bulk discount, which skips line items of exactly 10 units although the rule is 10 units or more.

## Symptom

A line item of exactly 10 units gets no bulk discount. Expected: 5% off that line, because the rule is 10 units or more (the report, and the comment on `BULK_QUANTITY`).

## Reproduction

1. Price a line of 10 units at $5.00 with `lineDiscount`.
2. Observe 0; expected 250 (5% of $50.00).
3. A line of 11 or more units is discounted, so only the boundary is wrong.

## Suspected Code Paths

- `src/invoice.ts:lineDiscount()` — compares `item.quantity > BULK_QUANTITY`; the rule needs `>=`.
- `src/invoice.ts:BULK_QUANTITY` — its comment says "this many units or more", matching the report, so the constant is right and the comparison is wrong.

## Root Cause Hypothesis

`lineDiscount` uses a strict comparison against `BULK_QUANTITY` (10), so the boundary quantity is excluded. Confidence: high.

## Proposed Remediation

**Preferred**: Change the comparison in `lineDiscount` to `item.quantity >= BULK_QUANTITY`.

**Files likely to change**:
- `src/invoice.ts`
- `test/invoice.test.ts`

**Tests to add or update**:
- A line of exactly 10 units gets the discount (250 on 10 x $5.00).
- A line of 9 units gets none.

## Risks & Considerations

- Invoices with 10-unit lines get a lower total than before; this is the documented rule.
- No API change.

## Open Questions

None.
