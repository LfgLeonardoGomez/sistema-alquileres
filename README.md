# Cabin Booking API

A sync FastAPI service over PostgreSQL for managing cabin rentals: reservations,
clients, payments, and a public availability calendar, isolated per tenant
(cabin rental owner) via PostgreSQL Row-Level Security.

This is slice 1 (Foundation) of the `cabin-booking-api` change. See
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

## Configuration

Environment variables, set via `pydantic-settings` (`app/config.py`):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | App-role (`alquileres_app`) connection string |
| `JWT_SECRET` | Yes, **no default** | Auth is not implemented yet (slice 2), but the setting exists now and the app refuses to boot without it — a default secret in source is how a staging key reaches production. |
| `REGISTRATION_TOKEN` | Yes, **no default** | Same reasoning; gates self-registration in a later slice. |

`MIGRATOR_DATABASE_URL` is read directly by `scripts/reset_db.py` and
`scripts/seed.py` (not part of the app's `Settings`) — it is never used by
the running API process.

## Project layout

```
app/
  main.py          # FastAPI app, GET /health
  config.py        # pydantic-settings; secrets have no defaults
  db/
    base.py         # SQLAlchemy 2.0 declarative Base
    session.py      # Engine + SessionLocal (app role)
    bootstrap.py     # THE authoritative schema DDL: extension, tables, RLS, grants
  models/
    tenant.py        # Tenant ORM model (global, no RLS)
docker/
  initdb/01-roles.sql   # Cluster-level role creation (D5)
scripts/
  reset_db.py      # The one command: reset + seed
  seed.py          # Development seed data (3 tenants)
tests/
  conftest.py        # Resets + seeds the test DB once per session
  test_health.py
  test_config.py
  test_bootstrap.py
  test_seed.py
```
