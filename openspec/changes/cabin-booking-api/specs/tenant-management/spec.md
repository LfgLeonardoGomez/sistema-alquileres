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
