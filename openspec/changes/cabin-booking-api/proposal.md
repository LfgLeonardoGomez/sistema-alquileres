# Proposal: Cabin Booking API

## Intent

Cabin owners in seasonal coastal markets track reservations in notebooks and chat threads. That loses money two ways: double-booked nights, and forgotten balances. This change delivers the backend for a small internal management tool — the owner records reservations received off-platform (WhatsApp), and a public read-only calendar lets prospects check availability before asking.

Multi-tenant from day one: the first user owns two cabins in Mar del Tuyú, but other owners must be onboardable without ever mixing data.

## Scope

### In Scope
- Tenant provisioning (self-registration: tenant + founding owner user in one transaction) and owner authentication.
- Tenant isolation enforced at the database level, not only in application code.
- Tenant-scoped CRUD: properties, clients, reservations, payments.
- Reservation non-overlap invariant, enforced by the database.
- Pricing entered per-night or as a stay total; stored as entered, with the effective total derived.
- Partial payments accumulating against a reservation; manual refund entries.
- Public unauthenticated availability-only calendar per tenant.
- Owner dashboard: available nights per month, monthly income, weekly income.
- Runtime foundation: Docker Compose, Postgres, migrations, `pytest`.

### Out of Scope (non-goals)
- Guest self-service booking, temporary holds, reservation expiry.
- Online payment gateway. Payments record money received off-platform.
- Automatic refund or cancellation-policy engine.
- React/Vite frontend.
- Notifications (email/WhatsApp/SMS).
- Seasonal/dynamic pricing, discounts.
- Admin-created tenants (needs a separate admin auth flow — deferred, see Slicing).

## Capabilities

### New Capabilities
- `tenant-management`: tenant record, self-registration, founding owner user, lifecycle.
- `authentication`: owner login, token issuance carrying the tenant claim. **CRITICAL domain.**
- `tenant-isolation`: every tenant-owned row scoped and enforced at DB level. **CRITICAL domain.**
- `property-management`: dynamic add/remove/edit of properties per tenant.
- `client-management`: client entity (name + phone required; email, national ID optional), find-or-create by phone within tenant.
- `reservation-booking`: the core invariant, states, derived completion, pricing resolution.
- `payment-tracking`: partial payments, derived balance, manual refunds.
- `public-availability-calendar`: unauthenticated availability-only read surface. **Privacy boundary.**
- `owner-dashboard`: available nights and income aggregates.

### Modified Capabilities
None — greenfield.

## Approach

**Non-overlap (the core invariant).** Nights are modeled as a half-open interval `[check_in, check_out)` over `DATE` columns. Two non-cancelled reservations for the same property must never overlap; checkout day may equal the next check-in day. Enforcement is a Postgres `EXCLUDE USING gist` constraint over a `daterange` scoped by property, with `btree_gist` enabled and cancelled rows excluded via a partial constraint predicate. Application validation exists only to produce good error messages — the database is the authority, because app-level checks lose the concurrency race. Constraint violations map to HTTP 409.

**Tenant isolation.** Shared schema, `tenant_id NOT NULL` on every tenant-owned table, UUID primary keys (no enumerable integer IDs), `tenant_id` as the leading column of every composite index. Postgres RLS policies filter by a per-request session setting; a request-scoped dependency sets it inside the transaction. Application scoping and RLS run together — the first is convenience, the second is enforcement.

**Never store a derived value.** `completed` is computed at read time (checkout date passed and not cancelled) — two persisted states only, `reserved` and `cancelled`, no state-sync job. Balance due is `total - SUM(payments)`, never a column. This is the standing pattern for this project.

**Privacy boundary.** The public calendar uses a dedicated response model exposing only property identity and occupied date ranges. Client names, contact data, prices, payments, and reservation identifiers are structurally unreachable from that surface, not merely omitted by convention.

**Simplicity guard.** No holds, no policy engine, no background workers, no caching layer, no event bus. If a feature is not in the In Scope list, it is not built.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docker-compose.yml`, `Dockerfile` | New | API + Postgres services |
| `pyproject.toml` | New | FastAPI, SQLModel, Alembic, pytest |
| `app/main.py`, `app/api/` | New | Routers per capability |
| `app/models/`, `app/schemas/` | New | Entities and request/response models |
| `app/db/`, `migrations/` | New | Session, tenant context dependency, RLS + `EXCLUDE` migrations |
| `tests/` | New | Isolation, invariant, and privacy contract tests |

## Slicing (first-slice boundary)

Full surface far exceeds a 400-line PR budget (rough estimate ~1800–2200 changed lines). **Chained PRs are required.** The two highest-risk pieces — tenant isolation and the non-overlap invariant — must land before low-value CRUD, not behind it.

| # | Slice | Est. lines | Notes |
|---|-------|-----------|-------|
| 1 | Foundation: Compose, Postgres, FastAPI skeleton, Alembic, `pytest`, health, `tenants` table | ~300 | Enables TDD re-evaluation |
| 2 | Auth + tenant isolation (RLS, session context, 3-tenant isolation tests) | ~400 | **CRITICAL — human approval gate** |
| 3 | Properties + clients CRUD | ~300 | |
| 4 | Reservations: `EXCLUDE` constraint, 1–60 nights, states, derived completion, pricing | ~450 | Core invariant |
| 5 | Payments: partial payments, derived balance, manual refunds | ~250 | |
| 6 | Public availability calendar + dashboard aggregates | ~350 | Privacy contract tests |

Deferred to a follow-up change: admin-created tenants and cross-tenant admin endpoints. Per multi-tenant practice these need a separate admin authentication flow; bundling them into owner auth is exactly how cross-tenant leaks happen.

## Governance

`authentication` and `tenant-isolation` are **CRITICAL** domain. Their design decisions require explicit human approval before implementation and must ship as their own reviewable slice (#2). They must not be quietly folded into a larger implementation batch.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cross-tenant data leak | Med | RLS + app scoping + UUID PKs + seed with 3 tenants; isolation test per endpoint |
| Concurrent double-booking | Med | DB `EXCLUDE` constraint is the authority; concurrent-request test |
| Public endpoint leaks PII | Med | Dedicated response model + contract test asserting absent fields |
| Date/timezone drift in derived `completed` and dashboard | Med | `DATE` columns (not timestamptz); fix a single server timezone (America/Argentina/Buenos_Aires) |
| Stale tenant context on pooled connections | Low | Set tenant setting transaction-locally; reset on release |
| Scope creep beyond a "simple system" | Med | Non-goals list is binding; new asks become new changes |

## Rollback Plan

Greenfield, no production data and no consumers. Per slice: revert the PR and run `alembic downgrade -1`. Full reset: `docker compose down -v` and re-run migrations. Only the auth/isolation slice carries irreversible risk once real tenant data exists — it lands before any tenant is onboarded.

## Dependencies

- PostgreSQL with the `btree_gist` extension (enabled by migration).
- Docker + Docker Compose.
- `pytest` installed in slice 1; Strict TDD Mode re-evaluated once it runs green.

## Success Criteria

- [ ] Two concurrent requests booking the same nights on the same property: exactly one succeeds, the other gets 409.
- [ ] A reservation whose check-in equals an existing reservation's check-out is accepted.
- [ ] Cancelling frees those nights for rebooking while the cancelled record remains readable.
- [ ] Tenant A cannot read or mutate Tenant B rows through any authenticated endpoint (verified with 3 seeded tenants).
- [ ] The public calendar response contains no client, price, payment, or reservation-detail field.
- [ ] No `balance` and no `completed` column exists in the schema.
- [ ] A reservation priced per-night and one priced by total report the same effective total for the same stay, and no `total` column exists.
- [ ] Extending the dates of a per-night-priced reservation rescales its effective total with no price re-entry.
- [ ] `pytest` runs green inside Docker Compose.
