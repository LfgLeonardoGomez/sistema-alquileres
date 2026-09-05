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

- [ ] 3.1 **No endpoint, no field — record the decision and its tripwire, not an implementation.** Per binding input 1 and design D47: once Phase 1 makes a cancelled reservation's `balance` read `0`, a guest's outstanding balance is the plain sum of that guest's reservation balances, and Phase 2's `client_id` filter already puts that list in the frontend's hands. Add a short docstring note to `back/app/schemas/client.py`'s `ClientRead` class (immediately above the class, beside the existing `is_active` note) recording: no `stay_count`/`outstanding_balance` field exists on this model, no new endpoint exists, and no SQL aggregate exists, by design (D47) — and the tripwire that reverses it: add the server-side aggregate the day a second consumer of this data appears, or a screen renders a reservation without having loaded that guest's full reservation list. Do not add a `stay_count` or `outstanding_balance` field. Do not add an endpoint.

## Phase 4: Tenant Public Contact (`tenant-management`, `tenant-isolation`, `public-tenant-contact`, `public-availability-calendar`) — CRITICAL, migration `0002`

> **Internal order is a correctness property (design D38/Slicing):** the
> migration and its RLS tests (4.2–4.7) land and are proven green **before**
> `PATCH /tenant` (4.8+) exists. The backstop must be a claim about the
> database before it is a claim about a handler.

- [ ] 4.1 **[BLOCKING — HUMAN APPROVAL REQUIRED]** D38 (enables Row-Level Security on `tenants` for the first time, per-command, no `FORCE`) and D39 (the first write path this system has ever had to that table) are CRITICAL domain (`tenant-isolation`). `design.md`'s own closing section states plainly: "Still blocking implementation... not approved by any document." Present to a human, for explicit sign-off, before writing 4.2: the exact DDL (`GRANT UPDATE (whatsapp) ON tenants TO alquileres_app`; `ENABLE ROW LEVEL SECURITY` with **no** `FORCE`; the three policies `tenants_read`/`tenants_insert`/`tenants_self_update` and their predicates copied verbatim from `back/migrations/versions/0001_baseline.py:67-69`); the four-layer defense argument (no tenant identifier in the request surface, predicate from the verified `tid` claim, column-scoped grant, per-command RLS); and the fact that `back/tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged` will go red and its triangulation subject must move to `alembic_version` rather than have its assertion weakened. **Do not write 4.2 until this is approved.**

- [ ] 4.2 `back/migrations/versions/0002_tenant_whatsapp.py` (create): `op.add_column("tenants", sa.Column("whatsapp", sa.String(20), nullable=True))`; `CHECK (whatsapp ~ '^[0-9]{8,15}$')` named `tenants_whatsapp_format`; `GRANT UPDATE (whatsapp) ON tenants TO alquileres_app` — the app role holds only `SELECT, INSERT` on `tenants` today (`back/migrations/versions/0001_baseline.py:246`), and PostgreSQL checks column privileges independently of RLS, so this is the layer that makes `UPDATE tenants SET slug = …` `ERROR: permission denied for column slug` regardless of policy; `ALTER TABLE tenants ENABLE ROW LEVEL SECURITY` with **no** `FORCE` (deliberate: `alquileres_app` is not the table owner, so plain `ENABLE` binds it completely, and `FORCE` would only constrain the migrator while imposing a "set `app.tenant_id` before every seed insert" rule that `back/tests/conftest.py::_seed_one_tenant` already violates by inserting the tenant row before calling `set_config`); three policies naming both `alquileres_app` and `alquileres_migrator` — `tenants_read FOR SELECT USING (true)`, `tenants_insert FOR INSERT WITH CHECK (true)` (both deliberately as permissive as no RLS at all, so login's and the public routes' pre-context reads are unaffected by construction), `tenants_self_update FOR UPDATE USING/WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)` — **the predicate copied verbatim from `back/migrations/versions/0001_baseline.py:67-69`, never retyped**. No `DELETE` policy and no `DELETE` grant. `downgrade()`: drop the three policies, `DISABLE ROW LEVEL SECURITY`, drop the CHECK, drop the column — the column-scoped grant dies with the column, nothing to revoke explicitly.
- [ ] 4.3 [TEST] Run `docker compose run --rm test`. The session fixture's `alembic downgrade base` → `upgrade head` cycle (design D15) now exercises 0002's `downgrade()` for the first time. Observe and record whether `back/tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged` now fails — expected, because `tenants.relrowsecurity` is `true` for the first time and that test's whole point is asserting it is `false`. This is the natural RED for 4.4, not a regression to fix by weakening the assertion.
- [ ] 4.4 [GREEN] `back/tests/test_rls_structural.py`: move `test_global_table_without_tenant_id_is_not_flagged`'s triangulation subject from `tenants` to `alembic_version`, which has no `tenant_id` column, no RLS, and no grants, permanently (design D14 point 6). Do **not** weaken the assertion — the test's job is proving the audit query is driven by column presence, not a hardcoded table list, and `alembic_version` still proves that. Re-run 4.3 → green.
- [ ] 4.5 [TEST] `back/tests/test_tenants_rls.py` (create), structural half: `pg_policies` on `tenants` contains exactly `{tenants_read/SELECT, tenants_insert/INSERT, tenants_self_update/UPDATE}`, each naming both roles; the `UPDATE` policy's `qual` and `with_check` text contains `app.tenant_id` (guards against D14's stale-predicate trap); `information_schema.column_privileges` shows `UPDATE` for `alquileres_app` on `tenants.whatsapp` and on no other column of `tenants`.
- [ ] 4.6 [TEST] same file, behavioural half — connect as `alquileres_app`, never `alquileres_migrator` (the migrator bypasses the policies entirely since `tenants` is not `FORCE`d): with `app.tenant_id` set to tenant A, an **unqualified** `UPDATE tenants SET whatsapp = 'x'` (deliberately omitting any `WHERE`) affects exactly 1 row and tenant B's row is unchanged; `UPDATE tenants SET slug = 'x' WHERE id = <own id>` raises a permission error (the column grant, independent of the policy); with **no** `app.tenant_id` set, `SELECT id FROM tenants WHERE slug = …` still returns the row — proving the pre-context read login and the public routes depend on is still open after enabling RLS.
- [ ] 4.7 **Prove the net by breaking it.** Temporarily edit `0002_tenant_whatsapp.py`'s `tenants_self_update` policy to `USING (true)` (drop the `id = …` predicate). Re-run 4.6's unqualified-`UPDATE` cross-tenant case, confirm it now fails, and record the **observed output** (the actual assertion failure / row count printed) in this task's notes — not a statement that it was done. Restore the policy's original `USING`/`WITH CHECK` predicate exactly. Re-run 4.6, confirm green, and record that output too.
- [ ] 4.8 `back/app/schemas/tenant.py` (create): `TenantRead {id, slug, name, whatsapp}` (`from_attributes=True`); `TenantUpdate {whatsapp: str | None}` with `ConfigDict(extra="forbid")` and a field validator that (a) rejects any input containing a character outside `[0-9 +().-]` **before** stripping anything — this is what stops `"llamame al 1122334455"` from being silently coerced into a valid-looking number — then (b) strips everything but digits and a leading `+`, then (c) requires 8–15 digits.
- [ ] 4.9 [RED] `back/tests/test_tenant_contact.py` (create): the `whatsapp` validator strips separators (spaces, dashes, parentheses) from a well-formed input; rejects letters and free text (e.g. `"llamame al 1122334455"`) rather than stripping down to the digits; rejects 7-digit and 16-digit values; accepts a leading `+`.
- [ ] 4.10 [GREEN] confirmed by 4.8's validator. Re-run 4.9 → green.
- [ ] 4.11 [RED] same file: unauthenticated `GET /tenant` → 401; `PATCH /tenant` with an extra `tenant_id` field anywhere in the body → 422 (`extra="forbid"`); an authenticated owner calling `PATCH /tenant` with `{"whatsapp": "+5491122334455"}` sets it, and an explicit `{"whatsapp": null}` clears a previously-set value, while an omitted `whatsapp` (empty body `{}`) is a no-op that leaves the existing value untouched.
- [ ] 4.12 [GREEN] `back/app/api/routers/tenant.py` (create): `GET /tenant` and `PATCH /tenant` — no path parameter, no query parameter, no body field names a tenant (Layer 1); both handlers take `PrincipalDep`/`TenantSessionDep` and resolve the row via `session.get(Tenant, principal.tenant_id)` (Layer 2); `PATCH` uses `payload.model_dump(exclude_unset=True)` so omitted vs. explicit-`null` are distinguishable. `back/app/main.py`: `app.include_router(tenant.router)`. Re-run 4.11 → green.
- [ ] 4.13 [RED] same file: an owner of Tenant A calls `PATCH /tenant` (no tenant identifier available to supply, by construction) and Tenant B's `whatsapp` remains unchanged — the end-to-end HTTP proof of D38 Layers 1+2, distinct from 4.6's raw-SQL proof of Layer 4.
- [ ] 4.14 [GREEN] confirmed by 4.12's implementation (the predicate is always `principal.tenant_id`, which decodes from Tenant A's own token). Re-run 4.13 → green.
- [ ] 4.15 `back/app/schemas/public.py`: add `PublicContact {name: str, whatsapp: str | None}` with `ConfigDict(extra="forbid")`, sharing no base class with `PublicAvailability` or any authenticated schema (D9's layer-2 pattern, applied to the second public surface).
- [ ] 4.16 `back/app/services/public.py`: add `get_public_contact(session, *, slug: str) -> ...` — a column projection `select(Tenant.name, Tenant.whatsapp).where(Tenant.slug == slug)`, reading only `tenants`, no join to any tenant-scoped table. `get_public_availability()` and its query are not touched by a single line.
- [ ] 4.17 `back/app/api/routers/public.py`: add `GET /public/{tenant_slug}/contact`, depending on `PublicSessionDep` for the 404 (unknown slug), then re-reading `tenants` by slug via 4.16's projection — a second lookup, accepted deliberately (design D40) rather than widening `PublicSessionDep` to carry tenant columns. Returns `PublicContact` with `whatsapp: null` (HTTP 200, not 404 or an omitted field) when unset.
- [ ] 4.18 [RED] `back/tests/test_tenant_contact.py` (extend): an unknown slug on the contact route → 404; a valid slug with a configured `whatsapp` → 200 with `{name, whatsapp}`; a valid slug with no `whatsapp` set → 200 with `whatsapp: null`; inspecting `PublicContact`'s fields finds none of `client_name`, `client_phone`, `email`, `national_id`, `price`, `total`, `amount`, `payment`, `reservation_id`, `property_id`.
- [ ] 4.19 [GREEN] confirmed by 4.15–4.17's implementation. Re-run 4.18 → green.
- [ ] 4.20 [RED] `back/tests/test_public_contract.py` (extend): seed a distinctive `whatsapp` value on a tenant; assert it appears in `GET /public/{slug}/contact`'s response and does **not** appear anywhere in the raw bytes of `GET /public/{slug}/availability`'s response — same string-absence shape as the existing private-data contract test in this file.
- [ ] 4.21 [GREEN] confirmed by construction (`get_public_availability()` is untouched, per 4.16's note). Re-run 4.20 → green.

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

- [ ] 5.1 `openspec/changes/frontend-api-alignment/specs/payment-tracking/spec.md`: correct "Payment Method Is A Stored Enum" to name the stored values as `cash`, `transfer`, `other` (English) rather than `efectivo`/`transferencia`/`otro`, with a note that these map to the Spanish labels `Efectivo`/`Transferencia`/`Otro` at display time only, matching `reservations.status`'s existing stored-value/display-label split. Update the requirement's two scenarios' example values accordingly (`method = "transfer"` accepted, `method = "card"` or similar unrecognized value rejected).
- [ ] 5.2 `back/migrations/versions/0003_payment_method.py` (create): `op.add_column("payments", sa.Column("payment_method", sa.String(20), nullable=False, server_default="other"))` then `op.alter_column("payments", "payment_method", server_default=None)` then `op.create_check_constraint("payments_method_valid", "payments", "payment_method IN ('cash', 'transfer', 'other')")`. **The DDL-default-then-drop sequence is required, not decoration:** `payments` is `FORCE ROW LEVEL SECURITY` with a policy predicated on `app.tenant_id` (`back/migrations/versions/0001_baseline.py`), which is unset inside a migration — an `UPDATE payments SET payment_method = 'other'` run here would silently touch **zero rows**, even though the migrator owns the table, because that is precisely what `FORCE` does. `ADD COLUMN ... DEFAULT` is DDL and is not subject to RLS at all; it fills every existing row identically whether the table is empty or populated. **Never `UPDATE` inside a migration against a `FORCE`d tenant-scoped table** — this is the general rule this task is the first exercise of. `downgrade()` drops the constraint then the column, and is lossy (documented, not fixed here — see design D45's Rollback section).
- [ ] 5.3 [TEST] Run `docker compose run --rm test` — confirm the session fixture's `downgrade base` → `upgrade head` cycle (design D15) exercises 0003's `upgrade()`/`downgrade()` cleanly.
- [ ] 5.4 `back/app/models/payment.py`: add `PAYMENT_METHODS = ("cash", "transfer", "other")` (mirroring `RESERVATION_STATUSES`'s pattern) and a `payment_method: Mapped[str] = mapped_column(String(20), nullable=False)` column — no Python-side default; only the owner knows how money arrived, so the API must always supply it (same rule `paid_on` already follows).
- [ ] 5.5 `back/app/schemas/payment.py`: `PaymentCreate.method: Literal["cash", "transfer", "other"]` (required, no default); `PaymentRead.purpose: Literal["deposit", "payment", "refund"]` (required, never null).
- [ ] 5.6 [RED] `back/tests/test_payments.py` (extend): recording a payment without `method` → 422; recording one with `method = "card"` → 422; recording one with `method = "transfer"` is accepted and the stored row reports `method = "transfer"` on read.
- [ ] 5.7 [GREEN] `back/app/api/routers/payments.py`: `create_payment` passes `payment_method=payload.method` into `Payment(...)`. Re-run 5.6 → green.
- [ ] 5.8 [RED] same file: a direct SQL `INSERT ... payment_method = 'cheque'` as `alquileres_app` raises `23514` — the concurrency-safe backstop distinct from the Pydantic 422 path in 5.6.
- [ ] 5.9 [GREEN] confirmed by 5.2's `payments_method_valid` CHECK. Re-run 5.8 → green.
- [ ] 5.10 [RED] `back/tests/test_payments.py` (extend): a pure, no-DB unit test for a new `assign_purposes()` function — among a list of payments, the earliest positive `paid_on` is labeled `"deposit"`, every other positive one `"payment"`, a negative-amount entry is labeled `"refund"` (or excluded from the deposit/payment labeling, per its own case); two same-`paid_on` positive payments produce a stable label across repeated calls (tie-break by `created_at`, then `id`).
- [ ] 5.11 [GREEN] `back/app/services/payments.py` (create — the fourth service module, deliberately, per design D3/D42): `assign_purposes(payments: Sequence[Payment]) -> dict[uuid.UUID, str]`, ordering key `(paid_on, created_at, id)`, only positive amounts are deposit/payment candidates. Re-run 5.10 → green.
- [ ] 5.12 [RED] `back/tests/test_payments.py` (extend, integration): a reservation where a payment dated `2026-03-02` is **recorded first** and a payment dated `2026-01-05` is **recorded second** — reading the payments list presents the `2026-01-05` one as `"deposit"` and the `2026-03-02` one as `"payment"` (ordering by `paid_on`, never insertion order); a reservation with one positive payment and one refund presents the refund as neither `"deposit"` nor `"payment"`.
- [ ] 5.13 [GREEN] `back/app/api/routers/payments.py`: `list_payments` labels every `PaymentRead.purpose` via `assign_purposes()` over the full ordered list; `create_payment` re-selects the reservation's payments after its existing `session.flush()` and labels the new row from the same function (one extra `SELECT` on the write path, so `purpose`'s absence never means two different things). Re-run 5.12 → green.
- [ ] 5.14 `back/tests/test_schema_no_derived_columns.py`: add `"purpose"` to `_FORBIDDEN_COLUMN_NAMES`. Run the full suite — confirm still green (no `purpose` column exists anywhere; it is Python-only, over rows already in hand).

---

## Task Count Summary

| Phase | Capability | Tasks | Notes |
|---|---|---|---|
| 1 | `client-management` / `payment-tracking` | 6 (1.1–1.6) | No migration. Ships first — unblocks every later guest-balance display |
| 2 | `reservation-booking` | 15 (2.1–2.15) | No migration |
| 3 | `client-management` | 1 (3.1) | Closed as no code (D47) — decision + tripwire recorded, no endpoint |
| 4 | `tenant-management` / `tenant-isolation` / `public-tenant-contact` / `public-availability-calendar` | 21 (4.1–4.21) | Migration `0002`. 1 BLOCKING human-approval gate (4.1, covers D38+D39). Internal order enforced: RLS proven before the write endpoint exists |
| 5 | `payment-tracking` | 14 (5.1–5.14) | Migration `0003`. Starts with a spec-wording correction (English stored values, per design's later resolution) |
| **Total** | | **57** | 1 BLOCKING human-approval gate |
