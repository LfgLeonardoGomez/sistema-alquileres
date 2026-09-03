# Authentication Specification

## Purpose

Owner login and token issuance for tenant-scoped access. There is no multi-user support and no roles — one owner credential per tenant. CRITICAL domain.

## Requirements

### Requirement: Single Owner Per Tenant

The system MUST allow exactly one owner user per tenant. The system MUST NOT provide any endpoint to create additional users for an existing tenant in this change.

#### Scenario: Second owner creation is rejected

- GIVEN a tenant already has a founding owner user
- WHEN any request attempts to create a second user for that tenant
- THEN the system MUST reject the request (no such endpoint exists, or it returns an error)

### Requirement: Owner Login Issues a Tenant-Scoped Token

The system MUST authenticate the owner with the credentials established at registration and, on success, MUST issue a token whose payload includes the tenant's `id` as a claim.

#### Scenario: Successful login

- GIVEN a registered tenant with a founding owner
- WHEN the owner submits correct credentials
- THEN the system MUST return an access token
- AND the token payload MUST include the tenant `id`

#### Scenario: Invalid credentials rejected

- GIVEN a registered tenant
- WHEN a login request submits an incorrect password
- THEN the system MUST reject the request with HTTP 401
- AND MUST NOT issue a token

### Requirement: Token Required for Owner-Scoped Endpoints

The system MUST reject any request to an owner-scoped endpoint (properties, clients, reservations, payments, dashboard) that lacks a valid token.

#### Scenario: Missing token rejected

- GIVEN no Authorization header is present
- WHEN a request is made to an owner-scoped endpoint
- THEN the system MUST respond with HTTP 401

#### Scenario: Token tenant claim drives all downstream scoping

- GIVEN a valid token issued for Tenant A
- WHEN a request is made to any owner-scoped endpoint
- THEN the tenant context used for isolation (see `tenant-isolation`) MUST be derived from the token's tenant claim, never from a client-supplied tenant identifier

### Requirement: Admin Authentication Out of Scope

The system MUST NOT provide a cross-tenant admin authentication flow in this change.

#### Scenario: No admin login path exists

- GIVEN the deployed API surface
- WHEN inspecting available authentication routes
- THEN there MUST be no route that authenticates a user with cross-tenant privileges
