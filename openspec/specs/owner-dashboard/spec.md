# Owner Dashboard Specification

## Purpose

Authenticated aggregates for the owner: availability and income collected for a caller-chosen date window.

## Requirements

### Requirement: Occupied and Available Nights For The Requested Window

The system MUST report, for a caller-supplied half-open date window `[from, to)`, the count of occupied nights and available nights per property and in aggregate across all the tenant's properties. Nights covered only by a `cancelled` reservation MUST count as available, not occupied.

#### Scenario: Availability excludes cancelled reservations

- GIVEN Property P has a `cancelled` reservation covering `2026-12-05` to `2026-12-10`
- WHEN the owner requests availability for a window covering December for Property P
- THEN those nights MUST be reported as available, not occupied

#### Scenario: Aggregate across properties

- GIVEN Tenant A has two properties each with distinct occupied nights in the requested window
- WHEN the owner requests aggregate availability for that window
- THEN the result MUST reflect the combined occupied and available nights across both properties

### Requirement: `collected` — Cash-Basis Income

The system MUST compute `collected` for a period as the sum of `payments.amount` where `paid_on` falls within the period, regardless of when the related stay occurs. This MUST be the only income metric exposed by the dashboard.

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

### Requirement: One Endpoint, One Caller-Chosen Window Per Call

`GET /dashboard/summary` MUST accept exactly one half-open date window per call, via `from` and `to` query parameters (`[from, to)`, local AR dates). The system MUST NOT compute or return multiple windows (e.g. a week and a month together) in a single response. There MUST NOT be separate weekly and monthly endpoints — a "week" or a "month" is simply a window the caller chooses and passes in, not a server-side variant.

The response MUST carry exactly `collected`, `occupied_nights`, `available_nights`, and a per-property breakdown, all computed over the single requested window.

The system MAY provide pure helper functions (`month_window()`, `week_window()`) that compute `[from, to)` boundaries for a calendar month or an ISO week, for callers that want one — but these are convenience utilities, not endpoint behavior; the endpoint itself has no knowledge of "week" or "month" and only ever sees the resolved `from`/`to` dates. Period boundaries MUST use the fixed server timezone `America/Argentina/Buenos_Aires` when such a window is computed.

#### Scenario: A monthly window returns one set of figures for that month

- GIVEN the owner wants October 2026 figures
- WHEN the owner requests `GET /dashboard/summary?from=2026-10-01&to=2026-11-01`
- THEN the response MUST return `collected`, `occupied_nights`, and `available_nights` computed only over that window, with no other window's figures included

#### Scenario: A weekly window returns one set of figures for that week, via the same endpoint

- GIVEN the owner wants figures for the ISO week starting `2026-06-08`
- WHEN the owner requests `GET /dashboard/summary?from=2026-06-08&to=2026-06-15`
- THEN the response MUST return figures for that week only, through the same `/dashboard/summary` endpoint used for a month — no separate weekly endpoint exists

### Requirement: No Accrual-Basis Income Metric

The system MUST NOT expose a second income metric valuing reservations by stay period independent of payment date (accrual basis). There MUST be no field, query parameter, or endpoint that returns reservation value not yet collected as an income figure.

#### Scenario: Dashboard response has a single income figure

- GIVEN a reservation with an unpaid balance whose stay falls in the requested month
- WHEN the owner requests dashboard data for that month
- THEN the response MUST NOT contain any income field other than `collected`, and the unpaid reservation value MUST NOT appear as income
