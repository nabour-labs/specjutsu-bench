## ADDED Requirements

### Requirement: Shipping is free from $100.00 of discounted subtotal
`totals` SHALL charge $7.99 shipping when the discounted subtotal is below $100.00, and MUST
charge no shipping when it is $100.00 or more. The threshold applies to the subtotal after the
bulk discount.

#### Scenario: SHIP-001 Below $100.00 is charged shipping
- **WHEN** an invoice's discounted subtotal is $99.99, or $50.00 (the old threshold)
- **THEN** `totals` charges 799 cents shipping

#### Scenario: SHIP-002 [keep] Exactly $100.00 ships free
- **WHEN** an invoice's discounted subtotal is exactly $100.00
- **THEN** `totals` charges no shipping

#### Scenario: SHIP-003 The threshold is measured after the bulk discount
- **WHEN** an invoice has one line of 12 units at $8.50, $102.00 before and $96.90 after the bulk discount
- **THEN** `totals` charges 799 cents shipping
