## ADDED Requirements

### Requirement: An invoice is due a fixed number of days after it is issued
`dueDate` SHALL return the date an invoice is due, as YYYY-MM-DD: the issue date plus 0
calendar days for due on receipt, 15 for net 15 and 30 for net 30. An invoice without terms
MUST be treated as due on receipt.

#### Scenario: TERMS-001 Due on receipt
- **WHEN** an invoice issued on 2026-03-01 has the terms due on receipt
- **THEN** `dueDate` returns 2026-03-01

#### Scenario: TERMS-002 No terms means due on receipt
- **WHEN** an invoice issued on 2026-03-01 has no terms
- **THEN** `dueDate` returns 2026-03-01

#### Scenario: TERMS-003 Net 15 counts calendar days across a leap day
- **WHEN** an invoice issued on 2028-02-15 has the terms net 15
- **THEN** `dueDate` returns 2028-03-01

#### Scenario: TERMS-004 Net 30 counts calendar days across month and year ends
- **WHEN** an invoice issued on 2026-01-31, or on 2026-12-15, has the terms net 30
- **THEN** `dueDate` returns 2026-03-02, or 2027-01-14

### Requirement: Unknown payment terms are rejected
`createInvoice` MUST reject payment terms other than due on receipt, net 15 and net 30.

#### Scenario: TERMS-005 Net 60 is rejected
- **WHEN** `createInvoice` is called for invoice INV-9 with the terms net-60
- **THEN** it throws an `InvoiceError` with the message `invoice INV-9: unknown payment terms net-60`
