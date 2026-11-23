# Spec Delta

## Purpose

Says what an invoice pays for shipping: a flat $7.99, waived for large orders.

## ADDED Requirements

### Requirement: Shipping is free from $100.00
Shipping SHALL be free when the discounted subtotal (after bulk discounts) is $100.00 or more,
and MUST be $7.99 below that.

#### Scenario: Exactly the threshold
- **WHEN** the discounted subtotal is $100.00
- **THEN** shipping is free

#### Scenario: One cent below the threshold
- **WHEN** the discounted subtotal is $99.99
- **THEN** shipping is $7.99

#### Scenario: The old threshold
- **WHEN** the discounted subtotal is $50.00
- **THEN** shipping is $7.99

#### Scenario: Measured after the bulk discount
- **WHEN** 12 units at $8.50 come to $102.00 and the bulk discount takes them to $96.90
- **THEN** shipping is $7.99
