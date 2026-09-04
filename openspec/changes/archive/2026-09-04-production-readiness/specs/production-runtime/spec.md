# Production Runtime Specification

## Purpose

Defines the properties a production deployment artifact of the API MUST
have, independent of where it is hosted: it carries only what a running API
process needs, holds no credentials beyond what serving requests requires,
and cannot execute a destructive schema operation.

## Requirements

### Requirement: Production Image Excludes Development-Only Content

The production runtime image MUST NOT contain the test suite or
development-only dependencies.

#### Scenario: Production image has no test files

- GIVEN the production image
- WHEN inspecting its filesystem
- THEN no test source files MUST be present

#### Scenario: Production image has no development dependencies installed

- GIVEN the production image's installed package set
- WHEN comparing it against the project's development-only dependency group
- THEN none of the development-only dependencies MUST be installed

### Requirement: Production Process Runs As A Non-Root User

The production runtime MUST run the API process as a non-root operating
system user.

#### Scenario: Running container process is non-root

- GIVEN a container started from the production image
- WHEN inspecting the user id of the running API process
- THEN it MUST NOT be root (UID 0)

### Requirement: Production Runtime Cannot Reach A Destructive Schema Command

The production runtime MUST NOT be able to execute any command that drops
application tables.

#### Scenario: No destructive entrypoint exists in the production image

- GIVEN the production image's available commands and entry points
- WHEN searching for a command that drops application tables
- THEN none MUST exist or be invocable from that image

### Requirement: API Process Never Holds Table-Owner Credentials

The production API service's runtime environment MUST NOT contain the
schema-owning/migrator database credential. Only a process responsible for
constructing or migrating the schema MAY hold that credential.

#### Scenario: Production API service environment excludes migrator credentials

- GIVEN the production API service's configured environment variables
- WHEN inspecting them
- THEN no table-owner/migrator database connection string MUST be present
- AND the API service MUST still be able to connect to the database using
  only application-role credentials
