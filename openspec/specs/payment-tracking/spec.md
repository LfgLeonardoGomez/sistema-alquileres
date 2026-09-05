# Payment Tracking Specification

## Purpose

Records money received off-platform against a reservation. Balance is always derived, never stored. Refunds are manual entries — no automatic policy.

## Requirements

### Requirement: Payment Record

The system MUST store each payment with `id` (UUID), `tenant_id` (UUID, NOT NULL), `reservation_id` (UUID, NOT NULL, FK), `amount` as `NUMERIC(12,2)` (ARS, may be negative for a refund entry), `paid_on` (DATE), and `created_at`. A payment row MUST NOT carry a `client_id` — the client is reached only through `reservation_id`.

#### Scenario: Schema has no client reference on payments

- GIVEN the payments table schema
- WHEN inspecting its columns
- THEN there MUST be no `client_id` or equivalent client foreign key

### Requirement: `paid_on` Defaults In Application Code, Never In The Database

When the owner does not supply `paid_on`, the system MUST default it in Python to "today" in the fixed timezone `America/Argentina/Buenos_Aires`. The `paid_on` column MUST NOT carry a database-level default (no `server_default`, no `DEFAULT CURRENT_DATE`).

This is not a stylistic preference: PostgreSQL runs in UTC. A server-side default of `CURRENT_DATE` would stamp a payment entered late in the evening in Buenos Aires (still one calendar day locally, already the next day in UTC) with the wrong date. Because the dashboard's `collected` metric buckets income strictly by `paid_on`, that misattribution would silently move real income into the wrong month's total with no error and no visible symptom.

#### Scenario: Payment recorded without an explicit date gets today in AR time

- GIVEN the owner records a payment without supplying `paid_on`
- WHEN the payment is created
- THEN `paid_on` MUST be set to the current date in `America/Argentina/Buenos_Aires`, computed in application code

#### Scenario: The `paid_on` column has no database default

- GIVEN the payments table schema
- WHEN inspecting `paid_on`'s column default in `information_schema.columns`
- THEN it MUST be `NULL` — no server-side default MUST exist for this column

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

Balance due MUST be computed at read time as `total - SUM(payments.amount)` for the reservation, EXCEPT when the reservation's status is `cancelled`, in which case the balance MUST be `0` regardless of `total` or of any amount recorded in `payments`. No `balance` column MUST exist anywhere in the schema. Payments recorded against a cancelled reservation MUST remain individually readable in full — cancellation collapses the derived balance, not the payment history, because those payments remain the record that an amount exists to settle personally with the guest.

(Previously: this requirement computed balance from `total` and `SUM(payments.amount)` alone, with no reference to `status`. A cancelled reservation carrying recorded payments could therefore report a nonzero balance — e.g. a cancelled $180.000 stay with a $60.000 deposit reporting "Le falta pagar $120.000", a figure nobody owes. This also brings `balance` into agreement with the dashboard's `collected` metric, which already excludes cancelled reservations' payments.)

#### Scenario: Balance reflects partial payment

- GIVEN a reservation with `total = 5000.00` and one payment of `2000.00`
- WHEN the reservation balance is read
- THEN it MUST equal `3000.00`

#### Scenario: A cancelled reservation's balance is zero regardless of payments

- GIVEN a `cancelled` reservation with an effective total of `180000` and a recorded payment of `60000`
- WHEN the reservation's balance is read
- THEN it MUST equal `0`, not `120000`

#### Scenario: A cancelled reservation's payments remain visible

- GIVEN a `cancelled` reservation with a recorded payment of `60000`
- WHEN the reservation's payment list is read
- THEN the `60000` payment MUST still appear, even though the reservation's balance reads `0`

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

### Requirement: A Cancelled Stay Is Not Counted As An "Estadía"

A cancelled reservation MUST NOT be counted toward any "estadía" (stay) count derived from a guest's or a property's reservation history. It MUST remain present in that history, individually readable and marked `Cancelada` — a count is a summary and excludes it; a history is a record and keeps it.

#### Scenario: A cancelled reservation is excluded from a stay count

- GIVEN a guest has two non-cancelled reservations and one cancelled reservation
- WHEN a stay count is derived for that guest
- THEN it MUST report `2`, not `3`

#### Scenario: A cancelled reservation still appears in history, marked Cancelada

- GIVEN a guest has a cancelled reservation
- WHEN that guest's reservation history is read
- THEN the cancelled reservation MUST still appear, with its `status` reading `cancelled`

### Requirement: Payment Method Is A Stored Enum

Each payment row MUST record how the money was received, as a `method` column constrained to exactly three values: `cash`, `transfer`, `other`. The system MUST reject a value outside this set. Unlike `paid_on`, this value MUST NOT be inferred or defaulted — only the owner knows how a given amount arrived, so it MUST be supplied explicitly when the payment is recorded.

The stored values are English identifiers and the interface MUST display Spanish labels (`Efectivo`, `Transferencia`, `Otro`), the same line `reservations.status` already draws by storing `reserved` and `cancelled` while every screen shows Spanish. A stored value is an identifier; the Spanish word is a label, and labels belong to the interface.

#### Scenario: A payment recorded with a valid method is accepted

- WHEN a payment is recorded with `method = "transfer"`
- THEN the system MUST accept it, and the stored row MUST report `method = "transfer"` on read

#### Scenario: An unrecognized method is rejected

- WHEN a payment is recorded with `method = "tarjeta"`
- THEN the system MUST reject it with a validation error

### Requirement: Payment Purpose Is Derived From `paid_on`, Never Stored

The system MUST NOT persist any column naming a payment's purpose. Among a reservation's positive-amount payments, the one with the earliest `paid_on` MUST be presented as "Seña"; every other positive-amount payment MUST be presented as "Pago". This derivation MUST be computed from `paid_on`, never from insertion order or `created_at` — a deposit recorded in the database after a later payment MUST still be identified as the seña if its `paid_on` is earlier. A negative-amount entry (a refund) MUST be presented as neither "Seña" nor "Pago"; its sign alone continues to identify it as a refund, unchanged from the existing sign-only discrimination.

#### Scenario: Purpose follows `paid_on`, not recording order

- GIVEN a reservation where a payment dated `2026-03-02` is recorded first, and a payment dated `2026-01-05` is recorded second
- WHEN the reservation's payments are read
- THEN the payment dated `2026-01-05` MUST be presented as "Seña" and the payment dated `2026-03-02` MUST be presented as "Pago"

#### Scenario: A refund is presented as neither seña nor pago

- GIVEN a reservation with one positive payment and one negative (refund) entry
- WHEN the reservation's payments are read
- THEN the refund entry MUST be presented as neither "Seña" nor "Pago"
