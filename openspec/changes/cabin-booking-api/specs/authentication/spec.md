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

### Requirement: Registration Requires A Deployment-Held Token And Returns An Access Token

`POST /auth/register` MUST require a valid `X-Registration-Token` header matching a server-configured secret; the app MUST refuse to boot without this secret configured. The token MUST travel in the `X-Registration-Token` header, never in the request body — it is a deployment credential, not a property of the tenant being created, so `RegisterRequest` MUST NOT contain a token field. A missing or incorrect header MUST be rejected with HTTP 403, and the comparison MUST fail closed (a missing header MUST NOT be able to match an unset or default secret).

On success, `POST /auth/register` MUST create the tenant and its founding owner in one transaction and MUST return an access token in the same response, logging the new owner in immediately. The caller MUST NOT be required to make a separate `POST /auth/login` call afterward to obtain a session.

#### Scenario: Registration without the token header is rejected

- GIVEN no `X-Registration-Token` header is present
- WHEN a registration request is submitted
- THEN the system MUST reject it with HTTP 403 and MUST NOT create a tenant

#### Scenario: Registration with an incorrect token is rejected

- GIVEN an `X-Registration-Token` header present but not matching the configured secret
- WHEN a registration request is submitted
- THEN the system MUST reject it with HTTP 403 and MUST NOT create a tenant

#### Scenario: Registration with the correct token creates the tenant and returns a usable token immediately

- GIVEN the correct `X-Registration-Token` header value
- WHEN a registration request is submitted
- THEN the system MUST create the tenant and its founding owner, and the response MUST include an `access_token` that authenticates owner-scoped requests without any further login call

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
