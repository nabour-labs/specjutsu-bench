# Quickstart: Invoice Payment Terms

## Prerequisites

- Node 22 and the project's dev dependencies installed (`npm install`).

## Validate

```sh
npx vitest run test/terms.test.ts
npx vitest run
```

## Expected outcome

- `test/terms.test.ts` passes: the due dates in User Story 1 and the error in User Story 2.
- The full suite passes, so existing invoice behaviour is unchanged (SC-002).
