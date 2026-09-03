# Public Availability Calendar Specification

## Purpose

An unauthenticated, tenant-scoped read surface that lets prospects check availability without exposing any private data. This is a privacy boundary — the response contract is structural, not conventional.

## Requirements

### Requirement: Unauthenticated Endpoint Keyed by Tenant Slug

The system MUST expose `GET /public/{tenant_slug}/availability` without requiring authentication, resolving the tenant by its unique `slug`.

#### Scenario: Unknown slug

- WHEN a request targets a slug that does not match any tenant
- THEN the system MUST respond with HTTP 404

#### Scenario: Valid slug returns data without a token

- GIVEN a tenant with slug `mar-del-tuyu-cabins` and properties with reservations
- WHEN an unauthenticated request is made to `/public/mar-del-tuyu-cabins/availability`
- THEN the system MUST return HTTP 200 with availability data

### Requirement: Response Exposes Only Property Identity and Occupied Ranges

The response MUST contain, per property, the property name and a list of occupied date ranges (`check_in`, `check_out`). It MUST be produced by a dedicated response model that structurally cannot carry any other field.

#### Scenario: Occupied ranges match non-cancelled reservations

- GIVEN Property P has one `reserved` reservation from `2026-12-05` to `2026-12-10` and one `cancelled` reservation from `2026-12-15` to `2026-12-20`
- WHEN the public availability endpoint is called for that tenant
- THEN the response MUST include the `2026-12-05`–`2026-12-10` range and MUST NOT include the `2026-12-15`–`2026-12-20` range

### Requirement: Inactive Properties Are Excluded

The response MUST NOT include any property whose `is_active` is `false` (see `property-management`).

#### Scenario: Inactive property absent from the public calendar

- GIVEN a tenant with one active property and one soft-deleted (inactive) property
- WHEN the public availability endpoint is called for that tenant
- THEN the response MUST list only the active property, and the inactive property MUST NOT appear at all

### Requirement: No Private Fields Are Reachable

The response model MUST NOT define fields for client name, phone, email, national ID, price, payment amounts, payment dates, or reservation identifiers.

#### Scenario: Contract test asserts absent fields

- GIVEN the public availability response schema
- WHEN inspecting its fields, including nested objects
- THEN none of `client_name`, `phone`, `email`, `national_id`, `price`, `total`, `amount`, `payment`, or `reservation_id` MUST be present
