# Implementation Plan: Raise the Free-Shipping Threshold

**Branch**: `001-free-shipping-threshold` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-free-shipping-threshold/spec.md`

## Summary

Raise `FREE_SHIPPING_FROM` from $50.00 to $100.00 of discounted subtotal, update the shipping tests and the README's pricing rules. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 (ES modules)

**Primary Dependencies**: None at runtime

**Storage**: N/A

**Testing**: Vitest 3.2 (`npx vitest run`)

**Target Platform**: Node 22

**Project Type**: library

**Performance Goals**: N/A

**Constraints**: No API change

**Scale/Scope**: One constant, its tests and the README

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution is ratified for this project (`.specify/memory/constitution.md` is absent), so there are no gates. Re-checked after Phase 1: no change.

## Project Structure

### Documentation (this feature)

```text
specs/001-free-shipping-threshold/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

No data model (no entity or field changes) and no contracts (the public API's shape is unchanged).

### Source Code (repository root)

```text
src/
└── invoice.ts         # FREE_SHIPPING_FROM 5000 -> 10000

test/
└── invoice.test.ts    # shipping tests at the new threshold

README.md              # pricing rules
```

**Structure Decision**: Single project, the library's existing layout.
