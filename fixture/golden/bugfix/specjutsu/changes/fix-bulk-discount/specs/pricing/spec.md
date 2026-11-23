## ADDED Requirements

### Requirement: Lines of 10 units or more get the bulk discount
`lineDiscount` SHALL give a line item of 10 units or more 5% off that line, and a line item
of fewer than 10 units no discount.

#### Scenario: DISC-001 A line of exactly 10 units gets the discount
- **WHEN** a line item has 10 units at $5.00
- **THEN** `lineDiscount` returns 250 cents

#### Scenario: DISC-002 [keep] A line of 9 units gets no discount
- **WHEN** a line item has 9 units at $5.00
- **THEN** `lineDiscount` returns 0
