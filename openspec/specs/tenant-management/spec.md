# Tenant Management Specification

## Purpose

Provisions tenants (cabin rental owners) and their founding owner account. Each tenant is a fully isolated data boundary; there is no tenant hierarchy and no shared data between tenants.

## Requirements

### Requirement: Tenant Record

The system MUST store each tenant as a row with `id` (UUID, primary key), `name`, `slug` (unique, URL-safe, used to key the public availability calendar), and `created_at`.

#### Scenario: Slug uniqueness

- GIVEN a tenant already exists with slug `mar-del-tuyu-cabins`
- WHEN a new tenant registration requests the same slug
- THEN the system MUST reject the registration with HTTP 409

### Requirement: Self-Registration Creates Tenant and Founding Owner Atomically

The system MUST create the tenant record and its founding owner user (see `authentication`) inside a single database transaction. Partial provisioning MUST NOT be possible.

#### Scenario: Successful self-registration

- GIVEN no tenant exists with the requested slug
- WHEN a registration request supplies tenant name, slug, and owner credentials
- THEN the system MUST create exactly one tenant row and exactly one owner user row
- AND both MUST be visible together, or neither MUST exist

#### Scenario: Registration failure rolls back both

- GIVEN a registration request with a valid tenant slug but an owner credential that fails validation
- WHEN the registration is submitted
- THEN the system MUST create NEITHER the tenant row NOR the owner user row

### Requirement: Tenant Provisioning Is the Only Onboarding Path

The system MUST support tenant creation only through self-registration in this change. Admin-created tenants and any cross-tenant admin endpoint are out of scope.

#### Scenario: No admin tenant-creation endpoint exists

- GIVEN the deployed API surface
- WHEN inspecting available routes
- THEN there MUST be no endpoint that creates a tenant on behalf of another tenant or without owner self-registration

### Requirement: Tenant Public Contact Field

The tenant record MUST gain a nullable public contact field (a WhatsApp number). The column MUST be nullable: `POST /auth/register` and `RegisterRequest` are out of scope for this change and remain fixed at `{tenant_slug, name, email, password}`, so the contact cannot be supplied at tenant creation and MUST be settable afterward instead.

The value MUST be stored normalised as digits only — 8 to 15 of them, E.164 without a leading `+` — because that is precisely what a `wa.me/<digits>` link consumes, and the frontend builds that link by concatenation and never parses. The stored form is therefore NOT the form the owner typed: separators a caller may reasonably type (spaces, `+`, `(`, `)`, `.`, `-`) MUST be accepted as input and MUST NOT survive normalisation.

Normalisation MUST reject before it strips. Any character outside the accepted input set MUST cause rejection while the original value is still intact — stripping first and validating afterward would silently reduce free text such as `"llamame al 1122334455"` to a valid-looking number the owner never intended to publish. The same shape MUST also be enforced at the database level as a concurrency-safe backstop, so the two halves cannot drift apart.

#### Scenario: A newly registered tenant has no contact set

- GIVEN a tenant completes registration through the unchanged `POST /auth/register` flow
- WHEN the tenant row is read immediately afterward
- THEN its public contact field MUST be `NULL`

#### Scenario: A typed number is stored normalised, not as entered

- GIVEN an owner submits a contact value containing separators, such as a leading `+` or spaces, dashes and parentheses
- WHEN the value is stored
- THEN the persisted value MUST contain digits only, with every separator removed, and MUST satisfy the same 8-to-15-digit shape the database CHECK enforces

#### Scenario: Free text is rejected rather than reduced to its digits

- GIVEN an owner submits a value containing characters outside the accepted separator set, such as `"llamame al 1122334455"`
- WHEN the value is validated
- THEN the request MUST be rejected, and the embedded digits MUST NOT be extracted and stored as if they were the intended number

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
