# Delta for Reservation Booking

## ADDED Requirements

### Requirement: `GET /reservations` Filters By `client_id`

The system MUST accept an optional `client_id` query parameter on `GET /reservations`. When supplied, the response MUST include only reservations belonging to that client, regardless of the active status of the property each reservation is on, and MUST be combinable with the date-window filter below.

#### Scenario: Filtering by client_id returns only that client's reservations

- GIVEN Client A has two reservations and Client B has one reservation
- WHEN `GET /reservations?client_id=<Client A's id>` is called
- THEN the response MUST contain exactly Client A's two reservations and MUST NOT contain Client B's reservation

#### Scenario: A client's reservation on a soft-deleted property still appears

- GIVEN a client has a reservation on a property that has since been soft-deleted
- WHEN `GET /reservations?client_id=<that client's id>` is called
- THEN that reservation MUST still appear in the response

### Requirement: `GET /reservations` Filters By A Half-Open Date Window, Matched By Overlap

The system MUST accept optional `from` and `to` query parameters on `GET /reservations` forming the half-open window `[from, to)`. A reservation MUST be included when it overlaps the window — `check_in < to AND check_out > from` — never merely when the window contains it. `from` and `to` MUST be supplied together; supplying exactly one MUST be rejected with a validation error. Supplying neither MUST leave the endpoint's existing (unfiltered, or otherwise-filtered) behavior unchanged.

#### Scenario: A stay straddling the window boundary is included

- GIVEN a reservation with `check_in = 2026-08-28` and `check_out = 2026-09-03`
- WHEN `GET /reservations?from=2026-09-01&to=2026-10-01` is called
- THEN that reservation MUST appear in the response, because it overlaps September even though it began in August

#### Scenario: A stay entirely outside the window is excluded

- GIVEN a reservation with `check_in = 2026-07-01` and `check_out = 2026-07-05`
- WHEN `GET /reservations?from=2026-09-01&to=2026-10-01` is called
- THEN that reservation MUST NOT appear in the response

#### Scenario: Supplying only `from` is rejected

- WHEN `GET /reservations?from=2026-09-01` is called without `to`
- THEN the system MUST reject it with a validation error

#### Scenario: Supplying only `to` is rejected

- WHEN `GET /reservations?to=2026-10-01` is called without `from`
- THEN the system MUST reject it with a validation error

#### Scenario: Supplying neither `from` nor `to` returns the unfiltered list

- WHEN `GET /reservations` is called without `from`, `to`, or `client_id`
- THEN the system MUST return the same list it returned before this change

#### Scenario: The window filter combines with the client filter

- GIVEN Client A has one reservation inside the requested window and one reservation outside it
- WHEN `GET /reservations?client_id=<Client A's id>&from=2026-09-01&to=2026-10-01` is called
- THEN the response MUST contain only Client A's reservation that overlaps the window
