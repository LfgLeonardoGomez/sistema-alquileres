# Reservation Recording Specification

## Purpose

The four-step wizard (cabaña → fechas → huésped → precio) that writes down a
stay the owner already agreed to on WhatsApp. The defining rule is that
availability is shown before dates are ever requested — an overlapping
selection must be unreachable, never an error returned after the fact — and
that a stay's price is entered exactly one way, never both.

## Requirements

### Requirement: Wizard State Persists Across Steps And Back Navigation

Selections made on any step MUST remain intact when the owner moves forward,
and MUST still be present if she navigates back to a previous step.

#### Scenario: Going back preserves the previously chosen dates

- GIVEN the owner has chosen dates on step 2 and moved to step 3
- WHEN she navigates back to step 2
- THEN the previously chosen dates MUST still be shown, not cleared

### Requirement: Only Active Cabins Are Offered On The Cabin Step

Step 1 MUST list only cabins whose `is_active` is `true`. A deactivated
cabin MUST NOT be selectable for a new reservation.

#### Scenario: A deactivated cabin does not appear in the step-1 list

- GIVEN one active and one deactivated cabin
- WHEN step 1 is rendered
- THEN only the active cabin MUST be offered

### Requirement: Availability Is Shown Before Dates Are Requested

The date-picker step MUST render every occupied night as inert (not
selectable) using the data already fetched, so an overlapping selection is
structurally unreachable. The system MUST NOT allow a tap on an occupied
night to start or extend a range and then report a conflict after
submission.

#### Scenario: Tapping an occupied night produces no selection and no request

- GIVEN a night already occupied by another reservation on the selected cabin
- WHEN the owner taps that night on the picker
- THEN no range selection MUST begin, and no request to the API MUST be sent

### Requirement: Adjacency Is A Legal Selection

A range that ends on the same day another stay begins MUST be selectable
and MUST proceed to the summary step with no warning of any kind.

#### Scenario: Selecting a range ending on another stay's check-in day succeeds

- GIVEN another reservation on the selected cabin begins on `2026-09-12`
- WHEN the owner selects a range ending on `2026-09-12`
- THEN the selection MUST be accepted and the step-2 summary MUST show it with no warning

### Requirement: Past Dates Are Freely Selectable With No Warning

A date range entirely in the past MUST be selectable and MUST produce
exactly the same summary presentation as a future range — no confirmation
prompt, no visual warning, no distinguishing treatment of any kind.

#### Scenario: A fully past range proceeds identically to a future one

- GIVEN today is `2026-09-04`
- WHEN the owner selects a range from `2026-08-01` to `2026-08-05`
- THEN the step-2 summary MUST render exactly as it would for a future range, with no warning shown

### Requirement: A Guest Is Found Or Created By Phone, Never Duplicated

Step 3 MUST resolve a guest by phone number: an existing active guest's
number opens that guest, an existing deactivated guest's number reactivates
that guest, and an unrecognized number creates a new guest — all inline,
without leaving the wizard, and never producing two client records for the
same number.

#### Scenario: An existing guest's phone number resolves to that guest

- GIVEN a client already exists with phone `1122334455`
- WHEN the owner enters `1122334455` on step 3
- THEN the wizard MUST proceed using that existing client, and MUST NOT create a new one

#### Scenario: A deactivated guest's phone number reactivates rather than duplicates

- GIVEN a deactivated client exists with phone `1122334455`
- WHEN the owner enters `1122334455` on step 3
- THEN the wizard MUST proceed using that same client, reactivated, and MUST NOT create a second client with that number

### Requirement: Price Entry Is Mutually Exclusive

Step 4's segmented control (`Por noche` / `Total de la estadía`) MUST allow
exactly one mode to be active at a time. The submitted request MUST carry
exactly one of `price_per_night` or `price_total`, matching whichever mode
is active, and never both.

#### Scenario: Switching modes changes which field is submitted

- GIVEN the owner entered an amount under `Por noche`, then switches to `Total de la estadía` and enters a different amount
- WHEN she submits the reservation
- THEN the request MUST carry `price_total` only, using the amount entered under that mode, and MUST NOT carry `price_per_night`

### Requirement: A Per-Night Price Rescales On A Date Change; A Stay-Total Price Does Not

Returning to step 2 and changing the selected dates MUST recompute the
displayed total when the active mode is `Por noche`, and MUST leave the
displayed amount unchanged when the active mode is `Total de la estadía`.

#### Scenario: Extending a per-night stay rescales the shown total

- GIVEN a 4-night selection priced at `$ 45.000` per night, showing a total of `$ 180.000`
- WHEN the owner returns to step 2 and extends the stay to 5 nights
- THEN the displayed total on step 4 MUST become `$ 225.000` without her re-entering a price

#### Scenario: Extending a stay-total stay leaves the amount untouched

- GIVEN a 4-night selection priced with a stay total of `$ 180.000`
- WHEN the owner returns to step 2 and extends the stay to 5 nights
- THEN the displayed amount on step 4 MUST remain `$ 180.000` until she changes it explicitly

### Requirement: Saving Clears The Draft And Leaves The Wizard

A successful save MUST clear the wizard draft from the store and MUST
navigate away from the wizard, so that opening "Anotar una reserva" again
starts a fresh draft rather than resuming the just-saved one.

#### Scenario: A successful save resets the next wizard entry

- GIVEN the owner just saved a reservation successfully
- WHEN she taps "Anotar una reserva" again
- THEN the wizard MUST start at step 1 with no data carried over from the just-saved reservation

### Requirement: Saving Without Connectivity Fails Visibly And Preserves The Draft

Tapping "Guardar la reserva" without network connectivity MUST show a
message that the reservation could not be saved, MUST leave every entered
value (cabin, dates, guest, price mode and amount) intact, and MUST NOT
create the reservation once connectivity returns unless the owner taps save
again.

#### Scenario: Tapping save while offline preserves every step's entries

- GIVEN the device has no connectivity and the owner has completed all four steps
- WHEN she taps "Guardar la reserva"
- THEN she MUST see a message that it could not be saved, and all four steps' entries MUST remain intact
- AND no reservation MUST be created automatically once connectivity returns
