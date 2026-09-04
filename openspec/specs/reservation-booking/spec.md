# Reservation Booking Specification

## Purpose

The core booking domain: non-overlapping nights per property, two persisted states with a derived `completed` view, and pricing stored as entered with the total derived.

## Requirements

### Requirement: Nights Modeled as a Half-Open Interval

The system MUST store `check_in` and `check_out` as `DATE` columns (no time component) and MUST treat the occupied range as the half-open interval `[check_in, check_out)`.

#### Scenario: Adjacent stays do not conflict

- GIVEN a reservation on Property P with `check_out = 2026-12-10`
- WHEN a new reservation is created on Property P with `check_in = 2026-12-10`
- THEN the system MUST accept it (no overlap)

### Requirement: Non-Overlap Enforced at the Database Level

The system MUST enforce non-overlapping nights per property for all non-cancelled reservations via a PostgreSQL `EXCLUDE USING gist` constraint over a `daterange` derived from `[check_in, check_out)`, scoped by `property_id`, with a partial predicate excluding `cancelled` reservations. Application-level validation MAY run first to produce a descriptive error, but the constraint is the final authority.

#### Scenario: Overlapping nights rejected

- GIVEN a reservation on Property P for `2026-12-05` to `2026-12-10`
- WHEN a new reservation is submitted on Property P for `2026-12-08` to `2026-12-12`
- THEN the system MUST reject it with HTTP 409

#### Scenario: Concurrent requests for the same nights

- GIVEN Property P has no reservation for `2026-12-05` to `2026-12-10`
- WHEN two requests submit that exact range on Property P concurrently
- THEN exactly one request MUST succeed and the other MUST receive HTTP 409

#### Scenario: Cancelling frees the nights

- GIVEN a cancelled reservation on Property P for `2026-12-05` to `2026-12-10`
- WHEN a new reservation is submitted on Property P for the same range
- THEN the system MUST accept it, AND the cancelled reservation MUST remain readable by its `id`

### Requirement: Stay Length Bounds

The system MUST require a stay of at least 1 night and at most 60 nights (`check_out - check_in`).

#### Scenario: Minimum accepted

- WHEN a reservation is submitted with `check_out = check_in + 1 day`
- THEN the system MUST accept it

#### Scenario: Maximum accepted

- WHEN a reservation is submitted with `check_out = check_in + 60 days`
- THEN the system MUST accept it

#### Scenario: Zero-night rejected

- WHEN a reservation is submitted with `check_out = check_in`
- THEN the system MUST reject it with a validation error

#### Scenario: 61-night rejected

- WHEN a reservation is submitted with `check_out = check_in + 61 days`
- THEN the system MUST reject it with a validation error

### Requirement: Retroactive Dates Are Allowed

`check_in` and `check_out` MAY be in the past, or the stay MAY already be in progress (`check_in` in the past, `check_out` in the future). The system MUST NOT reject a reservation because its dates are not in the future — there is NO "date must be today or later" validation, and NO retroactive flag or marker field distinguishing these reservations from any other. The owner is migrating existing bookings from a paper notebook and will go live mid-season, so past and in-progress stays MUST be loadable exactly like future ones. The only date rules that apply are the non-overlap invariant and the 1–60 night bounds, identically for past and future dates.

#### Scenario: Fully past stay accepted

- GIVEN today is date D
- WHEN a reservation is created with both `check_in` and `check_out` before D
- THEN the system MUST accept it, and reading it back MUST show it as completed per the derived-state requirement below

#### Scenario: In-progress stay accepted

- WHEN a reservation is created with `check_in` before today and `check_out` after today
- THEN the system MUST accept it

#### Scenario: Past-dated reservation still respects non-overlap

- GIVEN an existing non-cancelled reservation on Property P for `2025-01-05` to `2025-01-10` (fully in the past)
- WHEN a new reservation is submitted on Property P for `2025-01-08` to `2025-01-12`
- THEN the system MUST reject it with HTTP 409, exactly as it would for overlapping future dates

### Requirement: Two Persisted States, `completed` Derived

The system MUST persist only two reservation states: `reserved` and `cancelled`. `completed` MUST NOT be a stored column; it MUST be computed at read time as `state = 'reserved' AND check_out < current_date`, evaluated in the fixed server timezone `America/Argentina/Buenos_Aires`.

#### Scenario: Past stay reads as completed

- GIVEN a `reserved` reservation with `check_out` in the past relative to the fixed timezone
- WHEN the reservation is read
- THEN the response MUST indicate it is completed, and the schema MUST NOT contain a `completed` column

#### Scenario: Future stay does not read as completed

- GIVEN a `reserved` reservation with `check_out` in the future
- WHEN the reservation is read
- THEN the response MUST NOT indicate it is completed

### Requirement: Pricing Is Stored As Entered, Total Is Derived

The system MUST accept price as either a per-night rate or a total for the stay, and MUST persist exactly the mode the owner entered — `price_per_night` and `price_total`, both `NUMERIC(12,2)` in ARS (single currency, no multi-currency support), exactly one of which is non-null, enforced by a database `CHECK`.

The effective `total` MUST NOT be a stored column. It MUST be derived as `price_total` when present, otherwise `price_per_night * (check_out - check_in)`.

#### Scenario: Per-night and total pricing agree

- GIVEN a 5-night stay
- WHEN one reservation is created with a per-night rate of `1000.00` and an equivalent reservation is created with a total of `5000.00`
- THEN both MUST report the same effective total of `5000.00`, AND the schema MUST NOT contain a stored `total` column

#### Scenario: Both pricing modes supplied is rejected

- WHEN a reservation is created supplying both `price_per_night` and `price_total`
- THEN the system MUST reject it with a validation error

#### Scenario: Neither pricing mode supplied is rejected

- WHEN a reservation is created supplying neither `price_per_night` nor `price_total`
- THEN the system MUST reject it with a validation error

#### Scenario: Extending dates rescales per-night pricing

- GIVEN a reservation of 5 nights priced at `1000.00` per night, reporting an effective total of `5000.00`
- WHEN the owner edits `check_out` to make it a 7-night stay
- THEN the effective total MUST become `7000.00` without the owner re-entering a price

#### Scenario: Extending dates does not rescale stay-total pricing

- GIVEN a reservation of 5 nights priced with a stay total of `5000.00`
- WHEN the owner edits `check_out` to make it a 7-night stay
- THEN the effective total MUST remain `5000.00` until the owner changes the price explicitly

### Requirement: Reservation Editing Respects the Invariant

Dates and price MUST be editable after creation, including when payments exist. Date edits MUST re-validate the non-overlap invariant and length bounds exactly as at creation.

#### Scenario: Editing dates into a conflict is rejected

- GIVEN Reservation R1 on Property P and Reservation R2 on the same property with adjacent, non-overlapping dates
- WHEN R1's dates are edited to overlap R2
- THEN the system MUST reject the edit with HTTP 409

#### Scenario: Editing price below amount already paid is allowed

- GIVEN a reservation with an effective total of `5000.00` and `800.00` already paid
- WHEN the owner edits the price so the effective total becomes `500.00`
- THEN the system MUST accept the edit, AND the derived balance (see `payment-tracking`) MUST be negative
