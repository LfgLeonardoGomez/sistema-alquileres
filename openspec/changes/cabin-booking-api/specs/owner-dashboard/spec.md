# Owner Dashboard Specification

## Purpose

Authenticated aggregates for the owner: monthly availability and income collected in the period.

## Requirements

### Requirement: Available Nights Per Month

The system MUST report, for a given month, the count of available nights per property and in aggregate across all the tenant's properties. Nights covered only by a `cancelled` reservation MUST count as available.

#### Scenario: Availability excludes cancelled reservations

- GIVEN Property P has a `cancelled` reservation covering `2026-12-05` to `2026-12-10`
- WHEN the owner requests December availability for Property P
- THEN those nights MUST be reported as available

#### Scenario: Aggregate across properties

- GIVEN Tenant A has two properties each with distinct occupied nights in December
- WHEN the owner requests aggregate December availability
- THEN the result MUST reflect the combined available nights across both properties

### Requirement: `collected` — Cash-Basis Income

The system MUST compute `collected` for a period as the sum of `payments.amount` where `payment_date` falls within the period, regardless of when the related stay occurs. This MUST be the only income metric exposed by the dashboard.

#### Scenario: Deposit counted in the month it was paid

- GIVEN a payment of `1000.00` recorded on `2026-10-15` for a reservation whose stay is in January 2027
- WHEN the owner requests `collected` for October 2026
- THEN the `1000.00` MUST be included in October's `collected` and MUST NOT be included in January's `collected`

#### Scenario: Payment sum within the requested month only

- GIVEN payments of `500.00` on `2026-10-02` and `700.00` on `2026-11-05` for reservations in the same property
- WHEN the owner requests `collected` for October 2026
- THEN the result MUST equal `500.00`

#### Scenario: Income from an inactive property still counts

- GIVEN a property with `is_active = false` (soft-deleted, see `property-management`) has a payment of `900.00` recorded on `2026-10-20` for a past reservation
- WHEN the owner requests `collected` for October 2026
- THEN the `900.00` MUST be included exactly as it would be for an active property

### Requirement: Weekly and Monthly Variants

`collected` MUST be available as both weekly and monthly aggregates. Period boundaries MUST use the fixed server timezone `America/Argentina/Buenos_Aires`.

#### Scenario: Monthly and weekly totals available

- WHEN the owner requests dashboard data for a given month
- THEN both weekly-bucketed values and a single monthly total MUST be returned for `collected`

### Requirement: No Accrual-Basis Income Metric

The system MUST NOT expose a second income metric valuing reservations by stay period independent of payment date (accrual basis). There MUST be no field, query parameter, or endpoint that returns reservation value not yet collected as an income figure.

#### Scenario: Dashboard response has a single income figure

- GIVEN a reservation with an unpaid balance whose stay falls in the requested month
- WHEN the owner requests dashboard data for that month
- THEN the response MUST NOT contain any income field other than `collected`, and the unpaid reservation value MUST NOT appear as income
