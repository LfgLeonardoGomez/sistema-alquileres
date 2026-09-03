# Client Management Specification

## Purpose

Tenant-scoped client (guest) records, created explicitly or via find-or-create during reservation booking. `POST /clients` is itself a find-or-create-or-reactivate upsert, not a plain insert — the same mechanism reservation creation uses. Deletion is soft to preserve reservation history.

## Requirements

### Requirement: Client Fields

The system MUST store each client with `id` (UUID), `tenant_id` (UUID, NOT NULL), `full_name` (required), `phone` (required), `email` (optional), `national_id` (optional), `deleted_at` (nullable timestamp, NULL when active), and `created_at`.

Active status MUST NOT be a stored boolean. The API MUST expose `is_active`, derived as `deleted_at IS NULL`. The same soft-delete mechanism MUST be used for properties (see `property-management`).

#### Scenario: Missing required field rejected

- GIVEN a client creation request without `full_name` or without `phone`
- WHEN the request is submitted
- THEN the system MUST reject it with a validation error

### Requirement: Phone Uniqueness Spans Active and Inactive Rows

The system MUST enforce that `phone` is unique per `tenant_id` across BOTH active and soft-deleted (inactive) client rows, via a full database `UNIQUE (tenant_id, phone)` constraint (never a partial index scoped to active rows only — a partial index would let a phone collide with a soft-deleted row's phone, defeating reactivation). The unique index MUST include `tenant_id`: an index on `phone` alone would let a constraint-violation response act as a cross-tenant existence oracle, since RLS hides the conflicting row but the 409 would still reveal that a match exists.

`POST /clients` MUST NOT surface a violation of this constraint as an error. See "`POST /clients` Is An Upsert" below for how a duplicate phone resolves on that endpoint.

#### Scenario: Same phone allowed across different tenants

- GIVEN Tenant A has a client with phone `+5491100000001`
- WHEN Tenant B creates a client with the same phone
- THEN the system MUST accept it

### Requirement: `POST /clients` Is An Upsert, Not A Plain Insert

`POST /clients` MUST resolve a duplicate `phone` within the tenant by reusing (or reactivating, per the requirement below) the existing client rather than rejecting the request. On a genuine insert the system MUST respond HTTP 201; on a resolved match (active or reactivated) the system MUST respond HTTP 200 with the existing client's `id`. The system MUST NOT create a second, parallel client row for a phone that already exists in the tenant, and MUST NOT overwrite the existing client's `full_name` or other fields from the new payload — only `deleted_at` is cleared on reactivation; field edits go through `PATCH /clients/{id}`.

The full-constraint uniqueness invariant above still holds; the 409 it can produce is a live backstop that only applies to `PATCH /clients/{id}` (see below), because a `PATCH` explicitly changing `phone` to a value already in use is a genuine conflict, not a case the upsert path resolves.

#### Scenario: Duplicate phone on an active client resolves via upsert, not rejection

- GIVEN an active client with phone `+5491100000001` in Tenant A
- WHEN a direct `POST /clients` request submits the same phone for Tenant A
- THEN the system MUST respond HTTP 200 with the existing client's `id`, and MUST NOT create a duplicate row or return an error

#### Scenario: `PATCH` onto an already-taken phone is rejected

- GIVEN two active clients in the same tenant, one holding phone `+5491100000002`
- WHEN the other client is `PATCH`ed with `phone` set to `+5491100000002`
- THEN the system MUST reject the request with HTTP 409, since the upsert path does not apply to `PATCH`

### Requirement: Find-or-Create by Phone During Reservation Creation

When creating a reservation, the system MUST look up an existing client by `phone` within the tenant; if found, MUST reuse that client; if not found, MUST create a new client from the supplied fields in the same request. This MUST complete in a single POST — no separate client-creation step is required.

#### Scenario: New client created inline

- GIVEN no client exists with phone `+5491100000002` in the tenant
- WHEN a reservation is created with client fields including that phone
- THEN the system MUST create the client and the reservation, both attributed to that client

#### Scenario: Existing active client reused

- GIVEN an active client exists with phone `+5491100000001`
- WHEN a reservation is created supplying that phone
- THEN the system MUST attach the new reservation to the existing client without creating a duplicate

### Requirement: Reactivation on Find-or-Create Match Against a Soft-Deleted Client

If find-or-create matches a `phone` belonging to a soft-deleted (inactive) client, the system MUST reactivate that client by clearing `deleted_at` back to NULL, and attach the new reservation to it. The system MUST NOT raise a duplicate-phone error and MUST NOT create a second, parallel client.

#### Scenario: Reactivation preserves history

- GIVEN a soft-deleted client with phone `+5491100000003` and two prior reservations
- WHEN a new reservation is created supplying that phone
- THEN the system MUST clear `deleted_at` on the existing client, MUST attach the new reservation to it, and the client's prior two reservations MUST remain associated with the same client `id`

### Requirement: Soft Delete

The system MUST support marking a client inactive by setting `deleted_at` to the deletion time, instead of physically deleting the row.

#### Scenario: Deleting a client

- GIVEN an active client
- WHEN the owner deletes the client
- THEN the system MUST set `deleted_at` and MUST NOT remove the row

### Requirement: Active Filter on Search, Not on Historical Reads

Client list and search endpoints MUST exclude inactive clients by default. Endpoints that resolve a client through a historical reservation MUST NOT apply the active filter.

#### Scenario: Inactive client excluded from listing

- GIVEN a soft-deleted client
- WHEN the owner lists or searches clients
- THEN the inactive client MUST NOT appear in the results

#### Scenario: Inactive client still resolves through reservation history

- GIVEN a soft-deleted client with a past reservation
- WHEN the owner reads that reservation's details
- THEN the client's name and contact fields MUST still be returned
