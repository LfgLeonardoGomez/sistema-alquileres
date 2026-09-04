# Cabin Booking API

A sync FastAPI service over PostgreSQL for managing cabin rentals: reservations,
clients, payments, and a public availability calendar, isolated per tenant
(cabin rental owner) via PostgreSQL Row-Level Security.

All six slices of the `cabin-booking-api` change are implemented:
Foundation, Auth + Tenant Isolation, Properties + Clients, Reservations,
Payments, and the Public Calendar + Owner Dashboard covered below. See
`openspec/changes/cabin-booking-api/design.md` for the full architecture.

## Stack

- FastAPI (sync `def` path operations — see design D2)
- SQLAlchemy 2.0 ORM + hand-written Pydantic I/O models (not SQLModel — see design D1)
- PostgreSQL 16, driver: `psycopg` (v3)
- Alembic — the single schema-construction path, used identically by
  deployment and by the test suite (design D13)
- pytest, run against real PostgreSQL inside Docker Compose

## Bring it up

```bash
docker compose up -d db
docker compose run --rm migrate python -m scripts.reset_db
docker compose up -d api
curl http://localhost:8000/health
```

The API listens on `http://localhost:8000`.

## Reset the database

`scripts/reset_db.py` migrates the schema to head and (re)seeds
development data. Despite its name, it is **not destructive** — it never
drops a table (see "Migrations" below, design D18):

```bash
docker compose run --rm migrate python -m scripts.reset_db
```

Safely re-runnable: `alembic upgrade head` is a no-op once already at
head, and `scripts/seed.py` inserts the 3 development tenants with
`ON CONFLICT (slug) DO NOTHING`:

- `mar-del-tuyu-cabins`
- `bariloche-lake-houses`
- `villa-carlos-paz-retreat`

Three tenants, not two: two tenants hide cross-tenant isolation bugs that
leak in only one direction.

**The name is a deliberately retained misnomer.** `reset_db.py` no longer
resets anything — it migrates and seeds. Renamed would be more accurate;
kept for muscle memory and because it is already wired into Compose and
this README (owner's decision, design D18). If you need a truly empty
schema, that is `alembic downgrade base` (below), run explicitly — there
is no longer a single command that does both.

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

## Migrations

There is exactly one way this schema comes into existence: Alembic. The
test suite uses the same mechanism (`tests/conftest.py`), so no test can
pass against a schema production never runs (design D13).

All three commands below run via the `migrate` service, the only place
`MIGRATOR_DATABASE_URL` is ever set (design D20) -- not `api`.

```bash
# Apply every migration up to the latest (what `scripts/reset_db.py` does)
docker compose run --rm migrate

# Roll back to nothing -- an explicit, typed, revision-scoped operator
# action. There is no other command in this codebase that drops a table.
docker compose run --rm migrate alembic downgrade base

# After changing a model in app/models/, generate the next migration.
# ALWAYS review the generated file by hand before committing it --
# autogenerate does not detect RLS policies, grants, or EXCLUDE
# constraints (see migrations/versions/0001_baseline.py, which is
# entirely hand-written for exactly this reason).
docker compose run --rm migrate alembic revision --autogenerate -m "message"
```

`migrations/versions/0001_baseline.py` reproduces, as literal
self-contained DDL, the schema this project built by hand until this
point (`app/db/bootstrap.py`, now deleted): the `btree_gist` extension,
all six tables with every constraint, the `reservations_no_overlap`
`EXCLUDE` constraint, and — the part autogenerate cannot see — RLS,
`FORCE ROW LEVEL SECURITY`, the `tenant_isolation` policy, and grants on
every tenant-scoped table. It MUST NOT import `app.models` or
`Base.metadata`: a migration is a snapshot of one moment, and importing
live metadata would make it silently follow the code instead of staying
fixed in time (`migrations/env.py` is the one file allowed to do that, for
autogenerate).

This baseline was verified once, mechanically, against the schema it
replaces — built both ways in a throwaway database and diffed at the
`pg_catalog` level (columns, constraints, indexes, RLS flags,
`pg_policies` predicate text and roles, grants, extensions) — before that
verification tooling was deleted along with `app/db/bootstrap.py`. What
guards the schema now that verification is gone: `tests/test_rls_structural.py`
(every `tenant_id` table has RLS + FORCE + a policy),
`tests/test_schema_is_migrated.py` (the test database's `alembic_version`
matches head, and there is no pending autogenerate diff).

## Database roles

Two PostgreSQL roles exist, created once at container init by
`docker/initdb/01-roles.sh` (never by application code — roles are
cluster-level infrastructure). The script reads both passwords from the
`db`/`db-test` service's environment (no defaults, no credentials
hardcoded in the file itself) — see "Provisioning a fresh PostgreSQL
cluster" below for the equivalent statements run by hand on a real
cluster (design D21).

| Role | Used by | Properties |
|---|---|---|
| `alquileres_migrator` | `alembic upgrade`/`downgrade`, `scripts/reset_db.py`, `scripts/seed.py`, test fixtures | Owns every table. Never used by the running API. |
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
(`migrations/versions/0001_baseline.py`). This is not a bypass —
both roles go through the identical `tenant_id = current_setting(...)`
predicate, and the migrator must `set_config('app.tenant_id', ...)` in the
same transaction before any tenant-scoped write succeeds, exactly like the
app does.

### Provisioning a fresh PostgreSQL cluster

`docker/initdb/01-roles.sh` only ever runs at Docker container init on the
`db`/`db-test` services — it never runs against a managed Postgres
cluster (RDS, Cloud SQL, a bare `postgres` install, etc.). `CREATE ROLE`
is cluster-level and is not re-runnable by a migration, and the migration
itself runs *as* `alquileres_migrator`, which cannot create itself
(design D5, D21). Standing up this schema on a real cluster is therefore
a **manual, one-time runbook**, run once as a superuser, with passwords
supplied by the operator (never committed):

```sql
CREATE ROLE alquileres_migrator WITH LOGIN PASSWORD '<operator-supplied>';

CREATE ROLE alquileres_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<operator-supplied>';

GRANT CREATE, USAGE ON SCHEMA public TO alquileres_migrator;
GRANT USAGE ON SCHEMA public TO alquileres_app;

GRANT CREATE ON DATABASE <database_name> TO alquileres_migrator;
```

**`NOSUPERUSER NOBYPASSRLS` on `alquileres_app` is the line that must not
be "simplified" away.** It is the line someone reaches for when a
permission error appears and RLS looks like the obstacle — but RLS is
bypassed by superusers, `BYPASSRLS` roles, and the table owner (design
D5). Dropping either keyword makes the app role bypass tenant isolation
entirely, and every isolation test in this repository would keep passing,
because they all run *as* the app role too. If a grant is missing, add
the grant; do not widen the role.

After both roles exist, point `MIGRATOR_DATABASE_URL` at the cluster and
run `alembic upgrade head` (see "Migrations" above) — the same command
the `migrate` service runs in Compose.

## Configuration

Environment variables, set via `pydantic-settings` (`app/config.py`):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | App-role (`alquileres_app`) connection string |
| `JWT_SECRET` | Yes, **no default**, min 32 bytes | Signs and verifies access tokens (HS256, 8h expiry). The app refuses to boot without it — a default secret in source is how a staging key reaches production. |
| `REGISTRATION_TOKEN` | Yes, **no default** | Shared secret required in the `X-Registration-Token` header on `POST /auth/register` — gates self-registration so anonymous tenant creation is not open on a public host. |
| `ENVIRONMENT` | Yes, **no default** | Same no-default rule as the two secrets above, and for the same reason (design D20): a default of `development` would make the check below fail open on a forgotten variable. Set to `production` to enable it. |

**When `ENVIRONMENT=production`, the app refuses to boot if
`MIGRATOR_DATABASE_URL` is present anywhere in the process environment**
— `Settings` has no field for it, so this reads the raw environment
directly, and it is enforced even though the variable is never part of
the app's own config (design D20). The API process must never hold
table-owner credentials.

`MIGRATOR_DATABASE_URL` itself is read directly by `migrations/env.py`,
`scripts/reset_db.py`, and `scripts/seed.py` — never part of the app's
`Settings`, and never set on the `api` service. It is set **only** on the
`migrate` Compose service (`command: alembic upgrade head` by default,
overridable to `python -m scripts.reset_db` for migrate + seed in the dev
loop):

```bash
docker compose run --rm migrate
docker compose run --rm migrate python -m scripts.reset_db
```

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

## Production image

`Dockerfile` is multi-stage with two targets (design D19):

- `dev` — what `docker compose build` produces for `api`, `test`, and
  `migrate` today. Keeps the `[dev]` extras (`pytest`) and `tests/`,
  `scripts/` present; bind-mount-friendly.
- `prod` — the deployment target. Built from a `builder` stage that
  installs the project **without** `[dev]` extras, then copies only
  `app/`, `migrations/`, and `alembic.ini` into a clean runtime stage —
  an explicit `COPY` allowlist, not `.dockerignore` alone. Runs as a
  fixed-UID non-root user (`appuser`, UID 10001). `CMD` invokes `uvicorn`
  explicitly with `--workers 1`: this is a rate-limiter **correctness**
  constraint (design D24), not a performance default — the auth rate
  limiter's counters are in-process and per-worker, so a second worker
  silently multiplies every budget.

Build and inspect it manually:

```bash
docker build --target prod -t cabin-booking-api:prod .

# No project test files, no scripts/, no docker/, no .env* -- only what
# the allowlist above copied:
docker run --rm cabin-booking-api:prod ls -la /app

# No dev-only dependencies (pytest) installed:
docker run --rm cabin-booking-api:prod sh -c "pip list | grep -i pytest || echo 'pytest NOT installed'"

# Non-root:
docker run --rm cabin-booking-api:prod id
```

**This is a manual runbook step, and that is a stated gap, not an
oversight.** Asserting these properties automatically requires a CI build
step this change does not have (design D19); automating this check
belongs to that future change. Saying that plainly is better than
implying the packaging claims above are covered by the test suite —
they are not; the test suite runs entirely inside the `dev`/`test`
images and never builds `prod`.

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

## Public availability calendar

`GET /public/{tenant_slug}/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` —
**no authentication required**. `tenant_slug` is the same public slug used
in `POST /auth/login`; `from`/`to` are a half-open `[from, to)` date
window. Returns one entry per **active** property for that tenant:

```json
[
  {
    "property_id": "…",
    "name": "Lake House 3",
    "occupied": [
      { "check_in": "2026-12-05", "check_out": "2026-12-10" }
    ]
  }
]
```

An unknown slug returns a plain `404` and reveals nothing else about
whether the tenant exists. This is the highest-risk data-leak surface in
the system, so it is protected by three independent layers (design D9):

1. **Query projection** — the underlying queries (`app/services/public.py`)
   select only `property_id`/`name` and `property_id`/`check_in`/`check_out`.
   No client name, phone, email, national id, price, payment amount, or
   payment note is ever fetched into memory. This is the layer that
   matters most: even if `response_model` is later widened by mistake, a
   projected query still cannot leak a column it never selected.
2. **A dedicated response model** (`app/schemas/public.py`) that shares no
   base class with any authenticated schema and sets
   `ConfigDict(extra="forbid")`.
3. **A contract test** (`tests/test_public_contract.py`) that seeds a
   distinctive client name, phone, price, and payment note, then asserts
   none of those strings appear anywhere in the **raw response body** —
   string-level, not field-level, so accidental nesting would be caught
   too.

Two independent exclusions apply and are tested separately, because they
are different kinds of exclusion: inactive (`deleted_at IS NOT NULL`)
properties never appear at all (`tests/test_public_inactive_property.py`),
and cancelled reservations never appear as occupied nights
(`tests/test_public_contract.py::test_public_availability_excludes_cancelled_reservations`)
— this second exclusion was a gap in the original task list, closed
during Phase 6 apply because the database's own `reservations_no_overlap`
constraint already treats a cancelled reservation's nights as bookable
(`WHERE (status <> 'cancelled')`), so the public calendar must agree.

## Owner dashboard

`GET /dashboard/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` — authenticated
(`TenantSessionDep`, same as every other owner-facing route). One
endpoint, two windows, two numbers (design "Interfaces"): the caller
computes `from`/`to` as a half-open `[from, to)` window — a month via
`app.services.dates.month_window(year, month)` or an ISO Monday-Sunday
week via `app.services.dates.week_window(any_date)` — and gets back:

```json
{
  "collected": "5000.00",
  "occupied_nights": 5,
  "available_nights": 26,
  "properties": [
    { "property_id": "…", "occupied_nights": 5, "available_nights": 26 }
  ]
}
```

- `collected` is **cash basis only** (owner-dashboard spec) — the signed
  sum of `payments.amount` with `paid_on` in `[from, to)`, regardless of
  the related reservation's stay dates. A deposit paid in October for a
  January stay counts in October, never in January. Refunds (negative
  amounts) reduce it naturally. There is deliberately no second,
  accrual-basis income metric.
- `occupied_nights`/`available_nights` are computed via Postgres
  `daterange` intersection against each non-cancelled reservation
  (`app/services/dashboard.py`), grouped per property for the
  `properties` breakdown.
- **The two soft-delete rules point in opposite directions, deliberately
  (design D8) — do not "fix" this asymmetry:** `collected` counts payments
  on **every** property, active or not (money already received is not
  un-earned by retiring a cabin), while `available_nights`'s denominator
  counts **only active** properties (a retired cabin has no nights to
  sell).

**Gotcha found and fixed during Phase 6 apply.** The first implementation
of the occupancy query built `daterange(r.check_in, r.check_out, '[)')`
directly against columns that can be `NULL` from a `LEFT JOIN` (a property
with no matching reservation, or one excluded because it is cancelled).
In Postgres, a `NULL` range bound means **unbounded**, not "no value" —
so `daterange(NULL, NULL, '[)')` is the *entire* range from `-infinity` to
`+infinity`, and intersecting it with the requested window returned the
whole window as "occupied". Every property with zero qualifying
reservations was silently reported as 100% occupied instead of 100%
available. Fixed with an explicit `CASE WHEN r.id IS NULL THEN 0 ELSE ...
END` guard; caught by this feature's own tests
(`tests/test_dashboard_availability.py`) before it ever reached a
response.

## Project layout

```
app/
  main.py            # FastAPI app, GET /health, registers routers + IntegrityError handler
  config.py          # pydantic-settings; secrets have no defaults, JWT_SECRET min 32 bytes
  security.py        # Argon2id hashing, JWT issuance/decoding (design D10)
  errors.py          # Central HTTP error mapping: auth (D10) + SQLSTATE dispatch (D11)
  db/
    base.py          # SQLAlchemy 2.0 declarative Base
    session.py       # Engine + SessionLocal (app role) + tenant_scoped_session (D4)
  models/
    __init__.py      # Registers every model on Base.metadata (design D13)
    tenant.py        # Tenant (global, deliberately no RLS)
    user.py          # User (tenant-scoped, UNIQUE(tenant_id, email))
    property.py      # Property (tenant-scoped, soft delete)
    client.py        # Client (tenant-scoped, soft delete, full UNIQUE(tenant_id, phone))
    reservation.py   # Reservation (composite FKs, EXCLUDE non-overlap, paid_amount property)
    payment.py       # Payment (signed amount, paid_on defaults in Python, never in the DB)
  schemas/
    auth.py          # RegisterRequest, LoginRequest, TokenResponse, MeResponse
    property.py      # PropertyCreate/Update/Read (is_active computed_field)
    client.py        # ClientCreate/Update/Read (is_active computed_field)
    reservation.py   # ReservationCreate/Update/Read (effective_total, is_completed, balance)
    payment.py       # PaymentCreate/Read (signed Decimal, free-text note)
    public.py        # PublicAvailability/OccupiedRange (D9, no shared base class)
    dashboard.py     # DashboardSummary/PropertyOccupancyRead
  api/
    deps.py          # PrincipalDep, TenantSessionDep, PublicSessionDep (D9)
    routers/
      auth.py        # /auth/register, /auth/login, /me
      properties.py  # /properties CRUD
      clients.py     # /clients CRUD (POST is find-or-create-or-reactivate)
      reservations.py# /reservations CRUD + /reservations/{id}/cancel
      payments.py    # /reservations/{id}/payments
      public.py      # GET /public/{tenant_slug}/availability (no auth)
      dashboard.py   # GET /dashboard/summary
  services/
    clients.py       # upsert_or_reactivate_client (design D8)
    reservations.py  # create_reservation with explicit flush; effective_total (D6/D7)
    dates.py         # today_ar, month_window, week_window (pure, no DB)
    public.py        # column-projected public availability query (D9)
    dashboard.py     # collected + occupied/available nights aggregation
docker/
  initdb/01-roles.sh   # Cluster-level role creation, passwords from env (D5, D21)
migrations/
  env.py             # Reads MIGRATOR_DATABASE_URL; target_metadata = Base.metadata
  script.py.mako     # Revision template
  versions/
    0001_baseline.py # Hand-written, self-contained: extension, tables, RLS/FORCE/policy/grants (D14)
scripts/
  reset_db.py        # migrate to head + seed (non-destructive, retained misnomer -- D18)
  seed.py            # Development seed data (3 tenants, ON CONFLICT DO NOTHING)
tests/
  conftest.py                       # Migrates (downgrade base -> upgrade head) + seeds the test DB
  test_health.py
  test_config.py                    # Settings refuse to boot without secrets/ENVIRONMENT, or in prod with MIGRATOR_DATABASE_URL set (D20)
  test_seed.py
  test_rls_structural.py            # pg_catalog: every tenant_id table has RLS enabled AND forced
  test_schema_is_migrated.py        # alembic_version == head; no pending autogenerate diff (D17)
  test_schema_no_derived_columns.py # no total/completed/balance columns; paid_on has no DB default
  test_tenant_session.py            # tenant_scoped_session isolation, direct
  test_security.py                  # password hashing + JWT round-trip
  test_auth_register.py             # token gate, one-transaction creation, duplicate slug -> 409
  test_auth_login.py                # one generic 401 for every failure mode
  test_me.py
  test_properties.py                # CRUD, soft delete, include_inactive
  test_clients.py                   # CRUD, find-or-create-or-reactivate, 23505 backstop on PATCH
  test_client_reactivation.py       # id stability, and reservations stay attached across reactivation
  test_reservation_overlap.py       # EXCLUDE rejection, adjacency accepted, cancel-then-rebook
  test_reservation_concurrency.py   # two real connections race the same nights -> one 201, one 409
  test_reservation_pricing.py       # per-night XOR stay-total, rescale on date edit
  test_reservation_dates.py         # 1..60 night bounds; past and in-progress stays accepted
  test_reservation_status.py        # cancel; is_completed derived from today_ar()
  test_reservation_balance.py       # balance = effective_total - paid_amount, incl. overpayment
  test_inactive_property_reservation.py
  test_payments.py                  # partial payments accumulate; amount = 0 rejected
  test_refunds.py                   # negative amount is a refund; no kind column exists
  test_public_contract.py           # D9 leak test (raw body), cancelled exclusion, mandatory window
  test_public_inactive_property.py  # inactive property absent from public, visible authenticated
  test_date_windows.py              # month_window/week_window unit tests, no DB
  test_dashboard_collected.py       # cash-basis bucketing, refunds, active+inactive properties
  test_dashboard_availability.py    # cancelled exclusion, inactive denominator, Dec/Jan straddle
  test_isolation_auth.py            # 3-tenant cross-isolation, GET /me
  test_isolation_login.py           # same email, independent tenants, no collision
  test_isolation_properties_clients.py
  test_isolation_reservations.py
  test_isolation_payments.py
  test_isolation_dashboard.py
```
