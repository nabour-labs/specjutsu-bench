# Tasks: Invoice Payment Terms

**Input**: Design documents from `/specs/001-payment-terms/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/terms.md, quickstart.md

**Tests**: Requested (test-driven development): each story's tests are written first and must fail before its code.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup: the project, toolchain and test runner already exist.

## Phase 2: Foundational

No foundational tasks.

## Phase 3: User Story 1 - Work out when an invoice is due (Priority: P1) 🎯 MVP

**Goal**: `dueDate` gives the date an invoice is due for each payment term.

**Independent Test**: `npx vitest run test/terms.test.ts` (dueDate cases).

### Tests for User Story 1

- [X] T001 [US1] Write dueDate tests for due on receipt, no terms, net 15 across a leap day, net 30 across a month end and a year end in test/terms.test.ts, and see them fail

### Implementation for User Story 1

- [X] T002 [US1] Add PAYMENT_TERMS (data-model.md PaymentTerms), PaymentTerms, isPaymentTerms and dueDate in src/terms.ts
- [X] T003 [US1] Add optional terms (data-model.md Invoice.terms) to Invoice in src/invoice.ts
- [X] T004 [US1] Re-export the terms API from src/index.ts per contracts/terms.md

**Checkpoint**: dueDate tests pass.

## Phase 4: User Story 2 - Refuse unknown payment terms (Priority: P2)

**Goal**: `createInvoice` refuses terms other than the three offered.

**Independent Test**: `npx vitest run test/terms.test.ts` (unknown terms case).

### Tests for User Story 2

- [X] T005 [US2] Write the "net-60" rejection test in test/terms.test.ts, and see it fail

### Implementation for User Story 2

- [X] T006 [US2] Refuse unknown terms in createInvoice in src/invoice.ts with "invoice <id>: unknown payment terms <terms>"

**Checkpoint**: all of test/terms.test.ts passes.

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T007 Run the full suite per quickstart.md and confirm it passes

## Dependencies & Execution Order

- US1 (T001–T004) before US2 (T005–T006): US2's check lives in the same files. T007 last.
- Tasks touch the same files, so none run in parallel.

## Implementation Strategy

MVP is User Story 1; User Story 2 adds input validation on top.
