# Cabin Directory Specification

## Purpose

Screen 08: two cabins, add, rename, deactivate. Nothing is ever deleted, and
because a cabin's name is always resolved live rather than snapshotted onto
a reservation, renaming propagates everywhere the name is shown.

## ADDED Requirements

### Requirement: Cabins Are Never Deleted, Only Deactivated

The system MUST NOT provide any affordance to permanently delete a cabin.
Deactivating MUST perform a soft delete, after which the cabin's reservation
history MUST remain fully readable.

#### Scenario: Deactivating a cabin preserves its reservation history

- GIVEN a cabin with past reservations
- WHEN the owner deactivates it
- THEN its past reservations MUST remain fully readable, with the cabin's name still resolvable

#### Scenario: No permanent-delete affordance exists

- GIVEN the cabin directory screen
- WHEN its available actions are enumerated
- THEN none MUST permanently delete a cabin

### Requirement: Deactivating Requires Confirmation

Tapping deactivate on a cabin MUST open a confirmation sheet before any
request is sent; declining MUST send no request.

#### Scenario: Declining the confirmation sends no request

- GIVEN the deactivation confirmation sheet for a cabin is open
- WHEN the owner declines
- THEN no request MUST be sent and the cabin MUST remain active

### Requirement: Adding A Cabin Requires A Non-Blank Name

Submitting the add-cabin form with a blank name MUST be blocked client-side;
no request MUST be sent.

#### Scenario: A blank name blocks submission

- GIVEN the add-cabin form has an empty name field
- WHEN the owner attempts to submit
- THEN no request MUST be sent to the API

### Requirement: Renaming Propagates Everywhere The Name Is Shown, Without Migrating History

Because guest and cabin names are always resolved live from the cabin lookup rather than stored on the reservation, renaming a cabin MUST update its displayed name on every surface that shows it, including past reservations' detail views, without any data migration step.

#### Scenario: A renamed cabin's new name appears on a past reservation

- GIVEN a past reservation on a cabin named "Casa Azul"
- WHEN the owner renames that cabin to a new name
- THEN the past reservation's detail view MUST show the new name, not "Casa Azul"

### Requirement: Occupied-Nights-This-Month Reuses The Dashboard's Per-Property Breakdown

The "N noches ocupadas este mes" figure on each cabin card MUST come from
`GET /dashboard/summary`'s per-property breakdown for the current month
window, not from a separately recomputed count over the reservation list.

#### Scenario: The displayed figure matches the dashboard's per-property count

- GIVEN `GET /dashboard/summary` reports `9` occupied nights for a given cabin's property id in the current month window
- WHEN that cabin's card is rendered
- THEN it MUST show "9 noches ocupadas este mes", sourced from that same response
