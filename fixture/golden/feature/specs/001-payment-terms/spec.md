# Feature Specification: Invoice Payment Terms

**Feature Branch**: `001-payment-terms`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Add payment terms to invoices (due on receipt, net 15, net 30) and a dueDate function that works out when an invoice is due."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Work out when an invoice is due (Priority: P1)

A billing clerk creates an invoice with payment terms and needs to know the date the customer must pay by.

**Why this priority**: The due date is the reason for having payment terms; without it the terms carry no information.

**Independent Test**: Create invoices with each payment term and check the due date returned for each.

**Acceptance Scenarios**:

1. **Given** an invoice issued 2026-03-01 due on receipt, **When** its due date is requested, **Then** it is 2026-03-01
2. **Given** an invoice issued 2026-03-01 with no payment terms, **When** its due date is requested, **Then** it is 2026-03-01
3. **Given** an invoice issued 2028-02-15 on net 15, **When** its due date is requested, **Then** it is 2028-03-01
4. **Given** an invoice issued 2026-01-31 on net 30, **When** its due date is requested, **Then** it is 2026-03-02
5. **Given** an invoice issued 2026-12-15 on net 30, **When** its due date is requested, **Then** it is 2027-01-14

---

### User Story 2 - Refuse unknown payment terms (Priority: P2)

A billing clerk who enters payment terms the library does not offer gets an error when the invoice is created, not a wrong due date later.

**Why this priority**: It protects the due date from bad input, but invoices with valid terms work without it.

**Independent Test**: Create an invoice with terms "net-60" and check that creation fails with a message naming the invoice and the terms.

**Acceptance Scenarios**:

1. **Given** an invoice INV-9 with terms "net-60", **When** it is created, **Then** creation fails with "invoice INV-9: unknown payment terms net-60"

---

### Edge Cases

- A net term that crosses a month end, a year end or a leap day lands on the right calendar date.
- An invoice without payment terms is due on receipt.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An invoice MUST accept optional payment terms: due on receipt, net 15 or net 30.
- **FR-002**: The system MUST give an invoice's due date as YYYY-MM-DD: the issue date plus 0, 15 or 30 calendar days for due on receipt, net 15 and net 30.
- **FR-003**: An invoice without payment terms MUST be treated as due on receipt.
- **FR-004**: Creating an invoice with any other payment terms MUST fail with "invoice <id>: unknown payment terms <terms>".
- **FR-005**: Existing invoices and totals MUST behave as before.

### Key Entities *(include if feature involves data)*

- **Payment terms**: How long a customer has to pay, as a number of calendar days after the issue date.
- **Invoice**: Gains optional payment terms; its issue date is the start of the payment period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every acceptance scenario above gives the stated due date or error.
- **SC-002**: All existing invoice behaviour is unchanged: the existing test suite still passes.

## Assumptions

- Days are calendar days, not business days; weekends and holidays are not skipped.
- Dates are calendar dates without a time zone.
