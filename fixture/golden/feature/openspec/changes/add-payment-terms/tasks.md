# Tasks

## 1. Payment terms

- [x] 1.1 Add `test/terms.test.ts` covering every scenario in the payment-terms spec and verify it fails before the code exists
- [x] 1.2 Add `src/terms.ts` with the terms and `dueDate`, the optional `terms` field and its check in `createInvoice`, export them from `src/index.ts`, and verify `npx vitest run` passes
