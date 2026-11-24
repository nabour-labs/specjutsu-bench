# Bug Verification: Bulk discount skips lines of exactly 10 units

- **Slug**: bulk-discount-boundary
- **Tested**: 2026-11-22
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

A 10-unit line now gets the 5% discount and a 9-unit line gets none; the rest of the suite still passes.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | `npx vitest run` (exactly-10 test) | pass | 10 x $5.00 gives 250 |
| New / updated tests | `npx vitest run` | pass | both boundary tests |
| Regression suite | `npx vitest run` | pass | all test files |
| Lint / type-check | `npx tsc --noEmit` | pass | no errors |

## Residual Risks

- None known.

## Recommendation

Close the bug — verified end-to-end.
