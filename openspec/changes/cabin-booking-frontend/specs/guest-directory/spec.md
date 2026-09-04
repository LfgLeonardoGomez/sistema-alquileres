# Guest Directory Specification

## Purpose

Screens 09 and 10 plus add/edit: guests keyed by phone number, deactivated
guests visible by design rather than hidden, and a per-guest stay history and
balance computed client-side, since no per-guest aggregate endpoint exists.

## Requirements

### Requirement: Guests Are Keyed By Phone; An Existing Number Never Duplicates

Adding a guest with a phone number matching an existing active client MUST
resolve to that existing client rather than creating a second one. Matching
a deactivated client's number MUST reactivate that client rather than
creating a duplicate.

#### Scenario: An existing active guest's number opens that guest

- GIVEN an active client exists with phone `1122334455`
- WHEN the owner adds a guest with phone `1122334455`
- THEN the system MUST resolve to the existing client and MUST NOT create a new one

#### Scenario: A deactivated guest's number reactivates rather than duplicates

- GIVEN a deactivated client exists with phone `1122334455`
- WHEN the owner adds a guest with phone `1122334455`
- THEN the system MUST resolve to that same client, reactivated, and MUST NOT create a second client with that number

### Requirement: Deactivated Guests Remain Visible, Marked, Never Hidden

The guest list MUST be fetched with `include_inactive=true` and MUST render
a deactivated guest with grey styling and "Desactivado" alongside their stay
count, rather than omitting them.

#### Scenario: A deactivated guest still appears in the list

- GIVEN a client whose `is_active` is `false`
- WHEN the guest list is rendered
- THEN that guest MUST appear, marked "Desactivado", and MUST NOT be filtered out

### Requirement: Search Filters By Name Or Phone, Client-Side

Typing into "Buscar por nombre o teléfono" MUST filter the visible rows to
only guests whose name or phone contains the typed text, computed from the
already-fetched list.

#### Scenario: A partial phone number filters to matching guests only

- GIVEN guests with phones `1122334455` and `1155667788`
- WHEN the owner types `2233`
- THEN only the guest with phone `1122334455` MUST remain visible

### Requirement: Per-Guest Stay Count And Balance Are Computed Client-Side From Non-Cancelled Stays

Because no per-guest aggregate endpoint exists, the system MUST compute each
guest's stay count and total balance from the reservation list, counting and
summing only non-cancelled reservations.

#### Scenario: A guest's combined balance sums only non-cancelled stays

- GIVEN a guest has one non-cancelled stay with a balance of `80000` and one cancelled stay
- WHEN the guest row is rendered
- THEN it MUST show `"Debe $ 80.000"`, excluding any amount from the cancelled stay

#### Scenario: A guest's stay count excludes cancelled stays

- GIVEN a guest has two non-cancelled stays and one cancelled stay
- WHEN the guest row is rendered
- THEN it MUST show `"2 estadías"`

### Requirement: A Guest's Stay History Lists Every Non-Cancelled Stay, Collapsing Overflow

The guest detail sheet MUST list each non-cancelled stay; stays beyond the
sheet's visible rows MUST collapse into a single summary line naming the
month of the earliest overflowing stay.

#### Scenario: Stays beyond the visible rows collapse into one summary line

- GIVEN a guest has more non-cancelled stays than the sheet displays directly, with the first overflowing stay in February
- WHEN the guest detail sheet is rendered
- THEN it MUST show a line reading "y 1 estadía más en febrero" for that overflow (adjusted to the actual overflow count)

### Requirement: Tapping A Stay Row Opens That Reservation's Detail

Tapping a stay row in the guest detail sheet MUST navigate to that
reservation's detail view.

#### Scenario: Tapping a stay row opens the matching reservation detail

- GIVEN a guest's detail sheet lists a stay for Reservation R
- WHEN the owner taps that row
- THEN the system MUST navigate to Reservation R's detail view

### Requirement: Deactivating A Guest Requires Confirmation And Deletes No Data

Tapping "Desactivar" MUST open a confirmation sheet before any request is
sent. Confirming MUST perform a soft delete; the guest's historical stays
MUST remain fully readable and named afterward.

#### Scenario: Confirming deactivation preserves stay history

- GIVEN a guest with two past stays
- WHEN the owner confirms deactivation
- THEN both past stays MUST remain visible with the guest's name intact

### Requirement: Add/Edit Guest Forms Reject A Blank Name Or Phone Before Submitting

Submitting the add or edit guest form with an empty name or phone field MUST
be blocked client-side; no request MUST be sent.

#### Scenario: A blank phone field blocks submission

- GIVEN the add-guest form has a name entered and an empty phone field
- WHEN the owner attempts to submit
- THEN no request MUST be sent to the API
