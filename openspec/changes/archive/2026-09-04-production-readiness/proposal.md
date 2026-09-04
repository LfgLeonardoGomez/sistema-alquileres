# Proposal: Production Readiness

> **Size note.** The 450-word proposal budget is deliberately exceeded, following
> the precedent set by this project's `design.md`. The Alembic adoption below is
> a correctness problem, not a setup task, and compressing the analysis of *how it
> fails silently* would be false economy.
>
> **Scope note.** This change makes the backend deployable. It does **not** deploy
> it and does **not** choose a host.

## Intent

The `cabin-booking-api` change is complete and correct — but correct *only under
the assumption that the database is disposable*. Every mechanism in this system
was built for a greenfield loop where the schema is rebuilt from scratch on
demand. That assumption expires the first time a real cabin owner records a real
reservation, and it expires silently.

**What breaks, and when:**

| # | Failure | Trigger |
|---|---|---|
| 1 | `scripts/reset_db.py` calls `Base.metadata.drop_all(engine)`. It is documented in the README as *the* way to change the schema, and there is no other way. | The first schema change after go-live. The operator is *forced* toward the destructive command, because no alternative exists. |
| 2 | No CORS middleware. A browser cannot call any endpoint. | The moment a frontend exists — the next change. |
| 3 | No logging configuration at all. A production 500 leaves nothing correlatable; D11's "the Postgres text goes to logs" currently goes nowhere. | First support request that isn't reproducible locally. |
| 4 | `POST /auth/login` is unthrottled, and `tenant_slug` is public by design (it is in the calendar URL). An attacker has a known username namespace and unlimited attempts. | The first hour the host is publicly reachable. |
| 5 | The Docker image bind-mounts the repo, installs `[dev]` extras, ships `tests/`, runs as root, and receives `MIGRATOR_DATABASE_URL` — the API process holds table-owner credentials. | Deploy day. |

(1) is not the same *kind* of problem as (2)–(5). Those four are missing
features. (1) is a structural property of how the schema exists, and adopting
Alembic naively makes it **worse than it is today**. That is the centre of this
change.

## The Alembic trap

Alembic was deferred deliberately (design D12 amendment, and the README's "Why
no Alembic"). The deferred cost is now due, and it is larger than "run
`alembic init`".

**Schema truth is split across two sources.**

| In `Base.metadata` (autogenerate sees it) | NOT in `Base.metadata` (autogenerate is blind to it) |
|---|---|
| Tables, columns, indexes | `CREATE EXTENSION IF NOT EXISTS btree_gist` (`create_extensions()`) |
| `CHECK` constraints, composite `UNIQUE (tenant_id, id)` FK targets | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` |
| `ExcludeConstraint` (`reservations_no_overlap`) | `CREATE POLICY tenant_isolation … TO alquileres_app, alquileres_migrator` with the `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` predicate |
| | `GRANT SELECT, INSERT, UPDATE, DELETE … TO alquileres_app`, and the `tenants` grant |

Everything in the right column lives as imperative Python in
`app/db/bootstrap.py`. `alembic revision --autogenerate` reads model metadata.
It will emit a migration producing a schema that **looks complete and has no RLS
at all**. Every tenant sees every other tenant's data.

**The failure modes are not equally loud.** The missing extension makes the
`EXCLUDE` constraint fail at migration time — loud, safe. The missing RLS fails
*silently*: the tables exist, every query works, and the only symptom is that
tenant isolation is gone.

**The central risk is not the missing RLS. It is that tests and production would
build the schema by different paths.** `tests/conftest.py` calls
`bootstrap.reset_database(engine)` directly. If Alembic is added alongside it,
production runs `alembic upgrade head` and the test suite never executes a
single migration. `tests/test_rls_structural.py` — the existing safety net that
introspects `pg_class`/`pg_policies` and fails on any `tenant_id` table without
RLS — would introspect the *bootstrap-built* schema, find RLS, and pass green,
while the deployed schema has none. **The net would still work perfectly; it
would just be pointed at the wrong database.** That state is strictly worse than
today, because today there is exactly one path and it is the tested one.

Therefore the binding rule for this change: **one schema construction path, and
the tests must use it.** `conftest.py` builds the test schema by running
Alembic. `test_rls_structural.py` then becomes a migration test for free,
without a single line changing inside it.

Two concrete traps the baseline must not fall into:

- **The policy predicate must be copied from the implementation, not the spec.**
  `specs/tenant-isolation/spec.md` says `current_setting('app.current_tenant_id')`
  and `SET LOCAL`; the code uses `app.tenant_id` and `set_config(…, true)`. This
  drift is pre-existing and harmless today because nothing reads the spec at
  runtime. A migration written from the spec's wording would deny every row on
  every request.
- **`FORCE ROW LEVEL SECURITY` plus a policy naming only `alquileres_app` is
  default-deny for the migrator**, not a bypass — every policy names both roles
  (`bootstrap.py::apply_row_level_security`, and the README's recorded D5
  deviation). A baseline that "cleans this up" back to D5's literal snippet
  breaks seeding and the test fixtures.

## Scope

### In Scope

- **Alembic**, with a hand-written baseline reproducing the current live schema
  exactly — extension, tables, RLS, `FORCE`, policies, grants — verified
  mechanically, not by reading it. Tests build from migrations.
- **`drop_all` no longer reachable by accident** once real data exists (the
  user's binding constraint — see Constraints).
- **CORS** from settings, explicit allowed-origins list, never a wildcard.
- **A production Docker image**, separate from the development one.
- **Structured logging with request correlation**, and a hard redaction rule.
- **Rate limiting on `POST /auth/login` and `POST /auth/register`.**

### Out of Scope (non-goals — binding)

- Password reset / forgot-password (needs an email provider — its own change).
- Choosing a hosting provider, or deploying.
- HTTPS/TLS termination.
- Automated backups.
- CI/CD pipelines.
- The frontend.
- **Rate limiting the public calendar.** D9 accepted scrapeability as a
  deliberate risk: occupancy dates are what a prospect is meant to see. Not
  reopened here.

## Constraints

**Binding, from the user:** the moment real data exists, `drop_all` must no
longer be reachable by accident. The design chooses the mechanism (removal,
environment guard, database-name assertion, or a combination); this proposal
only fixes the requirement. A destructive path that is merely *documented as
dangerous* does not satisfy this — `reset_db.py` already carries that warning
in its docstring and in the README, and that is exactly the state being
rejected.

## Capabilities

### New Capabilities

- `schema-migrations`: Alembic as the single schema construction path. The
  baseline reproduces extension, RLS, `FORCE`, policies and grants — the parts
  autogenerate cannot see. Tests build the schema by migrating. Destructive
  rebuild is not reachable in a production configuration.
- `cors-policy`: browser access controlled by an explicit allowed-origins list
  from settings. Wildcard origin is forbidden. Custom request headers the API
  actually uses (`X-Registration-Token`) and the correlation header must survive
  preflight, or registration and support tracing break in a browser.
- `request-logging`: structured logs to stdout, one correlation id per request,
  propagated to every line and echoed to the client. Secrets, credentials,
  tokens and full request/response bodies never reach a log line.
- `production-runtime`: a production image containing no test code and no dev
  dependencies, running as a non-root user, where the API process never holds
  `MIGRATOR_DATABASE_URL`.

### Modified Capabilities

- `authentication`: `POST /auth/login` and `POST /auth/register` gain a new
  observable response case — `429` with `Retry-After` — when an attempt budget
  is exhausted. The existing requirement that a failed login is a single
  generic `401` and never an enumeration oracle is unchanged and must not be
  weakened by the limiter's own responses (a `429` that fires only for existing
  accounts would reintroduce exactly the oracle D10 removed).
- `tenant-isolation`: no behavioural requirement changes. Its *structural*
  requirement is strengthened: RLS, `FORCE`, and the `tenant_isolation` policy
  must hold on the schema produced by the deployment path, and the existing
  `pg_catalog` audit must run against that schema.

## Approach

**Alembic (slice 1).** Configure Alembic against `Base.metadata` for
autogenerate's benefit on future migrations, but write the baseline by hand.
Prove faithfulness mechanically rather than by review: build one database via
`alembic upgrade head` and one via the existing `bootstrap.reset_database()`,
then diff `pg_catalog` introspection — tables, columns, constraints, indexes,
`pg_policies` rows, table grants, installed extensions. Any difference fails.
This comparison is only possible while a throwaway rebuild is still available,
which is the argument for doing this slice first (see Slicing). Once the diff is
clean, `conftest.py` switches to the Alembic path and `bootstrap.py`'s DDL role
is retired.

**Roles stay out of Alembic.** `docker/initdb/01-roles.sql` keeps owning
`CREATE ROLE` (D5, D12 amendment): roles are cluster-level, `CREATE ROLE` is not
re-runnable, and the migration runs *as* `alquileres_migrator`, which cannot
create itself. The honest consequence — `docker-entrypoint-initdb.d` does not
exist on a managed Postgres — is an operator bootstrap step, and an open
question below, not something this change automates.

**Logging.** JSON lines to stdout (containers log to stdout; aggregation is the
host's job). A correlation id is taken from an inbound header when present,
generated otherwise, bound for the request's lifetime, echoed in the response,
and attached to every line. Log context carries `tenant_id` and `user_id` —
UUIDs, not PII — so a support issue is traceable per tenant. **The redaction
rule is a hard boundary, not a guideline:** no `JWT_SECRET`, no
`REGISTRATION_TOKEN`, no `Authorization` or `X-Registration-Token` value, no
password, no `password_hash`, and no full request or response body. The reason
is concrete: a `POST /auth/login` body contains a plaintext password, and a
`POST /auth/register` request carries both a password and a deployment secret.

There is a second, less obvious source. D11 says raw driver messages go to logs;
today nothing logs them, so the rule has never been tested. The natural
implementation — logging `exc.orig` in `handle_integrity_error` — puts client
PII in the log: a `23505` on `clients_tenant_phone_uq` produces
`Key (tenant_id, phone)=(…, +54911…) already exists`. Diagnostics must carry the
SQLSTATE and constraint name, not the driver's key-value detail.

**Rate limiting.** In-process, keyed on client address, applied only to the two
auth endpoints, returning `429` with `Retry-After`. Two things the design must
settle rather than assume: `X-Forwarded-For` is trivially spoofable and makes a
limiter useless if trusted blindly, so proxy trust is explicit configuration
that defaults to trusting nothing; and in-process counters are per-worker, so
the effective limit multiplies by the worker count. Keying must not let an
attacker lock out the legitimate owner — with one owner per tenant, a
tenant-slug-only key is a denial-of-service handle, not a defence.

**CORS.** An explicit origin list from `Settings`. `allow_credentials` is not
needed: authentication is a bearer token, not a cookie. `allow_headers` must
include the registration header and `allow_origins` must never be `["*"]`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `alembic.ini`, `migrations/` | New | Alembic config + hand-written baseline (extension, tables, RLS, policies, grants) |
| `app/db/bootstrap.py` | Modified | DDL role retired after the baseline; `drop_all` removed from any reachable path |
| `scripts/reset_db.py` | Modified | Dev-only rebuild, delegating to Alembic; destructive path guarded |
| `tests/conftest.py` | Modified | Builds the test schema by migrating, not by bootstrapping |
| `tests/test_rls_structural.py` | Unchanged | Becomes a migration test by virtue of the line above |
| `app/config.py` | Modified | CORS origins, log level/format, rate-limit settings, proxy trust |
| `app/main.py` | Modified | CORS middleware, correlation middleware, logging setup, limiter |
| `app/logging.py` | New | JSON formatter, correlation contextvar, redaction filter |
| `app/errors.py` | Modified | Log SQLSTATE + constraint name; never the driver's key-value detail |
| `Dockerfile.prod` (or a multi-stage `Dockerfile`) | New | No tests, no dev extras, non-root, no migrator credentials in the API process |
| `docker-compose.yml` | Modified | Migration step; keep dev image for the dev loop |
| `README.md` | Modified | "Why no Alembic" replaced by the migration runbook |

## Slicing (proposed order)

Estimated well over a 400-line budget in total. Five slices.

| # | Slice | Why here |
|---|-------|---------|
| 1 | **Alembic baseline + unified test path** | First, and the ordering argument is not "hardest first" — **this slice's central verification expires.** The parity diff (build both ways, compare `pg_catalog`) is only possible while a throwaway rebuild still exists. Once real data lands, the old path cannot be run to compare against, and the baseline can only be reviewed by eye — the weakest possible check on the most dangerous artifact. |
| 2 | **Production image + config surface** | Second because it *consumes* slice 1's answer: the image has to know how the schema is applied at deploy. Built before slice 1, it would bake in `reset_db` and need redoing. Also establishes the settings surface slices 3–5 extend. |
| 3 | **Structured logging + correlation + redaction** | Before CORS and rate limiting, because both of those fail in ways that are near-undiagnosable without a correlation id — a rejected preflight and a `429` both surface to a browser as an opaque network error. This slice is the observability substrate for the two after it. |
| 4 | **CORS** | Small and self-contained, and deliberately before rate limiting: a `429` response still needs CORS headers, or the frontend shows a generic failure instead of "too many attempts". Doing CORS first makes slice 5 verifiable from a browser rather than only from `curl`. |
| 5 | **Auth rate limiting** | Last. It is the only slice with a real user-facing lockout risk, so it benefits from landing on a stack that is already observable (3) and already correct in a browser (4). |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Baseline migration omits RLS/policies/grants → silent total loss of tenant isolation | **High** if autogenerated | Hand-written baseline + mechanical `pg_catalog` parity diff against the bootstrap-built schema; slice 1 lands before real data so the comparison is available |
| Tests and production build the schema by different paths, making `test_rls_structural.py` pass vacuously | **High** if Alembic is added alongside `bootstrap` | Single construction path is a requirement, not a convention: `conftest.py` migrates. This is the change's central acceptance criterion |
| Baseline copies the spec's policy predicate (`app.current_tenant_id`) instead of the implemented one (`app.tenant_id`) | Med | Named explicitly above; parity diff catches it, since `pg_policies` carries the predicate text |
| Baseline "corrects" the policy to `TO alquileres_app` only | Med | Named explicitly above; seeding and fixtures fail immediately (default-deny), and the parity diff catches it first |
| A destructive rebuild is run against production | Med | Binding constraint: `drop_all` unreachable, not merely documented as dangerous |
| Plaintext passwords or the registration token reach logs | Med | Redaction is a spec requirement with its own test asserting absence from emitted log lines, mirroring D9's raw-body contract test |
| Driver diagnostics leak client phone numbers into logs | Med | Log SQLSTATE + constraint name only |
| Rate limiter is bypassable via spoofed `X-Forwarded-For`, or locks out the real owner | Med | Proxy trust is explicit and defaults to trusting nothing; keying reviewed against the one-owner-per-tenant reality |
| Rate limiter becomes an account-existence oracle | Low | `429` must depend only on attempt volume, never on whether the account exists — preserves D10 |
| CORS misconfigured to `*` "just to unblock the frontend" | Med | Wildcard forbidden at the settings level, not by review discipline |

## Rollback Plan

Per slice, revert the commit. Slices 2–5 are additive middleware, config and
packaging: reverting restores prior behaviour exactly, with no data implications.

Slice 1 is the exception and is the reason it lands while the database is still
disposable. Before real data: revert the commit and rebuild via the existing
bootstrap path, which still exists throughout that slice. After real data: there
is no rebuild, so recovery is `alembic downgrade` plus a restore — and this
change explicitly does not deliver backups. **This asymmetry is itself the
argument for sequencing slice 1 first and for treating "no real data yet" as a
precondition to be confirmed, not assumed** (see Open Questions).

## Dependencies

- `alembic` added to project dependencies.
- A rate-limiting mechanism (in-process; no Redis or external store in scope).
- No new infrastructure services.

## Success Criteria

- [ ] The test suite builds its schema by running Alembic; `bootstrap.reset_database()` is not called by `tests/conftest.py`.
- [ ] `tests/test_rls_structural.py` passes against the migrated schema, with its query unchanged.
- [ ] A `pg_catalog` parity check shows no difference between the Alembic-built schema and the bootstrap-built schema, including `pg_policies` predicates, table grants, and installed extensions.
- [ ] Deliberately dropping a `CREATE POLICY` from the baseline makes the suite fail. (The net is verified by breaking it, not by observing it green.)
- [ ] `Base.metadata.drop_all` is not reachable from any code path a production configuration can execute.
- [ ] The production image contains no `tests/` and no dev dependencies, runs as a non-root user, and its API process environment has no `MIGRATOR_DATABASE_URL`.
- [ ] Every response carries a correlation id, and every log line emitted while handling that request carries the same id.
- [ ] A test asserts that a `POST /auth/login` with a known password, and a `POST /auth/register` with a known registration token, emit no log line containing either value.
- [ ] A `23505` on `clients_tenant_phone_uq` logs the constraint name and SQLSTATE, and no log line contains the conflicting phone number.
- [ ] A browser-origin request from a configured origin succeeds; from an unconfigured origin it is refused; no configuration accepts `*`.
- [ ] Exceeding the login attempt budget returns `429` with `Retry-After`, and the `429` fires identically for an existing and a non-existent account.

## Open Questions

Decisions this proposal cannot make alone. Slice 1 should not start before (1)
and (2) are answered.

1. **Does real data exist anywhere yet?** This determines whether the parity
   diff is available, and whether the baseline is *run* or *stamped* on an
   existing database. The whole slice-1 plan assumes not yet.
2. **What happens to `bootstrap.py` and `reset_db.py` after the baseline?**
   Delete both, or keep `reset_db.py` as a dev convenience that runs
   `alembic upgrade head` and then seeds? Recommendation: keep the command
   (muscle memory, and the seed data is genuinely useful), remove the
   `drop_all`.
3. **Role provisioning off Docker.** `docker/initdb/01-roles.sql` never runs on a
   managed Postgres, and it contains hardcoded role passwords committed to the
   repo. Does this change deliver an operator runbook and parameterise those
   passwords, or does that belong to the deployment change?
4. **CORS when the origin list is unset:** refuse to boot (consistent with
   `JWT_SECRET` and `REGISTRATION_TOKEN`, which have no defaults by design), or
   boot with no browser access allowed? And does `/public/{slug}/availability`
   — which a prospect may hit from the owner's own marketing site — need a
   broader origin policy than the authenticated routes?
5. **Rate limit budget and key.** What limits on login and register, and keyed
   by address alone or address + tenant slug? Is the deployment behind a trusted
   reverse proxy (i.e. is `X-Forwarded-For` meaningful), or should the limiter
   trust nothing?
6. **Worker count in production.** One uvicorn worker (in-process counters are
   exact) or several (limits multiply per worker)? This is a rate-limiting
   correctness question, not a performance one.
7. **Log level and retention expectations**, and confirmation that stdout-only
   JSON is the right target given no logging infrastructure has been chosen.
