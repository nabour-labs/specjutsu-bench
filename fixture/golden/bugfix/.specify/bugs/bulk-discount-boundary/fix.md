# Bug Fix: Bulk discount skips lines of exactly 10 units

- **Slug**: bulk-discount-boundary
- **Fixed**: 2026-11-22
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`lineDiscount` now gives the bulk discount at 10 units or more, as documented, instead of only above 10.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/invoice.ts` | modified | `>` became `>=` in `lineDiscount` |
| `test/invoice.test.ts` | added tests | the boundary and one below it |

## Tests Added or Updated

- `test/invoice.test.ts` "gives a line of exactly the bulk quantity the discount" — fails with `>`, passes with `>=`.
- `test/invoice.test.ts` "gives a line one unit short of the bulk quantity no discount" — pins the lower side of the boundary.

## Local Verification

- Commands run: `npx vitest run test/invoice.test.ts` → failed before the fix (exactly-10 case), passes after.

## Deviations from Assessment

None.

## Follow-ups

None.
