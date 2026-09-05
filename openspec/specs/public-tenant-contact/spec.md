# Public Tenant Contact Specification

## Purpose

The tenant's own published contact channel — a WhatsApp number the owner sets, exposed without authentication so a prospect on the public availability page can reach the owner directly. It is the second unauthenticated surface in the system, deliberately kept independent of `public-availability-calendar`: a contact number belongs to the tenant, not to any property or reservation, and mixing it into the availability response would leave a future reader unable to tell whether it was a deliberate publication or a privacy-boundary regression that survived review. Publishing it is not a leak — it is the owner's own commercial contact information, chosen by the owner to be seen by strangers, categorically different from reservation, client, or payment data, and it touches only `tenants`, a table that by rule (`tenant-management`) holds nothing else private. This capability gives it its own endpoint, its own response model, and its own column projection over `tenants` only.

## Requirements

### Requirement: Unauthenticated Endpoint Keyed By Tenant Slug, Separate From Availability

The system MUST expose a public, unauthenticated endpoint under `/public/{tenant_slug}/...` that returns a tenant's public contact information, resolved by the tenant's unique `slug`, at a route distinct from `GET /public/{tenant_slug}/availability`. It MUST NOT be a field added to the availability response.

#### Scenario: Unknown slug

- WHEN a request targets a slug that does not match any tenant
- THEN the system MUST respond with HTTP 404

#### Scenario: Valid slug returns data without a token

- GIVEN a tenant with slug `mar-del-tuyu-cabins` and a configured public contact value
- WHEN an unauthenticated request is made to the tenant contact endpoint for that slug
- THEN the system MUST return HTTP 200 with the tenant's public identity and contact value

### Requirement: The Response Model Carries Only Tenant Identity And Contact

The response MUST be produced by a dedicated response model, sharing no base class with `PublicAvailability` or with any authenticated schema, that structurally cannot carry any reservation, client, property, or payment field.

#### Scenario: Contract test asserts absent fields

- GIVEN the tenant contact response schema
- WHEN inspecting its fields
- THEN none of `client_name`, `client_phone`, `email`, `national_id`, `price`, `total`, `amount`, `payment`, `reservation_id`, or `property_id` MUST be present

### Requirement: An Unset Contact Reads As Null, Not As An Error Or A Missing Field

When a tenant has not set a contact value, the endpoint MUST still respond HTTP 200, with the contact field present and `null` — never HTTP 404 (the tenant exists), and never an omitted field.

#### Scenario: A tenant with no contact configured

- GIVEN a tenant whose public contact field is `NULL`
- WHEN the public contact endpoint is called for that tenant's slug
- THEN the system MUST respond HTTP 200 with the contact field present and `null`

### Requirement: The Query Projects Only `tenants` Columns

The database query backing this endpoint MUST select only the tenant's own identity and contact columns from `tenants`, and MUST NOT join to or fetch from any tenant-scoped table (properties, clients, reservations, payments).

#### Scenario: The projection touches no tenant-scoped table

- GIVEN the tenant contact endpoint's query
- WHEN inspecting which tables it reads
- THEN it MUST read only `tenants`, and no other table
