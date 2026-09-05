# Delta for Tenant Management

## ADDED Requirements

### Requirement: Tenant Public Contact Field

The tenant record MUST gain a nullable public contact field (a WhatsApp number), storing the value as entered. The column MUST be nullable: `POST /auth/register` and `RegisterRequest` are out of scope for this change and remain fixed at `{tenant_slug, name, email, password}`, so the contact cannot be supplied at tenant creation and MUST be settable afterward instead.

#### Scenario: A newly registered tenant has no contact set

- GIVEN a tenant completes registration through the unchanged `POST /auth/register` flow
- WHEN the tenant row is read immediately afterward
- THEN its public contact field MUST be `NULL`

### Requirement: `tenants` Holds Only Data Safe To Publish

Any field added to the `tenants` table MUST be either data the owner has explicitly chosen to make publicly reachable, or structural data the slug-keyed public surface already exposes (e.g. `name`, `slug`). `tenants` MUST NOT be used to store owner-private data — billing details, personal identifiers, internal notes, or anything not meant for a stranger who resolves the tenant by slug. Data of that kind belongs on a tenant-scoped, RLS-protected table instead. This rule exists so a future contributor does not read the public-contact column as license to treat `tenants` as a general owner-profile table.

#### Scenario: Schema audit finds no private-only field on `tenants`

- GIVEN the `tenants` table schema
- WHEN inspecting its columns
- THEN every column MUST be either structural (`id`, `slug`, `name`, `created_at`) or a field the owner has chosen to publish (the public contact field)

### Requirement: Owner Self-Service Write Path For The Tenant Contact

The system MUST expose an authenticated endpoint that lets the owner set, update, or clear their own tenant's public contact field. The endpoint MUST identify the target tenant exclusively from the caller's verified token claim, never from a client-supplied tenant identifier in the path, query, or body. This endpoint MUST satisfy the cross-tenant write guarantee stated in `tenant-isolation`.

#### Scenario: The owner sets the contact value

- GIVEN an authenticated owner whose tenant has no contact set
- WHEN the owner calls the write endpoint with a WhatsApp number
- THEN the tenant's public contact field MUST be updated to that value

#### Scenario: The owner clears the contact value

- GIVEN an authenticated owner whose tenant has a contact value set
- WHEN the owner calls the write endpoint to clear it
- THEN the tenant's public contact field MUST become `NULL`

#### Scenario: The write endpoint accepts no tenant identifier from the caller

- GIVEN an authenticated owner of Tenant A
- WHEN the owner calls the write endpoint, even if a different tenant id is supplied anywhere in the request (path, query, or body)
- THEN the system MUST update Tenant A's row only, using the tenant id carried in the verified token
