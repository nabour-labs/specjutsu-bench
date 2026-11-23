# Implementation Plan: Invoice Payment Terms

**Branch**: `001-payment-terms` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-payment-terms/spec.md`

## Summary

Invoices gain optional payment terms (due on receipt, net 15, net 30) and a `dueDate` function that adds the term's calendar days to the issue date. Unknown terms are refused when the invoice is created. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 (ES modules)

**Primary Dependencies**: None at runtime

**Storage**: N/A

**Testing**: Vitest 3.2 (`npx vitest run`)

**Target Platform**: Node 22

**Project Type**: library

**Performance Goals**: N/A

**Constraints**: No new dependencies; existing exports unchanged

**Scale/Scope**: One new module and two small edits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution is ratified for this project (`.specify/memory/constitution.md` is absent), so there are no gates. Re-checked after Phase 1: no change.

## Project Structure

### Documentation (this feature)

```text
specs/001-payment-terms/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/terms.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── terms.ts      # new: PAYMENT_TERMS, PaymentTerms, isPaymentTerms, dueDate
├── invoice.ts    # Invoice.terms; createInvoice refuses unknown terms
└── index.ts      # re-exports the terms API

test/
└── terms.test.ts # new
```

**Structure Decision**: Single project, the library's existing `src/` and `test/` layout.
