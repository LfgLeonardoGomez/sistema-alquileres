# Cabin Booking API

A sync FastAPI service over PostgreSQL for managing cabin rentals: reservations,
clients, payments, and a public availability calendar, isolated per tenant
(cabin rental owner) via PostgreSQL Row-Level Security.

This covers slice 1 (Foundation) and slice 2 (Auth + Tenant Isolation) of
the `cabin-booking-api` change. See
`openspec/changes/cabin-booking-api/design.md` for the full architecture.

## Stack

- FastAPI (sync `def` path operations — see design D2)
- SQLAlchemy 2.0 ORM + hand-written Pydantic I/O models (not SQLModel — see design D1)
- PostgreSQL 16, driver: `psycopg` (v3)
- pytest, run against real PostgreSQL inside Docker Compose

## Bring it up

```bash
docker compose up -d db
docker compose run --rm api python -m scripts.reset_db
docker compose up -d api
curl http://localhost:8000/health
```

The API listens on `http://localhost:8000`.

## Reset the database

There are no migrations yet (see "Why no Alembic" below). To rebuild the
schema from scratch and reseed development data:

```bash
docker compose run --rm api python -m scripts.reset_db
```

This is destructive by design — it drops and recreates every table this
project owns, then reseeds 3 development tenants:

- `mar-del-tuyu-cabins`
- `bariloche-lake-houses`
- `villa-carlos-paz-retreat`

Three tenants, not two: two tenants hide cross-tenant isolation bugs that
leak in only one direction.

## Run the tests

```bash
docker compose run --rm test
```

This runs `pytest` inside a container against a dedicated `db-test`
PostgreSQL service, resetting and reseeding that database once per test
session (see `tests/conftest.py`).

### Why tests need real PostgreSQL, never SQLite

Both invariants this system depends on are PostgreSQL-specific and do not
exist in SQLite:

- **Row-Level Security** (tenant isolation) — SQLite has no RLS at all.
- **`EXCLUDE USING gist`** (reservation non-overlap, added in a later slice) —
  SQLite has no GiST index support.

A SQLite-backed test suite would report green while both central guarantees
of this system were completely absent. Tests always run against a real
Postgres container.

## Why no Alembic (yet)

This project is greenfield: no real data, no consumers, and the schema is
still changing daily. Writing and maintaining migrations for a shape that
isn't stable yet is friction with no payoff.

Instead, `scripts/reset_db.py` is the single deterministic command that
rebuilds the whole schema from the SQLAlchemy models (`app/db/bootstrap.py`),
in order:

1. `CREATE EXTENSION IF NOT EXISTS btree_gist`
2. Drop and recreate every table SQLAlchemy tracks (`Base.metadata`)
3. Enable + FORCE Row-Level Security and create the `tenant_isolation`
   policy on every tenant-scoped table
4. `GRANT` the minimum privileges to the `alquileres_app` role
5. Seed development data

`Base.metadata.create_all()` alone would create the tables but **not** the
RLS policies or grants — the tables would exist while tenant isolation
silently did not. Step 3 and 4 are raw DDL that lives in exactly one place
(`app/db/bootstrap.py`) so that risk can't be introduced by scattering it.

This is a deliberate, recorded deviation from design decision D12
(migration strategy via Alembic). Alembic will be introduced once the
schema settles or real data exists — at that point, `alembic revision
--autogenerate` will not detect RLS policies, grants, or `EXCLUDE`
constraints, so the baseline migration will have to be hand-written. That
cost is postponed, not removed.

## Database roles

Two PostgreSQL roles exist, created once at container init by
`docker/initdb/01-roles.sql` (never by application code — roles are
cluster-level infrastructure):

| Role | Used by | Properties |
|---|---|---|
| `alquileres_migrator` | `scripts/reset_db.py`, `scripts/seed.py`, test fixtures | Owns every table. Never used by the running API. |
| `alquileres_app` | The API process, and the app under test | `NOSUPERUSER NOBYPASSRLS`, not the table owner, only explicit grants |

RLS is bypassed by superusers, `BYPASSRLS` roles, and the table owner —
getting this role split wrong makes every future isolation test pass
vacuously.

**Deviation from design D5, recorded here.** `FORCE ROW LEVEL SECURITY`
means the table owner (`alquileres_migrator`) is *also* subject to RLS —
that is its entire purpose. If a table's `tenant_isolation` policy names
only `alquileres_app`, the migrator has no applicable policy at all and
every write is denied outright (Postgres' default-deny, not a bypass). But
test fixtures and the seed script insert directly into tenant-scoped
tables as the migrator (see `scripts/seed.py`'s successor for `users`, and
`tests/conftest.py::seed_three_tenants`). So every `tenant_isolation`
policy names **both** `alquileres_app, alquileres_migrator`
(`app/db/bootstrap.py::apply_row_level_security`). This is not a bypass —
both roles go through the identical `tenant_id = current_setting(...)`
predicate, and the migrator must `set_config('app.tenant_id', ...)` in the
same transaction before any tenant-scoped write succeeds, exactly like the
app does.

## Configuration

Environment variables, set via `pydantic-settings` (`app/config.py`):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | App-role (`alquileres_app`) connection string |
| `JWT_SECRET` | Yes, **no default**, min 32 bytes | Signs and verifies access tokens (HS256, 8h expiry). The app refuses to boot without it — a default secret in source is how a staging key reaches production. |
| `REGISTRATION_TOKEN` | Yes, **no default** | Shared secret required in the `X-Registration-Token` header on `POST /auth/register` — gates self-registration so anonymous tenant creation is not open on a public host. |

`MIGRATOR_DATABASE_URL` is read directly by `scripts/reset_db.py` and
`scripts/seed.py` (not part of the app's `Settings`) — it is never used by
the running API process.

### Secrets

`JWT_SECRET` and `REGISTRATION_TOKEN` are the only real secrets. Before the
first `docker compose up`:

```bash
cp .env.example .env      # then fill in both values
```

Compose auto-loads `.env` and passes both into the `api` service as
`${VAR:?...}`, so an unset variable fails the `up` with a named error instead
of silently starting on a placeholder. `.env` is gitignored; `.env.example`
is committed and must never hold a real value.

The `test` service is the deliberate exception: it keeps literal throwaway
values in `docker-compose.yml`. Test secrets are not secrets, and requiring a
populated `.env` just to run `pytest` buys nothing.

## Authentication

One owner user per tenant, no roles, no multi-user support (design D10).

- `POST /auth/register` — creates a tenant and its founding owner in one
  transaction. Requires header `X-Registration-Token: <REGISTRATION_TOKEN>`;
  missing or wrong token -> `403`. Body:
  `{"tenant_slug", "name", "email", "password"}`. Returns `201` and
  `{"access_token", "token_type": "bearer"}` — registering logs the new
  owner straight in, so no follow-up `/auth/login` call is needed. The
  token is a header rather than a body field because it is a deployment
  credential, not a property of the tenant being created (design D10
  addendum).
- `POST /auth/login` — body `{"tenant_slug", "email", "password"}`. Returns
  `200` and `{"access_token", "token_type": "bearer"}` on success. Wrong
  slug, wrong email, and wrong password all return the **same** generic
  `401` — the endpoint is deliberately not an enumeration oracle for
  tenants or accounts.
- `GET /me` — requires `Authorization: Bearer <access_token>`. Returns the
  caller's own `{"user_id", "tenant_id", "email"}`, resolved entirely from
  the verified token.

Tokens are stateless JWTs (HS256, 8h expiry, claims `sub`/`tid`/`iat`/`exp`),
signed with `JWT_SECRET`. No refresh tokens — re-login after 8h. Passwords
are hashed with Argon2id (`pwdlib[argon2]`). Login identifier (`email`) is
unique **per tenant**, not globally — the same email can have independent
accounts in different tenants.

Every authenticated route resolves its tenant context (`app.tenant_id`,
used by RLS) only from the verified JWT's `tid` claim — never from a
header, query param, or body field (design D4).

## Properties and clients

Both resources share the same soft-delete mechanism (design D8):
`deleted_at TIMESTAMPTZ NULL` on the row, never a physical delete, and the
API exposes a derived `is_active` boolean — `is_active` is never a stored
column.

- `POST /properties`, `GET /properties` (`?include_inactive=true` opts
  into inactive rows; default excludes them), `GET /properties/{id}`,
  `PATCH /properties/{id}` (edits `name`), `DELETE /properties/{id}` (soft).
- `POST /clients` is the find-or-create-or-reactivate entrypoint, not a
  plain insert: a second `POST` with the same `phone` returns the existing
  client's id (`200`, not a new `201`), and a `POST` matching a
  soft-deleted client's `phone` reactivates it in place (`deleted_at`
  cleared, same `id`, existing `full_name` never overwritten). See
  `app/services/clients.py::upsert_or_reactivate_client`. `GET /clients`
  excludes inactive clients by default; `GET /clients/{id}` does not
  filter, so a historical lookup still resolves an inactive client.
  `PATCH /clients/{id}` edits any field directly (including `phone`) and
  does **not** go through the upsert — a `phone` collision there is a
  genuine `409` (the `23505` backstop in `app/errors.py`).

Every property/client route uses `TenantSessionDep`; cross-tenant access
by id returns `404` (design D11 — RLS makes "belongs to another tenant"
and "never existed" indistinguishable without deliberately bypassing RLS,
so 404 is the only honest answer).

**Known spec deviation, flagged during Phase 3 apply.** The
`client-management` spec states a direct `POST /clients` duplicate-phone
request against an active client "MUST reject it with HTTP 409". The
implementation instead follows design D8/D11 and the task list: `POST
/clients` always goes through the upsert, so a duplicate active phone
resolves silently to the existing client (`200`), never a `409`. See
`openspec/changes/cabin-booking-api/tasks.md`'s Phase 3 deviation note.

## Project layout

```
app/
  main.py          # FastAPI app, GET /health, registers routers + IntegrityError handler
  config.py        # pydantic-settings; secrets have no defaults
  security.py      # Argon2id hashing, JWT issuance/decoding (design D10)
  errors.py        # Central HTTP error mapping: auth (D10) + SQLSTATE dispatch (D11)
  db/
    base.py         # SQLAlchemy 2.0 declarative Base
    session.py      # Engine + SessionLocal (app role) + tenant_scoped_session (D4)
    bootstrap.py     # THE authoritative schema DDL: extension, tables, RLS, grants
  models/
    tenant.py        # Tenant ORM model (global, no RLS)
    user.py           # User ORM model (tenant-scoped, RLS applied)
    property.py        # Property ORM model (tenant-scoped, soft delete)
    client.py           # Client ORM model (tenant-scoped, soft delete, UNIQUE(tenant_id, phone))
  schemas/
    auth.py           # RegisterRequest, LoginRequest, TokenResponse, MeResponse
    property.py         # PropertyCreate/Update/Read (is_active computed_field)
    client.py            # ClientCreate/Update/Read (is_active computed_field)
  api/
    deps.py           # PrincipalDep (verifies JWT), TenantSessionDep (sets app.tenant_id)
    routers/
      auth.py          # /auth/register, /auth/login, /me
      properties.py     # /properties CRUD
      clients.py          # /clients CRUD (POST is find-or-create-or-reactivate)
  services/
    clients.py         # upsert_or_reactivate_client (design D8)
docker/
  initdb/01-roles.sql   # Cluster-level role creation (D5)
scripts/
  reset_db.py      # The one command: reset + seed
  seed.py          # Development seed data (3 tenants)
tests/
  conftest.py             # Resets + seeds the test DB; seed_three_tenants + registered_owner fixtures
  test_health.py
  test_config.py
  test_bootstrap.py
  test_seed.py
  test_rls_structural.py    # pg_catalog introspection: every tenant_id table has RLS
  test_tenant_session.py    # tenant_scoped_session isolation, direct
  test_security.py          # password hashing + JWT round-trip
  test_auth_register.py
  test_auth_login.py
  test_me.py
  test_isolation_auth.py    # 3-tenant cross-isolation for GET /me
  test_isolation_login.py   # same email, independent tenants, no collision
  test_properties.py               # property CRUD, soft delete, include_inactive
  test_clients.py                   # client CRUD, find-or-create-or-reactivate, 23505 backstop
  test_isolation_properties_clients.py  # 3-tenant cross-isolation, one test per endpoint x resource
  test_client_reactivation.py           # client id stability across delete/reactivate cycles
```
