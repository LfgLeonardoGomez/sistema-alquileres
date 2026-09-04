# Design: Cabin Booking API

> **GOVERNANCE — READ BEFORE IMPLEMENTING.** `authentication` (D10) and `tenant-isolation` (D3, D4) are **CRITICAL** domain. The decisions below are a *proposal awaiting explicit human approval*. They must not be implemented until a human approves them, and they must ship as their own reviewable slice (proposal slice #2), never folded into a larger batch. No approval is assumed by the existence of this document.

> **Size note.** The 800-word design budget is deliberately exceeded. Twelve decisions were mandated, four of them security-critical with exact DDL. Compression here would be false economy.

## Technical Approach

Greenfield sync FastAPI service over PostgreSQL. Two invariants carry the whole system and both are enforced **in the database, not in Python**: non-overlap (`EXCLUDE USING gist`) and tenant isolation (RLS keyed on a transaction-local session setting). Application code is a thin, obvious CRUD layer whose job is to open the right transaction, set the tenant, and translate constraint violations into good HTTP responses.

Two standing rules from prior domain decisions apply everywhere below:
1. **Never store a value derived from other stored facts** (`completed`, `balance`, `total`, `is_active`).
2. **The database is the authority; the app layer is for error messages.**

## Architecture Decisions

### D1 — ORM: SQLAlchemy 2.0 + separate Pydantic v2 models

| Option | Tradeoff | Verdict |
|---|---|---|
| SQLModel (proposal draft; also the `fastapi` skill's stated default) | Fewest classes. But `ExcludeConstraint`, `Index(postgresql_where=…)` and `column_property` are all reached by dropping through to SQLAlchemy anyway, and the one-class-for-table-and-API affordance is a liability given D9's privacy boundary. | Rejected |
| SQLAlchemy 2.0 ORM (`Mapped[]`/`mapped_column`) + hand-written Pydantic I/O models | ~6 extra small classes of boilerplate. Every Postgres feature this design depends on is first-class and documented; Alembic autogenerate targets SQLAlchemy metadata directly. | **Chosen** |

**Rationale.** Honest framing: SQLModel would work — this is a close call, not a rout. It loses on two specific points. First, the derived reads in D6 need `column_property` with correlated scalar subqueries and SQL expressions bound to a Python-computed date; that fights SQLModel's metaclass and is idiomatic in SQLAlchemy 2.0. Second, and decisive: the persistence model and the transport model must be *structurally* separate here, because a single leaked field on the public calendar is a privacy breach. Paying for a dependency whose headline feature we are forbidden to use is not simplicity.

**This is a deliberate deviation from the `fastapi` skill**, which prefers SQLModel. Recorded as such, not overlooked. If a future reviewer weights class count over persistence/transport separation, SQLModel is the reasonable alternative and the migration cost is low.

### D2 — Sync, not async

`def` path operations, sync `Session`, psycopg3. Reason: the load is one owner and a low-traffic public calendar; async buys nothing and costs async-driver footguns around transaction-local settings and pooling. FastAPI runs `def` handlers in a threadpool. **Tradeoff:** higher per-request thread cost, irrelevant at this scale; revisiting means changing the session dependency and the driver, nothing else. Chosen against the reflexive "FastAPI means async".

### D3 — Project layout: flat, feature-oriented, no repository layer

```
app/
  main.py              # app, router registration, exception handlers
  config.py            # pydantic-settings; no defaults for secrets
  errors.py            # SQLSTATE -> HTTP mapping (D11)
  db/  base.py session.py
  models/              # SQLAlchemy ORM: tenant user property client reservation payment
  schemas/             # Pydantic I/O; public.py is deliberately separate (D9)
  api/
    deps.py            # PrincipalDep, TenantSessionDep, PublicSessionDep
    routers/           # auth properties clients reservations payments dashboard public
  services/            # ONLY reservations.py, clients.py, dashboard.py
scripts/               # reset_db.py, seed.py — D12 amendment, replaces migrations/
docker/initdb/
tests/
```

No repository abstraction: `Session` already is one, and wrapping it would be a repository over a repository. No hexagonal ports/adapters: nothing here is swappable — the design is *deliberately* welded to Postgres, so an adapter boundary would be a lie. `services/` exists only for the three modules with real logic (pricing, find-or-create-or-reactivate, aggregation); every other router talks to the session directly. **Tradeoff:** routers doing simple queries inline are harder to unit-test in isolation — accepted, because D-level correctness here is integration-level anyway and mocking a Session proves nothing.

### D4 — Tenant context: transaction-local setting, set from the verified token only

```python
def get_tenant_session(principal: PrincipalDep) -> Iterator[Session]:
    with SessionLocal() as session, session.begin():          # BEGIN
        session.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(principal.tenant_id)},                 # true = transaction-local
        )
        yield session                                          # COMMIT or ROLLBACK on exit
TenantSessionDep = Annotated[Session, Depends(get_tenant_session)]
```

- `set_config(..., true)`, not `SET LOCAL` — `SET LOCAL` cannot take a bind parameter, and string-interpolating a tenant id into DDL-ish SQL is how injection happens.
- **Leakage is impossible by construction, not by cleanup discipline:** the setting's lifetime *is* the transaction. COMMIT and ROLLBACK both discard it, so a connection can never return to the pool carrying it. The pool's `reset_on_return='rollback'` is a second net, not the mechanism.
- **Fail-closed:** if any query runs outside this transaction, the setting is absent, the policy predicate evaluates to NULL, and every row is filtered out. Absence of context denies access; it does not grant it.
- Also compatible with PgBouncer transaction mode, should it ever appear.
- **The tenant id is read only from the verified JWT claim** — never a header, query param, or body field. For the public route it comes from a path slug resolved server-side (D9). Dependency resolution order guarantees the token is verified *before* the transaction opens; that ordering is enforced by the dependency graph, not by convention.

### D5 — RLS shape, and the role question (the fatal-mistake one)

RLS is bypassed by superusers, `BYPASSRLS` roles, **and the table owner**. Getting this wrong makes every isolation test pass vacuously.

Two roles:

| Role | Used by | Properties |
|---|---|---|
| `alquileres_migrator` | Alembic, test setup/teardown | Owns the tables. Never used by the app. |
| `alquileres_app` | The API process **and the app under test** | `NOSUPERUSER NOBYPASSRLS`, not the owner, only `SELECT/INSERT/UPDATE/DELETE` grants. |

`CREATE ROLE` lives in `docker/initdb/01-roles.sql` (roles are cluster-level infrastructure, and a migration that creates them breaks on re-run or without `CREATEROLE`). `GRANT`s live in the migration that creates each table.

Per tenant-scoped table, one policy — not four:

```sql
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;   -- belt: applies even to the owner

CREATE POLICY tenant_isolation ON reservations
  FOR ALL TO alquileres_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

`current_setting(..., true)` (missing_ok) returns NULL instead of raising when unset; `NULLIF(…,'')` prevents an empty string reaching the `::uuid` cast. `FOR ALL` with both clauses covers read (USING) and write (WITH CHECK) in one object.

**No `BYPASSRLS` anywhere in the application, including the public calendar** — see D9. The two reads that legitimately precede tenant context are handled without a bypass:

- `tenants` is a **global table with no RLS**. It holds only id, slug, name, timestamps; the slug is public by design (it is in the public calendar URL). Nothing tenant-secret lives there.
- **Login** takes `{tenant_slug, email, password}`: resolve the tenant from the un-RLS'd `tenants` row, set `app.tenant_id`, *then* look up the user under RLS and verify the password. **Registration** inserts the tenant, sets the setting to the new id, then inserts the owner — all one transaction, WITH CHECK satisfied.

**Enforcement, not documentation.** A pytest queries `pg_class`/`pg_policies` and fails if any table with a `tenant_id` column lacks both `relrowsecurity` and `relforcerowsecurity` or has no policy. This replaces a hand-maintained "tenant-scoped tables" manifest, which drifts.

### D6 — The `EXCLUDE` constraint, plus the cross-tenant FK hole it does not close

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- required for `uuid WITH =` inside gist

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    property_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');

ALTER TABLE reservations
  ADD CONSTRAINT reservations_nights_range
  CHECK (check_out - check_in BETWEEN 1 AND 60);
```

- `'[)'` half-open bounds are what make checkout day == next check-in day legal. This is the entire adjacency requirement, expressed once.
- Scoping on `property_id` alone is sufficient — `property_id` is a globally unique UUID, so it transitively determines the tenant. Adding `tenant_id` would be redundant.
- Predicate `status <> 'cancelled'` rather than `status = 'reserved'`: identical today with two states, but fail-closed if a third state (e.g. maintenance block) is ever added — a new state is included in overlap checking by default.
- `check_out > check_in` is implied by the `BETWEEN 1 AND 60` check.

**Explicit non-constraints — retroactive dates are ALLOWED.** `check_in` and `check_out` may be in the past or straddle today. There is **no future-date validation anywhere** and **no retroactive flag column**. This is stated as a first-class design element rather than an omission, because "check-in must be today or later" is the instinctive default in every booking system and would be added back by reflex during implementation or review. The owner's real workflow is migrating a paper notebook mid-season, which means backfilling stays that already happened or are in progress; a future-date rule would block the primary use case on day one.

Concretely, this forbids: `Field(ge=date.today())` or any equivalent on the Pydantic models, a `CHECK (check_in >= CURRENT_DATE)`, and any service-layer guard. The **only** date rules in the system are the non-overlap invariant and the 1–60 night bounds. The derived `completed` read (D7) already yields the correct answer for a backfilled past stay with no extra work — a reservation whose `check_out` has passed simply reads as completed the moment it is created.

**The hole `EXCLUDE` does not cover:** RLS blocks *reading* another tenant's property, but a plain `FK (property_id) REFERENCES properties(id)` would still accept a foreign tenant's property id on INSERT. Close it with composite FKs:

```sql
ALTER TABLE properties ADD CONSTRAINT properties_tenant_id_uq UNIQUE (tenant_id, id);
ALTER TABLE reservations
  ADD FOREIGN KEY (tenant_id, property_id) REFERENCES properties (tenant_id, id),
  ADD FOREIGN KEY (tenant_id, client_id)   REFERENCES clients    (tenant_id, id);
```

Same pattern for `payments → reservations`. Every tenant-scoped table therefore carries a `UNIQUE (tenant_id, id)` as an FK target.

**Catching it as 409, not 500.** The violation surfaces at flush. If the commit happens in the session dependency *after* the handler returned, the response has already started and the exception handler cannot shape it. Therefore the reservation service calls `session.flush()` explicitly inside the handler, so the violation raises while a response is still writable. This is the specific mechanism by which "409" stays a 409.

### D7 — Derived reads: the SQL/Python boundary

**Rule: derive in SQL when the value participates in a `WHERE`, `ORDER BY`, or aggregate. Derive in Python when it is only presented.**

| Value | Where | Why |
|---|---|---|
| `paid_amount` | SQL — `column_property` over a correlated `SUM(payments.amount)` | Aggregate over another table; a Python property would be N+1 on every list. |
| `balance` | Python — Pydantic `computed_field`: `total - paid_amount` | Arithmetic on two scalars already in hand. |
| `is_completed` | Python — `status == 'reserved' and check_out <= today_ar()` | Presentation only. |
| filtering by completed | SQL — `WHERE check_out <= :today` with `today` **passed as a bound parameter** | See below. |

`CURRENT_DATE` is never used in a query. "Today" is computed once in Python as `datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()` and bound in. This removes any dependence on the database server's timezone.

**Tradeoff:** `column_property` runs its subquery on *every* `Reservation` select, including ones that don't need it. At hundreds of rows this is free; if it ever hurts, wrap it in `deferred()` — a one-line change.

**Pricing (refinement of the proposal).** The proposal said both pricing modes "resolve to one stored total". Storing the resolved total makes the per-night rate unrecoverable, so editing dates on a per-night-priced reservation silently keeps the old total. Instead:

```sql
price_per_night NUMERIC(12,2) NULL,
price_total     NUMERIC(12,2) NULL,
CHECK (num_nonnulls(price_per_night, price_total) = 1)
```

`total` is derived: `COALESCE(price_total, price_per_night * (check_out - check_in))`. Date edits rescale per-night pricing automatically, with zero extra logic, and no derived value is stored. **This changes a success criterion's wording from "same stored total" to "same effective total" — flagged for spec reconciliation.**

Money is `NUMERIC(12,2)` and `Decimal` in Python. Never float. Refunds are `payments` rows with a **negative signed `amount`** (`CHECK (amount <> 0)`), with a free-text `note` — no `kind` column, because the kind is derivable from the sign.

### D8 — Soft delete + find-or-create-or-reactivate

The usual soft-delete pattern (partial unique index `WHERE deleted_at IS NULL`) is **wrong here** and must be actively avoided. The product decision requires the collision to happen so the row can be reactivated. So:

```sql
deleted_at TIMESTAMPTZ NULL,                    -- is_active is derived: deleted_at IS NULL
CONSTRAINT clients_tenant_phone_uq UNIQUE (tenant_id, phone)   -- FULL, spans deleted rows
```

Find-or-create-or-reactivate is one atomic statement — no read-then-write race:

```sql
INSERT INTO clients (id, tenant_id, full_name, phone, email, national_id)
VALUES (:id, :tenant_id, :name, :phone, :email, :nid)
ON CONFLICT (tenant_id, phone) DO UPDATE SET deleted_at = NULL
RETURNING id, (xmax = 0) AS was_created;
```

Reactivation only. The name is deliberately *not* overwritten from a reservation payload — name edits go through `PATCH /clients/{id}`, so a typo while booking cannot silently rename an existing client.

**Why the unique index must include `tenant_id`:** a unique index on `phone` alone would fire across tenants even though RLS hides the conflicting row, turning the constraint error into an existence oracle — an attacker could enumerate another tenant's phone numbers by watching for 409s. Including `tenant_id` makes cross-tenant collision impossible. This is the classic RLS + unique-index leak.

**Query rules — explicit, not global:** `GET /clients` and client search add `WHERE deleted_at IS NULL`; reservation reads that join the client add **nothing**. SQLAlchemy's `with_loader_criteria` global filter is rejected: a filter applied everywhere with an escape hatch would silently break exactly the historical reads that must not be filtered. Explicit at the call site beats implicit everywhere.

#### Properties are soft-deleted too — the same mechanism, a different rule set

Removing a cabin must never orphan its reservations, payments, or income history. `properties` therefore gets the same `deleted_at TIMESTAMPTZ NULL` column.

**Column spelling — a deliberate call.** The requirement was phrased as `is_active boolean`. Stored as `deleted_at`, exposed in the API as a derived `is_active` boolean. Rationale: `deleted_at` strictly dominates a boolean — it answers *when* as well as *whether*, and `is_active` is recoverable from it while the reverse is not — which is the project's standing "never store a derived value" rule. More importantly, two tables with two different soft-delete mechanisms is precisely the inconsistency that produces a missed filter. The user-facing contract is unchanged: the API field is `is_active`. **Reversible in one migration if the boolean spelling is specifically wanted in the schema.**

Behaviour matrix — inactive properties are *not* simply hidden:

| Operation | Inactive property | Why |
|---|---|---|
| Create a new reservation on it | **Rejected, 422** | Enforced in `services/reservations.py`, not by a DB constraint — see below |
| Appears in public availability calendar (D9) | **Excluded** | |
| Appears in default `GET /properties` listing | **Excluded** (`?include_inactive=true` opt-in for the owner) | |
| Existing reservations on it | **Readable and editable** | Mid-season corrections must still be possible |
| Its payments in dashboard `collected` | **Still counted** | The money was received; retiring a cabin does not un-earn it |
| `EXCLUDE` non-overlap constraint | **Still applies** | Unaffected by inactivity — the rows exist, so they still block overlaps. This matters if the property is ever reactivated: its history is intact and consistent, with no window during which a conflicting reservation could have been created. |

The "no new reservations" rule lives in the service layer rather than as a DB constraint, because a constraint would have to be a trigger or a redundant denormalised copy of `properties.deleted_at` on every reservation row — real complexity for a rule with no concurrency hazard. Unlike non-overlap, racing two inserts against a property being deactivated has no bad outcome worth defending against: the loser is one reservation on a cabin that was retired a second later, trivially fixed by editing it. **Tradeoff stated plainly: this rule is application-enforced and therefore weaker than every other invariant in this design. That is the correct trade here, and it is the only rule for which it is.**

**Two tables, no abstraction.** The filtering discipline now spans `clients` and `properties`. It stays as an explicit `.where(X.deleted_at.is_(None))` at each call site — no soft-delete mixin, no base model, no query helper. Two tables and roughly five call sites do not justify an abstraction, and the whole point of D8 is that the *exception* cases (historical reads, dashboard income, reservation edits) are the ones that matter and must be visible at the call site. A shared helper would make the default invisible and the exceptions look like mistakes. Revisit at a third table.

### D9 — Public endpoint isolation: three independent layers

Field omission on a shared model is not a boundary. All three of these hold:

1. **Query projection.** The public query selects *columns*, never the entity: `select(Reservation.property_id, Reservation.check_in, Reservation.check_out)`. Client id, prices, notes and the reservation id are never fetched into memory, so no serialization bug can leak them.
2. **Dedicated response model** in `app/schemas/public.py` — `PublicAvailability { property_id, name, occupied: list[OccupiedRange] }`, `ConfigDict(extra="forbid")`, declared via `response_model=`. It shares no base class with any authenticated schema.
3. **Contract test.** Seed a tenant with a distinctive client name, phone, price and payment note; assert none of those strings appear anywhere in the **raw response body**. String-level, not field-level, so accidental nesting is caught too.

The route lives in its own `public.py` router with no auth dependency, and uses `PublicSessionDep`, which resolves the tenant from the path slug and sets `app.tenant_id` exactly as D4 does. **The public endpoint is not an RLS bypass** — it is the same isolation with the tenant resolved from the URL instead of a token. No `BYPASSRLS` role exists in the application.

**This endpoint now excludes two independent things, and they are not the same kind of exclusion.** The privacy fields above are excluded *structurally* — they cannot be reached. Retired cabins are excluded by an ordinary predicate: the query joins `properties` and adds `WHERE properties.deleted_at IS NULL` (D8). Because that one is a plain filter, it is the one that can be forgotten, so it gets its own test: seed an inactive property carrying a reservation, assert its `property_id` is absent from the public response *while* the same reservation remains visible on the authenticated endpoint. Listing the two exclusions side by side here is deliberate — a reader who assumes both are structural will not think to test the second.

**Accepted risk (not a build item):** the endpoint is unauthenticated and scrapeable. Occupancy dates for a cabin are the information a prospect is meant to see. No rate limiting in this change.

### D10 — Auth (CRITICAL — proposal, not approved)

| Concern | Choice | Tradeoff |
|---|---|---|
| Hashing | **Argon2id** via `pwdlib[argon2]` | OWASP first recommendation. bcrypt is more widely deployed but carries the 72-byte truncation gotcha. `passlib` is avoided: effectively unmaintained. No custom crypto, no hand-rolled salting. |
| Token | **Stateless JWT HS256** (`pyjwt`), 8h expiry, claims `sub`, `tid`, `iat`, `exp` | No revocation before expiry. Acceptable: one owner per tenant, 8h window. DB-backed opaque tokens give instant revocation at the cost of a sessions table plus a lookup per request — deferred, and the swap is contained behind one dependency. |
| Refresh tokens | **None** | Re-login after 8h. Extra surface, no benefit for an internal tool. |
| Signing key | `pydantic-settings`, **no default** | The app refuses to boot without `JWT_SECRET`. A default secret in source is how staging keys reach production. |
| `password_hash` | `TEXT NOT NULL`; the `User` ORM model is never used as a response model | D1's model separation is what makes this structural rather than a review checklist item. |

**Login identifier: email, unique *per tenant*.** `UNIQUE (tenant_id, email)`, and login takes `{tenant_slug, email, password}`.

Email over username: there is no new namespace to invent, the owner already knows the value, and it is the natural recovery channel if password reset is ever added. A username would buy nothing here.

The harder question is *scoping*, and it is the one that actually matters. A globally-unique email would let login be just `{email, password}` — nicer to type, since one owner per tenant makes the lookup unambiguous. It is rejected because it requires reading `users` **before** any tenant context exists, which means punching an RLS hole in the most sensitive table in the schema purely for login ergonomics. It would also reintroduce exactly the cross-tenant existence oracle D8 exists to avoid: a global unique index turns "registration conflict" into "this email has an account here". Per-tenant scoping keeps D5's zero-bypass property intact, which is the strongest guarantee in this design and not worth trading for two seconds of typing.

**Ergonomics mitigation, one line:** the slug already appears in the public calendar URL the owner shares, and a bookmarked `/login?tenant=<slug>` prefills it. The cost of the safer choice is paid once, at bookmark time.

The claim path is the whole point: `get_current_principal` verifies the JWT and returns `(user_id, tenant_id)`; `get_tenant_session` depends on it and sets `app.tenant_id` from the `tid` claim. Client-supplied tenant identifiers are never trusted on an authenticated route.

Failed login returns a single generic 401 regardless of whether the slug, the email, or the password was wrong — three distinct failure modes, one response, so the endpoint is not an enumeration oracle for tenants or accounts.

**Open, needs a human decision:** self-registration is open by default. Recommend gating `POST /auth/register` behind a shared `REGISTRATION_TOKEN` env var — one line, and it prevents anonymous tenant creation on a public host.

#### D10 addendum — resolved during apply (slice 2)

Three questions D10 left open were decided by the owner while implementing Phase 2.

**1. Self-registration is gated.** `REGISTRATION_TOKEN` is required, has no
default, and the app refuses to boot without it. Approved as recommended.

**2. The registration token travels in an `X-Registration-Token` header,**
not in the request body. `RegisterRequest` is specified as exactly
`{tenant_slug, name, email, password}` — the token is a deployment
credential, not a property of the tenant being created, so it does not
belong in the resource payload. Missing or wrong header -> `403`. The
comparison fails closed: an absent header is `None`, which never equals the
configured value.

**3. `POST /auth/register` returns a JWT, not a bare `201`.** Registering
logs the new owner in immediately, so the client never has to follow up
with `POST /auth/login`.

The tradeoff was raised with the owner and accepted: whoever holds
`REGISTRATION_TOKEN` gets an active session in one call rather than two.
That is acceptable here because the token is a closed, operator-held
deployment secret, there is exactly one owner per tenant, and the caller
already supplied the password that `/auth/login` would have asked for — the
second call would authenticate nothing the first call did not already
establish. Revisit this if registration is ever opened to the public or a
tenant grows past a single user.

### D11 — Error mapping

| Trigger | SQLSTATE | HTTP | Reasoning |
|---|---|---|---|
| Date overlap | `23P01` exclusion_violation | **409** `dates_unavailable` | Conflict with existing state. |
| Duplicate phone | `23505` | 409 | Normally absorbed by the D8 upsert; this is the backstop. |
| Nights out of range, bad dates | `23514` | **422** | Semantically invalid request. Pydantic catches it first; the CHECK is the concurrency-safe backstop. |
| FK to a row RLS hides | `23503` | **404** | See below. |
| Missing/invalid token | — | 401 | |
| Authenticated but not permitted | — | 403 | |
| Cross-tenant resource access | — | **404** | See below. |

Dispatch on `exc.orig.sqlstate` in one `IntegrityError` handler. Do **not** blanket-map `IntegrityError → 409`: `23514` and `23503` mean different things and would be misreported.

**404 vs 403 for cross-tenant access — the argument.** 404 is not merely the privacy-preferable answer; it is the **only honest** one. Under RLS the row does not exist for this session, and the application genuinely cannot distinguish "belongs to another tenant" from "never existed" without deliberately bypassing RLS to check. Returning 403 would require *building the leak in order to report it*. The isolation mechanism makes the correct answer the default one — that is a property worth naming.

Raw driver messages are never returned; responses use a stable `{"detail", "code"}` shape and the Postgres text goes to logs.

### D12 — Schema bootstrap, not Alembic (SUPERSEDED during apply — see below)

> **Amendment recorded during Slice 1 apply (engram: `architecture/schema-bootstrap`).** The table below was the original Alembic-based plan. The user rejected migrations for the duration of active development: greenfield, no real data, no consumers, and the schema is still changing daily. Writing and reviewing five migrations for a shape that isn't stable yet is friction with no payoff. **This section is retained for history; the paragraphs below it are the binding decision.**
>
> | # | Revision | Contents |
> |---|---|---|
> | 0001 | `extensions` | `CREATE EXTENSION IF NOT EXISTS btree_gist` |
> | 0002 | `tenants_users` | `tenants` (global, no RLS), `users` + `UNIQUE (tenant_id, email)` + RLS + grants |
> | 0003 | `properties_clients` | tables, `deleted_at` on both, `UNIQUE (tenant_id, id)` FK targets, `UNIQUE (tenant_id, phone)`, RLS + grants |
> | 0004 | `reservations` | table, composite FKs, CHECKs, then `EXCLUDE`, RLS + grants |
> | 0005 | `payments` | table, composite FK, signed-amount CHECK, RLS + grants |

**The replacement: one deterministic bootstrap command.** `scripts/reset_db.py` recreates the entire schema from scratch, in order:

1. `CREATE EXTENSION IF NOT EXISTS btree_gist`
2. `Base.metadata.drop_all()` then `Base.metadata.create_all()` — SQLAlchemy models (`app/models/*.py`) are the single source of truth for tables, columns, indexes, `CHECK` constraints, and the `EXCLUDE` constraint (via `sqlalchemy.dialects.postgresql.ExcludeConstraint`, so `create_all()` emits it without hand-written DDL for that part)
3. `ENABLE`/`FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation` + `GRANT`s, for every table listed in `TENANT_SCOPED_TABLES` — one authoritative list in `app/db/bootstrap.py`
4. Seed data (`scripts/seed.py`) — 3 tenants, so cross-tenant isolation is testable from day one

It is **idempotent by recreation, not a migration** — every run drops and rebuilds. It must never try to preserve data.

**Roles stay exactly as D5 describes them** — `alquileres_migrator` / `alquileres_app` are created once in `docker/initdb/01-roles.sql` (cluster-level infrastructure, not touched by the bootstrap script or application code). `docker/initdb/01-roles.sql` additionally grants `CREATE`/`USAGE` on schema `public` and `CREATE ON DATABASE` to `alquileres_migrator` — both are required for a non-owner role to run `CREATE EXTENSION` and `CREATE TABLE`, and both survive every bootstrap reset because the bootstrap never drops the schema itself, only the tables it tracks.

**Why this is safe despite skipping migrations:** `create_all()` alone creates tables but not RLS policies or grants — the exact fatal mistake D5 exists to prevent, silently. The safety net is the `pg_class`/`pg_policies` introspection test (`tests/test_rls_structural.py`, added when the first tenant-scoped table ships in slice 2): it fails if any table with a `tenant_id` column lacks `relrowsecurity`, `relforcerowsecurity`, or a policy. With that test green on every run, this approach is as safe as reviewing an Alembic migration by hand.

**Deferred cost, accepted knowingly:** when Alembic is introduced later (once the schema settles or real data exists), `alembic revision --autogenerate` will not detect RLS policies, grants, or reliably emit `EXCLUDE` constraints. The baseline migration at that point will have to be hand-written from the live schema. The cost is postponed, not removed.

**File:** `app/db/bootstrap.py` is the one authoritative place this DDL lives — `create_extensions()`, `create_schema()`, `apply_row_level_security()`, `grant_global_tables()`, composed by `reset_database()`. `scripts/reset_db.py` calls `reset_database()` then `scripts/seed.py::run()`, all via the `alquileres_migrator` role. `migrations/` and Alembic dependencies are removed from this change's scope entirely (not merely deferred to a later file — they are not created).

## Data Flow

```
  Authenticated write                            Public read
  ------------------                             -----------
  Request + Bearer JWT                           GET /public/{slug}/availability
        |                                              |
   verify token (pyjwt) -> (user_id, tid)        resolve tenant by slug (tenants: no RLS)
        |                                              |
   BEGIN; set_config('app.tenant_id', tid, true) <-- same mechanism, same policy
        |                                              |
   router -> service -> Session                  column-projection SELECT only
        |                                              |
   session.flush()  --23P01--> 409                PublicAvailability model
        |                                              |
   COMMIT (setting discarded with the txn)        response
```

## File Changes

| File | Action | Description |
|---|---|---|
| `docker-compose.yml`, `Dockerfile` | Create | `api`, `db`, `db-test` services |
| `docker/initdb/01-roles.sql` | Create | `CREATE ROLE alquileres_app` / `alquileres_migrator` (D5) |
| `pyproject.toml` | Create | fastapi, sqlalchemy, psycopg, pydantic-settings, pyjwt, pwdlib[argon2], pytest — **no alembic** (D12 amendment) |
| `app/config.py` | Create | Settings; secrets have no defaults |
| `app/db/session.py` | Create | Engine, `SessionLocal`, `get_tenant_session`, `get_public_session` (D4) |
| `app/models/*.py` | Create | Six ORM models, `__table_args__` carrying CHECKs and unique targets |
| `app/schemas/*.py` | Create | Pydantic I/O; `public.py` structurally isolated (D9) |
| `app/api/deps.py` | Create | `PrincipalDep`, `TenantSessionDep`, `PublicSessionDep` |
| `app/api/routers/*.py` | Create | auth, properties, clients, reservations, payments, dashboard, public |
| `app/services/reservations.py` | Create | Pricing resolution, explicit `flush()` for 409 mapping |
| `app/services/clients.py` | Create | Upsert-reactivate (D8) |
| `app/services/dashboard.py` | Create | `collected` (cash basis) + occupied/available nights |
| `app/errors.py` | Create | SQLSTATE dispatch (D11) |
| `app/db/bootstrap.py` | Create | Schema bootstrap: extension, tables, RLS, grants (D12 amendment — replaces `migrations/versions/`) |
| `scripts/reset_db.py`, `scripts/seed.py` | Create | The one reset command + dev seed data (D12 amendment) |
| `tests/` | Create | See Testing Strategy |

## Interfaces

Endpoints: `POST /auth/register`, `POST /auth/login`, `GET /me`; CRUD on `/properties`, `/clients` (DELETE = soft), `/reservations` (+ `POST /reservations/{id}/cancel`), `/reservations/{id}/payments`; `GET /dashboard/summary?from=&to=`; `GET /public/{tenant_slug}/availability?from=&to=`.

**Dashboard: one endpoint, two windows, two numbers.** `from`/`to` are half-open `[from, to)` **local AR dates**, so "month" and "week" are caller-chosen windows over one query path rather than two near-duplicate endpoints. The response carries exactly `collected`, `occupied_nights`, `available_nights`, and a per-property breakdown.

**Scope note:** income is reported on a **cash basis only** — money actually received in the period. An accrual/valued-occupancy metric was considered and is explicitly **out of scope**; a deposit paid in October for a January stay counts in **October** and nowhere else. One income number, no reconciliation between two numbers that disagree by design.

**Timezone — the remaining subtlety, handled by elimination.** All business dates are `DATE`, including `payments.paid_on`. `TIMESTAMPTZ` exists only on `created_at`/`deleted_at` and is never used in a report. Consequences:

- A period boundary is a plain date comparison. There is no `AT TIME ZONE`, no UTC-midnight-vs-local-midnight off-by-one, and no possibility of a payment landing in the wrong month because the server runs in UTC.
- `America/Argentina/Buenos_Aires` is used in exactly **two** places, both in Python, both producing a `date`: the default value of `paid_on` when the owner does not supply one, and "today" for D7. Nothing else in the system knows about a timezone.
- Month window: `[first_of_month, first_of_next_month)`. Week window: ISO Monday–Sunday, i.e. `[monday, monday + 7d)`. Both are computed by the caller as AR local dates; the API only ever sees dates. Half-open bounds mean no day is double-counted at a boundary and none is dropped.
- Argentina has had no DST since 2009, but nothing above depends on that — `DATE` arithmetic is DST-immune regardless.

`collected` — signed sum, so refunds reduce it; RLS supplies the tenant scope:

```sql
SELECT COALESCE(SUM(p.amount), 0) FROM payments p
WHERE p.paid_on >= :from AND p.paid_on < :to;
```

That is the entire income feature. No materialized view, no pre-aggregation table, no cache: two cabins produce a few hundred payment rows per year, and an index on `(tenant_id, paid_on)` makes this a trivial scan.

Available nights, same window:

```sql
occupied_nights = SUM(upper(nights) - lower(nights))     -- over the D6 daterange intersection
available_nights = active_properties * nights_in_window - occupied_nights
```

using `daterange(check_in, check_out, '[)') * daterange(:from, :to, '[)')` and `status <> 'cancelled'`. Grouping by `property_id` yields the per-property breakdown from the same query.

**The two soft-delete rules here point in opposite directions, deliberately** (D8):

- `available_nights` counts only **active** properties (`deleted_at IS NULL`) in the denominator. A retired cabin has no nights to sell, so including it would report phantom availability.
- `collected` counts payments on **all** properties, active or not. The money was received; retiring a cabin does not un-earn it, and a retired property must not silently rewrite last month's income.

Getting these the same way round would be wrong in one of the two, so each has its own test.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Pricing resolution, night counting, AR "today", week/month boundary helpers, balance arithmetic | Pure functions, no DB |
| Integration | Overlap → 409; adjacency accepted; **a fully retroactive stay and an in-progress stay are both accepted**; cancel-then-rebook; reactivation upsert; derived balance/completed; `collected` counts a deposit in its payment month, not its stay month; a refund reduces `collected`; available nights across a Dec/Jan straddling stay | Real Postgres |
| Soft delete | Inactive property: new reservation → 422, absent from public calendar and default listing, but its existing reservations stay readable/editable and its payments **still count** in `collected`; available-nights denominator **excludes** it | Real Postgres |
| Isolation | 3 seeded tenants, one test **per endpoint**, asserting 404 | Real Postgres, **app role** |
| Concurrency | Two parallel connections booking the same nights → exactly one 201, one 409 | Separate real connections, not one shared session |
| Contract | Public endpoint string-absence assertions (D9) | Raw body inspection |
| Structural | Every `tenant_id` table has FORCE RLS + a policy; no `balance` or `completed` column exists anywhere in the schema | `pg_catalog` queries |

**The gotcha that decides whether any of this is real:** tests must connect as **`alquileres_app`**, not the migrator. Fixtures that set up and tear down use `alquileres_migrator`; the application under test uses `alquileres_app`. Run the isolation suite as the owner and every test passes while proving nothing.

Real Postgres, never SQLite — every invariant here is Postgres-specific. Isolation between tests via `TRUNCATE … RESTART IDENTITY CASCADE` as the migrator, rather than the nested-transaction-rollback pattern, because that pattern interferes with the transaction-local tenant setting this design depends on. **Tradeoff:** slower per test; at six tables, irrelevant, and it exercises the real commit path including the D6 flush behaviour.

Three tenants in seed data, not two: two tenants hide bugs that leak in only one direction.

## Migration / Rollout

Greenfield, no consumers, no data. Per slice: revert the commit, then `docker compose run --rm api python -m scripts.reset_db` to rebuild the schema from the reverted models (D12 amendment — no `alembic downgrade` exists in this project). Full reset: `docker compose down -v`. Slice 2 (auth + isolation) lands before any real tenant is onboarded, so it carries no irreversible risk at merge time. Slices follow the proposal's order — the two invariant-carrying slices land before CRUD.

## Open Questions

- [ ] **BLOCKING, human approval required:** D5 (roles + RLS shape) and D10 (JWT, Argon2id, 8h expiry, no refresh) are CRITICAL-domain decisions and are not approved by this document.
- [ ] **Human decision:** gate `POST /auth/register` behind a shared `REGISTRATION_TOKEN`? (Recommended.)
- [ ] **Spec reconciliation:** D7 replaces "one stored total" with two nullable price columns and a derived total. The proposal's success criterion should read "the same *effective* total". The parallel `sdd-spec` run reads only the proposal and will not have this.
- [ ] **Stale memory:** the engram decision `domain/product-rules-round2` records *two* income metrics (`collected` + `accrued`). The user has since reduced this to `collected` only ("solo mostremos lo cobrado del mes"). That memory should be superseded so a later session does not resurrect the accrual metric.
- [ ] **Confirm the column spelling:** properties soft-delete is stored as `deleted_at` and exposed as a derived `is_active`, rather than stored as an `is_active` boolean (D8). Behaviour is identical; this keeps one soft-delete mechanism across both tables and honours the never-store-derived rule. Reversible in one migration if the boolean is specifically wanted in the schema.
- [ ] Should a property soft-deleted mid-window contribute partial availability to the denominator? Proposed answer: no — count currently-active properties only, for the whole window. Low impact, easy to revise.
- [ ] The "no new reservations on an inactive property" rule is the only application-enforced invariant in the design (D8). Accepted deliberately; noted so a reviewer does not read it as an oversight.
- [ ] D1 deviates from the `fastapi` skill's stated SQLModel preference. Flagged deliberately; reversible at low cost if a reviewer disagrees.
