# Feature Specification: Raise the Free-Shipping Threshold

**Feature Branch**: `001-free-shipping-threshold`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Raise the free-shipping threshold from $50.00 to $100.00 of discounted subtotal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ship free only from $100.00 (Priority: P1)

A customer whose discounted subtotal is $100.00 or more ships free; below $100.00 the $7.99 shipping fee is charged, including on orders between $50.00 and $100.00 that used to ship free.

**Why this priority**: It is the whole change.

**Independent Test**: Total invoices just below, at and above the new threshold and at the old one, and check the shipping charged.

**Acceptance Scenarios**:

1. **Given** a discounted subtotal of exactly $100.00, **When** totals are worked out, **Then** shipping is $0.00
2. **Given** a discounted subtotal of $99.99, **When** totals are worked out, **Then** shipping is $7.99
3. **Given** a discounted subtotal of $50.00, **When** totals are worked out, **Then** shipping is $7.99
4. **Given** 12 units at $8.50 ($102.00 before the 5% bulk discount, $96.90 after), **When** totals are worked out, **Then** shipping is $7.99
5. **Given** a $85.00 subtotal with a $3.00 bulk discount and 8% tax, **When** totals are worked out, **Then** shipping is $7.99, tax $7.20 and the total $97.19

---

### Edge Cases

- The threshold is measured after the bulk discount, as before.
- Tax still applies to the discounted subtotal plus shipping.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Shipping MUST be free when the discounted subtotal is $100.00 or more.
- **FR-002**: Shipping MUST be $7.99 when the discounted subtotal is below $100.00.
- **FR-003**: The README's pricing rules MUST state the new threshold.
- **FR-004**: Discount and tax rules MUST be unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every acceptance scenario above gives the stated shipping and totals.
- **SC-002**: The documented pricing rules and the computed totals agree.

## Assumptions

- The change applies to every invoice totalled after release; stored totals are not recomputed (the library stores none).
