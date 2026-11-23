# Tasks: Raise the Free-Shipping Threshold

**Input**: Design documents from `/specs/001-free-shipping-threshold/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Requested (test-driven development): the tests change first and must fail before the code.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup: the project, toolchain and test runner already exist.

## Phase 2: Foundational

No foundational tasks.

## Phase 3: User Story 1 - Ship free only from $100.00 (Priority: P1) 🎯 MVP

**Goal**: Shipping is free from $100.00 of discounted subtotal.

**Independent Test**: `npx vitest run test/invoice.test.ts`

### Tests for User Story 1

- [X] T001 [US1] Update the shipping tests in test/invoice.test.ts for $100.00, $99.99, the old $50.00 and the discounted $96.90 cases, and the 8% totals example, and see them fail

### Implementation for User Story 1

- [X] T002 [US1] Set FREE_SHIPPING_FROM to 10000 in src/invoice.ts

**Checkpoint**: test/invoice.test.ts passes.

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T003 [P] Update the shipping rule in README.md to $100.00
- [X] T004 Run the full suite per quickstart.md and confirm it passes

## Dependencies & Execution Order

- T001 before T002; T003 any time; T004 last.

## Implementation Strategy

One story, delivered in one increment.
