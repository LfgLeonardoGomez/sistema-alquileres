# Tasks: Production Readiness

## Review Workload Forecast

No PR-based review workload applies. The user works alone and has explicitly
rejected pull requests — there are no PR boundaries, no chained-PR plan, and
no review-size budget in this document. Delivery unit is the commit.

**Slice 1 is the one exception to "one commit per slice."** `design.md`'s
Slicing section specifies slice 1's *internal* commit order as a correctness
property — each of its 8 steps is its own commit, individually revertible
right up until the final (8th) commit, which is the point of no return
(`bootstrap.py` deletion). That structure is preserved below and each task
group is labeled with the commit it belongs to. Slices 2–5 have no such
internal-ordering argument in the design and each ships as one commit.

Two tasks below are **BLOCKING human-approval gates** (governance CRITICAL
domain) and stop the flow until a human explicitly approves: task **1.2**
(D14's baseline DDL — the artifact enforcing `tenant-isolation`) and task
**5.1** (D24 — the authentication behavioural change). Neither is approved
by any document written so far; the rate-limit *numbers* were approved by
the owner on 2026-09-04, but the CRITICAL-domain governance sign-off on
implementing the change itself is a separate, still-open gate per
`design.md`'s Open Questions section.

---

## Phase 1: Alembic baseline + unified test path (`schema-migrations`, `tenant-isolation`) — CRITICAL

> Test runner: `docker compose run --rm test`. Current baseline: 131 tests
> passing, HEAD `ebe501f`, working tree clean — re-confirm this before 1.1.

- [x] 1.1 **Precondition, re-confirmed not assumed (D-binding-input-1).** Before any other step in this phase, confirm no real data exists: the only databases with this schema are the local `db` and `db-test` Compose services, no deployment has occurred, and the only rows present are the 3 seeded dev tenants (`mar-del-tuyu-cabins`, `bariloche-lake-houses`, `villa-carlos-paz-retreat`) and their derived test fixtures. Record the confirmation (date + how it was checked) in the commit that starts this phase. **If real data exists, STOP — do not proceed with this phase.** The whole parity-verification plan (steps 1.6–1.9) depends on a disposable database; per `design.md`'s Rollback section, this precondition has no fallback.

  **Re-confirmed 2026-09-04** by querying the dev database (`db`) through `MIGRATOR_DATABASE_URL`: `tenants` = 3 rows (`bariloche-lake-houses`, `mar-del-tuyu-cabins`, `villa-carlos-paz-retreat` — the seeded dev tenants), and `users`, `properties`, `clients`, `reservations`, `payments` all = 0 rows. No deployment has ever occurred; the only databases carrying this schema are the local `db` and `db-test` Compose services. Precondition holds: the database is disposable and the parity check is available.

- [x] 1.2 **[BLOCKING — HUMAN APPROVAL REQUIRED]** D14's baseline DDL (`migrations/versions/0001_baseline.py`) is the single artifact that will enforce `tenant-isolation` in production. CRITICAL domain, not approved by any document written so far. Present the planned contents to a human — literal DDL, in the order D14 specifies (extension → tables → `reservations_no_overlap` → RLS/FORCE/policy/grants → no grant on `alembic_version`), the two named traps (predicate copied from `app/db/bootstrap.py::apply_row_level_security`, both roles on every policy) — and obtain explicit approval. **Do not write 1.5 until this is approved.**

  **Approved by the owner 2026-09-04.** Binding shape: self-contained (no `app.models`/`Base.metadata` imports); order extension → tables (`tenants, users, properties, clients, reservations, payments`) → `reservations_no_overlap` via literal `op.execute()` → RLS/FORCE/policy/grant per tenant-scoped table → `GRANT SELECT, INSERT ON tenants` → no grant on `alembic_version`; predicate `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` copied verbatim from `app/db/bootstrap.py::apply_row_level_security`; every policy names both `alquileres_app` and `alquileres_migrator`.

**Commit 1 (D-step 1 — nothing runs it yet):**

- [ ] 1.3 `pyproject.toml`: add `alembic` to `[project.dependencies]` (runtime, not `[dev]` — the production image runs `alembic upgrade head`, per D19).
- [ ] 1.4 `alembic.ini`, `migrations/env.py`, `migrations/script.py.mako`: create the Alembic scaffold. `alembic.ini` sets `script_location = migrations`. `env.py` reads `MIGRATOR_DATABASE_URL` and sets `target_metadata = Base.metadata` — `env.py` is explicitly allowed to import `Base.metadata` (D14: it tracks HEAD, it is not a snapshot; only revision files are self-contained). `app/db/bootstrap.py` still exists and is still the only active schema-construction path; nothing here runs yet.

**Commit 2 (D-step 2 — still nothing uses it):**

- [x] 1.5 `migrations/versions/0001_baseline.py`: hand-write the baseline, approved in 1.2. MUST NOT import `app.models`, `app.db.base`, `Base.metadata`, or `TENANT_SCOPED_TABLES` — every table is `op.create_table(...)` with explicit `sa.Column`s. Order (correctness constraint, D14): (1) `CREATE EXTENSION IF NOT EXISTS btree_gist` first; (2) tables in dependency order `tenants, users, properties, clients, reservations, payments` with every `CHECK`, every composite `UNIQUE (tenant_id, id)` FK target, `UNIQUE (tenant_id, phone)` on `clients`, and the composite FKs; (3) `reservations_no_overlap` via literal `op.execute()` (not `ExcludeConstraint`'s round-trip); (4) for each of `users, properties, clients, reservations, payments`: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `CREATE POLICY tenant_isolation ... FOR ALL TO alquileres_app, alquileres_migrator` with the predicate copied verbatim from `app/db/bootstrap.py::apply_row_level_security` (`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` — never the stale spec wording), plus the app role's `GRANT`; (5) `GRANT SELECT, INSERT ON tenants TO alquileres_app`; (6) no grant of any kind on `alembic_version`. `downgrade()` drops the tables in reverse dependency order and stops there — leaves `btree_gist` installed.

**Commit 3 (D-step 3 — must be green before Commit 4):**

- [x] 1.6 `docker-compose.yml`: add a throwaway `db-parity` Postgres service and a one-shot `parity` run service. `scripts/verify_schema_parity.py`: create — against the `db-parity` database: (1) `bootstrap.reset_database(engine)` → snapshot **A**; (2) `DROP TABLE IF EXISTS alembic_version` — **required**; without it a leftover version row makes `upgrade head` a silent no-op and the diff compares a schema against itself; (3) `Base.metadata.drop_all(engine)`; (4) `alembic upgrade head` → snapshot **B**; (5) compare A and B across `information_schema.columns`, `pg_constraint` (`conname`, `contype`, `pg_get_constraintdef(oid)` — catches the `EXCLUDE` definition text too), `pg_indexes`, `pg_class` (`relrowsecurity`, `relforcerowsecurity`), `pg_policies` (`tablename`, `policyname`, `roles`, `cmd`, `qual`, `with_check`), `information_schema.role_table_grants`, `pg_extension`; exclude `alembic_version` and extension-owned objects from both snapshots; print the symmetric difference and exit non-zero on any mismatch.
- [x] 1.7 [TEST] Run `docker compose run --rm parity`. It MUST report zero difference before proceeding to 1.8. This is the mechanical verification D16 exists for — it is only possible while a throwaway rebuild still exists.

  **Observed:** `Schema parity: OK -- bootstrap-built and Alembic-built schemas match.` on the first run, no iteration needed.

**Commit 4 (D-step 4 — prove the net by breaking it):**

- [x] 1.8 [RED] Temporarily delete one `CREATE POLICY tenant_isolation` statement from `0001_baseline.py` (e.g. the one on `payments`). Re-run `docker compose run --rm parity`. Confirm it fails and record the observed diff output (which table/policy it reports missing) in this task's notes — the design requires this recorded as an observation, not an intention.

  **Observed output** (payments' `tenant_isolation` policy omitted from `upgrade()`, everything else unchanged):
  ```
  Schema parity: MISMATCH

  [policies]
    Only in bootstrap-built schema:
      ('payments', 'tenant_isolation', ('alquileres_app', 'alquileres_migrator'), 'ALL', "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)", "(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)")
  ```
  Exit code non-zero. The `policies` category correctly identified `payments` as the table missing its policy.

- [x] 1.9 [GREEN] Restore the deleted policy statement exactly as it was. Re-run `docker compose run --rm parity`. Confirm it reports zero difference again. Commit 1.8+1.9 together as the "break and restore" demonstration.

  **Observed:** `Schema parity: OK -- bootstrap-built and Alembic-built schemas match.` `git diff` against `0001_baseline.py` after restoring is empty.

**Commit 5 (D-step 5):**

- [x] 1.10 `tests/conftest.py`: switch the autouse session fixture's three lines to `alembic downgrade base` → `alembic upgrade head` → `seed_script.run(engine)`, invoked in-process via `alembic.config.Config` + `alembic.command` (not `subprocess`, so a failure raises with a real traceback). No other fixture in the file changes. Run `docker compose run --rm test` — full suite MUST be green, and **`tests/test_rls_structural.py` MUST pass with zero lines changed** — this is D17's first standing check: it now audits the migrated schema instead of the bootstrap-built one, for free.

  **Observed:** 131 passed, run twice in a row against the same `db-test` container (proving the downgrade→upgrade→seed cycle is repeatable, not just correct once). `git diff --stat tests/test_rls_structural.py` is empty; both its tests pass against the Alembic-migrated schema.

**Commit 6 (D-step 6 — D17's remaining two standing checks):**

- [x] 1.11 [TEST] `tests/test_schema_is_migrated.py`: create — one test reads `alembic_version.version_num` and asserts it equals `ScriptDirectory.get_current_head()`. This is what makes D13 ("one schema construction path") enforceable rather than conventional: if anyone reintroduces a `create_all()` shortcut into `conftest.py`, `alembic_version` is absent or stale and this fails. Note honestly if no natural RED state exists at this point (1.10 already switched `conftest.py` to migrate, so the assertion is true by construction) — do not manufacture an artificial failure for a standing check whose failure mode is a future regression, not a missing feature today.

  **Honest note:** no natural RED state existed here, as anticipated — 1.10 already made the assertion true by construction. No artificial failure was manufactured.

- [x] 1.12 [TEST] `tests/test_schema_is_migrated.py`: extend — run `alembic.autogenerate.compare_metadata()` against the migrated test database and assert the diff is empty. **Caveat, recorded up front:** Alembic's reflection of `EXCLUDE` constraints is incomplete, so this may report a permanent phantom diff for `reservations_no_overlap`. If it does, exclude that one constraint by name via `include_object` with a comment explaining why. If it turns out noisier than that single exception, **delete this test rather than weaken it into a filter that ignores real diffs** — a check tuned until it can no longer fail is worse than no check.

  **Observed:** checked empirically before writing the assertion — `compare_metadata()` with no `include_object` filter returns an empty diff against this schema. The anticipated `reservations_no_overlap` phantom diff does not occur, so no exclusion filter was added.

**Commit 7 (D-step 7):**

- [ ] 1.13 `scripts/reset_db.py`: replace the body with `alembic upgrade head` (in-process via `alembic.config.Config`/`alembic.command`) then `seed.run(engine)`. No `drop_all`, no drop of any kind (D18). Keeps its module path and its command (`python -m scripts.reset_db`) — the owner's decision to retain the name despite it no longer describing what the script does.
- [ ] 1.14 `scripts/seed.py`: the `Tenant` insert becomes `ON CONFLICT (slug) DO NOTHING`, since nothing clears the table before it runs any more.
- [ ] 1.15 [TEST] Run the updated `scripts.reset_db` against `db` end-to-end (or the equivalent Compose invocation) and confirm it migrates + seeds without error and is safely re-runnable. Full suite (`docker compose run --rm test`) still green.

**Commit 8 (D-step 8 — the point of no return; everything before this commit was individually revertible because `bootstrap.py` still existed):**

- [ ] 1.16 **Delete** `app/db/bootstrap.py`, `tests/test_bootstrap.py`, `scripts/verify_schema_parity.py`, and the `db-parity`/`parity` Compose services (D16, D18). **This reads like removing a safety net and is not** — it removes a duplicate schema definition. The RLS/FORCE/policy/grant DDL now lives in exactly one place (`0001_baseline.py`), and D17's three standing checks (1.10's unchanged `test_rls_structural.py`, 1.11, 1.12) are what remain to guard it. Do not restore any of these files on the assumption that this commit weakened coverage.
- [ ] 1.17 `app/models/__init__.py`: move the six model imports here (`tenant`, `user`, `property`, `client`, `reservation`, `payment`) — currently registered by `app/db/bootstrap.py`, which 1.16 deletes. Without this, `Base.metadata` is empty for anything that imports it without importing models first, which is exactly what `migrations/env.py`'s `target_metadata` does — an empty metadata does not raise, it makes 1.12's `compare_metadata()` report either "drop every table" or nothing at all. Same commit as 1.16.
- [ ] 1.18 [TEST] Run `docker compose run --rm test` — full suite MUST be green after 1.16/1.17, including 1.11/1.12.

- [ ] 1.19 `README.md`: replace the "Why no Alembic (yet)" section with the migration runbook (`alembic upgrade head`, `alembic downgrade base`, `alembic revision --autogenerate`); remove references to `bootstrap.py`/`drop_all` as the reset mechanism; document `scripts/reset_db.py`'s new non-destructive behavior and that its name is now a deliberately retained misnomer (D18).

## Phase 2: Production image + config surface (`production-runtime`) — single commit per numbered group below

- [ ] 2.1 `Dockerfile`: convert to multi-stage with `dev` and `prod` targets. `prod` builder stage installs the project **without** `[dev]` extras into a prefix copied into a clean runtime stage. `prod` runtime `COPY`s exactly `app/`, `migrations/`, `alembic.ini` — never `tests/`, `scripts/`, `docker/`, or `.env*` (allowlist, not `.dockerignore` alone). Non-root `appuser` (fixed UID, e.g. 10001), `USER appuser` before `CMD`. `ENV PYTHONUNBUFFERED=1`, `ENV PYTHONDONTWRITEBYTECODE=1`. `HEALTHCHECK` against `GET /health`. `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]` — explicit `uvicorn`, explicit `--workers 1` (D19/D24: worker count is a rate-limiter correctness input, not a performance default). `dev` target keeps the current bind-mount-friendly shape (`[dev]` extras, `tests/`/`scripts/` present).
- [ ] 2.2 `.dockerignore`: create as the second layer only — excludes `tests/`, `scripts/`, `docker/`, `.env*`, `.git`, `__pycache__`. The `COPY` allowlist in 2.1 is the actual mechanism; this is belt-and-suspenders.

- [ ] 2.3 [RED] `tests/test_config.py`: add cases — `Settings()` refuses to boot without `ENVIRONMENT` set; and separately, boot refuses (raises) when `ENVIRONMENT=production` while `MIGRATOR_DATABASE_URL` is present anywhere in the process environment, even though `Settings` has no field for it.
- [ ] 2.4 [GREEN] `app/config.py`: add `environment: str` (required, no default — same rule as `jwt_secret`/`registration_token`: a default would make the next check fail open on a forgotten variable). Add a validator that raises when `environment == "production"` and `"MIGRATOR_DATABASE_URL" in os.environ`. `Settings` never gains a `migrator_database_url` field — application code has no sanctioned way to read it. Re-run 2.3 → green.

- [ ] 2.5 `docker-compose.yml`: add a new `migrate` service (same build as `api`, migrator env, `command: alembic upgrade head` by default, overridable to `python -m scripts.reset_db` for migrate+seed in the dev loop).
- [ ] 2.6 `docker-compose.yml`: remove `MIGRATOR_DATABASE_URL` from the `api` service's environment entirely.
- [ ] 2.7 `docker-compose.yml`: add `ENVIRONMENT` explicitly to every service (`api`, `test`, `migrate`, and any future production example) — three one-line edits removing the fail-open default noted in 2.4.
- [ ] 2.8 [TEST] Verify: `docker compose run --rm migrate` runs `alembic upgrade head` against `db` successfully; `docker compose run --rm migrate python -m scripts.reset_db` migrates and seeds; `docker compose up -d api` boots and serves without `MIGRATOR_DATABASE_URL`, using only `alquileres_app` credentials.

- [ ] 2.9 `docker/initdb/01-roles.sql` → `docker/initdb/01-roles.sh`: convert to a shell script reading role passwords from the `db` service's environment (no defaults, no hardcoded credentials left in the file — the SQL file becomes copy-safe, which is the actual hazard D21 targets). `docker-compose.yml`'s `db`/`db-test` services gain the corresponding password env vars (dev passwords still live in `docker-compose.yml`, same as the existing `postgres/postgres` credentials — not removed from the repo, just out of the copy-pasteable SQL file).
- [ ] 2.10 [TEST] Rebuild `db`/`db-test` from a fresh volume; confirm `01-roles.sh` provisions both roles correctly and the full suite (`docker compose run --rm test`) still passes.

- [ ] 2.11 `README.md`: add the "Provisioning a fresh PostgreSQL cluster" runbook — literal `CREATE ROLE` / `GRANT CREATE, USAGE ON SCHEMA public` / `GRANT CREATE ON DATABASE` statements, run once as a superuser, passwords supplied by the operator. Call out `NOSUPERUSER NOBYPASSRLS` on `alquileres_app` as the line that must not be "simplified," with D5's one-sentence reason attached.
- [ ] 2.12 `README.md`: add the manual image-inspection runbook command (build the `prod` target, confirm no `tests/`, no `scripts/`, no dev extras, non-root process) — documented as a stated gap, not automated in this change (D19: requires a CI build step out of scope).
- [ ] 2.13 `README.md`: update the config table — add `ENVIRONMENT` (required, no default); document the `migrate` service and that `api` no longer holds `MIGRATOR_DATABASE_URL`.

## Phase 3: Structured logging + correlation + redaction (`request-logging`) — single commit per numbered group below

- [ ] 3.1 `app/config.py`: add `log_level: str = "INFO"` (has a default — not a secret, not a dangerous-when-wrong setting).

- [ ] 3.2 [RED] `tests/test_logging_redaction.py`: a `POST /auth/login` with a known password emits no log line containing that password, regardless of outcome.
- [ ] 3.3 [RED] same file: a `POST /auth/register` with a known `X-Registration-Token` value emits no log line containing that token, regardless of outcome.
- [ ] 3.4 [GREEN] `app/logging.py`: create — JSON formatter emitting exactly an allowlist of fields (`timestamp, level, logger, event, request_id, method, path, status, duration_ms, tenant_id, user_id` plus `extra` keys validated against an explicit allowlist); **anything not on the allowlist is dropped, not redacted**. `exc_info` renders as `{"type", "frames": [{file, line, function}]}` — never the exception's `str()`, `repr()`, or `args`. `sqlalchemy.engine` logger pinned to `WARNING` independently of the root level (Layer 4 — otherwise `LOG_LEVEL=DEBUG` turns on bound-parameter logging: password hashes, phone numbers, emails). Wire root logging config in `app/main.py` using this formatter and `settings.log_level`.
- [ ] 3.5 Re-run 3.2/3.3 → green.

- [ ] 3.6 [RED] `tests/test_correlation.py`: every response carries `X-Request-ID`; an inbound `X-Request-ID` matching `^[A-Za-z0-9._-]{1,64}$` is reused, an invalid one is discarded and a fresh UUID4 generated instead; every log line emitted while handling one request carries the same correlation id — including a forced 500.
- [ ] 3.7 [GREEN] `app/logging.py`: add a correlation contextvar holding a **mutable dict**, set fresh by the middleware and mutated in place elsewhere (never rebound — document the working-vs-broken distinction in the module docstring, per D23's threadpool/`copy_context()` gotcha), plus a `logging.Filter` on the root handler attaching `request_id`/`tenant_id`/`user_id` from that dict to every record. `app/middleware.py`: create — `CorrelationMiddleware` validates/generates the correlation id, sets the contextvar dict fresh, wraps `call_next` in try/except (logs `status=500` with the exception **type**, re-raises), emits one `event=request` log line at completion (`method`, `path` with query string stripped, `status`, `duration_ms`, `request_id`, `tenant_id`, `user_id`), echoes `X-Request-ID` on every response including error responses. Never calls `request.body()` (Layer 5).
- [ ] 3.8 `app/api/deps.py`: wherever the current principal is resolved (JWT verification), mutate the correlation contextvar dict in place with `tenant_id`/`user_id` — never rebind the contextvar itself.
- [ ] 3.9 `app/main.py`: register `CorrelationMiddleware` outermost, wire logging setup at import time.
- [ ] 3.10 Re-run 3.6 → green, including the forced-500 case.

- [ ] 3.11 [RED] `tests/test_logging_db_diagnostics.py`: force a `23505` on `clients_tenant_phone_uq` with a known, distinctive phone number; assert an emitted log line records the SQLSTATE and constraint name, and no emitted log line contains the conflicting phone number.
- [ ] 3.12 [GREEN] `app/logging.py`: `describe_db_error(exc) -> dict` — the only sanctioned accessor for driver diagnostics, returns exactly `{"sqlstate", "constraint", "table"}` from psycopg's `Diagnostic` (`constraint_name`, `table_name`); never reads `message_detail`/`message_primary`. `app/errors.py`: `handle_integrity_error` logs `describe_db_error(exc)` and nothing else — no `exc.orig` string, no `str(exc)`, no `repr(exc)` anywhere.
- [ ] 3.13 Re-run 3.11 → green.

- [ ] 3.14 `README.md`: document `LOG_LEVEL` (default `INFO`; `DEBUG` is safe due to the `sqlalchemy.engine` pin; `WARNING` loses the access log), JSON-lines-to-stdout, and `X-Request-ID` correlation.

## Phase 4: CORS (`cors-policy`) — single commit per numbered group below

- [ ] 4.1 `app/config.py`: add `cors_allowed_origins: str` (required, no default; declared as `str`, not `list[str]` — pydantic-settings attempts a JSON decode for complex env types, which breaks a plain comma-separated value; split it in a validator instead) with a field validator that splits on comma and rejects the literal `*` with a named error. An explicit empty string is a legal value ("no browser access, deliberately").
- [ ] 4.2 [RED] `tests/test_cors.py`: `CORS_ALLOWED_ORIGINS=*` fails `Settings()` construction at boot with a named error (subprocess-based, same pattern as `test_config.py`).
- [ ] 4.3 [GREEN] Confirm 4.1's validator rejects `*`. Re-run 4.2 → green.

- [ ] 4.4 [RED] `tests/test_cors.py`: a browser preflight + request from a configured origin to an owner-scoped route succeeds with CORS headers permitting it; the same from an unconfigured origin is refused.
- [ ] 4.5 [GREEN] `app/main.py`: register `CORSMiddleware` — nesting order outermost-to-innermost is correlation → CORS → routes (per D23's Component Map, so CORS still wraps every route including a future `429`) — with `allow_origins` from settings, `allow_credentials=False` (bearer-token auth, not cookies), `allow_headers` including `Authorization`, `Content-Type`, `X-Registration-Token`, `X-Request-ID`, `expose_headers` including `X-Request-ID` (browser JS cannot read a response header that isn't exposed — the whole point of echoing the correlation id would be silently defeated otherwise). Re-run 4.4 → green.

- [ ] 4.6 [RED] `tests/test_cors.py`: a browser preflight for `POST /auth/register` carrying `X-Registration-Token` is allowed.
- [ ] 4.7 [GREEN] Confirm 4.5's `allow_headers` covers this; re-run 4.6 → green.

- [ ] 4.8 [TEST] `tests/test_cors.py`: `/public/{slug}/availability` shares the single owner-scoped CORS policy — no independent policy is implemented now (D22: a second policy would be a second thing to get wrong for zero benefit, since CORS is not access control and the endpoint is already unauthenticated by design). One test confirming the same origin allow-list applies there too.

- [ ] 4.9 `README.md`: document `CORS_ALLOWED_ORIGINS` (required, no default; an explicit empty value means "no browser access, deliberately"; `*` rejected at boot, not by review).

## Phase 5: Auth rate limiting (`authentication`) — CRITICAL, single commit per numbered group below

- [ ] 5.1 **[BLOCKING — HUMAN APPROVAL REQUIRED]** D24 modifies `authentication` behaviour. CRITICAL domain, not approved by any document written so far as a *code change*, independent of the rate-limit numbers themselves. Present the approved shape to a human for explicit sign-off before writing any code in this phase: outcome-blind counting (the limiter never learns whether login/registration succeeded), address-only key (never tenant-slug-inclusive — a slug-keyed limiter is a remote lockout button for any known tenant), `TRUSTED_PROXY_COUNT` required with no default, sliding-window log algorithm, budgets of **login 10/15min, register 5/hour** (owner-approved 2026-09-04 as a revisable starting point). Emphasize: the *shape* (outcome-blind, address-only) is not negotiable — trading it away reopens the enumeration oracle D10 closed; the *numbers* are cheap to change later. **Do not write 5.2 until this is approved.**

- [ ] 5.2 `app/config.py`: add `trusted_proxy_count: int` (required, no default — same fail-neither-open-nor-closed rule as `environment`) and the rate-limit budget settings (or constants in `app/ratelimit.py` — login 10/15min, register 5/hour).
- [ ] 5.3 [RED] `tests/test_ratelimit.py` (unit, no DB): `TRUSTED_PROXY_COUNT=0` ignores a forged `X-Forwarded-For` and uses `request.client.host`; `TRUSTED_PROXY_COUNT=1` resolves the correct entry from the **right** of `X-Forwarded-For` (never the leftmost — that value is fully attacker-controlled).
- [ ] 5.4 [GREEN] `app/ratelimit.py`: create — client-address resolution per `trusted_proxy_count`. Re-run 5.3 → green.

- [ ] 5.5 [RED] `tests/test_ratelimit.py`: sliding-window log — exceeding the budget blocks further attempts; timestamps outside the window expire and free budget; `Retry-After` is computed as the exact seconds until the oldest attempt in the window expires (not a constant).
- [ ] 5.6 [GREEN] `app/ratelimit.py`: sliding-window log limiter — in-process, counts every request before the handler runs (never the outcome), `threading.Lock`-guarded (sync endpoints run in a threadpool — an unguarded counter is quietly wrong under concurrent load), bounded LRU key set (~10k keys, so an attacker rotating source addresses cannot grow the dict without limit). Re-run 5.5 → green.

- [ ] 5.7 [RED] `tests/test_auth_ratelimit.py`: exceeding the login attempt budget returns `429` with a `Retry-After` header.
- [ ] 5.8 [RED] same file: exceeding the registration attempt budget returns `429` with a `Retry-After` header.
- [ ] 5.9 [GREEN] `app/api/routers/auth.py`: add a route-level rate-limit dependency to `POST /auth/login` and `POST /auth/register` only — a dependency, not middleware, because middleware would have to path-match and drift from the router silently. The dependency runs before the handler has looked anything up, keyed on client address alone via `app/ratelimit.py`. Re-run 5.7/5.8 → green.

- [ ] 5.10 [RED] `tests/test_auth_ratelimit.py`: **the D10-preservation test.** Two callers each exhaust the login budget — one submitting credentials for an existing account, the other a tenant-slug/email combination that does not exist. Assert the resulting `429` responses are byte-identical: same status, same body, same headers. This is what keeps the limiter from becoming the enumeration oracle D10 closed by making every failed login return one identical `401`.
- [ ] 5.11 [GREEN] Confirm the rate-limit dependency (5.9) never inspects the handler's outcome — structural, by construction of running before the handler. Re-run 5.10 → green.

- [ ] 5.12 [TEST] `tests/test_auth_login.py` (existing file): confirm the existing single-generic-401 test still passes unchanged for a caller below the rate-limit budget (D24 scenario: "a caller below the budget still receives the existing generic 401").

- [ ] 5.13 [RED] `tests/test_cors.py`: a `429` response still carries `Access-Control-Allow-Origin` for a configured origin — pins the CORS-wraps-everything middleware ordering from Phase 4 against the new rate-limit dependency.
- [ ] 5.14 [GREEN] Confirm CORSMiddleware (registered outside routing in Phase 4) still wraps a `429` raised by the route-level dependency; fix ordering if it does not. Re-run 5.13 → green.

- [ ] 5.15 `app/main.py`: log the resolved `TRUSTED_PROXY_COUNT` strategy once at boot (visible in the log rather than discovered during an incident); the first `429` in a process logs a `WARNING` with the resolved key.

- [ ] 5.16 `README.md`: document the rate-limit budgets (login 10/15min, register 5/hour), `TRUSTED_PROXY_COUNT` (required, no default — `0` for direct connections, `n` for `n` trusted proxies), and that the shape (outcome-blind counting, address-only key) is load-bearing while the numbers are explicitly revisable.

---

## Task Count Summary

| Phase | Capability | Tasks | Notes |
|---|---|---|---|
| 1 | `schema-migrations` / `tenant-isolation` | 19 (1.1–1.19) | 1 precondition + 1 BLOCKING gate + 8 commits |
| 2 | `production-runtime` | 13 (2.1–2.13) | |
| 3 | `request-logging` | 14 (3.1–3.14) | |
| 4 | `cors-policy` | 9 (4.1–4.9) | |
| 5 | `authentication` (rate limiting) | 16 (5.1–5.16) | 1 BLOCKING gate |
| **Total** | | **71** | 2 BLOCKING human-approval gates |
