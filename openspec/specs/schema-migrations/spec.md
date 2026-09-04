# Schema Migrations Specification

## Purpose

Guarantees the database schema is built through exactly one mechanism, used
identically by the test suite and by deployment, so no test can pass against
a schema that production never runs. The built schema MUST reproduce every
object the ORM's mapped metadata cannot describe — the extension, Row-Level
Security, its policy, and grants — and that reproduction MUST be verified
mechanically rather than by review. CRITICAL domain: this is the foundation
`tenant-isolation` depends on.

## Requirements

### Requirement: Single Schema Construction Path

The system MUST build the database schema through exactly one construction
mechanism, and the test suite MUST use that same mechanism to build its
schema. No alternate schema-construction path MUST be reachable from test
setup or from deployment.

#### Scenario: Test suite builds its schema through the deployment mechanism

- GIVEN the test suite starts a fresh test session
- WHEN the test database schema is constructed
- THEN it MUST be constructed by the same mechanism a deployment would use
- AND no direct, migration-bypassing schema-construction call MUST execute

#### Scenario: The RLS structural test cannot be pointed at the wrong schema

- GIVEN the schema is built through the single construction mechanism
- WHEN the existing `pg_catalog`/`pg_policies` structural test runs against
  that schema
- THEN it MUST introspect the schema shape that mechanism produces, with no
  remaining code path that could build a divergent schema for it to inspect

### Requirement: Migrated Schema Reproduces Objects The ORM Cannot See

The system's schema-construction mechanism MUST produce, for every
tenant-scoped table: the `btree_gist` extension, `ENABLE ROW LEVEL SECURITY`,
`FORCE ROW LEVEL SECURITY`, and a `tenant_isolation` policy naming both the
application role and the schema-owning role under the exact predicate that is
implemented in the running system (not any predicate text recorded
elsewhere), plus the grants the application role needs to operate. These
objects MUST NOT depend on the ORM's mapped metadata being able to describe
them.

#### Scenario: Extension present after schema construction

- GIVEN a freshly constructed schema
- WHEN inspecting installed extensions
- THEN `btree_gist` MUST be installed

#### Scenario: RLS, FORCE, policy and grants present on every tenant-scoped table

- GIVEN a freshly constructed schema
- WHEN inspecting `pg_class`, `pg_policies`, and table grants for `users`,
  `properties`, `clients`, `reservations`, and `payments`
- THEN each MUST have `relrowsecurity` and `relforcerowsecurity` set, a
  `tenant_isolation` policy naming both the application role and the
  migrator/owner role, and the application role's grants MUST be present

### Requirement: Schema Equivalence Is Verified Mechanically

The system MUST provide an automated check that compares the schema produced
by the single construction mechanism against a reference schema at the
`pg_catalog` level — including table and column definitions, constraints,
indexes, installed extensions, `pg_policies` predicate text, and grants —
rather than relying on manual review of the construction logic.

#### Scenario: Equivalence check passes on a faithful schema

- GIVEN a schema built by the construction mechanism
- WHEN the mechanical equivalence check runs
- THEN it MUST report no difference from the reference schema

#### Scenario: Equivalence check fails when a policy is missing

- GIVEN a schema built by a version of the construction mechanism that omits
  one table's `tenant_isolation` policy
- WHEN the mechanical equivalence check runs
- THEN it MUST report a difference and MUST NOT report equivalence

### Requirement: No Reachable Command Drops Application Tables

No command available in the repository MUST be able to drop tables the
application owns as part of its normal invocation. A developer convenience
command for rebuilding the local schema MAY exist, but it MUST perform its
rebuild through the schema-construction mechanism rather than through a drop.

#### Scenario: Developer reset rebuilds without dropping

- GIVEN a developer runs the repository's schema-reset command
- WHEN the command completes
- THEN the schema MUST have been rebuilt through the schema-construction
  mechanism, and development seed data MUST be present
- AND no table-drop operation MUST have occurred as part of that command

#### Scenario: No standalone destructive command exists

- GIVEN the full set of commands available in the repository (scripts, CLI
  entry points, container commands)
- WHEN searching for a command that drops application tables directly
- THEN none MUST exist
