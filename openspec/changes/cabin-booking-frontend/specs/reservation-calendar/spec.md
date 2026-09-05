# Reservation Calendar Specification

## Purpose

Screen 03: the per-cabin month view the owner opens most, built on the
shared calendar core (`month-calendar-rendering`), plus the "Quién se queda"
list below it. This is a read-only surface — no interaction moves a
reservation from here — and the first place client-side name resolution is
required, since `ReservationRead` carries no guest or cabin name.

## ADDED Requirements

### Requirement: One Cabin Is Selected At A Time, As URL State

The segmented control MUST show exactly one cabin's calendar at a time.
Switching cabins MUST update the URL's search parameters (per
`frontend-foundation`), never a store.

#### Scenario: Switching the segmented control changes only the URL and the shown occupancy

- GIVEN `Casa Azul` is selected and shown
- WHEN the owner taps `Casa Dos Aguas`
- THEN the URL's cabin parameter MUST update to reflect Casa Dos Aguas, and the grid MUST show only Casa Dos Aguas's occupied nights

### Requirement: Occupied Nights Are Read-Only

Tapping an occupied or free day on this calendar MUST NOT start a selection,
open an editor, or send any request. This calendar has no interaction.

#### Scenario: Tapping an occupied day changes nothing

- GIVEN a day rendered with an occupied-night segment
- WHEN the owner taps it
- THEN no selection state MUST change and no navigation or request MUST occur

### Requirement: "Quién Se Queda" Lists Every Non-Cancelled Stay Overlapping The Month, Ordered By Check-In

The list below the grid MUST include every non-cancelled reservation
overlapping the displayed month for the selected cabin, ordered by
`check_in`, regardless of the order the API returns them in (the API orders
by `created_at`).

#### Scenario: A cancelled reservation does not appear in the list

- GIVEN a cancelled reservation overlapping the displayed month for the selected cabin
- WHEN the list is rendered
- THEN that reservation MUST NOT appear

#### Scenario: The list is ordered by check-in, not by creation order

- GIVEN two reservations overlapping the displayed month with `check_in` on the 2nd and the 5th, created in the reverse order (5th created first)
- WHEN the list is rendered
- THEN the row for the 2nd MUST appear before the row for the 5th

### Requirement: Guest And Cabin Names Are Resolved From A Lookup That Includes Inactive Records

Every guest name and cabin name shown on this screen MUST be resolved from a
client-side lookup fetched with `include_inactive=true`, so a deactivated
guest's or cabin's stays still render a name rather than a blank.

#### Scenario: A deactivated guest's stay still shows their name

- GIVEN a reservation belongs to a guest whose `is_active` is `false`
- WHEN that reservation's row is rendered in "Quién se queda"
- THEN the guest's full name MUST render, not a blank or placeholder

### Requirement: An Empty Month Shows An Instructive State, Not A Blank List

The system MUST show the exact copy "Todavía no anotaste ninguna reserva
en este mes", together with the primary action to record one, when no
non-cancelled reservation overlaps the displayed month for the selected
cabin. It MUST NOT render an empty list with no explanation.

#### Scenario: A month with zero stays shows the instructive copy

- GIVEN the selected cabin has no non-cancelled reservation overlapping the displayed month
- WHEN the screen is rendered
- THEN it MUST show "Todavía no anotaste ninguna reserva en este mes" and the reachable primary action

### Requirement: Each List Row Shows Debe Or Pagado, Matching The Shared Balance Helper

Each row in "Quién se queda" MUST show `Debe $ <amount>` when the shared
balance helper reports a positive balance, and `Pagado` when it reports zero,
using the same helper `reservation-ledger` uses for the detail screen.

#### Scenario: A stay with an outstanding balance shows Debe

- GIVEN a non-cancelled reservation with a positive balance of `80000`
- WHEN its row is rendered
- THEN it MUST show `"Debe $ 80.000"`

#### Scenario: A fully paid stay shows Pagado

- GIVEN a non-cancelled reservation with a balance of `0`
- WHEN its row is rendered
- THEN it MUST show `"Pagado"`
