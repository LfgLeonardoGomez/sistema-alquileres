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

### Requirement: The Window Is Caller-Supplied and Mandatory

The endpoint MUST require both `from` and `to` query parameters, and
neither MUST be given a default. There is no implicit "current month"
fallback: a caller that omits either one MUST receive a validation error
rather than a silently chosen window, so a client can never render a
calendar for a period it did not ask for.

#### Scenario: Missing window parameter is rejected

- WHEN the public availability endpoint is called without `from`, without `to`, or without both
- THEN the system MUST respond with HTTP 422 and MUST NOT return availability data

#### Scenario: Both parameters supplied

- WHEN the endpoint is called with both `from` and `to`
- THEN the system MUST return occupied ranges for that window only

### Requirement: The Query Layer Selects Only The Columns It Returns

The database query backing this endpoint MUST select individual columns (property id, name, `check_in`, `check_out`), never a whole ORM entity such as `Reservation` or `Property`. This is a required isolation layer in its own right, not a performance optimization: because private columns (client, price, payment, notes, reservation id) are never fetched into process memory, no serialization bug, response-model regression, or accidental field addition can leak them — there is nothing loaded to leak.

#### Scenario: An unfetched column cannot leak even if the response model is widened

- GIVEN the public availability query selects only property identity and occupied-range columns, never a full `Reservation` or `Property` entity
- WHEN the response model is hypothetically extended with an additional field
- THEN the query still cannot serialize private data, because that data was never loaded from the database in the first place

### Requirement: Response Exposes Only Property Identity and Occupied Ranges

The response MUST contain, per property, its `id`, its `name`, and a list of occupied date ranges (`check_in`, `check_out`). It MUST be produced by a dedicated response model that structurally cannot carry any other field.

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

### Requirement: No Tenant-Level Field Is Reachable Through The Availability Response

The requirements "Response Exposes Only Property Identity and Occupied Ranges" and "No Private Fields Are Reachable" above stay exactly as written and are not relaxed by this delta. They additionally MUST be read to cover tenant-level fields: the availability response MUST NOT carry a tenant-level field either, including the public contact number introduced by `public-tenant-contact`. That value MUST be reachable only through its own dedicated endpoint (see `public-tenant-contact`), never as a field added here, and never by wrapping this endpoint's `list[PublicAvailability]` response in an envelope to carry it.

#### Scenario: The contract test also asserts no tenant contact value is present

- GIVEN a tenant with a public contact value configured
- WHEN the public availability endpoint is called for that tenant and its response bytes are inspected
- THEN the tenant's contact value MUST NOT appear anywhere in the response

#### Scenario: The availability response shape does not change to accommodate the contact field

- GIVEN the public availability endpoint's response is a bare `list[PublicAvailability]`, with no envelope
- WHEN `public-tenant-contact` is added
- THEN this endpoint's response MUST remain a bare `list[PublicAvailability]`, unchanged in shape
