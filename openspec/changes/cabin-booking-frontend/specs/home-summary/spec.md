# Home Summary Specification

## Purpose

Screen 02: the deliberately empty home screen — one occupancy figure and one
action. `GET /dashboard/summary` returns `collected`; this screen must not
render it, overriding the original brief's "how much she collected".

## Requirements

### Requirement: No Revenue Figure Is Ever Rendered

The screen MUST NOT render `collected` or any money figure derived from it,
even though `GET /dashboard/summary` returns it in the same response used
for occupancy.

#### Scenario: A nonzero collected amount still renders no revenue figure

- GIVEN `GET /dashboard/summary` returns `collected: "450000.00"` alongside occupancy data
- WHEN screen 02 is rendered
- THEN no element on the screen MUST display `450000`, `$ 450.000`, or any other money figure

### Requirement: Occupied-Nights Progress Reflects The Argentina-Time Month

The "Noches ocupadas" card's numerator, denominator, and progress-bar
fraction MUST reflect the month containing "today" as computed in
`America/Argentina/Buenos_Aires`, not the UTC month.

#### Scenario: Near a UTC month rollover, the AR month is still shown

- GIVEN the moment is `2026-10-01T02:00:00Z`, which is `2026-09-30T23:00:00-03:00` in Argentina
- WHEN screen 02 is rendered
- THEN the occupancy figures MUST reflect September 2026, not October 2026

### Requirement: The Displayed Month Label Reflects The Argentina-Time Month

The month label above "Hola, Ana" MUST name the current month in
`America/Argentina/Buenos_Aires`, not the browser's locale-derived or UTC
month.

#### Scenario: The month label matches the AR calendar near a rollover

- GIVEN the same moment as above (`2026-10-01T02:00:00Z`, `2026-09-30` in Argentina)
- WHEN screen 02 is rendered
- THEN the month label MUST read "Septiembre"

### Requirement: "Anotar Una Reserva" Is Always Reachable In One Tap

The primary button MUST be present and MUST navigate directly to step 1 of
the reservation wizard regardless of whether any reservation exists yet — it
MUST NOT be conditionally hidden behind an empty state.

#### Scenario: The primary action is present with zero existing reservations

- GIVEN the tenant has no reservations at all yet
- WHEN screen 02 is rendered
- THEN "Anotar una reserva" MUST be present and MUST navigate to step 1 of the wizard when tapped
