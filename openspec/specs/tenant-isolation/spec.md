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

**This guarantee MUST hold on the schema produced by the system's single schema-construction path** (see `schema-migrations`), not merely on some schema built by any available means. A schema built by an alternate, non-authoritative path MUST NOT be treated as satisfying this requirement, and the test suite that verifies this requirement MUST run against the schema produced by that single construction path — never against a schema built by a bypassed or divergent mechanism.


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

#### Scenario: RLS holds on the schema produced by the single construction path

- GIVEN the schema has been built through the system's single schema-construction path (migrations, not an alternate bootstrap path)
- WHEN the existing `pg_catalog`/`pg_policies` structural audit runs against that schema
- THEN it MUST find `relrowsecurity`, `relforcerowsecurity`, and the `tenant_isolation` policy present on every tenant-owned table, with no divergence from what the previously-used bootstrap-built schema showed

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

### Requirement: `tenants` Is Structurally Excluded From The Table Audit, By Design

`tenants` MUST remain a global table with no `tenant_id` column — its key is `id` — because login (`POST /auth/login`) and public slug resolution (`GET /public/{tenant_slug}/...`) MUST be able to read it before any tenant context exists. Because the `pg_catalog`/`pg_policies` structural audit (see "Schema audit" above) selects its subjects by the presence of a `tenant_id` column, `tenants` MUST be understood as deliberately outside that audit's coverage, not as an oversight in it — and a passing result from that audit MUST NOT be treated as evidence that a write path added to `tenants` is safe.

This exclusion is a statement about the audit's reach, not about the table's protection. `tenants` carries its own Row-Level Security policies (see the requirement below); they are simply invisible to a column-driven query. Any claim that `tenants` is protected MUST therefore cite that table's own dedicated tests, never this audit.

#### Scenario: The structural audit does not, and is not expected to, cover `tenants`

- GIVEN the `pg_catalog`/`pg_policies` structural audit that verifies RLS on every table carrying a `tenant_id` column
- WHEN it runs against the schema
- THEN it MUST NOT assert anything about `tenants`, and its passing MUST NOT be read as evidence that a write path on `tenants` is safe

#### Scenario: The audit's own triangulation subject is a table that will never gain RLS

- GIVEN the audit is triangulated by a table deliberately expected to carry no RLS, proving the query is driven by column presence rather than a hardcoded table list
- WHEN `tenants` gains Row-Level Security
- THEN that triangulation subject MUST move to a table that will never gain RLS or a `tenant_id` column — `alembic_version` — and the triangulating assertion MUST NOT be weakened to accommodate the change

### Requirement: `tenants` Carries Per-Command Row-Level Security, Enabled And Not Forced

`tenants` MUST have Row-Level Security `ENABLE`d and MUST NOT have it `FORCE`d. `alquileres_app` is not the table's owner, so plain `ENABLE` binds the application role completely; `FORCE` would additionally constrain `alquileres_migrator`, whose only `tenants` traffic is the bootstrap and seed path, and would impose a standing "set `app.tenant_id` before every insert" rule on code that legitimately inserts a tenant row before any tenant context can exist.

The table MUST carry exactly three policies, each naming both `alquileres_app` and `alquileres_migrator`:

- `tenants_read` `FOR SELECT USING (true)` — deliberately as permissive as no RLS at all, so the pre-context reads login and the public routes depend on are unaffected by construction.
- `tenants_insert` `FOR INSERT WITH CHECK (true)` — same rationale, for the bootstrap insert path.
- `tenants_self_update` `FOR UPDATE`, with both `USING` and `WITH CHECK` predicated on `id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`.

The predicate's right-hand side MUST be copied verbatim from the existing baseline policies rather than retyped from prose; the left-hand side MUST be `id`, because `tenants` has no `tenant_id` column. A policy comparing against any other setting name — `app.current_tenant_id`, for instance — would still exist, still be named correctly, and still enforce nothing, so the policy's rendered predicate text MUST itself be asserted.

There MUST be no `DELETE` policy and no `DELETE` grant on `tenants`. Because RLS denies by omission rather than by error, a `DELETE` grant added later without a matching policy would report success while removing nothing — a silent failure mode that MUST be understood as introduced by enabling RLS on this table.

#### Scenario: The policy set and its predicate text are asserted structurally

- GIVEN `tenants` has Row-Level Security enabled
- WHEN `pg_policies` is inspected for the table
- THEN exactly `tenants_read` (SELECT), `tenants_insert` (INSERT), and `tenants_self_update` (UPDATE) MUST be present, each naming both roles, and the UPDATE policy's `qual` and `with_check` text MUST reference `app.tenant_id`

#### Scenario: Pre-context reads survive the introduction of RLS

- GIVEN no `app.tenant_id` has been set on the connection
- WHEN the application role resolves a tenant by slug, as login and the public routes do
- THEN the row MUST still be returned

### Requirement: Any Write Path On `tenants` MUST Guarantee A Tenant Can Only Modify Its Own Row

Any endpoint that writes to `tenants` MUST guarantee that a tenant can only ever modify its own row, and MUST do so through defense that survives the failure of any single layer:

1. No tenant identifier appears anywhere in the request surface — not in a path parameter, a query parameter, or a body field.
2. The row is resolved from the verified `tid` token claim, never from client input.
3. A column-scoped `GRANT UPDATE` limits the application role to the specific columns a tenant may change; PostgreSQL checks column privileges independently of RLS, so this layer holds regardless of any policy.
4. The `tenants_self_update` RLS policy scopes the write to the row matching `app.tenant_id`.

This guarantee MUST be verified by dedicated behavioral tests that run against the `alquileres_app` role, never `alquileres_migrator` — the migrator bypasses these policies entirely, since `tenants` is `ENABLE`d and not `FORCE`d, so a test running as the migrator would pass while proving nothing. A code-review-only or unit-level guarantee is insufficient.

#### Scenario: An authenticated owner cannot modify another tenant's row through any write path

- GIVEN Tenant A and Tenant B both exist, and Tenant A is authenticated
- WHEN Tenant A calls a `tenants`-writing endpoint with any parameter, header, or body value that could name Tenant B
- THEN Tenant B's row MUST remain unchanged, verified against the running `alquileres_app` role

#### Scenario: An unqualified UPDATE is scoped to the acting tenant's row alone

- GIVEN three tenant rows exist and `app.tenant_id` is set to Tenant A
- WHEN the application role issues an `UPDATE tenants SET ...` with no `WHERE` clause at all
- THEN exactly one row MUST be affected and the other tenants' rows MUST remain unchanged

#### Scenario: A column outside the grant is denied even for the tenant's own row

- GIVEN `app.tenant_id` is set to Tenant A and the target row is Tenant A's own
- WHEN the application role attempts to update a column outside the column-scoped grant
- THEN the statement MUST be denied by the grant, independently of what the RLS policy would permit

#### Scenario: The guarantee is exercised by a behavioral test, not inferred from the structural audit

- GIVEN a write path exists on `tenants`
- WHEN the test suite is inspected
- THEN a dedicated cross-tenant-write test for `tenants` MUST exist, distinct from the `pg_catalog` structural audit that does not cover this table

#### Scenario: The cross-tenant test is proven to detect a removed predicate

- GIVEN the `tenants_self_update` policy's `USING` and `WITH CHECK` predicates are both temporarily replaced with `true`
- WHEN the unqualified-`UPDATE` test is re-run
- THEN it MUST fail on the affected-row count, demonstrating that the test detects the exact regression it exists to guard against, and the observed output MUST be recorded rather than asserted
