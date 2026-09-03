# Tasks: Cabin Booking API

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2050 (300+400+300+450+250+350), range 1800-2200 per proposal |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 -> PR 2 -> PR 3 -> PR 4 -> PR 5 -> PR 6 (six slices, proposal order) |
| Delivery strategy | auto-chain |
| Chain strategy | pending — resolve at apply time (stacked-to-main or feature-branch-chain); task list works under either |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

Note: slices 2 (~400) and 4 (~450) individually sit at or over the 400-line budget even as standalone PRs. This is accepted — per design, these are the smallest independent work units for the two invariant-carrying capabilities (RLS isolation, non-overlap constraint) and were sized this way deliberately in the proposal.

### Suggested Work Units

| Unit | Goal | PR | Notes |
|------|------|----|-------|
| 1 | Foundation: repo, Compose, FastAPI skeleton, schema bootstrap script (no Alembic — see D12 amendment), pytest, `tenants` table, DB roles | PR 1 | Base = main (or tracker, if feature-branch-chain). No dependents block on chain-strategy choice. |
| 2 | Auth + tenant isolation (RLS, JWT, Argon2id, `REGISTRATION_TOKEN`) | PR 2 | **CRITICAL, human-approved.** Base = PR 1's target per chosen strategy. |
| 3 | Properties + clients CRUD, soft delete + reactivation | PR 3 | Base = PR 2's target. |
| 4 | Reservations: `EXCLUDE`, pricing, dates, states | PR 4 | Base = PR 3's target. Core invariant. |
| 5 | Payments: partial payments, derived balance, refunds | PR 5 | Base = PR 4's target. |
| 6 | Public calendar + dashboard | PR 6 | Base = PR 5's target. Final slice. |

Branch-target decision (open item): under `stacked-to-main`, each PR targets `main` directly and merges in order. Under `feature-branch-chain`, PR 1 targets a draft tracker branch and PR 2-6 each target the immediately preceding PR's branch. Resolve before opening PR 1.

**Deliberate deviation from the `fastapi` skill's SQLModel/async defaults**: this project uses SQLAlchemy 2.0 ORM (`Mapped[]`) with hand-written Pydantic I/O models, and sync `def` path operations — both per design decisions D1 and D2, recorded there with rationale. Tasks below follow the design, not the generic skill default.

---

## Phase 1: Foundation (PR 1, ~300 lines) — COMPLETE

> **Amendment (apply time, engram: `architecture/schema-bootstrap`):** Alembic is deferred. Tasks that originally named `migrations/` or Alembic are replaced by a single deterministic schema bootstrap script. See `design.md` D12 (amended) for the full rationale. `pyproject.toml` does NOT include `alembic`.

- [x] 1.1 `git init`, add `.gitignore` (Python, `.venv`, Docker volumes, `.env`)
- [x] 1.2 `docker-compose.yml`: `api`, `db`, `db-test` services (Postgres 16+) — plus a `test` service that runs pytest against `db-test`
- [x] 1.3 `Dockerfile` for the `api` service (shared by `api` and `test`)
- [x] 1.4 `docker/initdb/01-roles.sql`: `CREATE ROLE alquileres_migrator`, `CREATE ROLE alquileres_app NOSUPERUSER NOBYPASSRLS` (D5); also grants `CREATE`/`USAGE` on schema `public` and `CREATE ON DATABASE` to `alquileres_migrator`, required for the bootstrap script to run without Alembic
- [x] 1.5 `pyproject.toml`: fastapi[standard], sqlalchemy, psycopg[binary], pydantic-settings, pytest — **no alembic**, no sqlmodel
- [x] 1.6 `app/config.py`: `Settings` (pydantic-settings) — `DATABASE_URL`, plus `JWT_SECRET` and `REGISTRATION_TOKEN` added now (ahead of Phase 2) with no defaults, per explicit user instruction for this slice
- [x] 1.7 `app/main.py`: FastAPI app instance, `GET /health` returning `{"status": "ok"}`
- [x] 1.8 `app/db/base.py`: SQLAlchemy 2.0 declarative `Base`
- [x] 1.9 `app/db/session.py`: engine + `SessionLocal` (tenant-scoped dependency added in Phase 2)
- [x] ~~1.10 `migrations/env.py`~~ — REPLACED by `app/db/bootstrap.py` (D12 amendment)
- [x] ~~1.11 `migrations/versions/0001_extensions.py`~~ — REPLACED by `app/db/bootstrap.py::create_extensions()`
- [x] 1.12 `app/models/tenant.py`: `Tenant` ORM model — `id UUID PK`, `slug` unique, `name`, `created_at`; no RLS (global table)
- [x] ~~1.13 `migrations/versions/0002_tenants.py`~~ — REPLACED by `app/db/bootstrap.py::create_schema()` + `grant_global_tables()`
- [x] 1.14 `tests/conftest.py`: session-scoped autouse fixture resets + seeds the `db-test` compose service via `app.db.bootstrap.reset_database()` + `scripts.seed.run()`; `migrator_engine` and `app_engine` fixtures
- [x] 1.15 `tests/test_health.py`: `GET /health` returns 200 (+ content-type check)
- [x] 1.16 Verify: `docker compose up`, `python -m scripts.reset_db`, `pytest` green inside the container (9/9 passed); quickstart, reset command, and "why real Postgres" documented in `README.md`

### Additional slice-1 work (not in the original task list, added during apply)

- [x] `app/db/bootstrap.py`: `create_extensions`, `create_schema`, `apply_row_level_security` (hook for future tenant-scoped tables), `grant_global_tables`, `reset_database`
- [x] `scripts/reset_db.py`: the one command (`docker compose run --rm api python -m scripts.reset_db`)
- [x] `scripts/seed.py`: 3 development tenants
- [x] `tests/test_config.py`: `Settings()` refuses to construct without `JWT_SECRET` or `REGISTRATION_TOKEN` (subprocess-based, 3 cases)
- [x] `tests/test_bootstrap.py`: `btree_gist` extension exists; `tenants` table exists
- [x] `tests/test_seed.py`: exactly 3 tenants; slugs are unique

## Phase 2: Auth + Tenant Isolation (PR 2, ~400 lines) — CRITICAL, human-approved (D5, D10)

- [x] 2.1 `app/models/user.py`: `User` ORM — `id UUID PK`, `tenant_id NOT NULL`, `email`, `password_hash TEXT NOT NULL`, `created_at`; `UNIQUE(tenant_id, email)`
- [x] 2.2 [RED] `tests/test_rls_structural.py::test_all_tenant_tables_have_rls` — generic `pg_class`/`pg_policies` introspection: every table with a `tenant_id` column must have `relrowsecurity`, `relforcerowsecurity`, and a policy. Fails once `users` migrates without RLS (2.3, first pass).
- [x] 2.3 [GREEN] `app/models/user.py` registered on `Base`; extend `app/db/bootstrap.py`: add `"users"` to `TENANT_SCOPED_TABLES` so `apply_row_level_security()` creates `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy + `GRANT` to `alquileres_app` (D5, D12 amendment — no migration file). Re-run 2.2 -> green.
- [x] 2.4 `app/db/session.py`: `get_tenant_session()` — `BEGIN`, `set_config('app.tenant_id', :tid, true)` bound param, yield, commit/rollback on exit; `TenantSessionDep`
- [x] 2.5 [RED] `tests/test_tenant_session.py` — two sessions with different `app.tenant_id` settings, seeded users in 2 tenants, each session only sees its own row
- [x] 2.6 [GREEN] Confirm 2.5 passes against 2.3+2.4; fix bind-param usage if not
- [x] 2.7 [RED] `tests/test_security.py::test_hash_and_verify_password` — Argon2id round-trip; wrong password rejected
- [x] 2.8 [GREEN] `app/security.py`: `hash_password()` / `verify_password()` via `pwdlib[argon2]`
- [x] 2.9 [RED] `tests/test_security.py::test_create_and_decode_jwt` — issues `sub`/`tid`/`iat`/`exp` claims, 8h expiry; decode returns same; expired/invalid token raises
- [x] 2.10 [GREEN] `app/security.py`: `create_access_token()` / `decode_access_token()` via `pyjwt` HS256; `app/config.py` adds `JWT_SECRET` with no default (boot fails if unset)
- [x] 2.11 `app/schemas/auth.py`: `RegisterRequest{tenant_slug,name,email,password}`, `LoginRequest{tenant_slug,email,password}`, `TokenResponse`, `MeResponse`
- [x] 2.12 `app/api/deps.py`: `get_current_principal()` verifies JWT, returns `(user_id, tenant_id)`; `PrincipalDep`; `get_tenant_session` depends on it so the setting comes only from the verified token (D4)
- [x] 2.13 [RED] `tests/test_auth_register.py` — missing/invalid `REGISTRATION_TOKEN` -> 403; valid token -> 201, tenant + owner created in one transaction
- [x] 2.14 [GREEN] `app/config.py` adds `REGISTRATION_TOKEN` (no default); `app/api/routers/auth.py` `POST /auth/register` — verify token, insert tenant, `set_config`, insert owner user, all one transaction
- [x] 2.15 [RED] `tests/test_auth_login.py` — valid creds -> 200 + JWT; wrong slug, wrong email, wrong password each -> the same generic 401 (not distinguishable)
- [x] 2.16 [GREEN] `POST /auth/login`: resolve tenant by slug (no-RLS read), `set_config`, look up user under RLS, verify password, issue JWT
- [x] 2.17 [RED] `tests/test_me.py` — `GET /me` without token -> 401; with valid token -> 200 with own `user_id`/`tenant_id`/`email`
- [x] 2.18 [GREEN] `GET /me` route using `PrincipalDep`
- [x] 2.19 `app/errors.py`: initial mapping — missing/invalid token -> 401; authenticated but not permitted -> 403
- [x] 2.20 `tests/conftest.py`: `seed_three_tenants` fixture (3 tenants + 3 owner users), created via `alquileres_migrator`; app under test always connects as `alquileres_app`
- [x] 2.21 [TEST] `tests/test_isolation_auth.py` — `GET /me` with tenant B's JWT never returns tenant A data, across all 3 seeded tenants
- [x] 2.22 [TEST] `tests/test_isolation_login.py` — same email registered independently in tenant A and tenant B, both log in independently, no collision
- [x] 2.23 `README.md`: document `REGISTRATION_TOKEN` and `JWT_SECRET` requirements, login payload shape

### Additional slice-2 work (not in the original task list, added during apply)

- [x] `app/db/bootstrap.py`: deviation from design D5's literal snippet — `tenant_isolation` policy is scoped `TO alquileres_app, alquileres_migrator`, not `alquileres_app` alone. `FORCE ROW LEVEL SECURITY` subjects the table owner to RLS too; with only `alquileres_app` on the policy, the migrator has zero applicable policy and every write is denied outright (Postgres default-deny), which would make fixture/seed writes as the migrator (task 2.20, `scripts/seed.py`-style inserts) impossible. Both roles go through the identical `tenant_id` predicate — not a bypass, and the migrator must `set_config('app.tenant_id', ...)` in the same transaction just like the app does. Documented in `app/db/bootstrap.py` and `README.md`.
- [x] `tests/test_seed.py`: adjusted from an exact-total-row-count assertion to checking the three known seed slugs specifically — Phase 2's auth/isolation tests legitimately add more tenants to the same session-scoped test database, so an exact count depends on pytest's collection order, not on a real property of `scripts/seed.py`.
- [x] `pyproject.toml`: added `pwdlib[argon2]` and `pyjwt`; rebuilt the `api`/`test` Docker images to pick them up.

## Phase 3: Properties + Clients CRUD (PR 3, ~300 lines) — COMPLETE

- [x] 3.1 `app/models/property.py`: `Property` ORM — `id`, `tenant_id`, `name`, `deleted_at` nullable, `created_at`; `UNIQUE(tenant_id, id)`
- [x] 3.2 `app/models/client.py`: `Client` ORM — `id`, `tenant_id`, `full_name`, `phone NOT NULL`, `email` nullable, `national_id` nullable, `deleted_at` nullable; `UNIQUE(tenant_id, id)`, `UNIQUE(tenant_id, phone)` (full unique, spans deleted rows — D8)
- [x] 3.3 Register `properties`/`clients` models on `Base`; add both to `TENANT_SCOPED_TABLES` in `app/db/bootstrap.py` (RLS ENABLE+FORCE+policy+grants, D12 amendment — no migration file); re-run `scripts.reset_db` and `test_rls_structural.py` (2.2, generic) -> green
- [x] 3.4 `app/schemas/property.py`: `PropertyCreate`, `PropertyUpdate`, `PropertyRead` (`is_active` computed_field from `deleted_at`)
- [x] 3.5 `app/schemas/client.py`: `ClientCreate`, `ClientUpdate`, `ClientRead` (`is_active` computed_field from `deleted_at`)
- [x] 3.6 [RED] `tests/test_properties.py` — POST creates; `GET /properties` excludes `deleted_at IS NOT NULL` by default, `?include_inactive=true` includes; PATCH edits name; DELETE sets `deleted_at`
- [x] 3.7 [GREEN] `app/api/routers/properties.py`: CRUD routes on `TenantSessionDep`
- [x] 3.8 `app/services/clients.py`: `upsert_or_reactivate_client()` — single `INSERT ... ON CONFLICT (tenant_id, phone) DO UPDATE SET deleted_at = NULL RETURNING id, (xmax = 0) AS was_created` (D8); name is never overwritten on reactivation
- [x] 3.9 [RED] `tests/test_clients.py` — create client; second create with same phone returns same `id`; soft-delete then re-create same phone reactivates (`deleted_at` cleared, same `id`, name unchanged)
- [x] 3.10 [GREEN] `app/api/routers/clients.py`: POST (calls 3.8), `GET` list (`deleted_at IS NULL` filter, explicit at call site), `GET` by id (no filter), PATCH, DELETE (soft)
- [x] 3.11 [TEST] `tests/test_isolation_properties_clients.py` — 3-tenant seed, one test per endpoint (list/create/get/patch/delete, both resources) asserting cross-tenant access -> 404
- [x] 3.12 `app/errors.py`: extend mapping — `23505` (duplicate phone backstop) -> 409; `23503` (FK to RLS-hidden row) -> 404
- [x] 3.13 [TEST] `tests/test_client_reactivation.py` — a soft-deleted client's prior reservations remain attached to the same client `id` after reactivation (deferred assertion on reservation FK, written now, exercised fully once Phase 4 lands)

### Deviation flagged during apply — client-management spec vs. task 3.9/D8

`openspec/changes/cabin-booking-api/specs/client-management/spec.md`'s
"Phone Uniqueness" requirement states a direct `POST /clients` with a
phone already used by an ACTIVE client "MUST reject it with HTTP 409".
Task 3.9 (and design D8's `upsert_or_reactivate_client`, whose D11 error
table explicitly says the D8 upsert "normally absorbs" the `23505`
conflict) both specify the opposite: `POST /clients` calls the same
find-or-create-or-reactivate upsert regardless of caller, so a duplicate
phone on an active client is NOT an error — it silently resolves to the
existing client's id (200, not 201), matching task 3.9's literal test
description ("second create with same phone returns same id"). Implemented
per the task list and D8/D11, not per the client-management spec's stated
409 scenario. The `23505` -> 409 mapping (task 3.12) is real and tested,
but as the documented "backstop" for a write path that does NOT go through
the upsert (`PATCH /clients/{id}` changing `phone` onto an existing
value), not for `POST /clients`. Flagging for spec reconciliation, same as
design.md's existing open item for D7's pricing wording.

## Phase 4: Reservations (PR 4, ~450 lines) — core invariant

- [x] 4.1 `app/models/reservation.py`: ORM — `id`, `tenant_id`, `property_id`, `client_id`, `check_in DATE`, `check_out DATE`, `status`, `price_per_night NUMERIC(12,2)` nullable, `price_total NUMERIC(12,2)` nullable, `created_at`; composite FKs to `properties`/`clients`; `CHECK num_nonnulls(price_per_night, price_total) = 1`; `CHECK check_out - check_in BETWEEN 1 AND 60`. No `EXCLUDE` yet.
- [x] 4.2 Register `reservations` model on `Base` (table, CHECKs, composite FKs); add to `TENANT_SCOPED_TABLES` in `app/db/bootstrap.py` (RLS ENABLE+FORCE+policy+grants, D12 amendment — no migration file); re-run `test_rls_structural.py` -> green
- [x] 4.3 [RED] `tests/test_reservation_overlap.py::test_overlapping_dates_rejected` — reservation A, then overlapping reservation B on same property; currently succeeds (no `EXCLUDE` yet) -> test fails
- [x] 4.4 [GREEN] **Stale reference amended**: no `0005_reservations.py` exists (Alembic deferred, D12 amendment). Added `ExcludeConstraint` directly to `Reservation.__table_args__` in `app/models/reservation.py`: `EXCLUDE USING gist (property_id WITH =, daterange(check_in, check_out, '[)') WITH &&) WHERE (status <> 'cancelled')`; rebuilt via `docker compose run --rm api python -m scripts.reset_db`
- [x] 4.5 `app/errors.py`: SQLSTATE `23P01` (exclusion_violation) -> 409 `{"code": "dates_unavailable"}` — already present in the dispatch table (added ahead of schedule in Phase 3); confirmed exercised end-to-end by 4.3/4.7 for the first time
- [x] 4.6 `app/services/reservations.py`: `create_reservation()` calls `session.flush()` explicitly before returning, so the constraint violation is still catchable as a 409 inside the handler (D6). **Deviation**: also built the full `app/api/routers/reservations.py` (`POST`/`GET` list/`GET` by id/`PATCH`/cancel) and wired it into `app/main.py` at this point, ahead of task 4.15's formal placement — required so 4.3/4.7's "409 returned end-to-end", 4.9's real HTTP 201/409 assertions, 4.11's PATCH-based rescale tests, and 4.16's cancel-based status tests are all genuine HTTP round-trips, not raw-session-level checks. Task 4.15 is kept as its own checkbox marking the point the full CRUD surface is confirmed complete and exercised, not the point it was first written.
- [x] 4.7 Re-run 4.3 -> green (409 returned end-to-end, confirmed via real `TestClient` HTTP call, not a mocked session)
- [x] 4.8 [TEST] `tests/test_reservation_overlap.py` — adjacency accepted (`check_in == existing check_out`); cancel-then-rebook succeeds (cancelled rows excluded from the constraint predicate)
- [x] 4.9 [TEST] `tests/test_reservation_concurrency.py` — two separate real DB connections book identical nights on the same property concurrently -> exactly one 201, one 409
- [x] 4.10 `app/schemas/reservation.py`: `ReservationCreate`/`ReservationRead` — `price_per_night` XOR `price_total` input; no `total`/`completed` fields stored; no `ge=date.today()` or equivalent anywhere
- [x] 4.11 [RED] `tests/test_reservation_pricing.py` — per-night pricing computes `total = rate * nights`; stay-total pricing returns the entered value; both or neither price field supplied -> 422; extending dates on a per-night reservation rescales the total; extending dates on a stay-total reservation does not
- [x] 4.12 [GREEN] `app/services/reservations.py`: `effective_total()` = `COALESCE(price_total, price_per_night * (check_out - check_in))`; wire into `ReservationRead` as a `computed_field`
- [x] 4.13 [RED] `tests/test_reservation_dates.py` — 0 nights and 61 nights -> 422; a fully-past stay is accepted; an in-progress stay (check-in past, check-out future) is accepted
- [x] 4.14 [GREEN] Confirm no future-date validation exists anywhere (Pydantic, CHECK, or service layer) — only the 1-60 night CHECK and the `EXCLUDE` constraint gate dates
- [x] 4.15 `app/api/routers/reservations.py`: `POST`/`GET`/`PATCH /reservations`, `POST /reservations/{id}/cancel` — full CRUD, built incrementally from 4.6 onward (see deviation note there)
- [x] 4.16 [RED] `tests/test_reservation_status.py` — cancel sets `status = cancelled`; `is_completed` derived `True` once `check_out` has passed on a non-cancelled reservation; a cancelled reservation is never completed
- [x] 4.17 [GREEN] `app/services/dates.py`: `today_ar()` via `ZoneInfo("America/Argentina/Buenos_Aires")`; wire `is_completed` computed_field
- [x] 4.18 [RED] `tests/test_inactive_property_reservation.py` — `POST` reservation targeting a soft-deleted property -> 422; its pre-existing reservations remain readable/editable
- [x] 4.19 [GREEN] `app/services/reservations.py`: reject creation when target `property.deleted_at IS NOT NULL`
- [x] 4.20 [TEST] `tests/test_isolation_reservations.py` — 3-tenant seed, one test per reservation endpoint asserting cross-tenant access -> 404
- [x] 4.21 `tests/test_schema_no_derived_columns.py`: `pg_catalog` assertion — `reservations` table has no `total` column and no `completed` column

## Phase 5: Payments (PR 5, ~250 lines) — COMPLETE

> **Phase 4 gap closed at the start of this apply.** Task 5.1 requires a
> composite FK `(tenant_id, reservation_id) REFERENCES reservations
> (tenant_id, id)`, which PostgreSQL requires the referenced column pair
> to be backed by a unique constraint. `reservations` never got the
> `UNIQUE(tenant_id, id)` that `properties`/`clients` both received in
> Phase 3 for exactly this purpose (design D6's "every tenant-scoped
> table therefore carries a `UNIQUE (tenant_id, id)` as an FK target").
> Fixed by adding `UniqueConstraint("tenant_id", "id",
> name="reservations_tenant_id_uq")` to `Reservation.__table_args__`
> (`app/models/reservation.py`) before 5.1. Nothing else about the
> reservations model changed — the `EXCLUDE` constraint and non-overlap
> invariant are untouched. Verified safe: 90/90 pre-existing tests still
> passed immediately after this change, before any Phase 5 code was
> written.

- [x] 5.1 `app/models/payment.py`: ORM — `id`, `tenant_id`, `reservation_id`, `amount NUMERIC(12,2) CHECK(amount <> 0)`, `paid_on DATE` (Python-side default `today_ar()`, not a DB default), `note TEXT` nullable, `created_at`; composite FK to `reservations`; `UNIQUE(tenant_id, id)`
- [x] 5.2 Register `payments` model on `Base` (table, CHECK, composite FK); add to `TENANT_SCOPED_TABLES` in `app/db/bootstrap.py` (RLS ENABLE+FORCE+policy+grants, D12 amendment — no migration file); re-run `test_rls_structural.py` -> green
- [x] 5.3 `app/models/reservation.py`: add `paid_amount` as `column_property` — correlated `SUM(payments.amount)` subquery (D7); defined after the class body (`Reservation.paid_amount = column_property(...)`), not inline, because the correlated subquery needs `Reservation.id` as a usable expression
- [x] 5.4 [RED] `tests/test_reservation_balance.py` — `balance = total - paid_amount`; balance updates after each payment; a refund (negative amount) increases balance back. Confirmed RED for the right reason: `KeyError: 'balance'` (field did not exist yet), not an import/collection error. Payment rows inserted directly via `migrator_engine` raw SQL, not through the (not-yet-built) payments endpoint — `balance` is a pure read-side concern, testable independently of the write path.
- [x] 5.5 [GREEN] `app/schemas/reservation.py`: `ReservationRead.balance` computed_field (added `paid_amount: Decimal` as a plain field too, so the schema can read the ORM's `column_property`). Re-ran 5.4 -> green, all 4 cases (including triangulation: no payments, one partial payment, three accumulating payments, and a refund).
- [x] 5.6 [RED] `tests/test_payments.py` — `POST /reservations/{id}/payments` creates a partial payment; multiple partial payments accumulate; `amount = 0` rejected (422); `GET` lists payments for a reservation. Confirmed RED: all 4 cases failed with `404` (route did not exist), the right reason.
- [x] 5.7 [GREEN] `app/api/routers/payments.py`: POST/GET under `/reservations/{id}/payments`, wired into `app/main.py`. No `app/services/payments.py` — design D3 reserves `services/` for the three modules with real logic (pricing, upsert-reactivate, aggregation); a payment insert/list has none, so it lives directly in the router, same as `properties`. Re-ran 5.6 -> green.
- [x] 5.8 [RED] `tests/test_refunds.py` — a negative-amount payment records as a refund; balance increases (less paid); confirm schema has no separate `kind` column (sign is the discriminator). **Deviation, noted honestly**: this did NOT produce a genuine failure — 5.7's `PaymentCreate.amount: Decimal` was already unrestricted (no `gt=0`, no positivity constraint), so negative amounts were accepted the moment the endpoint existed, and no `kind` column was ever built. All 4 cases passed on first run with zero additional production code. This is the expected outcome of writing the minimum general implementation at 5.7 rather than a narrower one that would have needed a later generalization step — reported as-is rather than manufacturing an artificial RED.
- [x] 5.9 [GREEN] Confirm `PaymentCreate` accepts a signed `Decimal`; `note` is free-text. Confirmed by 5.8's passing suite; no code change required.
- [x] 5.10 [TEST] `tests/test_isolation_payments.py` — 3-tenant seed, POST/GET payments cross-tenant -> 404; a third case (triangulation) confirms a rejected cross-tenant POST leaves zero rows behind, not just an invisible one. All green on first run (verification test, same pattern as 4.20).
- [x] 5.11 `tests/test_schema_no_derived_columns.py`: extended — added `test_payments_table_has_no_derived_columns`/`test_payments_table_still_has_its_real_stored_columns`, mirroring the existing `reservations` pair. `_FORBIDDEN_COLUMN_NAMES` already included `"balance"` from Phase 4 apply; only the `payments`-table query was missing.
- [x] 5.12 Extended `tests/test_client_reactivation.py`'s deferred task-3.13 assertion into a real test: seeds a reservation + a payment for a client, soft-deletes and reactivates the client via the same phone, and asserts the reservation's `client_id` and its payments (reached only through the reservation, never a direct client FK per the payment-tracking spec) both survive under the same client id.

### Deviation flagged during apply — spec column name `payment_date` vs. implemented `paid_on`

`openspec/changes/cabin-booking-api/specs/payment-tracking/spec.md`'s
"Payment Record" requirement names the date column `payment_date`. Task
5.1 and design D7/D12's "Timezone" section both explicitly and
consistently say `paid_on` (`payments.paid_on` appears by that name
throughout the design's dashboard/timezone discussion, written ahead of
this phase). Implemented as `paid_on`, per the task list and design, not
the spec's literal wording. Flagging for spec reconciliation, same
pattern as the two prior phases' documented deviations (D7 pricing
wording, D8 vs. client-management spec).

## Phase 6: Public Calendar + Dashboard (PR 6, ~350 lines)

- [ ] 6.1 `app/schemas/public.py`: `PublicAvailability{property_id, name, occupied: list[OccupiedRange]}`, `OccupiedRange{check_in, check_out}`; `ConfigDict(extra="forbid")`; shares no base class with authenticated schemas (D9)
- [ ] 6.2 `app/api/deps.py`: `get_public_session()` — resolves tenant by slug path param (no-RLS `tenants` read), sets `app.tenant_id` exactly as `get_tenant_session`; `PublicSessionDep`
- [ ] 6.3 `app/api/routers/public.py`: `GET /public/{tenant_slug}/availability?from=&to=` — column-projection `SELECT (property_id, check_in, check_out)` only, joins `properties` and excludes `deleted_at IS NOT NULL`, no auth dependency
- [ ] 6.4 [RED] `tests/test_public_contract.py` — seed a tenant with a distinctive client name, phone, price, and payment note; assert none of those strings appear anywhere in the raw response body
- [ ] 6.5 [GREEN] Confirm 6.3's query selects only the three projected columns; `response_model=list[PublicAvailability]` enforced -> 6.4 green
- [ ] 6.6 [TEST] `tests/test_public_inactive_property.py` — seed an inactive property carrying a reservation; assert its `property_id` is absent from the public response while the same reservation remains visible on the authenticated `GET /reservations`
- [ ] 6.7 `app/services/dates.py`: `month_window()`, `week_window()` (ISO Monday-Sunday) — pure functions, half-open bounds, no DB
- [ ] 6.8 [RED] `tests/test_date_windows.py` — unit tests for `month_window`/`week_window` boundaries
- [ ] 6.9 [GREEN] Implement/confirm `month_window`/`week_window`
- [ ] 6.10 `app/services/dashboard.py`: `collected(from, to)` — signed `SUM(payments.amount)` where `paid_on` in `[from, to)`; `occupied_nights`/`available_nights` via `daterange` intersection, denominator counts only active (`deleted_at IS NULL`) properties, grouped by `property_id`
- [ ] 6.11 [RED] `tests/test_dashboard_collected.py` — a deposit paid in month A for a stay in month B counts in A, not B; a refund reduces `collected`; `collected` counts payments on both active and inactive properties
- [ ] 6.12 [RED] `tests/test_dashboard_availability.py` — `available_nights` excludes inactive properties from the denominator; a stay straddling Dec/Jan is split correctly across the two month windows
- [ ] 6.13 [GREEN] `app/api/routers/dashboard.py`: `GET /dashboard/summary?from=&to=` returns `{collected, occupied_nights, available_nights, per-property breakdown}`
- [ ] 6.14 [TEST] `tests/test_isolation_dashboard.py` — 3-tenant seed, dashboard summary reflects only the caller's own tenant
- [ ] 6.15 `README.md`: document the public calendar URL shape and dashboard query params
