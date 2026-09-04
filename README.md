# Sistema de Alquileres

A multi-tenant cabin rental management system: an internal ledger for the
owner, and a public read-only availability calendar for prospective guests.

Built for one owner with two cabins in Mar del Tuyú, Buenos Aires — but
multi-tenant from the first commit, so other owners can be onboarded without
reshaping anything.

## Layout

```
back/       FastAPI + PostgreSQL API. See back/README.md.
front/      React + Vite owner app and public calendar. Not built yet.
openspec/   Specs and change history for both halves.
```

`openspec/specs/` holds the capability specifications that are the project's
source of truth. `openspec/changes/archive/` holds the record of how each
change was proposed, designed, sliced and verified — including the reasoning
behind decisions that look surprising in the code.

## Running the backend

Everything runs in Docker Compose from this directory:

```bash
cp .env.example .env      # fill in JWT_SECRET and REGISTRATION_TOKEN
docker compose up -d db
docker compose run --rm migrate
docker compose up -d api
```

Tests:

```bash
docker compose run --rm test
```

`back/README.md` documents the database roles, the migration workflow, the
authentication surface, and why the tests need real PostgreSQL rather than
SQLite.

## The two invariants

Both are enforced by the database, not by application code, because both are
the kind of guarantee that an application-level check can only *usually*
provide:

- **No two stays overlap on the same cabin.** A PostgreSQL `EXCLUDE USING
  gist` constraint rejects the insert. There is deliberately no
  read-then-write check in application code — that shape has an irreducible
  race between the read and the write, and this one has none.
- **No tenant can see another tenant's data.** Row-Level Security, enabled
  and forced on every table carrying a `tenant_id`, keyed on a
  transaction-local setting that comes only from a verified token. The
  routers contain no `tenant_id` filters at all, which is the point: there is
  no second mechanism to forget to apply.
