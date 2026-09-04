# Property Management Specification

## Purpose

Tenant-scoped CRUD for rental properties (cabins). Properties are dynamic — owners add, edit, and remove them freely.

## Requirements

### Requirement: Property Record

The system MUST store each property with `id` (UUID), `tenant_id` (UUID, NOT NULL), `name`, `deleted_at` (nullable timestamp, NULL when active), and `created_at`, scoped per `tenant-isolation`.

Active status MUST NOT be a stored boolean. The API MUST expose `is_active`, derived as `deleted_at IS NULL`.

#### Scenario: Property creation

- GIVEN an authenticated owner
- WHEN the owner submits a property name
- THEN the system MUST create a property row with the owner's `tenant_id` and `deleted_at` NULL, and reads MUST report `is_active = true`

### Requirement: Property CRUD Is Tenant-Scoped

The system MUST allow the authenticated owner to list, create, update, and delete properties belonging only to their own tenant.

#### Scenario: List properties

- GIVEN Tenant A owns two active properties and Tenant B owns one
- WHEN Tenant A lists properties
- THEN the response MUST contain exactly Tenant A's two properties

#### Scenario: Rename a property

- GIVEN an existing property
- WHEN the owner submits an update with a new name
- THEN subsequent reads MUST return the updated name

### Requirement: Property Deletion Is Soft

Deleting a property MUST set `deleted_at` to the deletion time and MUST NOT remove the row. Historical reservations and payments on an inactive property MUST remain readable and editable, and their value MUST continue to count toward dashboard income (see `owner-dashboard`).

#### Scenario: Deletion timestamps the row without removing it

- GIVEN an active property
- WHEN the owner deletes it
- THEN the system MUST set `deleted_at` on that property's row, the row MUST still exist in the database, and reads MUST report `is_active = false`

#### Scenario: Existing reservations remain readable and editable

- GIVEN an inactive property with a past reservation
- WHEN the owner reads or edits that reservation
- THEN the system MUST allow it exactly as it would for an active property

### Requirement: Inactive Properties Are Excluded from New Bookings and Default Listings

An inactive property MUST reject new reservations and MUST be excluded from default property listings.

#### Scenario: New reservation on an inactive property is rejected

- GIVEN a soft-deleted property
- WHEN a request attempts to create a new reservation on that property
- THEN the system MUST reject it

#### Scenario: Inactive property excluded from default listing

- GIVEN Tenant A has one active and one inactive property
- WHEN Tenant A lists properties with default filters
- THEN the response MUST contain only the active property
