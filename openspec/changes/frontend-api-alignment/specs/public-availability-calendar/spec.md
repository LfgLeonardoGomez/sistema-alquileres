# Delta for Public Availability Calendar

## ADDED Requirements

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
