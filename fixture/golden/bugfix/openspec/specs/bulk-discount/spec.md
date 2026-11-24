# bulk-discount Specification

## Purpose

Rewards large orders: a line item of 10 units or more gets 5% off that line.

## Requirements

### Requirement: Lines of the bulk quantity or more are discounted
A line item of 10 units or more SHALL get 5% off its gross price, rounded to the nearest cent,
and a line item of fewer units MUST get no bulk discount.

#### Scenario: Exactly the bulk quantity
- **WHEN** a line item has 10 units at $5.00
- **THEN** its bulk discount is $2.50

#### Scenario: One unit short
- **WHEN** a line item has 9 units at $5.00
- **THEN** it gets no bulk discount
