# Delta for Tenant Isolation

## MODIFIED Requirements

### Requirement: Row-Level Security Enforces Tenant Scoping

The system MUST enable PostgreSQL Row-Level Security on every tenant-owned table with a policy restricting rows to `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` (the `NULLIF` guards against an empty string reaching the cast; the `true` argument to `current_setting` makes a missing setting evaluate to NULL instead of raising). A request-scoped dependency MUST set this session variable transaction-locally via `SELECT set_config('app.tenant_id', :tid, true)`, with the tenant id passed as a **bound parameter** — never `SET LOCAL` and never string interpolation. `SET LOCAL` cannot take a bind parameter, and interpolating a tenant id into SQL text is how injection happens; `set_config(..., true)` achieves the identical transaction-local lifetime through a parameterized call.

The policy MUST be granted `FOR ALL` to both the application role (`alquileres_app`) and the schema-owning migrator/seed role (`alquileres_migrator`), through the identical `tenant_id` predicate — this is not a bypass, and neither role MUST hold `BYPASSRLS`. This dual grant is required because every tenant-owned table also has `FORCE ROW LEVEL SECURITY` enabled, which subjects the table owner to RLS as well; in PostgreSQL, a role with no applicable policy on a forced-RLS table receives zero rows, not an implicit bypass. Without the migrator named on the policy, it could not seed or fixture tenant-scoped data at all.

**This guarantee MUST hold on the schema produced by the system's single schema-construction path** (see `schema-migrations`), not merely on some schema built by any available means. A schema built by an alternate, non-authoritative path MUST NOT be treated as satisfying this requirement, and the test suite that verifies this requirement MUST run against the schema produced by that single construction path — never against a schema built by a bypassed or divergent mechanism.

(Previously: this requirement described the RLS/FORCE/policy/grant shape without specifying which schema-construction path it must hold on; in practice the schema was implicitly whatever the project's one existing bootstrap script produced. It now binds explicitly to the single construction path defined by `schema-migrations`.)

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
