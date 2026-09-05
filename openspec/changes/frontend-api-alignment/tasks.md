# Tasks: Frontend API Alignment

## Review Workload Forecast

No PR-based review workload applies. The owner works alone and has explicitly
rejected pull requests — there are no PR boundaries, no chained-PR plan, and
no review-size budget in this document. Delivery unit is the commit, one
commit per slice, matching `production-readiness`'s precedent.

**Phase 4 is the one exception to "one commit per slice."** `design.md`'s
Slicing section specifies Phase 4's *internal* order as a correctness
property: the migration and its structural/behavioural RLS tests land and
are proven green **before** `PATCH /tenant` is written, so "the backstop
works" is a claim about the database, not about the handler that has not
been written yet. That internal ordering is preserved below.

**One task is a BLOCKING human-approval gate** (governance CRITICAL domain)
and stops the flow until a human explicitly approves: task **4.1**, covering
both D38 (enabling RLS on `tenants`) and D39 (the first write path to that
table). Neither is approved by any document written so far — `design.md`'s
own closing section states this explicitly, dated the same day the rest of
the design's open questions were resolved. Do not write task 4.2 until 4.1
is approved.

**Baseline going in:** `production-readiness` is complete and archived, 166
tests passing, working tree clean. Test runner: `docker compose run --rm
test` from the repo root, per `back/docker-compose.yml`'s `test` service
(invoked from the repository root as `docker compose run --rm test`).
Rebuild the image (`docker compose build`) after any change to
`back/pyproject.toml` or the Dockerfile — `docker compose run` reuses cached
images otherwise.

---

## Phase 1: Client-Management Disambiguation + Cancelled-Reservation Balance Fix (`client-management`, `payment-tracking`) — no migration

> This phase ships first per `design.md`'s Slicing table: the frontend
> cannot display any guest's balance correctly until `balance` stops
> ignoring `status`, and every later slice is built on an API that agrees
> with itself.

- [x] 1.1 [TEST] **Spec-only disambiguation, confirmed rather than coded.** `openspec/changes/frontend-api-alignment/specs/client-management/spec.md`'s "Active Filter on Search, Not on Historical Reads" delta already states the mechanism (`GET /clients/{id}` does not filter by `deleted_at`). No application code in `back/app/api/routers/clients.py:58-63` needs to change — confirm this by creating `back/tests/test_client_historical_lookup.py`: a soft-deleted client referenced by a past reservation still returns its `full_name`/`phone`/`email`/`national_id` from a direct `GET /clients/{id}` call, and the reservation response itself carries only `client_id`. Record honestly if this passes on the first run with no code change — expected, since the router already implements the second reading of the old ambiguous wording.

  **Observed:** passed on the first run with **no application code change**, exactly as this task predicted — `back/app/api/routers/clients.py:58-63` already implemented the second reading of the ambiguous wording. `back/tests/test_client_historical_lookup.py` records it with two cases: a soft-deleted client referenced by a past reservation still returns `full_name`/`phone`/`email`/`national_id` from `GET /clients/{id}`, and that same client stays excluded from the list endpoint. Zero production lines touched by this task.

- [x] 1.2 [RED] `back/tests/test_reservation_balance.py` (extend): a `cancelled` reservation with an effective total of `180000` and a recorded payment of `60000` reports `balance == 0`, not `120000` (payment-tracking spec "Balance Is Derived, Never Stored" — cancelled branch).
- [x] 1.3 [GREEN] `back/app/services/reservations.py`: add a pure function `balance(*, status: str, effective_total: Decimal, paid_amount: Decimal) -> Decimal` — returns `Decimal(0)` when `status == "cancelled"`, else `effective_total - paid_amount`. Placed beside `is_completed`, which already consults `status` (design D44's point: the two derived fields were asymmetric). `back/app/schemas/reservation.py`: `ReservationRead.balance`'s `computed_field` deletes its inline arithmetic and delegates to this function instead. Re-run 1.2 → green.

  **Observed:** 1.2 green after the change. `balance()` lives beside `is_completed` in `back/app/services/reservations.py`; `ReservationRead.balance` in `back/app/schemas/reservation.py` is now a plain delegation with no arithmetic of its own.

- [x] 1.4 [RED] same file: a cancelled reservation's recorded payment remains individually visible in the reservation's `paid_amount` and in `GET /reservations/{id}/payments`, even though `balance` reads `0` — cancellation collapses the derived number, not the payment history.
- [x] 1.5 [GREEN] confirmed by construction (1.3's `balance()` only changes the returned number; `paid_amount`'s `column_property` and the payments list endpoint are untouched). Re-run 1.4 → green.

  **Observed:** confirmed by construction as written — `paid_amount`'s `column_property` and the payments list endpoint are at zero changed lines, and `test_cancelled_reservation_keeps_paid_amount_visible` passed with no further edit.

- [x] 1.6 [TEST] `back/tests/test_reservation_balance.py` (extend): a direct, no-DB unit test calling `balance()` — `cancelled` returns `0` at several different paid amounts (including `0` paid and overpaid); a non-cancelled status returns `effective_total - paid_amount` including a negative (overpaid) result. Triangulates the pure function independently of the HTTP/DB round-trip in 1.2/1.4.

  **Observed:** 5 no-DB unit tests added (cancelled with no payment / partial / overpaid; non-cancelled normal and negative-overpaid). Full suite `docker compose run --rm test` → **175 passed, 3 warnings in 57.98s**; targeted re-run of the two Phase 1 files → **14 passed in 8.31s**.

## Phase 2: Reservation List Filters (`reservation-booking`) — no migration

- [x] 2.1 [RED] `back/tests/test_reservation_filters.py` (create): `GET /reservations?client_id=<id>` returns exactly that client's reservations and none of another client's; a reservation on a since-soft-deleted property still appears for its client.

  **Observed:** `back/tests/test_reservation_filters.py` created with the full Phase 2 test set (13 tests) up front, then run once against the unmodified router to confirm RED before any production code changed: `9 failed, 4 passed`. The 4 that passed without any filter existing were `test_client_reservation_on_soft_deleted_property_still_appears`, `test_straddling_stay_is_returned_by_overlap_window`, `test_no_filters_returns_the_unfiltered_list`, `test_omitting_status_keeps_the_cancelled_inclusive_default` — each passes trivially pre-implementation because an absent filter returns everything, which happens to satisfy an inclusion assertion (not a false-positive risk, since their paired exclusion tests — soft-delete's own client scoping via 2.1's other case, the outside-window case, and the status-exclusion case — did fail red). `test_filter_by_client_id_returns_only_that_clients_reservations` itself failed as expected (both clients' reservations returned, unfiltered).

- [x] 2.2 [GREEN] `back/app/api/routers/reservations.py`: add an optional `client_id: Annotated[uuid.UUID | None, Query()]` filter to `list_reservations`. Re-run 2.1 → green.

  **Observed:** green — `test_filter_by_client_id_returns_only_that_clients_reservations` and `test_client_reservation_on_soft_deleted_property_still_appears` both pass with the `client_id` filter added.

- [x] 2.3 [RED] same file: a reservation with `check_in = 2026-08-28`, `check_out = 2026-09-03` **is** returned by `?from=2026-09-01&to=2026-10-01` (overlap, not containment); a reservation entirely outside that window is excluded.

  **Observed:** already covered by 2.1's up-front batch. `test_stay_entirely_outside_window_is_excluded` failed red (no filter yet, outside-window reservation still appeared); `test_straddling_stay_is_returned_by_overlap_window` passed trivially pre-implementation for the reason recorded in 2.1.

- [x] 2.4 [GREEN] `back/app/api/routers/reservations.py`: add optional `from_: Annotated[date, Query(alias="from")]` and `to: Annotated[date, Query()]`. Filter via `func.daterange(Reservation.check_in, Reservation.check_out, "[)").op("&&")(func.daterange(from_, to, "[)"))` — the same expression `reservations_no_overlap` uses (design D43), never a hand-rolled `check_in < to AND check_out > from_` boundary comparison. Re-run 2.3 → green.

  **Observed:** green — both `test_straddling_stay_is_returned_by_overlap_window` and `test_stay_entirely_outside_window_is_excluded` pass with the `daterange && daterange` filter added, expression copied character-for-character from the `reservations_no_overlap` EXCLUDE constraint per design D43.

- [x] 2.5 [RED] same file: supplying only `from`, or only `to`, is rejected with a validation error (422).

  **Observed:** already covered by 2.1's up-front batch — `test_only_from_is_rejected` and `test_only_to_is_rejected` both failed red (no guard yet, FastAPI silently ignores the lone parameter and returns 200).

- [x] 2.6 [GREEN] `back/app/api/routers/reservations.py`: FastAPI cannot express "both or neither" in the signature — add an explicit guard in the handler body raising `errors.invalid("from and to must be supplied together")` when exactly one of `from_`/`to` is present. Re-run 2.5 → green.

  **Observed:** green — both tests pass with the `(from_ is None) != (to is None)` guard raising 422.

- [x] 2.7 [RED] same file: `from >= to` is rejected with a validation error (422) rather than silently returning an empty list.

  **Observed:** already covered by 2.1's up-front batch — `test_from_after_to_is_rejected` and `test_from_equal_to_is_rejected` (the zero-width case) both failed red.

- [x] 2.8 [GREEN] `back/app/api/routers/reservations.py`: add a guard raising `errors.invalid("from must be before to")` when both are present and `from_ >= to`. Re-run 2.7 → green.

  **Observed:** green — both the inverted-range and zero-width-window cases pass with the `from_ >= to` guard raising 422.

- [x] 2.9 [TEST] same file: supplying neither `from`/`to` nor `client_id` returns the same list the endpoint returned before this change (structure only — the ordering assertion is 2.14/2.15, not this task).

  **Observed:** `test_no_filters_returns_the_unfiltered_list` passed on the first run with no code change, exactly as expected for a `[TEST]` task with no paired `[GREEN]` — the reservation created in the test is present in the unfiltered response both before and after every later task in this phase.

- [x] 2.10 [RED] same file: a client with one reservation inside the requested window and one outside it — `?client_id=<id>&from=2026-09-01&to=2026-10-01` — returns only the reservation that overlaps.

  **Observed:** already covered by 2.1's up-front batch — `test_client_id_combines_with_window_by_and` failed red before 2.2/2.4 landed (neither filter existed, both reservations returned).

- [x] 2.11 [GREEN] confirmed by construction (2.2's and 2.4's `.where()` clauses AND together on the same `stmt`). Re-run 2.10 → green.

  **Observed:** confirmed by construction as written — no additional code beyond 2.2 and 2.4's own `.where()` calls. `test_client_id_combines_with_window_by_and` passed once both filters existed, with no further edit.

- [x] 2.12 [RED] same file: `?status=reserved` excludes a cancelled reservation from the list; omitting `status` leaves the existing (cancelled-inclusive) default unchanged (design D43 / Open Question 3: decided here, not a silent default change).

  **Observed:** already covered by 2.1's up-front batch — `test_status_filter_excludes_cancelled` failed red (no `status` filter yet, cancelled reservation still returned); `test_omitting_status_keeps_the_cancelled_inclusive_default` passed both before and after, by design (the default must not change).

- [x] 2.13 [GREEN] `back/app/api/routers/reservations.py`: add an optional `status: Annotated[str | None, Query()]` filter. Re-run 2.12 → green.

  **Observed:** green — `test_status_filter_excludes_cancelled` now passes; `test_omitting_status_keeps_the_cancelled_inclusive_default` stays green, confirming the default did not silently change.

- [x] 2.14 [RED] same file: default ordering is `check_in, created_at` — two reservations with the same `check_in` keep a stable order by `created_at`, and a reservation with an earlier `check_in` but a later `created_at` sorts first (proves the primary key changed, not just a secondary tie-break).

  **Observed:** already covered by 2.1's up-front batch — `test_default_ordering_is_by_check_in_then_created_at` failed red against the unmodified `order_by(Reservation.created_at)` (the later-`check_in`-but-recorded-first reservation sorted first, the opposite of the expected order). The three reservations exercising this are deliberately placed on three different properties to avoid colliding with `reservations_no_overlap`, since two of them deliberately share the same `check_in`.

- [x] 2.15 [GREEN] `back/app/api/routers/reservations.py`: change `list_reservations`'s `order_by(Reservation.created_at)` to `order_by(Reservation.check_in, Reservation.created_at)`. Re-run 2.14 → green.

  **Observed:** green. Full suite `docker compose run --rm test` → **188 passed, 3 warnings in 71.62s** (175 baseline + 13 new tests in `test_reservation_filters.py`). Targeted re-run of the full new file → **13 passed in 5.96s**.

## Phase 3: Per-Guest Aggregates — closed as no code (`client-management`)

- [x] 3.1 **No endpoint, no field — record the decision and its tripwire, not an implementation.** Per binding input 1 and design D47: once Phase 1 makes a cancelled reservation's `balance` read `0`, a guest's outstanding balance is the plain sum of that guest's reservation balances, and Phase 2's `client_id` filter already puts that list in the frontend's hands. Add a short docstring note to `back/app/schemas/client.py`'s `ClientRead` class (immediately above the class, beside the existing `is_active` note) recording: no `stay_count`/`outstanding_balance` field exists on this model, no new endpoint exists, and no SQL aggregate exists, by design (D47) — and the tripwire that reverses it: add the server-side aggregate the day a second consumer of this data appears, or a screen renders a reservation without having loaded that guest's full reservation list. Do not add a `stay_count` or `outstanding_balance` field. Do not add an endpoint.

  **Observed:** no code written, as the task requires. Added a class docstring to `ClientRead` in `back/app/schemas/client.py` recording that no `stay_count`/`outstanding_balance` field, no endpoint and no SQL aggregate exist by design (D47), and the tripwire that reverses it. No field, no endpoint and no aggregate were added. Suite unchanged at 188 passed.


## Phase 4: Tenant Public Contact (`tenant-management`, `tenant-isolation`, `public-tenant-contact`, `public-availability-calendar`) — CRITICAL, migration `0002`

> **Internal order is a correctness property (design D38/Slicing):** the
> migration and its RLS tests (4.2–4.7) land and are proven green **before**
> `PATCH /tenant` (4.8+) exists. The backstop must be a claim about the
> database before it is a claim about a handler.

- [x] 4.1 **[BLOCKING — HUMAN APPROVAL REQUIRED]** D38 (enables Row-Level Security on `tenants` for the first time, per-command, no `FORCE`) and D39 (the first write path this system has ever had to that table) are CRITICAL domain (`tenant-isolation`). `design.md`'s own closing section states plainly: "Still blocking implementation... not approved by any document." Present to a human, for explicit sign-off, before writing 4.2: the exact DDL (`GRANT UPDATE (whatsapp) ON tenants TO alquileres_app`; `ENABLE ROW LEVEL SECURITY` with **no** `FORCE`; the three policies `tenants_read`/`tenants_insert`/`tenants_self_update` and their predicates copied verbatim from `back/migrations/versions/0001_baseline.py:67-69`); the four-layer defense argument (no tenant identifier in the request surface, predicate from the verified `tid` claim, column-scoped grant, per-command RLS); and the fact that `back/tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged` will go red and its triangulation subject must move to `alembic_version` rather than have its assertion weakened. **Do not write 4.2 until this is approved.**

  **Observed:** **APPROVED by the owner on 2026-09-05**, in conversation, after being presented with: the exact DDL (column + `tenants_whatsapp_format` CHECK, `GRANT UPDATE (whatsapp) ON tenants TO alquileres_app`, `ENABLE ROW LEVEL SECURITY` with no `FORCE`, and the three policies with their predicates); the four-layer defense argument (no tenant identifier in the request surface, predicate from the verified `tid` claim, column-scoped grant, per-command RLS); the deliberate absence of `FORCE` and why it creates no standing rule on the application path; the expected RED in `back/tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged` and that its triangulation subject must MOVE to `alembic_version` rather than have its assertion weakened; and the residual risk stated plainly (RLS denies silently, so a future unpaired `GRANT DELETE` would report success and remove nothing -- a failure mode that did not exist before this change).

  **Correction raised at approval time and accepted:** 4.1 and 4.2 both say the `tenants_self_update` predicate is copied *verbatim* from `back/migrations/versions/0001_baseline.py:67-69`. It cannot be verbatim in full -- line 67-69 reads `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`, and `tenants` has no `tenant_id` column; its key is `id`. What must be copied verbatim is the right-hand side, `NULLIF(current_setting('app.tenant_id', true), '')::uuid`; the left-hand side is `id`. D14's intent is unchanged (never `app.current_tenant_id`, never retyped from prose).


- [x] 4.2 `back/migrations/versions/0002_tenant_whatsapp.py` (create): `op.add_column("tenants", sa.Column("whatsapp", sa.String(20), nullable=True))`; `CHECK (whatsapp ~ '^[0-9]{8,15}$')` named `tenants_whatsapp_format`; `GRANT UPDATE (whatsapp) ON tenants TO alquileres_app` — the app role holds only `SELECT, INSERT` on `tenants` today (`back/migrations/versions/0001_baseline.py:246`), and PostgreSQL checks column privileges independently of RLS, so this is the layer that makes `UPDATE tenants SET slug = …` `ERROR: permission denied for column slug` regardless of policy; `ALTER TABLE tenants ENABLE ROW LEVEL SECURITY` with **no** `FORCE` (deliberate: `alquileres_app` is not the table owner, so plain `ENABLE` binds it completely, and `FORCE` would only constrain the migrator while imposing a "set `app.tenant_id` before every seed insert" rule that `back/tests/conftest.py::_seed_one_tenant` already violates by inserting the tenant row before calling `set_config`); three policies naming both `alquileres_app` and `alquileres_migrator` — `tenants_read FOR SELECT USING (true)`, `tenants_insert FOR INSERT WITH CHECK (true)` (both deliberately as permissive as no RLS at all, so login's and the public routes' pre-context reads are unaffected by construction), `tenants_self_update FOR UPDATE USING/WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)` — **the predicate copied verbatim from `back/migrations/versions/0001_baseline.py:67-69`, never retyped**. No `DELETE` policy and no `DELETE` grant. `downgrade()`: drop the three policies, `DISABLE ROW LEVEL SECURITY`, drop the CHECK, drop the column — the column-scoped grant dies with the column, nothing to revoke explicitly.

  **Observed:** created as specified. **Deviation, stated plainly:** this task's own text is migration-only, but `design.md`'s Files-Changed table pairs the `whatsapp` column with `back/app/models/tenant.py` under the same decision (D39), and `tests/test_schema_is_migrated.py::test_no_pending_autogenerate_diff` (part of the full suite, run continuously per D15) reflects the live DB against `Base.metadata` — an ORM model left unchanged would make that pre-existing check fail as an *unlisted* regression alongside 4.3's expected one. Added `whatsapp: Mapped[str | None]` and a mirrored `CheckConstraint("whatsapp ~ '^[0-9]{8,15}$'", name="tenants_whatsapp_format")` to `back/app/models/tenant.py`'s `__table_args__`, following the exact precedent every other CHECK-bearing model in this codebase already sets (`Payment`, `Reservation`) even though D17 notes `compare_metadata()` does not reliably diff CHECK bodies — only the column itself is load-bearing for that test; the constraint mirror is for consistency with existing convention. Also updated the model's docstring, which said "GLOBAL table, no RLS (design D5)" and is now stale given D38's amendment.

- [x] 4.3 [TEST] Run `docker compose run --rm test`. The session fixture's `alembic downgrade base` → `upgrade head` cycle (design D15) now exercises 0002's `downgrade()` for the first time. Observe and record whether `back/tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged` now fails — expected, because `tenants.relrowsecurity` is `true` for the first time and that test's whole point is asserting it is `false`. This is the natural RED for 4.4, not a regression to fix by weakening the assertion.

  **Observed:** exactly the predicted RED and nothing else — `1 failed, 187 passed, 3 warnings in 68.82s`. The sole failure: `tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged`, `AssertionError: assert True is False` on the `tenants_has_rls is False` line (`relrowsecurity` is now `true`). `test_no_pending_autogenerate_diff` and `test_alembic_version_matches_script_directory_head` both stayed green — the 4.2 model-sync deviation above did what it was meant to. The `downgrade base` → `upgrade head` cycle exercised 0002's `downgrade()` cleanly (visible in every subsequent run's setup log: `Running downgrade 0002 -> 0001, tenant whatsapp` then `Running upgrade 0001 -> 0002, tenant whatsapp`).

- [x] 4.4 [GREEN] `back/tests/test_rls_structural.py`: move `test_global_table_without_tenant_id_is_not_flagged`'s triangulation subject from `tenants` to `alembic_version`, which has no `tenant_id` column, no RLS, and no grants, permanently (design D14 point 6). Do **not** weaken the assertion — the test's job is proving the audit query is driven by column presence, not a hardcoded table list, and `alembic_version` still proves that. Re-run 4.3 → green.

  **Observed:** green — `tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged PASSED`, `2 passed in 2.16s` for the file. Both assertions now read `alembic_version` (`"alembic_version" not in unprotected` and `alembic_version_has_rls is False`); the assertion shape is unchanged, only the subject moved, per instruction.

- [x] 4.5 [TEST] `back/tests/test_tenants_rls.py` (create), structural half: `pg_policies` on `tenants` contains exactly `{tenants_read/SELECT, tenants_insert/INSERT, tenants_self_update/UPDATE}`, each naming both roles; the `UPDATE` policy's `qual` and `with_check` text contains `app.tenant_id` (guards against D14's stale-predicate trap); `information_schema.column_privileges` shows `UPDATE` for `alquileres_app` on `tenants.whatsapp` and on no other column of `tenants`.

  **Observed:** green, 3 structural tests. **Note:** `pg_policies.cmd` renders as the human-readable strings `'SELECT'`/`'INSERT'`/`'UPDATE'`, not the single-character `polcmd` codes (`r`/`a`/`w`) from the underlying `pg_policy` catalog — verified empirically (first draft asserted `'r'` and failed with `AssertionError: assert 'SELECT' == 'r'`), corrected before proceeding.

- [x] 4.6 [TEST] same file, behavioural half — connect as `alquileres_app`, never `alquileres_migrator` (the migrator bypasses the policies entirely since `tenants` is not `FORCE`d): with `app.tenant_id` set to tenant A, an **unqualified** `UPDATE tenants SET whatsapp = 'x'` (deliberately omitting any `WHERE`) affects exactly 1 row and tenant B's row is unchanged; `UPDATE tenants SET slug = 'x' WHERE id = <own id>` raises a permission error (the column grant, independent of the policy); with **no** `app.tenant_id` set, `SELECT id FROM tenants WHERE slug = …` still returns the row — proving the pre-context read login and the public routes depend on is still open after enabling RLS.

  **Observed:** green, 3 behavioural tests, all connected via `app_engine` (`DATABASE_URL` → `alquileres_app`, confirmed against `docker-compose.yml`'s `test` service definition), never `migrator_engine` for the write/permission assertions. **Deviation:** the literal example value `'x'` in this task's text does not satisfy 4.2's `tenants_whatsapp_format` CHECK (`^[0-9]{8,15}$`); used `'5491122334455'` instead — a real digit string, same shape 4.9's future validator tests will use. The unqualified-UPDATE test asserts `result.rowcount == 1` then re-reads both rows via `migrator_engine` (bypasses RLS) to confirm A changed and B did not.

- [x] 4.7 **Prove the net by breaking it.** Temporarily edit `0002_tenant_whatsapp.py`'s `tenants_self_update` policy to `USING (true)` (drop the `id = …` predicate). Re-run 4.6's unqualified-`UPDATE` cross-tenant case, confirm it now fails, and record the **observed output** (the actual assertion failure / row count printed) in this task's notes — not a statement that it was done. Restore the policy's original `USING`/`WITH CHECK` predicate exactly. Re-run 4.6, confirm green, and record that output too.

  **Correction to this task's own prior record:** the first pass here broke only `USING`, leaving `WITH CHECK (id = …)` intact. That is a genuinely different, weaker break than the one this task's own instruction and `test_unqualified_update_as_tenant_a_affects_only_tenant_as_row`'s docstring describe ("if the RLS predicate were ever dropped or mis-typed, this is the statement that would silently touch every tenant row") — dropping only `USING` still leaves the real predicate live in `WITH CHECK`, so the unqualified `UPDATE` never actually reaches the row-count assertion; it aborts atomically on `InsufficientPrivilege` first. That is not the failure mode the test exists to catch. Re-run below with the correct break: **both** `USING` and `WITH CHECK` dropped to `(true)`, removing the `id = …` predicate entirely.

  **Observed — broken (`USING (true)` AND `WITH CHECK (true)`, the real regression: `id = …` removed from both clauses):**
  ```
  tests/test_tenants_rls.py::test_unqualified_update_as_tenant_a_affects_only_tenant_as_row FAILED [100%]

  ________ test_unqualified_update_as_tenant_a_affects_only_tenant_as_row ________
      with app_engine.begin() as conn:
          conn.execute(
              text("SELECT set_config('app.tenant_id', :tid, true)"),
              {"tid": str(tenant_a.id)},
          )
          result = conn.execute(text("UPDATE tenants SET whatsapp = '5491122334455'"))
  >       assert result.rowcount == 1
  E       assert 6 == 1
  E        +  where 6 = <sqlalchemy.engine.cursor.CursorResult object at 0x7f06a95e4b40>.rowcount

  tests/test_tenants_rls.py:111: AssertionError
  1 failed, 2 warnings in 4.53s
  ```
  This is the assertion the test was written to exercise, and it fails for the right reason: no permission/privilege error at all, a plain row-count mismatch. `rowcount` is `6`, not the `3` this task's text anticipated, because `scripts/seed.py`'s session-level seed (`tests/conftest.py::_reset_and_seed_test_database`, which runs once per session before any fixture) inserts its own 3 baseline demo tenants ahead of `seed_three_tenants`' 3 test tenants — 6 tenant rows total exist by the time this test runs, and with both clauses at `(true)` the unqualified `UPDATE` silently rewrites every one of them. That is a *more* convincing proof than 3-would-have-been, not a weaker one: it shows the blast radius is every row in the table, seed data included, not just the tenants this test itself created.

  **Secondary observation, kept from the first pass (still true and still worth recording):** with only `USING` dropped and `WITH CHECK (id = …)` left intact, the same unqualified `UPDATE` instead raised, before the `rowcount` assertion was ever reached:
  ```
  sqlalchemy.exc.ProgrammingError: (psycopg.errors.InsufficientPrivilege) new row violates row-level security policy for table "tenants"
  [SQL: UPDATE tenants SET whatsapp = '5491122334455']
  1 failed, 2 warnings in 5.87s
  ```
  `USING (true)` makes every row a candidate for the unqualified `UPDATE`; `WITH CHECK` then evaluates the real predicate against each candidate's *new* row and rejects the ones that aren't tenant A's, and a single `UPDATE` statement is atomic — one rejected row aborts the whole statement with `InsufficientPrivilege` rather than a silent partial write. This is genuinely useful: it shows `WITH CHECK` is an independent second lock, not decoration next to `USING`. But it is not the primary proof for this task, because it never reaches the failure mode the test's docstring and this task's own wording describe — that requires dropping both clauses, as done above.

  **Observed — restored** (`USING`/`WITH CHECK` both reading `id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`, exactly as 4.2 wrote them — confirmed byte-for-byte via `git diff back/migrations/versions/0002_tenant_whatsapp.py` returning empty):
  ```
  tests/test_tenants_rls.py::test_unqualified_update_as_tenant_a_affects_only_tenant_as_row PASSED [ 98%]
  ```
  Full suite re-run after restoring: `docker compose run --rm test` → **194 passed, 3 warnings in 70.03s** — same baseline as the first pass (188 pre-4.5 baseline + 6 in `test_tenants_rls.py`); `test_rls_structural.py` and `test_schema_is_migrated.py` both still green.
- [x] 4.8 `back/app/schemas/tenant.py` (create): `TenantRead {id, slug, name, whatsapp}` (`from_attributes=True`); `TenantUpdate {whatsapp: str | None}` with `ConfigDict(extra="forbid")` and a field validator that (a) rejects any input containing a character outside `[0-9 +().-]` **before** stripping anything — this is what stops `"llamame al 1122334455"` from being silently coerced into a valid-looking number — then (b) strips everything but digits and a leading `+`, then (c) requires 8–15 digits.

  **Observed — deviation from this task's own literal wording, stated plainly:** step (b) as written here (and in design D39's own Mechanism paragraph, which this task's wording is copied from) says the validator "strips everything but digits and a leading `+`" — i.e. keep a leading `+` in the normalised value. That directly contradicts D39's own "Representation" decision one section above it in the same design document: **"digits only, E.164 without the `+`"**, and contradicts migration `0002`'s already-verified `tenants_whatsapp_format` CHECK, `whatsapp ~ '^[0-9]{8,15}$'`, which has no `+` in its character class at all. Implementing step (b) literally (`"+5491122334455"`) produced an observed, reproduced failure: `PATCH /tenant` with a `+`-prefixed number returned **422 from the database CHECK constraint**, not from Pydantic — confirmed by running `test_patch_tenant_sets_whatsapp` before the fix (`assert 422 == 200`, `WARNING app.db:errors.py:82` logging the `23514` check-violation dispatch). Since the CHECK is the concurrency-safe backstop for this same validator (design D11: "Pydantic first, the CHECK as the backstop" — the whole pattern depends on both validating the *same final shape*), and migration `0002` is complete/verified/not-to-be-modified, resolved in favor of the DB-authoritative rule and D39's own "Representation" line: the validator strips a `+` too, same as any other separator. A `+` is still accepted as an *input* character (rejecting it outright would refuse a well-formed `"+549…"` paste) but does not survive normalisation. `back/app/schemas/tenant.py` documents this reasoning inline beside `_DIGITS_ONLY`.

- [x] 4.9 [RED] `back/tests/test_tenant_contact.py` (create): the `whatsapp` validator strips separators (spaces, dashes, parentheses) from a well-formed input; rejects letters and free text (e.g. `"llamame al 1122334455"`) rather than stripping down to the digits; rejects 7-digit and 16-digit values; accepts a leading `+`.

  **Observed:** the six pure validator tests (no DB, no HTTP) passed on first run against 4.8's already-written validator — expected for a `[RED]` task whose corresponding `[GREEN]` (4.10) is "confirmed by construction," i.e. RED/GREEN collapse into one run here since the production code came first in this pairing. The six HTTP-surface tests in the same file (`GET`/`PATCH /tenant`) failed red as expected at this point — `404 Not Found` on every one, since no `tenant` router exists yet. Full command: `docker compose run --rm test pytest tests/test_tenant_contact.py -v` → `6 failed, 6 passed`.

- [x] 4.10 [GREEN] confirmed by 4.8's validator. Re-run 4.9 → green.

  **Observed:** confirmed by construction exactly as this task predicts — the six validator tests were already green in 4.9's own run, with no separate code change attributable to 4.10.

- [x] 4.11 [RED] same file: unauthenticated `GET /tenant` → 401; `PATCH /tenant` with an extra `tenant_id` field anywhere in the body → 422 (`extra="forbid"`); an authenticated owner calling `PATCH /tenant` with `{"whatsapp": "+5491122334455"}` sets it, and an explicit `{"whatsapp": null}` clears a previously-set value, while an omitted `whatsapp` (empty body `{}`) is a no-op that leaves the existing value untouched.

  **Observed:** these are the same six HTTP tests already recorded RED under 4.9 (this task's text describes the same batch written up front, per this file's own established convention from Phase 2's task 2.1). Also added `test_patch_tenant_never_touches_another_tenants_row` (4.13's test) to the same file in the same batch. All six + the cross-tenant test failed red for the same reason: `404`, no router registered. The `set`/`sets_whatsapp` assertion uses `"+5491122334455"` as input per this task's literal example value; per 4.8's Observed note the *response* value is asserted as digits-only (`"5491122334455"`), not with the `+` retained.

- [x] 4.12 [GREEN] `back/app/api/routers/tenant.py` (create): `GET /tenant` and `PATCH /tenant` — no path parameter, no query parameter, no body field names a tenant (Layer 1); both handlers take `PrincipalDep`/`TenantSessionDep` and resolve the row via `session.get(Tenant, principal.tenant_id)` (Layer 2); `PATCH` uses `payload.model_dump(exclude_unset=True)` so omitted vs. explicit-`null` are distinguishable. `back/app/main.py`: `app.include_router(tenant.router)`. Re-run 4.11 → green.

  **Observed:** green on first implementation, with one intermediate failure along the way (not a second RED cycle for this task, but worth recording plainly): `test_patch_tenant_sets_whatsapp` failed once with `assert 422 == 200` because the router correctly rejected a `+`-prefixed value against the DB CHECK, which is what surfaced 4.8's deviation above and was fixed there, not here. After that fix, full file run: `docker compose run --rm test pytest tests/test_tenant_contact.py -v` → **12 passed**.

- [x] 4.13 [RED] same file: an owner of Tenant A calls `PATCH /tenant` (no tenant identifier available to supply, by construction) and Tenant B's `whatsapp` remains unchanged — the end-to-end HTTP proof of D38 Layers 1+2, distinct from 4.6's raw-SQL proof of Layer 4.

  **Observed:** written and run in the same up-front batch as 4.11 (see that task's note) — `test_patch_tenant_never_touches_another_tenants_row` failed red alongside the other five for the same reason (`404`, no router yet), using `seed_three_tenants` for a real two-tenant scenario rather than `registered_owner` (only one tenant identity available from that fixture).

- [x] 4.14 [GREEN] confirmed by 4.12's implementation (the predicate is always `principal.tenant_id`, which decodes from Tenant A's own token). Re-run 4.13 → green.

  **Observed:** green — confirmed by construction as this task predicts, no code beyond 4.12's own handler. Full suite `docker compose run --rm test` → **206 passed, 3 warnings in 57.59s** (194 baseline + 12 new tests in `test_tenant_contact.py`). Targeted re-run of the new file alone → **12 passed in 3.35s**.
- [x] 4.15 `back/app/schemas/public.py`: add `PublicContact {name: str, whatsapp: str | None}` with `ConfigDict(extra="forbid")`, sharing no base class with `PublicAvailability` or any authenticated schema (D9's layer-2 pattern, applied to the second public surface).

  **Observed:** added exactly as specified — `PublicContact(BaseModel)` declared independently, no shared base with `PublicAvailability` (both derive directly from `pydantic.BaseModel`). `git diff` confirms `PublicAvailability`'s own class body was not touched by a single line.

- [x] 4.16 `back/app/services/public.py`: add `get_public_contact(session, *, slug: str) -> ...` — a column projection `select(Tenant.name, Tenant.whatsapp).where(Tenant.slug == slug)`, reading only `tenants`, no join to any tenant-scoped table. `get_public_availability()` and its query are not touched by a single line.

  **Observed:** added as specified, returning `PublicContact | None` (`None` when the slug resolves to no row — a defensive branch the router turns into a 404, mirroring `GET /tenant`'s own defensive `None` check). `git diff` shows only import-line additions (`Tenant`, `PublicContact`) plus the new function appended after `get_public_availability`; `get_public_availability()`'s own body has zero changed lines.

- [x] 4.17 `back/app/api/routers/public.py`: add `GET /public/{tenant_slug}/contact`, depending on `PublicSessionDep` for the 404 (unknown slug), then re-reading `tenants` by slug via 4.16's projection — a second lookup, accepted deliberately (design D40) rather than widening `PublicSessionDep` to carry tenant columns. Returns `PublicContact` with `whatsapp: null` (HTTP 200, not 404 or an omitted field) when unset.

  **Observed:** added as specified. `git diff` shows only import-line additions (`Path`, `errors`, `PublicContact`, `get_public_contact`) plus the new route appended after `public_availability`; the existing `public_availability` handler's body is unchanged.

- [x] 4.18 [RED] `back/tests/test_tenant_contact.py` (extend): an unknown slug on the contact route → 404; a valid slug with a configured `whatsapp` → 200 with `{name, whatsapp}`; a valid slug with no `whatsapp` set → 200 with `whatsapp: null`; inspecting `PublicContact`'s fields finds none of `client_name`, `client_phone`, `email`, `national_id`, `price`, `total`, `amount`, `payment`, `reservation_id`, `property_id`.

  **Observed:** same collapse as 4.9/4.10's own precedent in this file — the four new tests passed on first run because 4.15–4.17's production code was already written. `docker compose run --rm test pytest tests/test_tenant_contact.py -v` → **16 passed** (12 baseline + 4 new: `test_public_contact_unknown_slug_returns_404`, `test_public_contact_returns_name_and_configured_whatsapp`, `test_public_contact_returns_null_whatsapp_when_unset`, `test_public_contact_model_carries_no_private_fields`).

- [x] 4.19 [GREEN] confirmed by 4.15–4.17's implementation. Re-run 4.18 → green.

  **Observed:** confirmed by construction as this task predicts — no code beyond 4.15–4.17's own implementation. All 16 tests in the file green, as recorded under 4.18.

- [x] 4.20 [RED] `back/tests/test_public_contract.py` (extend): seed a distinctive `whatsapp` value on a tenant; assert it appears in `GET /public/{slug}/contact`'s response and does **not** appear anywhere in the raw bytes of `GET /public/{slug}/availability`'s response — same string-absence shape as the existing private-data contract test in this file.

  **Observed:** `test_public_contact_whatsapp_absent_from_availability_raw_bytes` added, passed on first run against the already-written 4.15–4.17 implementation (same collapse as 4.18, production code preceded the test in this pairing). `docker compose run --rm test pytest tests/test_public_contract.py -v` → **6 passed** (5 baseline + 1 new).

- [x] 4.21 [GREEN] confirmed by construction (`get_public_availability()` is untouched, per 4.16's note). Re-run 4.20 → green.

  **Observed:** confirmed by construction, no code change — `get_public_availability()`'s body has zero changed lines (verified via `git diff back/app/services/public.py`, the only additions are the new import and the new `get_public_contact` function appended after it). Full suite `docker compose run --rm test` → **211 passed, 3 warnings in 48.25s** (206 baseline + 5 new tests: 4 in `test_tenant_contact.py`, 1 in `test_public_contract.py`). `openspec validate frontend-api-alignment --strict` → **valid**. Phase 4 is now closed (4.1–4.21, 21/21).

## Phase 5: Payment Method + Purpose (`payment-tracking`) — migration `0003`

> **Spec/design reconciliation, flagged before writing code (task 5.1):**
> `openspec/changes/frontend-api-alignment/specs/payment-tracking/spec.md`'s
> "Payment Method Is A Stored Enum" requirement currently names the stored
> values as `efectivo`/`transferencia`/`otro`. `design.md`'s D41 and its
> "Owner decisions" closing section resolve Open Question 2 the other way —
> **English stored values (`cash`, `transfer`, `other`), Spanish display
> labels** — following the precedent `reservations.status` already set. The
> spec's wording predates that resolution. This task list follows
> `design.md`'s later, owner-approved resolution, and 5.1 corrects the spec
> wording so the artifact trail agrees with what gets built.

> **Ordering rationale — this phase was reordered before implementation,
> and the reasons are part of the contract.** An earlier draft ran
> migration → model → schema → test → router. Three defects came out of
> reviewing it, and the order below exists to answer them:
>
> 1. **The migration makes `payment_method` mandatory before anything
>    supplies it.** `Payment(...)` is constructed in exactly ONE place in
>    the entire codebase (`back/app/api/routers/payments.py`), and every
>    test creates payments through the HTTP API. The moment `0003` runs its
>    `alter_column(server_default=None)`, every payment `INSERT` violates
>    `NOT NULL` until the router supplies the value — breaking nine test
>    files (`test_payments`, `test_refunds`, `test_dashboard_collected`,
>    `test_reservation_balance`, `test_isolation_payments`,
>    `test_isolation_dashboard`, `test_client_reactivation`,
>    `test_public_contract`, `test_schema_no_derived_columns`) plus
>    `test_schema_is_migrated`'s model-to-migration diff. That is a broken
>    suite, not a designed RED, and a broken suite is where a real
>    regression hides. The DDL and the write path that satisfies it are
>    therefore **one task** (5.3): the minimum *coherent* unit, not the
>    minimum number of lines. A mandatory column nobody fills is not an
>    intermediate state of the system — it is a system that does not run.
> 2. **Production code must not precede the first RED.** With the schema's
>    `Literal` already in place, two of the three assertions in the old
>    method test would have passed on the day they were written. The tests
>    move ahead of the code (5.2) so all three genuinely fail first.
> 3. **A test that cannot fail must not be labelled `[RED]`.** The CHECK
>    backstop test was tagged `[RED]`, but the constraint it exercises
>    lands with the migration, so it passes the moment it is written. It is
>    now `[TEST]` (5.5) — a real and necessary proof, honestly labelled.
>
> Tasks 5.6–5.9 are unchanged from the earlier draft: pure unit test before
> the function, integration test before the router change. That part was
> already correct TDD.

- [ ] 5.1 `openspec/changes/frontend-api-alignment/specs/payment-tracking/spec.md`: correct "Payment Method Is A Stored Enum" to name the stored values as `cash`, `transfer`, `other` (English) rather than `efectivo`/`transferencia`/`otro`, with a note that these map to the Spanish labels `Efectivo`/`Transferencia`/`Otro` at display time only, matching `reservations.status`'s existing stored-value/display-label split. Update the requirement's two scenarios' example values accordingly (`method = "transfer"` accepted, `method = "card"` or similar unrecognized value rejected). Run `openspec validate frontend-api-alignment --strict` afterwards — it passes today and must keep passing.

- [ ] 5.2 [RED] `back/tests/test_payments.py` (extend), written **before** any of 5.3's production code exists, so that all three assertions genuinely fail: recording a payment **without** `method` → 422 (today it is silently accepted, so this fails); recording one with `method = "card"` → 422 (today accepted); recording one with `method = "transfer"` is accepted and the stored row reports `method = "transfer"` on read (today the field does not exist in the response). Run and record all three failures — if any of them passes at this point, STOP and report it rather than proceeding, because it would mean the field already exists somewhere and the rest of this phase rests on a false premise.

- [ ] 5.3 [GREEN] **One coherent unit — the DDL and the write path that satisfies it land together** (see Ordering rationale 1). Do the four sub-steps in this order, and run the suite only at the end:

  **(a)** `back/migrations/versions/0003_payment_method.py` (create): `op.add_column("payments", sa.Column("payment_method", sa.String(20), nullable=False, server_default="other"))` then `op.alter_column("payments", "payment_method", server_default=None)` then `op.create_check_constraint("payments_method_valid", "payments", "payment_method IN ('cash', 'transfer', 'other')")`. **The DDL-default-then-drop sequence is required, not decoration:** `payments` is `FORCE ROW LEVEL SECURITY` with a policy predicated on `app.tenant_id` (`back/migrations/versions/0001_baseline.py`), which is unset inside a migration — an `UPDATE payments SET payment_method = 'other'` run here would silently touch **zero rows**, even though the migrator owns the table, because that is precisely what `FORCE` does. `ADD COLUMN ... DEFAULT` is DDL and is not subject to RLS at all; it fills every existing row identically whether the table is empty or populated. **Never `UPDATE` inside a migration against a `FORCE`d tenant-scoped table** — this is the general rule this task is the first exercise of, and it is the same family of hazard Phase 4 recorded: RLS denies silently, so the statement reports success and changes nothing. `downgrade()` drops the constraint then the column, and is lossy (documented, not fixed here — see design D45's Rollback section).

  **(b)** `back/app/models/payment.py`: add `PAYMENT_METHODS = ("cash", "transfer", "other")` (mirroring `RESERVATION_STATUSES`'s pattern) and a `payment_method: Mapped[str] = mapped_column(String(20), nullable=False)` column — no Python-side default; only the owner knows how money arrived, so the API must always supply it (same rule `paid_on` already follows). Keeping this in the same task as (a) is also what stops `test_schema_is_migrated.py`'s `compare_metadata()` from reporting model-to-migration drift as an unexplained failure.

  **(c)** `back/app/schemas/payment.py`: `PaymentCreate.method: Literal["cash", "transfer", "other"]` (required, no default); `PaymentRead.purpose: Literal["deposit", "payment", "refund"]` (required, never null).

  **(d)** `back/app/api/routers/payments.py`: `create_payment` passes `payment_method=payload.method` into `Payment(...)` — the single construction site in the codebase.

  Re-run 5.2 → green, then run the full suite and confirm the nine payment-creating test files are green too. Record the count.

- [ ] 5.4 [TEST] Run `docker compose run --rm test` — confirm the session fixture's `alembic downgrade base` → `upgrade head` cycle (design D15) exercises 0003's `upgrade()` and `downgrade()` cleanly. This check is meaningful only on an otherwise-green suite, which is why it follows 5.3 rather than the migration: a failure here is now unambiguously about the migration cycle and nothing else. Record the observed output.

- [ ] 5.5 [TEST] `back/tests/test_payments.py` (extend): a direct SQL `INSERT ... payment_method = 'cheque'` as `alquileres_app` raises `23514`. **Labelled `[TEST]`, not `[RED]`, deliberately** — the `payments_method_valid` CHECK lands with 5.3(a), so this test passes the moment it is written and can never have a red phase. It is still necessary: it proves the concurrency-safe database backstop exists independently of the Pydantic 422 path in 5.2, which is the whole point of the house pattern (D11). Connect as `alquileres_app`, never `alquileres_migrator`.

- [ ] 5.6 [RED] `back/tests/test_payments.py` (extend): a pure, no-DB unit test for a new `assign_purposes()` function — among a list of payments, the earliest positive `paid_on` is labeled `"deposit"`, every other positive one `"payment"`, a negative-amount entry is labeled `"refund"` (or excluded from the deposit/payment labeling, per its own case); two same-`paid_on` positive payments produce a stable label across repeated calls (tie-break by `created_at`, then `id`).

- [ ] 5.7 [GREEN] `back/app/services/payments.py` (create — the fourth service module, deliberately, per design D3/D42): `assign_purposes(payments: Sequence[Payment]) -> dict[uuid.UUID, str]`, ordering key `(paid_on, created_at, id)`, only positive amounts are deposit/payment candidates. Re-run 5.6 → green.

- [ ] 5.8 [RED] `back/tests/test_payments.py` (extend, integration): a reservation where a payment dated `2026-03-02` is **recorded first** and a payment dated `2026-01-05` is **recorded second** — reading the payments list presents the `2026-01-05` one as `"deposit"` and the `2026-03-02` one as `"payment"` (ordering by `paid_on`, never insertion order); a reservation with one positive payment and one refund presents the refund as neither `"deposit"` nor `"payment"`.

- [ ] 5.9 [GREEN] `back/app/api/routers/payments.py`: `list_payments` labels every `PaymentRead.purpose` via `assign_purposes()` over the full ordered list; `create_payment` re-selects the reservation's payments after its existing `session.flush()` and labels the new row from the same function (one extra `SELECT` on the write path, so `purpose`'s absence never means two different things). Re-run 5.8 → green.

- [ ] 5.10 `back/tests/test_schema_no_derived_columns.py`: add `"purpose"` to `_FORBIDDEN_COLUMN_NAMES`. Run the full suite — confirm still green (no `purpose` column exists anywhere; it is Python-only, over rows already in hand).

---

## Task Count Summary

| Phase | Capability | Tasks | Notes |
|---|---|---|---|
| 1 | `client-management` / `payment-tracking` | 6 (1.1–1.6) | No migration. Ships first — unblocks every later guest-balance display |
| 2 | `reservation-booking` | 15 (2.1–2.15) | No migration |
| 3 | `client-management` | 1 (3.1) | Closed as no code (D47) — decision + tripwire recorded, no endpoint |
| 4 | `tenant-management` / `tenant-isolation` / `public-tenant-contact` / `public-availability-calendar` | 21 (4.1–4.21) | Migration `0002`. 1 BLOCKING human-approval gate (4.1, covers D38+D39). Internal order enforced: RLS proven before the write endpoint exists |
| 5 | `payment-tracking` | 10 (5.1–5.10) | Migration `0003`. Reordered before implementation: tests precede production code, and the DDL ships with the write path that satisfies it (see the phase's Ordering rationale). Starts with a spec-wording correction (English stored values, per design's later resolution) |
| **Total** | | **53** | 1 BLOCKING human-approval gate |
