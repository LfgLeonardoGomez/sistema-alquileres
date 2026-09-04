# Reservation Ledger Specification

## Purpose

Screen 06 (the reservation's detail), screen 07 (cancellation confirmation),
and the undrawn "Anotar un pago" / "Devolución" sheets — the stay, its
payments, its derived balance in both directions, cancellation, and editing
a saved reservation's dates and price. Editing is in scope by the owner's
decision after the proposal, bounded by `ReservationUpdate` to dates and
price only.

## Requirements

### Requirement: Balance Reads As A Normal State In Either Direction

The system MUST render a positive balance as "Le falta pagar" with the
amount owed, and a negative balance as "Le tenés que devolver" with the
absolute amount to refund. Neither presentation MUST use error styling or
error-adjacent language.

#### Scenario: An overpaid stay reads as a refund owed, not an error

- GIVEN a reservation with an effective total of `180000` and `200000` already paid (balance `-20000`)
- WHEN the detail screen is rendered
- THEN it MUST show "Le tenés que devolver $ 20.000", with no error indicator anywhere on the screen

### Requirement: A Cancelled Reservation Shows No Amount Owed

Regardless of what balance the API reports for a cancelled reservation (a
known backend defect that `frontend-api-alignment` will fix), the system
MUST render no "Debe", "Le falta pagar", or "Le tenés que devolver" line
anywhere for a cancelled reservation.

#### Scenario: A cancelled reservation with a nonzero reported balance shows nothing owed

- GIVEN a cancelled reservation for which the API reports a nonzero `balance`
- WHEN its detail view (or any list row referencing it) is rendered
- THEN no amount-owed or amount-to-refund line MUST appear anywhere for that reservation

### Requirement: Payments And Refunds Share One List, A Refund Signed Negative

The "Pagos" list MUST include both payments and refunds together, ordered by
date, with a refund rendered as a negative-signed entry — matching the API's
sign-only discrimination (there is no separate `kind` field).

#### Scenario: A payment and a later refund both appear, correctly signed

- GIVEN a payment of `60000` on `2026-08-12` and a refund of `10000` on `2026-08-20`
- WHEN the "Pagos" list is rendered
- THEN both entries MUST appear in date order, and the refund MUST render as a negative amount

### Requirement: Recording A Payment And Recording A Refund Submit The Same Endpoint, Differing Only By Sign

The "Anotar un pago" sheet MUST submit a positive amount and the
"Devolución" sheet MUST submit a negative amount, both to
`POST /reservations/{id}/payments`.

#### Scenario: The refund sheet submits a negative amount

- GIVEN the owner enters `10000` into the "Devolución" sheet
- WHEN she confirms
- THEN the request MUST submit `amount: -10000` to the payments endpoint

### Requirement: Cancelling Requires Explicit Confirmation And Frees The Nights Immediately

Tapping "Cancelar" MUST open a confirmation sheet naming the affected date
range and cabin, matching the handoff's copy. Confirming MUST call
`POST /reservations/{id}/cancel`; declining MUST send no request. Once
confirmed, the reservation's nights MUST no longer render as occupied on the
reservation calendar without requiring a manual refresh.

#### Scenario: Declining the confirmation sends no request

- GIVEN the cancellation confirmation sheet is open
- WHEN the owner taps "No, dejarla como está"
- THEN no request MUST be sent and the reservation MUST remain unchanged

#### Scenario: Confirming frees the nights on the calendar without a manual refresh

- GIVEN a reservation for `2026-09-03` to `2026-09-07` on Casa Azul
- WHEN the owner confirms cancellation
- THEN the reservation calendar for Casa Azul MUST stop showing those nights as occupied without the owner reloading the page

### Requirement: Cancellation Preserves Payment History

A cancelled reservation's detail view MUST continue to list every payment
and refund recorded before cancellation.

#### Scenario: Prior payments remain listed after cancellation

- GIVEN a reservation with two recorded payments is then cancelled
- WHEN its detail view is rendered afterward
- THEN both payments MUST still appear in the "Pagos" list

### Requirement: Editing Is Reachable Only While The Reservation Is Not Cancelled

The system MUST NOT render any edit affordance on a cancelled reservation's
detail view. A non-cancelled reservation MUST render an edit affordance
leading to the bounded edit view described below.

#### Scenario: A cancelled reservation offers no way to edit

- GIVEN a cancelled reservation's detail view
- WHEN its available actions are enumerated
- THEN none MUST offer to edit dates or price

#### Scenario: A non-cancelled reservation offers editing

- GIVEN a non-cancelled reservation's detail view
- WHEN its available actions are enumerated
- THEN an edit affordance MUST be present

### Requirement: Editing Bounds Itself To Dates And Price Only

The edit view MUST NOT render any control to change the reservation's cabin
or guest, matching `ReservationUpdate`'s accepted fields (`check_in`,
`check_out`, `price_per_night`, `price_total`).

#### Scenario: The edit view has no cabin or guest control

- GIVEN the edit view for a non-cancelled reservation is open
- WHEN its editable fields are enumerated
- THEN none MUST allow changing the cabin or the guest

### Requirement: The Edit Calendar Excludes The Reservation Being Edited From Its Own Occupied Display

When editing a reservation's dates, the date picker MUST NOT render that
same reservation's currently held nights as occupied. Every other
reservation's occupied nights on that cabin MUST still render normally.

#### Scenario: A reservation's own nights are not shown as blocking its own edit

- GIVEN Reservation R currently holds `2026-09-03` to `2026-09-07` on Casa Azul, and no other reservation overlaps those nights
- WHEN the edit picker for R is opened
- THEN `2026-09-03` through `2026-09-06` MUST NOT render as occupied on that picker

#### Scenario: Moving a stay by one night succeeds without a false block

- GIVEN Reservation R holds `2026-09-03` to `2026-09-07` on Casa Azul, and `2026-09-08` is free
- WHEN the owner edits R's dates to `2026-09-04` to `2026-09-08` on the edit picker
- THEN the picker MUST NOT show `2026-09-03` through `2026-09-06` as blocking the new selection, and the edit MUST be submittable

#### Scenario: Another reservation's occupied nights still block the edit picker

- GIVEN Reservation R is being edited on Casa Azul, and a different Reservation S occupies `2026-09-10` to `2026-09-12` on the same cabin
- WHEN the edit picker for R is rendered
- THEN `2026-09-10` and `2026-09-11` MUST still render as occupied

### Requirement: Editing Rescales Or Preserves Price Identically To Recording

Extending or shortening dates during an edit MUST rescale a per-night price
and MUST leave a stay-total price untouched, following the same rule as
`reservation-recording`.

#### Scenario: Extending a per-night-priced reservation during an edit rescales its total

- GIVEN a reservation of 4 nights at `$ 45.000` per night
- WHEN the owner edits it to 5 nights
- THEN the displayed effective total MUST become `$ 225.000` without her re-entering a price

#### Scenario: Extending a stay-total-priced reservation during an edit leaves it untouched

- GIVEN a reservation of 4 nights with a stay-total price of `$ 180.000`
- WHEN the owner edits it to 5 nights
- THEN the displayed total MUST remain `$ 180.000` until she edits the price explicitly

### Requirement: Lowering An Edited Price Below What Has Been Paid Is Allowed

The edit view MUST NOT block saving a price lower than the amount already
paid, and the resulting negative balance MUST render as "Le tenés que
devolver", not as an error.

#### Scenario: A price edit that creates a refund owed is accepted

- GIVEN a reservation with an effective total of `180000` and `180000` already paid
- WHEN the owner edits the price down to `100000` and saves
- THEN the edit MUST be accepted, and the detail view MUST then read "Le tenés que devolver $ 80.000"

### Requirement: A Conflicting Date Edit Fails Visibly, Naming Which Nights Are Free

When an edit's new dates overlap another reservation, the system MUST show a
Spanish message stating the cabin is occupied those nights and indicating
which nights within the requested range remain free, using no technical
wording. The edit MUST NOT be saved.

#### Scenario: An overlapping date edit is rejected with plain-language copy

- GIVEN Reservation R is being edited to overlap Reservation S's occupied nights
- WHEN the owner submits the conflicting edit
- THEN the system MUST show a message that the cabin is occupied those nights, naming which nights of the requested range are free, without the words "error", "conflicto", or "409"
- AND R's dates MUST remain unchanged
