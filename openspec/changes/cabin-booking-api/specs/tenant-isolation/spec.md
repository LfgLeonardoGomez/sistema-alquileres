# Tenant Isolation Specification

## Purpose

Guarantees that no tenant can read or mutate another tenant's data, enforced at both the application and database layers. CRITICAL domain.

## Requirements

### Requirement: Tenant-Owned Tables Carry `tenant_id`

Every tenant-owned table (properties, clients, reservations, payments) MUST have a `tenant_id` column that is `NOT NULL`, of type UUID, referencing `tenants.id`, and included as the leading column of every composite index on that table. Primary keys on tenant-owned tables MUST be UUIDs, never auto-incrementing integers.

#### Scenario: Schema audit

- GIVEN the database schema
- WHEN inspecting properties, clients, reservations, and payments tables
- THEN each MUST have a non-nullable `tenant_id` column and a UUID primary key

### Requirement: Row-Level Security Enforces Tenant Scoping

The system MUST enable PostgreSQL Row-Level Security on every tenant-owned table with a policy restricting rows to `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` (the `NULLIF` guards against an empty string reaching the cast; the `true` argument to `current_setting` makes a missing setting evaluate to NULL instead of raising). A request-scoped dependency MUST set this session variable transaction-locally via `SELECT set_config('app.tenant_id', :tid, true)`, with the tenant id passed as a **bound parameter** — never `SET LOCAL` and never string interpolation. `SET LOCAL` cannot take a bind parameter, and interpolating a tenant id into SQL text is how injection happens; `set_config(..., true)` achieves the identical transaction-local lifetime through a parameterized call.

The policy MUST be granted `FOR ALL` to both the application role (`alquileres_app`) and the schema-owning migrator/seed role (`alquileres_migrator`), through the identical `tenant_id` predicate — this is not a bypass, and neither role MUST hold `BYPASSRLS`. This dual grant is required because every tenant-owned table also has `FORCE ROW LEVEL SECURITY` enabled, which subjects the table owner to RLS as well; in PostgreSQL, a role with no applicable policy on a forced-RLS table receives zero rows, not an implicit bypass. Without the migrator named on the policy, it could not seed or fixture tenant-scoped data at all.

#### Scenario: RLS blocks a query missing the app-level filter

- GIVEN two tenants A and B each with reservations
- WHEN a query for Tenant A's session omits an explicit `tenant_id` filter in application code
- THEN RLS MUST still return only Tenant A's rows

#### Scenario: Session variable reset between requests

- GIVEN a pooled connection previously scoped to Tenant A
- WHEN the connection is returned to the pool and reused for a Tenant B request
- THEN the tenant session setting MUST be reset or set fresh for Tenant B before any Tenant B query executes

#### Scenario: Missing tenant context fails closed, not open

- GIVEN a query runs against a tenant-owned table in a transaction that never called `set_config('app.tenant_id', ...)`
- WHEN the query executes
- THEN `current_setting('app.tenant_id', true)` MUST evaluate to NULL, the policy predicate MUST evaluate to NULL, and RLS MUST return zero rows — absence of tenant context MUST deny access, never grant it

#### Scenario: The migrator role can seed tenant-scoped data under FORCE RLS

- GIVEN `FORCE ROW LEVEL SECURITY` is enabled on a tenant-owned table and `alquileres_migrator` owns that table
- WHEN `alquileres_migrator` sets `app.tenant_id` via `set_config` and inserts a seed row
- THEN the insert MUST succeed because `alquileres_migrator` is named on the `tenant_isolation` policy — not because it bypasses RLS or is exempt as owner

### Requirement: Cross-Tenant Isolation Verified Per Endpoint

With three seeded tenants (A, B, C), every authenticated endpoint that reads or mutates properties, clients, reservations, or payments MUST reject or exclude access to another tenant's rows.

#### Scenario: Read isolation

- GIVEN Tenant A is authenticated
- WHEN Tenant A requests a resource (property, client, reservation, or payment) belonging to Tenant B by its ID
- THEN the system MUST respond as if the resource does not exist (HTTP 404) and MUST NOT leak Tenant B data

#### Scenario: Mutation isolation

- GIVEN Tenant A is authenticated
- WHEN Tenant A attempts to update, cancel, or delete a resource belonging to Tenant B
- THEN the system MUST reject the mutation and Tenant B's row MUST remain unchanged

#### Scenario: List isolation

- GIVEN Tenants A, B, and C each have properties, clients, and reservations
- WHEN Tenant A requests any list endpoint (properties, clients, reservations, payments)
- THEN the response MUST contain only Tenant A's rows
