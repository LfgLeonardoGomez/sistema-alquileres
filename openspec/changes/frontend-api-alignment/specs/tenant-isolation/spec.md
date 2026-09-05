# Delta for Tenant Isolation

## ADDED Requirements

### Requirement: `tenants` Is Structurally Excluded From The Table Audit, By Design

`tenants` MUST remain a global table with no `tenant_id` column and no Row-Level Security policy, because login (`POST /auth/login`) and public slug resolution (`GET /public/{tenant_slug}/...`) MUST be able to read it before any tenant context exists. Because the `pg_catalog`/`pg_policies` structural audit (see "Schema audit" above) only inspects tables carrying a `tenant_id` column, `tenants` MUST be understood as deliberately outside that audit's coverage, not as an oversight in it — and a passing result from that audit MUST NOT be treated as evidence that a write path added to `tenants` is safe.

#### Scenario: The structural audit does not, and is not expected to, cover `tenants`

- GIVEN the `pg_catalog`/`pg_policies` structural audit that verifies RLS on every tenant-owned table
- WHEN it runs against the schema
- THEN it MUST NOT assert anything about `tenants`, and its passing MUST NOT be read as evidence that a write path on `tenants` is safe

### Requirement: Any Write Path On `tenants` MUST Guarantee A Tenant Can Only Modify Its Own Row

Because `tenants` carries no RLS backstop, any endpoint that writes to `tenants` MUST guarantee — by whatever mechanism the implementation chooses (an application-level predicate derived from the verified token claim, per-command RLS policies scoped to `tenants`, or an equivalent enforced guarantee) — that a tenant can only ever modify its own row. This guarantee MUST be verified by a dedicated behavioral test that attempts a cross-tenant write against the running application role and asserts it is rejected or scoped away; a code-review-only or unit-level guarantee is insufficient given the table has no database-level backstop underneath it.

#### Scenario: An authenticated owner cannot modify another tenant's row through any write path

- GIVEN Tenant A and Tenant B both exist, and Tenant A is authenticated
- WHEN Tenant A calls a `tenants`-writing endpoint with any parameter, header, or body value that could name Tenant B
- THEN Tenant B's row MUST remain unchanged, verified against the running `alquileres_app` role

#### Scenario: The guarantee is exercised by a behavioral test, not inferred from the structural audit

- GIVEN a write path exists on `tenants`
- WHEN the test suite is inspected
- THEN a dedicated cross-tenant-write test for `tenants` MUST exist, distinct from the `pg_catalog` structural audit that does not cover this table
