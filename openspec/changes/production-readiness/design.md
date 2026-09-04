# Design: Production Readiness

> **GOVERNANCE — READ BEFORE IMPLEMENTING.** This change touches two **CRITICAL** domains: `authentication` (D24, rate limiting) and the schema that enforces `tenant-isolation` (D13–D18, the Alembic baseline). The decisions below are a *proposal awaiting explicit human approval*. Nothing here may be implemented until a human approves it, and slice 1 and slice 5 must each ship as their own reviewable slice, never folded into a batch. No approval is implied by the existence of this document.

> **Size note.** The design budget is deliberately exceeded, following the precedent of this project's first `design.md`. Twelve decisions, four of them load-bearing for tenant isolation. The central problem here is a *silent* failure mode; compressing the analysis of how it fails silently would be false economy.

> **Numbering.** Decisions continue from the archived `cabin-booking-api` design (D1–D12). **D13 supersedes the D12 amendment** (schema bootstrap instead of Alembic). Everything else in D1–D12 stands unchanged.

## Binding inputs (already decided, not reopened here)

1. **No real data exists.** The project has never been deployed; the only databases are the local Docker `db` and `db-test`. The baseline is therefore **run**, not stamped, and — decisive for slice ordering — the parity check is still available. That verification expires the moment real data lands (D16).
2. **`scripts/reset_db.py` keeps its command and loses its `drop_all`.** It becomes the dev-environment command that migrates and then seeds (D18).

## Technical Approach

Nothing about the running system's behaviour changes except two new observable response cases (`429` on the auth endpoints, and CORS headers). Everything else in this change is about **where things live and what is reachable**: schema DDL moves from imperative Python into versioned migrations, credentials move out of the API process, and log output gains a shape.

One rule carries the whole change, and it is worth stating before any decision:

> **There is exactly one way this schema comes into existence, and the test suite uses it.**

Every decision in D13–D18 exists to make that sentence structurally true rather than conventionally true. The reason is in the proposal and bears repeating in one line: if tests bootstrap while production migrates, `tests/test_rls_structural.py` passes green against a schema nobody deploys. **The net works perfectly while aimed at the wrong database.** That is worse than having no migrations at all, because it manufactures confidence.

Two standing rules from the original design still apply and are load-bearing below:
1. Never store a value derived from other stored facts.
2. The database is the authority; the app layer is for error messages.

To which this change adds a third:
3. **A rule that can only be followed by remembering it is not a rule.** Where a guarantee can be made structural — unreachable code, an absent field, a formatter that cannot express the dangerous thing — it is made structural, and the cost is paid.

---

## Architecture Decisions

### D13 — One schema construction path (supersedes the D12 amendment)

The choice is not "should we adopt Alembic" — the proposal settled that. It is **what happens to the second path** once Alembic exists.

| Option | Tradeoff | Verdict |
|---|---|---|
| Alembic for production, `bootstrap.reset_database()` for tests | Zero migration risk in the test loop, fast. But it is *precisely* the failure the proposal describes: `test_rls_structural.py` audits a schema that is never deployed. The safety net keeps working and stops meaning anything. | **Rejected — this is the failure mode, not a compromise with it** |
| Migration 0001 imports `app.db.bootstrap` and calls its functions | Looks DRY. It is the classic Alembic trap: a revision is a *snapshot in time*, and one that calls `Base.metadata.create_all()` silently becomes tomorrow's schema. Revision 0001 would produce a different database in March than it did in January, and nothing would detect it until someone ran it on an empty database months later. | **Rejected — actively dangerous** |
| Keep both paths permanently, bound by a standing parity test | Honest about the duplication and continuously verified. But it means maintaining the RLS DDL in two places forever, and the parity test becomes load-bearing for tenant isolation — a test that must be perfect rather than merely present. | Rejected (its verification *is* adopted, as a one-shot gate — D16) |
| **Alembic is the only path. `bootstrap.py` is deleted. `conftest.py` migrates.** | The test suite pays the cost of running DDL migrations on every session (seconds), and slice 1 carries all the risk in one place. In exchange, "tests and production build the same schema" is not a convention anyone can forget — the other path does not exist to be taken. | **Chosen** |

**What each file becomes:**

| File | Becomes |
|---|---|
| `app/db/bootstrap.py` | **Deleted**, in the final commit of slice 1. Its model-import aggregation moves to `app/models/__init__.py` (see below). `TENANT_SCOPED_TABLES` is *not* preserved anywhere — see D17. |
| `tests/test_bootstrap.py` | **Deleted** with it. |
| `scripts/reset_db.py` | Keeps its module path and its command (`python -m scripts.reset_db`). Body becomes `alembic upgrade head` then `seed.run()`. No `drop_all`, no drop of any kind (D18). |
| `scripts/seed.py` | Unchanged in shape; the tenant insert becomes `ON CONFLICT (slug) DO NOTHING` so `reset_db` is re-runnable now that nothing clears the table first. |
| `tests/conftest.py` | The autouse session fixture's three lines change: `downgrade base` → `upgrade head` → `seed.run()` (D15). **Every other fixture in the file is untouched.** |
| `tests/test_rls_structural.py` | **Zero lines change.** It takes `migrator_engine` and queries `pg_catalog`; once the fixture above migrates, it is a migration test. This is the point of doing it this way rather than writing a new "migration RLS test" — a second test would have to be remembered, and this one already exists and already passes for the right reasons. |

**The model-import detail that will otherwise break silently.** `app/db/bootstrap.py` is currently the module whose imports register all six models on `Base.metadata`. Deleting it leaves `Base.metadata` empty for anything that imports it without importing the models first — which is exactly what `migrations/env.py` does for `target_metadata`. An empty metadata does not raise; it makes `compare_metadata()` (D17) report "drop every table" or, worse, report nothing at all. Move the six imports into `app/models/__init__.py` **in the same commit that deletes `bootstrap.py`**, and confirm with D17's no-pending-diff test.

### D14 — The baseline is one revision of literal, self-contained DDL

**Self-containment is the rule, and it has no exceptions.** `migrations/versions/0001_baseline.py` MUST NOT import `app.models`, `app.db.base`, `Base.metadata`, or `TENANT_SCOPED_TABLES`. The table list is written out literally, in the file. `migrations/env.py` is allowed to import `Base.metadata` — `env.py` is not a snapshot, it is allowed to track HEAD, and autogenerate needs it.

**One revision, not five.** The archived D12 table proposed five (`extensions`, `tenants_users`, `properties_clients`, `reservations`, `payments`). That split was for incremental development that already happened. Reproducing an existing schema, the five would always run together and nobody will ever `upgrade 0003`. One revision is one artifact to diff against the bootstrap.

**Tradeoff, stated plainly:** one ~250-line DDL file is harder to review by eye. That is not a defect of the choice — it is the reason D16 exists. This artifact is verified mechanically; it is *not* trusted to review.

Contents, in this order (the order is a correctness constraint, not style):

1. `CREATE EXTENSION IF NOT EXISTS btree_gist` — **first**, because `reservations_no_overlap` cannot be created without it. This is the loud failure mode; it is here so it never fires.
2. Tables via `op.create_table(...)` with explicit `sa.Column`s, in dependency order: `tenants`, `users`, `properties`, `clients`, `reservations`, `payments` — carrying every `CHECK`, every composite `UNIQUE (tenant_id, id)` FK target, the full `UNIQUE (tenant_id, phone)` on `clients`, and the composite foreign keys (D6, D8).
3. `reservations_no_overlap` via `op.execute()` literal DDL. Alembic's `ExcludeConstraint` round-trip is unreliable; literal text removes the question.
4. For each of `users`, `properties`, `clients`, `reservations`, `payments`: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `CREATE POLICY tenant_isolation`, `GRANT SELECT, INSERT, UPDATE, DELETE … TO alquileres_app`.
5. `GRANT SELECT, INSERT ON tenants TO alquileres_app` — the global table (D5) carries no RLS but still needs its grant.
6. **No grant of any kind on `alembic_version`.** The app role has no business reading it.

**The two traps, named so a reviewer can check them by grep rather than by reading:**

- **The predicate must be copied from `app/db/bootstrap.py::apply_row_level_security`, never from prose.** It is:
  ```sql
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ```
  The old spec wording said `app.current_tenant_id` and `SET LOCAL`. That drift has since been corrected in `openspec/specs/tenant-isolation/spec.md`, but a migration written from the stale text would compare against a setting nobody sets, get NULL, and **deny every row on every request while the application starts perfectly cleanly**. There is no error, no log line, and no 500 — just an API that returns empty lists and 404s for data that exists.
- **Every policy names both roles:**
  ```sql
  FOR ALL TO alquileres_app, alquileres_migrator
  ```
  `FORCE ROW LEVEL SECURITY` subjects the table owner to RLS — that is its entire purpose. A role with no applicable policy on a forced table gets zero rows; `FORCE` does not grant the owner an implicit bypass, it removes the owner's default exemption. A baseline that "cleans this up" back to D5's literal snippet (`TO alquileres_app` only) makes `scripts/seed.py` and `conftest.py::_seed_one_tenant` fail immediately. This is the recorded D5 deviation (README, `bootstrap.py` docstring, and now the promoted `tenant-isolation` spec). Both roles pass through the identical predicate; neither holds `BYPASSRLS`.

**`downgrade()` drops the tables in reverse dependency order and stops there.** Policies and grants die with their tables. `btree_gist` is deliberately **left installed**: dropping an extension is a cluster-visible side effect, `CREATE EXTENSION IF NOT EXISTS` is idempotent on the way back up, and D15 runs this cycle on every test session. A downgrade that fought over an extension would be a per-run irritant with no upside.

### D15 — The test database is reset by `downgrade base` → `upgrade head` → seed

Removing `drop_all` removes the thing that gave each test session a clean slate. `alembic upgrade head` against an already-migrated database is a no-op, so without a replacement the test DB accumulates data across runs and `seed.run()` collides on `tenants.slug`.

| Option | Tradeoff | Verdict |
|---|---|---|
| `upgrade head` + `TRUNCATE` every table found in `pg_tables` | Faster; no correct `downgrade()` required. But it needs its own introspection query (a second thing to get right), and it never exercises `downgrade()` — so the rollback path stays theoretical until the day it is needed under pressure. | Rejected |
| An explicit `DROP TABLE IF EXISTS …` list in `conftest.py` | Simple. It is a hand-maintained table manifest, which is the exact artifact `test_rls_structural.py` was designed to eliminate. It will drift. | Rejected |
| `DROP SCHEMA public CASCADE; CREATE SCHEMA public` | Total. Destroys the one-time `GRANT CREATE, USAGE ON SCHEMA public` from `01-roles.sql`, and the migrator does not own the schema so it likely cannot do this anyway. | Rejected |
| **`alembic downgrade base` then `alembic upgrade head`, then seed** | Two full DDL passes per session instead of one. At six tables that is a fraction of a second. In exchange the schema *and* the data are guaranteed fresh with no manifest, and `downgrade()` — the rollback plan — is exercised on every single test run instead of being discovered broken during an incident. | **Chosen** |

Invoked programmatically via `alembic.config.Config` + `alembic.command`, not `subprocess`, so a failure raises in-process with a real traceback instead of a non-zero exit code.

**Honest note on the destructive-capability constraint.** This does mean a destructive schema operation still exists in the codebase. It is not equivalent to what is being removed: `alembic downgrade base` is an explicit, typed, revision-scoped operator action against an explicitly named URL, whereas `Base.metadata.drop_all()` was reachable from the command the README told people to run to change the schema. The binding constraint was "not reachable by accident"; a command nobody runs by accident satisfies it. The mitigation that matters is packaging: the production image ships no code that calls `downgrade` (D19).

### D16 — Parity is verified mechanically, once, and then deliberately expires

The baseline reproduces a live schema. The only trustworthy check is to build the schema both ways and compare `pg_catalog`. **This check is possible only while a throwaway rebuild still exists** — which is the entire argument for sequencing slice 1 first.

**Where it runs.** Not in the main test suite: a parity check must drop and rebuild the schema twice, which would destroy the session-scoped fixture every other test depends on. It gets a dedicated throwaway database.

| Option | Tradeoff | Verdict |
|---|---|---|
| A pytest inside the normal suite against `db-test` | Nothing new to run; impossible to forget. It also drops the schema mid-session and breaks every test after it. | **Rejected — actively broken** |
| A standalone script an operator runs once | Zero infra. Easy to skip, and this is the one artifact that must not be skipped. | Rejected |
| **A dedicated `db-parity` Compose service + a `parity` run service** | One extra container in the dev Compose file for the duration of slice 1. Cannot corrupt the real test run, runs with one command, and both services are deleted in slice 1's final commit. | **Chosen** |

**The two passes, in one throwaway database:**

1. `bootstrap.reset_database(engine)` → snapshot **A**
2. `DROP TABLE IF EXISTS alembic_version` — *required*; without it, a leftover version row makes `upgrade head` a silent no-op and the diff compares a schema against itself
3. `Base.metadata.drop_all(engine)`
4. `alembic upgrade head` → snapshot **B**
5. Compare A and B. Any difference fails, and prints the symmetric difference.

**What the snapshot covers.** This list decides whether the check is real or decorative:

| Source | Catches |
|---|---|
| `information_schema.columns` (table, column, type, nullable, default) | Column drift, type drift |
| `pg_constraint` — `conname`, `contype`, `pg_get_constraintdef(oid)` | CHECKs, uniques, composite FKs, **and the `EXCLUDE` definition text** |
| `pg_indexes` — `indexname`, `indexdef` | Missing or extra indexes |
| `pg_class` — `relrowsecurity`, `relforcerowsecurity` | A table that has RLS but not `FORCE`, or neither |
| `pg_policies` — `tablename`, `policyname`, `roles`, `cmd`, `qual`, `with_check` | **Both named traps.** `qual` is the rendered predicate, so `app.current_tenant_id` vs `app.tenant_id` is a text difference. `roles` is the role array, so a policy that dropped `alquileres_migrator` is a difference. |
| `information_schema.role_table_grants` — grantee, table, privilege | A missing `GRANT`, which would otherwise surface as an opaque permission error much later |
| `pg_extension` — `extname` | A missing `btree_gist` |

Excluded from both snapshots: `alembic_version`, and objects owned by an extension.

**The check is a one-shot gate, not a standing net, and this must be said loudly.** It is removed in the same commit that deletes `bootstrap.py`, because keeping it means maintaining the RLS DDL in two places forever — reintroducing the exact two-source problem this change exists to end. What replaces it is D17.

**Prove the net by breaking it.** Before slice 1 is called done, delete one `CREATE POLICY` from the baseline, confirm the suite goes red, and restore it. Recorded as a checklist item with its observed output, not as an intention. A net is verified by breaking it, never by observing it green.

### D17 — What guards the schema after parity expires

Three standing checks, each catching a different failure:

1. **`tests/test_rls_structural.py`, unchanged.** Catches a tenant-scoped table without `ENABLE`/`FORCE`/policy. It is column-driven (`EXISTS … column_name = 'tenant_id'`), not list-driven — which is precisely why `TENANT_SCOPED_TABLES` does not need to survive `bootstrap.py`'s deletion. That list was always a manifest, and this test was written to replace manifests. Its second test (`tenants` is not flagged) already proves the check is driven by column presence rather than a hardcoded list.

2. **A new assertion that the test schema was actually migrated.** One test: read `alembic_version.version_num` and assert it equals `ScriptDirectory.get_current_head()`. This is the piece that makes D13 enforceable rather than conventional — if anyone ever reintroduces a `create_all()` shortcut into `conftest.py`, `alembic_version` is absent or stale and this fails. Without it, "one construction path" is a comment in a docstring.

3. **A no-pending-autogenerate-diff test.** Run `alembic.autogenerate.compare_metadata()` against the migrated test database and assert the diff is empty. Catches the most common Alembic failure by a wide margin: a model changed and nobody wrote the migration.
   **Caveat, stated up front so it is not discovered as a mystery:** Alembic's reflection of `EXCLUDE` constraints is incomplete, so this test may report a permanent phantom diff for `reservations_no_overlap`. If it does, exclude that one constraint by name via `include_object` and say why in a comment. If it turns out to be noisy in more ways than that, **delete the test rather than weaken it into a filter that ignores real diffs** — a check tuned until it can no longer fail is worse than no check, because it looks like coverage.

### D18 — Destructive capability is removed, not guarded

The binding constraint rejects "documented as dangerous" — `reset_db.py` already carries that warning in its docstring and in the README, and that is the state being rejected. Guards were considered and are worse than removal:

| Option | Tradeoff | Verdict |
|---|---|---|
| Keep `drop_all`, guard on `ENVIRONMENT != production` | One line. Fails open on a forgotten variable, and the failure is unrecoverable. | Rejected |
| Keep `drop_all`, assert the database name ends in `_test` | Stronger, but it is a naming convention defending real data. Somebody's production database will be called `alquileres_test` for a week during a migration. | Rejected |
| **Delete `drop_all` along with `bootstrap.py`** | The destructive path is gone. Cost: a developer who wants a truly empty database types `alembic downgrade base` instead. | **Chosen** |

`scripts/reset_db.py` keeps its command per the owner's decision, and becomes non-destructive:

```
alembic upgrade head   →   seed.run(engine)
```

`seed.run()` gains `ON CONFLICT (slug) DO NOTHING`, because nothing clears the table for it any more.

**The name is now a misnomer** — it no longer resets anything. Retained deliberately for muscle memory and because it is in the README, in Compose, and in the archived design. Renaming it to `scripts/dev_db.py` is a reasonable alternative and costs nothing but a README edit; flagged as reversible, not raised as a question.

### D19 — One multi-stage Dockerfile, two targets; one image, two invocations

| Option | Tradeoff | Verdict |
|---|---|---|
| `Dockerfile` (dev) + `Dockerfile.prod` (new file) | Simplest to read. Two files drift: a Python version bump lands in one and not the other, and the drift is invisible until a production-only bug appears. | Rejected |
| Separate app image and migrator image | Cleanest credential story — the app image physically cannot migrate. Two builds, two tags, two things to keep in lockstep, and a real risk of deploying an app image built from a different commit than the migration image that just ran. | Rejected |
| **One multi-stage `Dockerfile` with `dev` and `prod` targets; production runs the same image twice — once as `alembic upgrade head`, once as the API** | The image contains migration code the API process never runs. Mitigated by D20 rather than by packaging. In exchange, base layers cannot drift, and the migration that runs is provably from the same commit as the app that starts. | **Chosen** |

The two-invocations pattern is the standard release-phase shape (Heroku release command, ECS run-task, a Kubernetes Job or initContainer). The migration container is ephemeral and is the *only* place `MIGRATOR_DATABASE_URL` is ever set.

**`prod` target contents — allowlist, not `.dockerignore` alone:**

- Builder stage installs the project **without** `[dev]` extras, into a prefix that is copied into a clean runtime stage.
- Runtime copies exactly `app/`, `migrations/`, `alembic.ini`. **`tests/`, `scripts/`, `docker/`, and `.env*` are never copied.** `.dockerignore` is added as a second layer, but it is a blocklist and is not the mechanism — `COPY app ./app` is.
- Non-root: a dedicated `appuser` (fixed UID, e.g. 10001), `USER appuser` before `CMD`, and the application directory owned by root and read-only to that user.
- `ENV PYTHONUNBUFFERED=1` — not cosmetic. Buffered stdout means the last log lines before a crash are lost, which defeats slice 3 in exactly the situation slice 3 exists for.
- `ENV PYTHONDONTWRITEBYTECODE=1`.
- `HEALTHCHECK` against `GET /health`.
- `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]` — **explicitly `uvicorn` with an explicit `--workers 1`**, not `fastapi run`, because the worker count is a correctness input to D24's rate limiter and must be visible in the image rather than inherited from a framework default that can change between releases.

**Verification is a manual runbook step in this change, and that is a stated gap.** Asserting "the image contains no `tests/`" requires building and inspecting an image, which needs a build step this change does not have (CI is out of scope). The README gains the exact command; automating it belongs to the CI change. Saying this plainly is better than implying the packaging claims are tested.

### D20 — The API process cannot hold migrator credentials

`docker-compose.yml` currently hands `MIGRATOR_DATABASE_URL` to the `api` service, so the API process holds table-owner credentials — and a table owner is exactly the role RLS treats specially. Three independent layers, because one is a configuration convention and conventions are what this change is spending its budget to eliminate:

1. **Packaging.** The `prod` target ships no `scripts/`. The only code in the image that reads `MIGRATOR_DATABASE_URL` is `migrations/env.py`, which only executes under an explicit `alembic` command.
2. **Compose.** A new `migrate` service (same build, migrator env, `command: alembic upgrade head`) takes over the migrator credentials, and **`api` loses `MIGRATOR_DATABASE_URL` entirely**. The dev loop becomes `docker compose run --rm migrate` (or `run --rm migrate python -m scripts.reset_db` for migrate + seed).
3. **A boot assertion with teeth.** `Settings` gains a required `environment` field, and when `environment == "production"` it **refuses to boot if `MIGRATOR_DATABASE_URL` is present in the process environment at all.** A misconfigured deployment fails loudly at start rather than running for months holding credentials it should not have.

**`ENVIRONMENT` has no default.** This is the same rule as `JWT_SECRET` and `REGISTRATION_TOKEN`, and for the same reason: a default of `development` would make layer 3 fail open on a forgotten variable, which is the only way it can fail. Dev Compose, the `test` service, and the production deployment each set it explicitly — three one-line edits to remove a fail-open.

`Settings` will never gain a `migrator_database_url` field. Application code has no sanctioned way to read it.

### D21 — Role provisioning: a runbook and a credential-free script, not automation

`docker/initdb/01-roles.sql` runs only at Docker container init, never on managed Postgres, and it contains role passwords committed to the repository.

Automation is not available: `CREATE ROLE` is cluster-level, it is not re-runnable, and the migration runs *as* `alquileres_migrator`, which cannot create itself (D5, D12 amendment — unchanged).

| Option | Tradeoff | Verdict |
|---|---|---|
| Defer entirely to the deployment change | Smaller slice. It also means shipping a "deployable" backend that cannot be stood up on any managed Postgres — the change's own goal fails on its own terms. | Rejected |
| Automate via a superuser bootstrap script run by the app | Requires the app to hold superuser credentials at some point, which is a strictly worse security posture than the problem being solved. | Rejected |
| **Convert `01-roles.sql` → `01-roles.sh` reading passwords from the `db` service's environment (no defaults), and add a "Provisioning a fresh PostgreSQL cluster" runbook to the README** | ~15 lines plus documentation. Does not remove dev passwords from the repo — they move into `docker-compose.yml` alongside the `postgres/postgres` credentials already there — but it makes the SQL file **copy-safe**, which is the actual hazard: someone pasting `01-roles.sql` into a production console and shipping `alquileres_app_password`. | **Chosen** |

The runbook is the exact `CREATE ROLE` / `GRANT CREATE, USAGE ON SCHEMA public` / `GRANT CREATE ON DATABASE` statements, run once as a superuser, with passwords supplied by the operator. `NOSUPERUSER NOBYPASSRLS` on `alquileres_app` is called out in the runbook as the line that must not be edited, with D5's one-sentence reason attached — because that is the line someone will "simplify" when a permission error appears.

### D22 — CORS: a required setting where empty is a legal answer

**The origin list is required and has no default. The empty list is a legal, explicit value.**

The proposal framed this as a binary: refuse to boot (consistent with the secrets) or boot with no browser access. Both are wrong here for opposite reasons. Refusing to boot on an empty list forces a headless deployment to invent a fake origin — and the project has no frontend today, by design. Booting on an *absent* variable means nobody ever decided.

So: `CORS_ALLOWED_ORIGINS` must be present, and `CORS_ALLOWED_ORIGINS=` (present, empty) means "no browser access, deliberately". You cannot boot without having answered the question; answering "none" is allowed. This is strictly better than either option in the proposal and is offered as such.

- **`*` is rejected by a field validator, at boot, with a named error.** Not by review discipline. An empty list already expresses "I have not configured a frontend"; a wildcard expresses nothing except that someone was unblocking themselves.
- **`allow_credentials=False`.** Authentication is a bearer token, not a cookie. `allow_credentials=True` with a specific origin list is the combination people reach for reflexively; here it is unnecessary, and it is also the setting that makes `*` illegal in browsers anyway — so leaving it off removes a footgun rather than adding a constraint.
- **`allow_headers` must include `Authorization`, `Content-Type`, `X-Registration-Token`, and `X-Request-ID`.** Omitting the third breaks registration in a browser; omitting the fourth breaks correlation on any client that sets it.
- **`expose_headers` must include `X-Request-ID`.** This is the subtle one: the header is on the wire, but browser JavaScript **cannot read a response header that is not exposed**. Echoing the correlation id and not exposing it means a user can never paste it into a support ticket — the entire point of echoing it, silently defeated.
- **Implementation note.** `pydantic-settings` attempts a JSON decode for complex types like `list[str]` read from the environment. Declare the field as `str` and split it in a validator (or use `NoDecode`), or the first `CORS_ALLOWED_ORIGINS=https://a,https://b` produces a confusing parse error.

**`/public/{slug}/availability` shares the single policy.** CORS is not access control — it restricts browser JavaScript on other origins and is completely bypassed by `curl` or any server-side fetch. The endpoint is already unauthenticated and scrapeable, deliberately (D9). A stricter policy there would protect nothing; a looser one would give away nothing. So a second policy would be a second thing to get wrong for zero benefit.

If the owner's marketing site later needs to embed the calendar cross-origin, the correct answer is a wildcard **on that one route only**, and it is safe there precisely because the data is public and no credentials are involved. That is recorded here so a future reader does not have to re-derive it — and it is deliberately *not* implemented now, because a wildcard anywhere in a codebase with a global no-wildcard rule is an invitation to copy-paste it somewhere it is not safe.

### D23 — Structured logging: allowlist fields, and no exception text, ever

JSON lines to stdout. Containers log to stdout; aggregation is the host's job.

**JSON only — no `console` format option.** A second renderer is a second place a redaction rule can be missed. `docker compose logs | jq` covers local ergonomics. Reversible at low cost if it proves annoying, on the condition that any second renderer consumes the *already-sanitised* record dict and never touches raw values.

#### The correlation id

- Header `X-Request-ID`, both directions. De facto standard, understood by nginx and most proxies.
- Accepted from the inbound request when present, **but only if it matches `^[A-Za-z0-9._-]{1,64}$`**; otherwise a fresh UUID4 is generated and the inbound value is discarded. The inbound value is attacker-controlled and goes straight into a log line: a newline in it forges log entries, and in a JSON-lines stream it breaks the line framing outright. This is a real, cheap-to-prevent injection and it is the sort of thing that gets added later, after an incident.
- Bound for the request's lifetime and attached to **every** line — including SQLAlchemy's and uvicorn's — by a `logging.Filter` on the root handler, so no call site has to pass it.
- Echoed on **every** response, including errors. The middleware ordering that makes this true is subtle enough that it is **verified by a test that forces a 500 and asserts the header**, not reasoned about from Starlette's source.

**The contextvar gotcha that would otherwise produce empty `tenant_id` on every line.** This application is sync by design (D2), so FastAPI runs both endpoints and their sync dependencies in a threadpool via `run_in_threadpool`, which executes them in a **copy** of the context. A `ContextVar` *rebound* inside `get_current_principal` is therefore invisible to the middleware afterwards, and `tenant_id` would silently be `null` in every log line forever.

The mechanism: the contextvar holds a **mutable dict**, set once (fresh) by the correlation middleware and **mutated in place** by `get_current_principal`. `copy_context()` copies bindings, not objects, so the dict the dependency mutates is the dict the middleware and the log filter hold. State this in the module docstring — the working version and the broken version differ by one character.

#### The redaction rule, and why it is a mechanism rather than a list

A filter that scans formatted messages for known secret values is a blocklist: it only catches values it was told about, and it cannot catch a client's phone number arriving inside a driver message. The rule needs to hold for values nobody anticipated.

**Layer 1 — the formatter emits an allowlist.** A record renders exactly: `timestamp`, `level`, `logger`, `event`, `request_id`, `method`, `path`, `status`, `duration_ms`, `tenant_id`, `user_id`, plus `extra` keys validated against an explicit allowlist. **Anything not on the allowlist is dropped, not redacted.** A field that is dropped by default cannot leak a value nobody anticipated.

**Layer 2 — no exception text, ever.** The JSON formatter renders `exc_info` as `{"type": "IntegrityError", "frames": [{file, line, function}, …]}`. It **never** renders the exception's `str()`, `repr()`, or `args`. Concretely this forbids `logger.exception(...)` with the default formatter, `logger.error(str(exc))`, `f"failed: {exc}"`, and `repr(exc)` anywhere in the codebase.

| Option | Tradeoff | Verdict |
|---|---|---|
| Log `exc.orig`; rely on a redaction filter for known secrets | The natural implementation, and it is what D11's "the Postgres text goes to logs" invites. A `23505` on `clients_tenant_phone_uq` emits `Key (tenant_id, phone)=(…, +54911…) already exists` — a client's phone number, in the logs, from a rule that says nothing about phone numbers. | **Rejected** |
| Allow exception messages except for `sqlalchemy.exc.DBAPIError` and subclasses | Keeps useful messages for ordinary bugs. It is a blocklist by exception type, and third-party clients happily put API response bodies in their messages. | Rejected |
| **No exception `str()` reaches a log line, from any exception type** | Real diagnostic loss: a `KeyError: 'foo'` becomes `type=KeyError` plus a frame location. | **Chosen** |

The cost is smaller than it looks, and there is a compensator: for database errors — the ones that actually recur in production — a sanctioned helper is *more* useful than the prose message.

**Layer 3 — one sanctioned accessor for driver diagnostics.** `app/logging.py::describe_db_error(exc) -> dict` is the only supported way to get a loggable dict out of a DBAPI error, and it returns exactly `{"sqlstate", "constraint", "table"}` from psycopg's `Diagnostic` (`constraint_name`, `table_name`) — all schema identifiers, never data. `Diagnostic.message_detail` and `message_primary` are the fields that carry the key-value text; they are **never** read. `handle_integrity_error` logs `describe_db_error(exc)` and nothing else.

**Layer 4 — `sqlalchemy.engine` is pinned to `WARNING`, independently of the root level.** `sqlalchemy.engine` logs SQL at `INFO` and **bound parameters at `DEBUG`** — which means password hashes, phone numbers, and email addresses. Without this pin, an operator raising `LOG_LEVEL=DEBUG` to diagnose an unrelated problem turns on full parameter logging as a side effect. This is the most likely way this system leaks PII into logs, and it is the one the redaction rule would not have caught, because those records are not ours.

**Layer 5 — bodies are never read.** The access-log middleware never calls `request.body()`. A `POST /auth/login` body carries a plaintext password; a `POST /auth/register` body carries a password and travels with a deployment secret in a header.

#### What is logged per request

One line at completion: `event=request`, `method`, `path`, `status`, `duration_ms`, `request_id`, `tenant_id`, `user_id`.

- **`path` is the raw path with the query string stripped.** UUIDs in a path are identifiers, not PII (the proposal's line). The query string is dropped entirely because it is the field most likely to grow a secret later — `?token=` is one careless endpoint away.
- The middleware wraps `call_next` in `try/except`, logs `status=500` with the exception **type**, and re-raises. Starlette's `ServerErrorMiddleware` sits above all user middleware, so on a truly unhandled exception the response may bypass the correlation header — but the log line will exist, which is what a support request actually needs.

#### Middleware nesting

Outermost to innermost: **correlation → CORS → routes**.

Correlation outermost so that CORS preflights — including *rejected* ones, which surface in a browser as an opaque network error — produce a log line. CORS still wraps every route, so a `429` (D24) and every handled 4xx/5xx pass back through it and carry CORS headers. Two tests pin this, because the ordering rule in Starlette (`add_middleware` inserts at the front of the user list, so the last call is outermost) is exactly the kind of thing that changes quietly:

- A `429` response carries `Access-Control-Allow-Origin`.
- A forced 500 emits a log line carrying the request id.

#### Level and configuration

`LOG_LEVEL`, default `INFO`. `DEBUG` is safe to enable because of Layer 4. `WARNING` is a supported value but loses the access log, which is noted in the README rather than forbidden.

### D24 — Auth rate limiting: the counter never learns the outcome

Applied to `POST /auth/login` and `POST /auth/register` only. `GET /public/{slug}/availability` is untouched — D9 accepted scrapeability deliberately and the proposal does not reopen it.

**The oracle constraint drives the entire design.** D10 removed account enumeration by making every failed login return one identical `401`. A limiter can hand it straight back.

| Option | Tradeoff | Verdict |
|---|---|---|
| Count only *failed* attempts | The usual refinement, and it is the trap. To count only failures the limiter must observe the outcome; once its state depends on the outcome, the `429` boundary leaks the outcome. An attacker probing with a wrong password learns whether the account exists by observing when the budget stops moving. | **Rejected** |
| Lock the *account* after N failures | Standard in consumer products. With one owner per tenant and a public `tenant_slug`, this is a remote lockout button for any known tenant. It is also outcome-dependent, so it is an oracle as well. | **Rejected** |
| **Count every request to the endpoint, before the handler runs** | A successful login consumes budget too — at 10 per 15 minutes, irrelevant for a human. In exchange, the limiter *cannot* be an oracle, because it never learns anything about the account. | **Chosen** |

The mechanism is the placement: a **route-level dependency** on the two routes, which runs before the handler has looked anything up. A middleware was rejected because it would have to path-match, and a path match in middleware drifts from the router silently; a dependency is attached to the route object and cannot.

**Key: the client address alone.** Not address + tenant slug, and not slug at all. With one owner per tenant, any key containing the slug is a denial-of-service handle — send N bad logins for a slug you read off a public calendar URL and the real owner is locked out. Address-only means an attacker rotating slugs burns their own budget. The cost is that an owner sharing a NAT with an attacker shares the budget, which at this scale (one owner, a home or mobile connection) is acceptable.

**Scope, honestly stated:** this stops single-source brute force and credential-stuffing scripts. A distributed attack across many addresses is not defended by any limiter keyed on address; what defends that is Argon2id and a strong password (D10). Claiming otherwise would be the kind of assertion this design is trying to avoid.

**Proxy trust: `TRUSTED_PROXY_COUNT`, required, no default.** When `0`, `X-Forwarded-For` is **ignored entirely** and `request.client.host` is used. When `n > 0`, the client is the *n*-th entry from the **right** of `X-Forwarded-For` — taking the leftmost entry is the classic bug, because the leftmost value is fully attacker-controlled.

No default, because both defaults are dangerous in opposite directions and the failure of one is severe:
- Defaulting to `0` behind a load balancer collapses every client into the LB's address, so the tenth login attempt **from anyone** locks out **everyone**.
- Defaulting to `1` when there is no proxy makes the limiter trivially bypassable with a forged header.

Every deployment knows its answer (`0` for direct, `1` for a single LB). Requiring it removes a fail-open and a fail-closed at once, and matches the project's established rule for settings that are dangerous when wrong. The resolved strategy is logged once at boot so it is visible, and the first `429` in a process logs a `WARNING` with the resolved key — an operator who accidentally collapsed everyone into one bucket sees it in the log rather than in a support queue.

**Budget** (see Open Questions — recommended, not owner-approved):

| Endpoint | Budget | Reasoning |
|---|---|---|
| `POST /auth/login` | 10 per 15 minutes per key | Generous for a human who forgot a password; useless for a script. |
| `POST /auth/register` | 5 per hour per key | Already gated by `REGISTRATION_TOKEN` (D10 addendum); this is defence in depth against token guessing, and a legitimate operator creates a tenant rarely. |

**Algorithm: sliding window log.** A fixed window is trivial and permits a 2× burst across the boundary. A sliding log stores a few timestamps per key; at this scale the memory is irrelevant and the boundary flaw disappears. `Retry-After` is the seconds until the oldest attempt in the window expires — an exact number rather than a constant.

**Storage: in-process, and therefore `--workers 1` (D19).** In-process counters are per-worker, so the effective budget multiplies by the worker count. This is a correctness constraint, not a performance one, and it is why the worker count is written into the image's `CMD` rather than left to a default. Sync endpoints run in a threadpool, so the counter is shared across threads and **needs a `threading.Lock`** — an easy omission that produces quietly wrong counts under exactly the concurrent load the limiter exists for. Horizontal scaling requires a shared store; that is a future change, and the limiter's interface is one function so the swap is contained.

**The key set is bounded (LRU, ~10k keys).** An attacker rotating source addresses would otherwise grow the dict without limit — a rate limiter that is itself a memory-exhaustion vector. Eviction under attack does degrade the limiter; bounded memory beats a perfect limiter that OOMs.

**No third-party limiter.** `slowapi` was considered. All three of the constraints above (outcome-blind counting, *n*-from-the-right proxy resolution, a bounded key set) are non-default, so the work is in overriding the library rather than in the ~60 lines of counting. Writing it produces something testable to exactly these requirements. If a shared store is ever needed, `limits` + Redis is the migration path.

**The `429` response** carries `Retry-After`, the same `{"detail", "code"}` shape as every other error (D11), the correlation id, and CORS headers.

---

## Component Map

```
                    request
                       │
        ┌──────────────▼──────────────┐
        │ CorrelationMiddleware       │  X-Request-ID in/out, contextvar dict,
        │  (outermost)                │  one access-log line, catch→log→re-raise
        └──────────────┬──────────────┘
        ┌──────────────▼──────────────┐
        │ CORSMiddleware              │  explicit origins, never "*",
        │                             │  expose X-Request-ID
        └──────────────┬──────────────┘
                       │
      ┌────────────────┼────────────────────┐
      │                │                    │
  auth routes     other routes         public route
      │                │                    │
 ┌────▼─────┐          │                    │
 │ rate     │  runs BEFORE the handler,     │
 │ limiter  │  so it never learns the       │
 │ (dep)    │  outcome  ──► 429             │
 └────┬─────┘          │                    │
      └────────────────┼────────────────────┘
                       │
              PrincipalDep → mutates the log-context dict in place
                       │        (threadpool-safe: same object, copied binding)
              TenantSessionDep / PublicSessionDep   (D4, unchanged)
                       │
                  PostgreSQL
                       │
        schema built by ONE path: alembic upgrade head
```

## Data Flow: how the schema comes to exist

```
  Production                     Development                  Test session
  ----------                     -----------                  ------------
  migrate container              docker compose run           conftest autouse
  (ephemeral, migrator creds)      --rm migrate                 fixture
        │                              │                            │
  alembic upgrade head          python -m scripts.reset_db    alembic downgrade base
        │                              │                            │
        │                        alembic upgrade head         alembic upgrade head
        │                              │                            │
        │                        seed.run() (idempotent)      seed.run()
        │                              │                            │
        ▼                              ▼                            ▼
  API container starts          api service starts           test_rls_structural.py
  (app creds only;              (app creds only)             audits THIS schema
   MIGRATOR_DATABASE_URL                                     ── the deployed one
   absent, asserted at boot)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `alembic.ini`, `migrations/env.py`, `migrations/script.py.mako` | Create | `script_location = migrations`; `env.py` reads `MIGRATOR_DATABASE_URL`, `target_metadata = Base.metadata` |
| `migrations/versions/0001_baseline.py` | Create | The whole current schema as literal DDL (D14). No `app.*` imports. |
| `app/db/bootstrap.py` | **Delete** | End of slice 1, after parity is green (D13) |
| `app/models/__init__.py` | Modify | Takes over the six model imports so `Base.metadata` is populated (D13) |
| `scripts/reset_db.py` | Modify | `upgrade head` + seed; no drop of any kind (D18) |
| `scripts/seed.py` | Modify | `ON CONFLICT (slug) DO NOTHING` |
| `scripts/verify_schema_parity.py` | Create **then delete** | Slice 1 only (D16) |
| `tests/conftest.py` | Modify | Three lines in the autouse fixture (D15) |
| `tests/test_rls_structural.py` | **Unchanged** | Becomes a migration test (D13) |
| `tests/test_bootstrap.py` | **Delete** | With `bootstrap.py` |
| `tests/test_schema_is_migrated.py` | Create | `alembic_version == head`; no pending autogenerate diff (D17) |
| `app/config.py` | Modify | `environment` (required), `cors_allowed_origins` (required, `*` rejected), `log_level`, `trusted_proxy_count` (required), rate-limit budgets |
| `app/logging.py` | Create | JSON formatter (allowlist, no exception text), correlation contextvar dict, `describe_db_error`, `sqlalchemy.engine` pin (D23) |
| `app/middleware.py` | Create | Correlation middleware (D23) |
| `app/ratelimit.py` | Create | Sliding-window, outcome-blind, bounded key set, proxy resolution (D24) |
| `app/api/routers/auth.py` | Modify | Rate-limit dependency on the two routes only |
| `app/main.py` | Modify | Logging setup, middleware registration in nesting order, production boot assertion (D20) |
| `app/errors.py` | Modify | `handle_integrity_error` logs `describe_db_error(exc)` and nothing else |
| `Dockerfile` | Modify | Multi-stage, `dev` and `prod` targets (D19) |
| `.dockerignore` | Create | Second layer only; `COPY` allowlist is the mechanism |
| `docker-compose.yml` | Modify | `migrate` service added; `api` loses `MIGRATOR_DATABASE_URL`; `ENVIRONMENT` on every service; `db-parity` + `parity` added and removed within slice 1 |
| `docker/initdb/01-roles.sql` → `01-roles.sh` | Modify | Passwords from env, no defaults, no credentials in the file (D21) |
| `pyproject.toml` | Modify | `alembic` added to runtime dependencies (the prod image runs `upgrade head`) |
| `README.md` | Modify | "Why no Alembic" → migration runbook; cluster provisioning runbook; image-inspection command; config table |

## Slicing

Order unchanged from the proposal. Slice 1's *internal* commit order is specified because it is the slice where ordering is a correctness property.

| # | Slice | Notes |
|---|---|---|
| 1 | Alembic baseline + unified test path | See commit order below |
| 2 | Production image + config surface (D19, D20, D21) | Consumes slice 1's answer about how the schema is applied at deploy |
| 3 | Structured logging + correlation + redaction (D23) | The observability substrate for 4 and 5 |
| 4 | CORS (D22) | Before 5, so a `429` is verifiable from a browser rather than only from `curl` |
| 5 | Auth rate limiting (D24) | Last; the only slice with real user-facing lockout risk |

**Slice 1, in order — each step is a commit:**

1. Add `alembic`, `alembic.ini`, `migrations/env.py`. Nothing else changes; nothing runs it yet.
2. Write `0001_baseline.py`. Still nothing uses it.
3. Add `db-parity` + `parity` Compose services and `verify_schema_parity.py`. **Run it. It must be green before step 4.**
4. **Break the net on purpose:** delete one `CREATE POLICY` from the baseline, confirm parity fails, restore, record the observed output.
5. Switch `conftest.py` to `downgrade base` → `upgrade head` → seed. Full suite green, `test_rls_structural.py` unchanged.
6. Add `tests/test_schema_is_migrated.py` (D17).
7. Switch `scripts/reset_db.py` to `upgrade head` + seed; make `seed.run()` idempotent.
8. **Delete** `app/db/bootstrap.py`, `tests/test_bootstrap.py`, `verify_schema_parity.py`, and the `db-parity`/`parity` services. Move the model imports to `app/models/__init__.py`. Full suite green.

Steps 3–4 are the ones that expire. If real data appears before slice 1 lands, **stop and re-plan** — the baseline would then have to be stamped against a live database and reviewed by eye, which is the weakest possible check on the most dangerous artifact in this change.

## Testing Strategy (additions only)

| Layer | What | Approach |
|---|---|---|
| Schema (one-shot) | Bootstrap-built and Alembic-built schemas are identical across columns, constraints, indexes, `relrowsecurity`/`relforcerowsecurity`, `pg_policies` (roles + `qual` + `with_check`), table grants, extensions | `verify_schema_parity.py`, isolated database (D16) |
| Schema (standing) | `alembic_version` equals head; no pending autogenerate diff | pytest (D17) |
| Schema (standing) | Every `tenant_id` table has RLS + FORCE + a policy | `test_rls_structural.py`, **unchanged**, now against the migrated schema |
| Logging | A `POST /auth/login` with a known password emits no log line containing it; same for `POST /auth/register` and the registration token | Capture emitted lines, string-absence assertion — the same shape as D9's raw-body contract test |
| Logging | A `23505` on `clients_tenant_phone_uq` logs `constraint` and `sqlstate`, and **no line contains the conflicting phone number** | Seed a distinctive phone, force the conflict via `PATCH /clients/{id}` |
| Logging | Every response carries `X-Request-ID`, and every line emitted while handling that request carries the same value | Including a forced 500 |
| CORS | A configured origin succeeds; an unconfigured one is refused; `CORS_ALLOWED_ORIGINS=*` fails at boot with a named error | Settings test + `TestClient` |
| CORS | A `429` response carries `Access-Control-Allow-Origin` | Pins the middleware nesting (D23) |
| Rate limit | Exceeding the login budget returns `429` with `Retry-After`, and **the `429` fires identically for an existing and a non-existent account** | The D10 preservation test |
| Rate limit | `TRUSTED_PROXY_COUNT=0` ignores a forged `X-Forwarded-For`; `=1` resolves the correct entry from the right | Unit, no DB |
| Config | The app refuses to boot without `ENVIRONMENT`, `CORS_ALLOWED_ORIGINS`, or `TRUSTED_PROXY_COUNT`; and with `ENVIRONMENT=production` while `MIGRATOR_DATABASE_URL` is set | Extends `tests/test_config.py` |

Not automated in this change, and stated as a gap: the production image's contents (no `tests/`, no `scripts/`, no dev extras, non-root). It requires a build step this change does not have (D19).

## Open Questions

Proposal questions 1 and 2 were answered by the owner and are recorded as binding inputs above.

| # | Question | Verdict | Recommendation |
|---|---|---|---|
| 3 | Role provisioning off Docker | **Decided here** (D21) | Runbook + credential-free `01-roles.sh` in slice 2. Deferring it entirely means shipping a backend that cannot be stood up on a managed Postgres. Low risk, ~15 lines. |
| 4 | CORS when the origin list is unset; does the public route need its own policy | **Decided here** (D22) | Required setting where the empty value is a legal explicit answer; `*` rejected at boot; one policy shared with `/public`. Reversible. |
| 5 | Rate-limit budget and key; proxy trust | **NEEDS OWNER SIGN-OFF** | CRITICAL domain with real lockout risk. Recommendation: login 10/15min, register 5/hour, **address-only** key, `TRUSTED_PROXY_COUNT` required with no default. The *shape* (outcome-blind, address-only) is the part that must not be traded away; the *numbers* are cheap to change. |
| 6 | Production worker count | **Decided here** (D19, D24) | `--workers 1`, written into the image `CMD`. It is a limiter-correctness constraint, not a performance choice. Revisit only together with a shared counter store. |
| 7 | Log level and retention; is stdout-only JSON right | **Level decided here** (D23); **retention deferred** | `INFO` default, `sqlalchemy.engine` pinned to `WARNING` independently. stdout-only JSON is correct for a containerised service. Retention belongs to the deployment change — with one note that must not be lost: Docker's default `json-file` driver grows **unbounded** and needs `max-size`/`max-file`, or the host fills up. |

**Also requiring sign-off before implementation:**

- [ ] **BLOCKING, human approval required:** D14's baseline DDL is the artifact that enforces `tenant-isolation`. It is CRITICAL domain and is not approved by this document.
- [ ] **BLOCKING, human approval required:** D24 modifies `authentication` behaviour. CRITICAL domain.
- [ ] **Precondition to confirm, not assume:** no real data exists when slice 1 begins. Stated as answered today; it must be re-confirmed at slice-1 start, because the whole verification plan collapses without it.

**Recorded, not raised as questions:**

- `scripts/reset_db.py` keeps a name that no longer describes what it does (D18). Renaming to `dev_db.py` costs a README edit.
- The parity check is deliberately deleted at the end of slice 1 (D16). A reader encountering that commit will read it as removing a safety net; it is removing a *duplicate schema definition*, and D17's three standing checks are what remain.
- D17's no-pending-diff test may report a permanent phantom diff on `reservations_no_overlap`. Exclude that one constraint by name, or delete the test — do not tune it into something that can no longer fail.

## Risks

| Risk | Likelihood | Mitigation | Residual |
|---|---|---|---|
| Baseline omits RLS/policies/grants → silent total loss of tenant isolation | High if autogenerated | Hand-written baseline + mechanical `pg_catalog` parity diff including `pg_policies.qual` and `roles`; net proved by breaking it | Low, **while parity is available**. Zero mitigation exists after real data lands — hence slice 1 first. |
| Baseline copies the stale `app.current_tenant_id` predicate | Med | `pg_policies.qual` is text in the parity snapshot | Low |
| Baseline "corrects" the policy to `TO alquileres_app` only | Med | `pg_policies.roles` is in the snapshot; seeding also fails immediately | Low |
| Someone reintroduces `create_all()` into `conftest.py` later | Med | `alembic_version == head` assertion (D17) — the check that makes D13 enforceable rather than conventional | Low |
| `Base.metadata` left empty after `bootstrap.py` is deleted, silently breaking autogenerate | Med | Imports moved to `app/models/__init__.py` in the same commit; D17's no-pending-diff test would report an implausible diff | Low |
| Exception text leaks client PII into logs | Med | Formatter cannot render exception `str()`; `describe_db_error` is the only sanctioned accessor; string-absence test on a real `23505` | Low |
| `LOG_LEVEL=DEBUG` turns on SQLAlchemy parameter logging (password hashes, phone numbers) | Med — this is the one the redaction rule would *not* have caught | `sqlalchemy.engine` pinned to `WARNING` independently of the root level | Low |
| `tenant_id`/`user_id` silently absent from every log line (threadpool context copy) | High if implemented naively | Mutable dict in the contextvar, mutated in place; documented at the definition | Low |
| Rate limiter becomes an account-existence oracle | Low | It counts requests before the handler runs and never learns the outcome — structural, not a rule | Low |
| Rate limiter locks out everyone at once behind a load balancer | **Med** | `TRUSTED_PROXY_COUNT` required with no default; resolved strategy logged at boot; first `429` logs a WARNING with the resolved key | Med — depends on the operator answering correctly, which no code can verify |
| Adding a second uvicorn worker silently doubles every budget | Med | `--workers 1` in the image `CMD` with the reason attached (D19, D24) | Med — a deployment platform can override `CMD` |
| Production image ships `tests/`, dev extras, or runs as root | Med | `COPY` allowlist + `.dockerignore` + non-root user | **Med — not automated in this change.** Manual runbook check; automation belongs to CI. |
| Migrator credentials reach the API process | Med | Three layers: no `scripts/` in the image, no `MIGRATOR_DATABASE_URL` on the `api` service, boot assertion under `ENVIRONMENT=production` | Low |
| CORS set to `*` "to unblock the frontend" | Med | Rejected by a validator at boot, not by review | Low |
| Rollback of slice 1 after real data exists | Low (slice 1 lands first) | Before real data: revert and rebuild. After: `alembic downgrade` + a restore — and **this change explicitly does not deliver backups** | **Accepted, and the reason slice 1 is sequenced first** |

## Rollback

Slices 2–5 are additive middleware, configuration, and packaging: revert the commit and prior behaviour is restored exactly, with no data implications.

Slice 1 is the exception and is why it lands while the database is disposable. Within the slice, steps 1–7 are individually revertible because `bootstrap.py` still exists throughout; step 8 is the point of no return. After real data exists there is no rebuild, and recovery is `alembic downgrade` plus a restore this change does not provide. That asymmetry is the argument for the ordering, and for treating "no real data yet" as a precondition to be confirmed at slice-1 start rather than assumed.
