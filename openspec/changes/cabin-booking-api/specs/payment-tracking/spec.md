# Payment Tracking Specification

## Purpose

Records money received off-platform against a reservation. Balance is always derived, never stored. Refunds are manual entries — no automatic policy.

## Requirements

### Requirement: Payment Record

The system MUST store each payment with `id` (UUID), `tenant_id` (UUID, NOT NULL), `reservation_id` (UUID, NOT NULL, FK), `amount` as `NUMERIC(12,2)` (ARS, may be negative for a refund entry), `payment_date` (DATE), and `created_at`. A payment row MUST NOT carry a `client_id` — the client is reached only through `reservation_id`.

#### Scenario: Schema has no client reference on payments

- GIVEN the payments table schema
- WHEN inspecting its columns
- THEN there MUST be no `client_id` or equivalent client foreign key

### Requirement: Multiple Partial Payments Accumulate

The system MUST allow any number of payments against one reservation, and deposit at creation MUST be optional — a reservation MAY be `reserved` with zero payments.

#### Scenario: Reservation created with no deposit

- WHEN a reservation is created without an initial payment
- THEN the system MUST accept it in `reserved` state with zero recorded payments

#### Scenario: Multiple partial payments

- GIVEN a reservation with `total = 6000.00`
- WHEN three payments of `2000.00` each are recorded on different dates
- THEN the sum of recorded payments for that reservation MUST equal `6000.00`

### Requirement: Balance Is Derived, Never Stored

Balance due MUST be computed at read time as `total - SUM(payments.amount)` for the reservation. No `balance` column MUST exist anywhere in the schema.

#### Scenario: Balance reflects partial payment

- GIVEN a reservation with `total = 5000.00` and one payment of `2000.00`
- WHEN the reservation balance is read
- THEN it MUST equal `3000.00`

#### Scenario: No stored balance column

- GIVEN the reservations and payments table schemas
- WHEN inspecting their columns
- THEN there MUST be no `balance` column in either table

### Requirement: Manual Refund Entries

Refunds MUST be recorded as explicit payment entries (e.g., a negative `amount`) created by the owner. The system MUST NOT compute or apply any refund automatically on cancellation.

#### Scenario: Cancellation does not create a refund automatically

- GIVEN a `reserved` reservation with `2000.00` paid
- WHEN the owner cancels the reservation
- THEN the system MUST NOT create any payment row automatically

#### Scenario: Owner records a manual refund

- GIVEN a cancelled reservation with `2000.00` paid
- WHEN the owner records a refund entry of `-2000.00`
- THEN the reservation's derived balance MUST reflect the refund
