# payment-terms Specification

## Purpose

Lets an invoice state how long the customer has to pay, and works out the date payment is due.

## Requirements

### Requirement: Invoices carry payment terms
An invoice SHALL accept the payment terms due on receipt, net 15 or net 30, and creating an
invoice with any other terms MUST fail with an error naming the invoice and the terms.

#### Scenario: Unknown terms are rejected
- **WHEN** an invoice INV-9 is created with the terms net-60
- **THEN** creation fails with `invoice INV-9: unknown payment terms net-60`

### Requirement: The due date follows the payment terms
The due date SHALL be the issue date plus 0 calendar days for due on receipt, 15 for net 15
and 30 for net 30, as YYYY-MM-DD. An invoice without terms MUST be due on receipt.

#### Scenario: Due on receipt
- **WHEN** an invoice issued on 2026-03-01 is due on receipt
- **THEN** its due date is 2026-03-01

#### Scenario: No terms
- **WHEN** an invoice issued on 2026-03-01 has no payment terms
- **THEN** its due date is 2026-03-01

#### Scenario: Net 15 across a leap day
- **WHEN** an invoice issued on 2028-02-15 has net 15 terms
- **THEN** its due date is 2028-03-01

#### Scenario: Net 30 across a month end
- **WHEN** an invoice issued on 2026-01-31 has net 30 terms
- **THEN** its due date is 2026-03-02

#### Scenario: Net 30 across a year end
- **WHEN** an invoice issued on 2026-12-15 has net 30 terms
- **THEN** its due date is 2027-01-14
