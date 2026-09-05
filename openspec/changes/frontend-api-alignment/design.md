# Design: Frontend API Alignment

> **GOVERNANCE — READ BEFORE IMPLEMENTING.** D38 and D39 touch `tenant-isolation`, a **CRITICAL** domain: they add the first write in this system to a table that has no RLS today, and they change the RLS state of the one table every login and every public page load reads. Those two decisions are a *proposal awaiting explicit human approval*. Slice 4 must ship as its own reviewable slice, never folded into a batch. No approval is implied by the existence of this document.

> **Size note.** Deliberately over budget, following both archived designs. Ten decisions; two of them change the protection of the most load-bearing table in the schema, and one of those changes a currently-passing test in a way a reviewer will misread as a regression. Compressing that would be false economy.

> **Numbering.** Continues from `cabin-booking-frontend` (D25–D37), which continued from `production-readiness` (D13–D24), which continued from `cabin-booking-api` (D1–D12). Nothing in D1–D37 is superseded here. **D38 amends D5's "`tenants` is a global table with no RLS"** — see the decision for why that is an amendment and not a contradiction.

## Binding inputs (already decided, not reopened here)

1. **A cancelled reservation owes nothing; its balance is 0.** Recorded payments stay visible. A cancelled stay is not counted as an "estadía" but still appears in a guest's stay list marked `Cancelada`. (Owner, 2026-09-04.)
2. **Slice 2 — per-guest aggregates — is expected to ship as no code**, because input 1 makes a guest's outstanding balance a plain sum over reservations the frontend already has. D47 closes this formally.
3. **Names are not embedded in `ReservationRead`.** Argued down to zero code in the proposal; the frontend resolves ids from cached `/clients` and `/properties`.
4. **Cookie sessions and password recovery are out of scope.** Across Vercel and Railway's own domains a session cookie is a third-party cookie and would not work; the trigger that reopens both together is the custom-domain purchase.
5. **`POST /auth/login`, `POST /auth/register` and `RegisterRequest` are untouched.**

**Open Question 1 is resolved by inspection, not left open.** `GET /properties?include_inactive=true` exists today (`app/api/routers/properties.py:33-41`), with the same shape as `/clients`. Binding input 3 therefore stands with no additional work: both resolution caches can be fetched including deactivated rows.

## Technical Approach

Five of the six things this change ships are additive and boring: two query parameters, two nullable-to-required columns, one computed field, one new unauthenticated read. The sixth is not, and the whole shape of this design follows from it:

> **`PATCH /tenant` would be the first write in this system with nothing beneath it.**

Every other write passes through an RLS policy that would reject a row belonging to another tenant even if the application forgot its `WHERE`. `tenants` has no such policy, deliberately (D5), because login and public slug resolution must read it *before* any tenant context exists. And the standing audit that would normally catch an unprotected table — `tests/test_rls_structural.py` — selects tables `WHERE EXISTS (… column_name = 'tenant_id')`. `tenants` has no `tenant_id` column. It is outside the net **by construction**, which is why this hazard is invisible today rather than merely unfixed.

Three standing rules from the prior designs apply throughout:

1. Never store a value derived from other stored facts.
2. The database is the authority; the app layer is for error messages.
3. A rule that can only be followed by remembering it is not a rule.

Rule 3 is the one that decides D38.

---

## Architecture Decisions

### D38 — The `tenants` write is protected by four independent layers, two of them in the database (amends D5)

The proposal named a two-way fork. Both options in it are **necessary**; the real question is whether the application-level one is **sufficient**. It is not, and the argument is not about the quality of the handler.

| Option | Tradeoff | Verdict |
|---|---|---|
| Predicate from the verified `tid` claim only, plus a dedicated cross-tenant-write test | Simplest; changes nothing about the most load-bearing table in the schema. But the protection is one `WHERE` clause in one handler, verified by one test that asserts a *handler* behaves — the same class of guarantee as "field omission on a shared model", which D9 already rejected as not a boundary. It is also the only write in the system whose safety is not a property of the schema, and nothing in the repository would ever tell a reader that. | **Rejected as the whole answer** (adopted as one layer of four) |
| Per-command RLS on `tenants`: `FOR SELECT USING (true)` beside `FOR UPDATE USING (id = …)` | More moving parts on the table login reads before it has any context. That objection dissolves once the policy is *per command*: `USING (true)` on SELECT is exactly as permissive as no RLS at all, so the pre-context reads are unaffected by construction, not by argument — and both are already covered by existing suites (`test_auth_login.py`, `test_public_contract.py`). Real cost: RLS denies **silently**, so a future command that gets a grant but no policy will appear to succeed and change nothing. | **Chosen, and it is not sufficient alone either** |
| A trigger enforcing `NEW.id = current_setting('app.tenant_id')` | Equivalent protection, but triggers are a mechanism this schema does not use anywhere; introducing one for a single column means a reader must now check for triggers on every table forever. | Rejected |
| Do nothing; publish the number out-of-band (seed/manual) and ship no write path | Genuinely on the table — Open Question 5 says the frontend has nowhere to call this. It removes the risk entirely by removing the feature. Rejected because the owner will need to change a phone number eventually, and the write path is far cheaper to get right now, alongside the migration that creates the column, than as an urgent one-off later. | Rejected (see Open Questions) |

**Chosen: all four layers below. Each one alone would be defensible; the point is that three of them are free once the fourth is being written.**

**Layer 1 — the request surface carries no tenant identifier at all.** The route is `PATCH /tenant`. Not `/tenants/{id}`, not `/tenants?id=`, and `TenantUpdate` is `{whatsapp}` with `ConfigDict(extra="forbid")`. There is no path parameter, no query parameter, and no body field that names a tenant. The proposal's success criterion reads *"an authenticated owner of Tenant A cannot change Tenant B's contact, **by any parameter**"* — the strongest possible answer to that is that **there is no parameter**, and `extra="forbid"` turns an attempt to invent one into a 422 rather than a silently ignored field.

**Layer 2 — the predicate comes from the verified `tid` claim, via the existing dependency graph.** The handler takes `PrincipalDep` and `TenantSessionDep`; it does `session.get(Tenant, principal.tenant_id)`, mutates `whatsapp`, and flushes. `principal.tenant_id` is decoded from the signed JWT in `get_current_principal` (D4/D10). No new claim path is introduced.

**Layer 3 — a column-scoped `UPDATE` grant.** This is the layer the proposal's fork did not consider, and it is the cheapest of the four:

```sql
GRANT UPDATE (whatsapp) ON tenants TO alquileres_app;
```

PostgreSQL column privileges are checked per assigned column, independently of RLS. `UPDATE tenants SET slug = …` as `alquileres_app` is `ERROR: permission denied for column slug` — regardless of the predicate, regardless of the policy, regardless of what any handler does. The app role today holds `SELECT, INSERT` on `tenants` and nothing else; this change widens that by exactly one column rather than by a verb. A future contributor who wants to write `name` from the API has to add a grant, in a migration, on purpose.

**Layer 4 — per-command RLS on `tenants`, enabled but *not* forced:**

```sql
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- NO `FORCE` -- deliberate, see below.

CREATE POLICY tenants_read ON tenants
  FOR SELECT TO alquileres_app, alquileres_migrator
  USING (true);

CREATE POLICY tenants_insert ON tenants
  FOR INSERT TO alquileres_app, alquileres_migrator
  WITH CHECK (true);

CREATE POLICY tenants_self_update ON tenants
  FOR UPDATE TO alquileres_app, alquileres_migrator
  USING      (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No DELETE policy and no DELETE grant. Deletes are denied twice over.
```

Four notes, each of which is a trap if missed:

- **The predicate is copied verbatim from `migrations/versions/0001_baseline.py`**, not retyped from this document. D14 named this exact hazard: a policy written from prose that says `app.current_tenant_id` compares against a setting nobody sets, evaluates to NULL, and denies every row while the application starts perfectly cleanly.
- **`USING (true)` on SELECT, `WITH CHECK (true)` on INSERT, are deliberately identical to today's behaviour.** This change is not tightening reads or inserts. Tightening INSERT to `id = current_setting(…)` was considered and rejected: `tests/conftest.py::_seed_one_tenant` inserts the tenant row *before* it calls `set_config`, and `scripts/seed.py` inserts with no context at all, so a strict INSERT policy would break both for no security gain — an INSERT cannot overwrite another tenant's row, and slug squatting is already gated by `REGISTRATION_TOKEN` (D10 addendum).
- **No `FORCE`, and this is an asymmetry a reader must not mistake for an omission.** Every other table in the schema is `FORCE`d, and D14 explains why: `FORCE` subjects the table *owner* to RLS, which matters because test fixtures seed as `alquileres_migrator`. Here it buys nothing and costs a standing rule. `alquileres_app` is not the owner of `tenants`, so plain `ENABLE` binds it completely — the entire threat model of this decision is an app-role write. `FORCE` would only constrain the migrator, whose `tenants` traffic is exactly the bootstrap path (`seed.py`, `conftest.py`, and any future data migration), and it would impose the standing rule "every migrator-side write to `tenants` must first set `app.tenant_id`" — a rule that can only be followed by remembering it, which rule 3 forbids. Skipping `FORCE` creates no rule to remember on the application path, because the application path is not the owner.
- **The policies name both roles anyway**, even though the migrator currently bypasses them. If `FORCE` is ever added, a policy that had silently dropped `alquileres_migrator` would deny every seed insert (D14's second named trap). Naming both now costs nothing and removes a future landmine.

**What this breaks, and why the breakage is the mechanism working.** `tests/test_rls_structural.py::test_global_table_without_tenant_id_is_not_flagged` asserts `relrowsecurity IS FALSE` for `tenants`. This change makes it true, and that test goes red. **Do not weaken the assertion to match.** That test's actual job is triangulation — proving the audit query is driven by column presence rather than a hardcoded table list — and it needs a subject with no `tenant_id` column and no RLS. `alembic_version` is exactly that, permanently (D14 point 6: it has no grants and no policies by design). Move the subject there; the test keeps its meaning and `tenants` gains an assertion of its own in the new `tests/test_tenants_rls.py` (D46).

**Residual risk, stated plainly.** RLS denies silently. If someone later adds `GRANT DELETE ON tenants` without a `FOR DELETE` policy, the delete will report success and remove nothing. That failure mode did not exist before this change. It is accepted because the alternative — no RLS — has a strictly worse silent failure, and because the structural test in D46 pins the exact policy set so an unpaired grant is visible in a diff.

### D39 — `PATCH /tenant`, and the phone number is normalised at the edge with a CHECK behind it

**Column: `tenants.whatsapp VARCHAR(20) NULL`.** Named for the channel, not for the person.

The name matters more than it looks. `public_contact` or `owner_phone` would both invite the next contributor to treat `tenants` as an owner-profile table — the exact risk the proposal names and that `tenant-management` now states as a binding rule (`tenants` holds only data that is safe to publish). `whatsapp` names a published channel. If a second channel is ever wanted, it is a second nullable column (`public_email`), not a JSON blob and not a `contacts` table: one column per channel keeps the "safe to publish" rule checkable by reading the DDL.

**Representation: digits only, E.164 without the `+`** — precisely what `wa.me/<digits>` consumes. The frontend builds the link by concatenation and never parses.

| Option | Tradeoff | Verdict |
|---|---|---|
| Store exactly as entered | Zero code. A typo produces a link to nobody, and the failure has **no symptom on the owner's side** — they see a button, prospects see a dead chat. | Rejected |
| Normalise and validate shape (strip separators, require 8–15 digits) | Catches the shapes that are certainly wrong: letters, free text, a truncated number, a pasted URL. Cannot catch a well-formed wrong number. | **Chosen** |
| Validate as an Argentine mobile (country code 54, the `9` prefix, area-code table) | Would catch more. Argentine mobile formatting is a genuine swamp (`+54 9 11 …` for WhatsApp vs `0 11 15 …` for dialling), the rules change, and a validator that rejects a *correct* number is worse than one that accepts a wrong one — it blocks the owner from a feature with no override. | Rejected |

Mechanism, following the house pattern exactly (D11: Pydantic first, the CHECK as the concurrency-safe backstop):

- A field validator on `TenantUpdate` rejects any input containing a character outside `[0-9 +().-]`, then strips everything but digits and a leading `+`, then requires 8–15 digits. Rejecting letters *before* stripping is what stops `"llamame al 1122334455"` from being silently coerced into a valid-looking number.
- `CHECK (whatsapp ~ '^[0-9]{8,15}$')`, named `tenants_whatsapp_format`, in revision 0002. A `23514` maps to 422 through the existing dispatch table with no new code.

**Honest limit:** this validates shape, never reachability. A well-formed wrong number still produces a link to nobody. The only real mitigation is a UI one — echo the resulting `wa.me/<digits>` link back to the owner so they can tap it once — and that belongs to the frontend, not here.

**Endpoints:**

| Route | Model | Notes |
|---|---|---|
| `GET /tenant` | `TenantRead {id, slug, name, whatsapp}` | Authenticated. The owner app needs the current value to prefill an edit field, and slice 4 needs a read to be testable without reaching into the database. |
| `PATCH /tenant` | body `TenantUpdate {whatsapp}`, response `TenantRead` | `model_dump(exclude_unset=True)`: an **omitted** `whatsapp` is a no-op, an **explicit `null`** clears the number. That distinction is the difference between "I did not touch it" and "take the button down", and Pydantic gives it for free only if `exclude_unset` is used. |

New router `app/api/routers/tenant.py`, new schema module `app/schemas/tenant.py`. Not folded into `auth.py`: `GET /me` is about the *user*, this is about the *tenant*, and the proposal's point stands — `PATCH /me` would write across two tables to serve one field.

### D40 — The public contact is its own route, its own model, and answers 200-with-null when unset

**Route: `GET /public/{tenant_slug}/contact`.**

| Option | Tradeoff | Verdict |
|---|---|---|
| A field on `PublicAvailability` | Simplest diff, and the failure the proposal exists to prevent: a future reader opens a privacy-boundary model, finds a contact field beside occupancy data, and cannot tell a deliberate publication from a leak that survived review. Structurally awkward too — `/availability` returns a bare `list[PublicAvailability]` of **per-property** items, so a tenant-level field either duplicates on every cabin or needs an envelope, which is a breaking change to the one endpoint whose contract must not move. | **Rejected** |
| `GET /public/{slug}` — the tenant's public resource | Natural REST. It is also an open invitation: a route named after the *entity* accretes whatever is "public about a tenant", which is how `tenants` becomes an owner-profile table one field at a time. | Rejected |
| **`GET /public/{slug}/contact`** | Two unauthenticated surfaces instead of one (accepted; this is the least dangerous read in the system — it touches only `tenants`, which by rule holds nothing private). In exchange the URL itself states what the endpoint publishes, so a reviewer reading the router cannot mistake it for a general tenant resource. | **Chosen** |

**Model — `app/schemas/public.py`, mirroring D9's three layers:**

```python
class PublicContact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    whatsapp: str | None
```

No shared base class with any authenticated schema (D9 layer 2). The query is a column projection over `tenants` **only** — `select(Tenant.name, Tenant.whatsapp).where(Tenant.slug == slug)` (D9 layer 1). `PublicAvailability`, `get_public_availability()`, and the availability route are **not touched by a single line**; the D9 contract test is extended to assert the availability response body still contains no tenant contact value (D46).

`name` is included because the public page renders the owner's business name in its header and the alternative is hard-coding it in the frontend. It is within the proposal's own wording ("the tenant's public identity and contact") and within the binding `tenant-management` rule: everything on `tenants` is publishable by definition.

**When no number is set: `200` with `{"name": …, "whatsapp": null}`. Not `404`, not an omitted field.**

A 404 would make "this tenant does not exist" and "this owner has not set a number" indistinguishable, and those need different frontend behaviour: the first is a bad URL and deserves a not-found page, the second is a normal page with one button hidden. The resource — the tenant's public identity — exists either way; the channel is what is unset, and `null` is the accurate word for that. An unknown slug still returns the same plain 404 the availability route returns, revealing nothing else.

Implementation note: the route uses `PublicSessionDep`, which already resolves the slug and raises that 404. It then re-reads `tenants` by slug for the projection — a second lookup on a unique index, accepted deliberately rather than refactoring the dependency to hand back the row, because widening a shared dependency to carry tenant *columns* is how a contact field ends up somewhere it was not meant to be.

### D41 — Payment method is `VARCHAR(20)` + a `CHECK`, following the `status` precedent on purpose

| Option | Tradeoff | Verdict |
|---|---|---|
| PostgreSQL `ENUM` type | Type-safe and compact. **`ALTER TYPE … ADD VALUE` has no inverse** — PostgreSQL cannot drop an enum value — so the revision that adds a fourth method would have an unimplementable `downgrade()`. That is disqualifying in *this* project specifically: D15 runs `alembic downgrade base` on **every test session**, so a downgrade that cannot be written is not a theoretical debt, it is a broken test suite. It also drags a second object (the type) through every drop/create cycle. | **Rejected** |
| Lookup table + FK | Adding a value becomes an `INSERT`, fully reversible. It is also a table, a join, and seed data for three values that will never be queried relationally, on a system with two cabins. Machinery for a list. | Rejected |
| **`VARCHAR(20)` + `CHECK (payment_method IN (…))`** | The set of legal values is not enforced by a type, so a raw `INSERT` bypassing the API relies on the CHECK rather than the column type. In exchange, adding a value is a drop-and-recreate of one constraint inside a normal transactional revision with a trivial `downgrade()`. | **Chosen** |

**This deliberately follows the house precedent.** `reservations.status` is already `String(20)`, and the `EXCLUDE` constraint's predicate compares it as text (`WHERE (status <> 'cancelled')`). Introducing a native enum for the second categorical column would leave one table with a type-enforced category and its neighbour with a text one, and the next contributor adding a third would have to guess. Consistency is the argument; the migration cost is the tiebreaker.

Mechanism, mirroring `RESERVATION_STATUSES`:

```python
PAYMENT_METHODS = ("cash", "transfer", "other")     # app/models/payment.py
```

with `PaymentCreate.method: Literal["cash", "transfer", "other"]`, so a bad value is a Pydantic 422 and the CHECK (`payments_method_valid`) is the concurrency-safe backstop that a direct SQL insert still hits.

**Stored values are English; the Spanish is a label.** The owner wrote `efectivo / transferencia / otro`, which are the words on screen. `reservations.status` already stores `reserved`/`cancelled` and the frontend already renders those as `Reservada`/`Cancelada`, so the line between stored value and display label is drawn and the frontend already has the machinery. Storing Spanish here would put two conventions in one table family and make the next enum a coin flip. Mapping: `cash → Efectivo`, `transfer → Transferencia`, `other → Otro`. **Flagged for the owner** (Open Questions) — it is one revision to reverse.

**`NOT NULL`, no database default, required in `PaymentCreate`.** The owner is the only person who records a payment and always knows how the money arrived; a nullable column would create a third state ("unknown") with no meaning and an empty chip in the UI forever. The `paid_on` precedent stands: no `server_default` survives the migration (D45), so the API must always supply the value, and `tests/test_schema_no_derived_columns.py` already has the shape of a test that proves a column has no database default.

**A refund is not a method and not a purpose.** `method` describes how money moved and applies to refunds too (a refund handed over in cash is `cash`). The sign of `amount` remains the only payment/refund discriminator (D7); no method value duplicates it.

### D42 — The payment's purpose is derived in Python, over the list the endpoint already returns

The rule: among a reservation's payments, the **earliest positive one by `paid_on`** is the *seña*; every other positive one is a *pago*; a negative amount is a *devolución*. Keyed on `paid_on`, never on insertion order — recording March's payment before January's deposit must not rename the seña.

The interesting part is *where*, because purpose is not a property of a payment row. It is a property of a row's **position within its reservation's payment list**, so a Pydantic `computed_field` — which sees only its own row — structurally cannot compute it.

| Option | Tradeoff | Verdict |
|---|---|---|
| A correlated `column_property` (`NOT EXISTS (… an earlier positive payment …)`), following `paid_amount` | Real precedent, and it makes the value available on any `select(Payment)` including `POST`'s. But `paid_amount` is in SQL for a reason D7 states precisely: it is an **aggregate over another table**, so a Python version would be N+1. Purpose is neither an aggregate nor cross-table — it is a self-join whose only consumer is presentation, and D7's rule is "derive in Python when it is only presented". It also puts a total ordering (`paid_on`, then the tie-break) into SQL text, where it is harder to unit-test than a pure function. | Rejected |
| Client-side | The frontend has the list. But this is a *business* label the owner reads next to money, and the same argument that put balance on the server applies: two places computing "which one is the seña" can disagree, and the owner would have no way to tell which is right. | Rejected |
| **Python, in a new `app/services/payments.py`, over the rows the endpoint has in hand** | A new service module, which D3 said it did not want (it reserved `services/` for the three modules with real logic). That reservation is honoured by being explicit: this is now the fourth module with real logic, added deliberately, not by drift. No extra query on the list path; one extra query on the create path (below). | **Chosen** |

```python
def assign_purposes(payments: Sequence[Payment]) -> dict[uuid.UUID, str]
```

- Ordering key: `(paid_on, created_at, id)`. `paid_on` is the rule; `created_at` breaks the case of two payments on the same day; `id` is the final, arbitrary-but-**stable** tie-break so the label never flips between two identical requests. Two positive payments on the same date with the same timestamp is a case where either could honestly be called the seña — what matters is that the answer does not change on refresh.
- Only positive amounts are candidates for `deposit`. A reservation whose only payment is a refund has no deposit at all, which is correct.
- Status is irrelevant. A cancelled reservation's payments still label as Seña/Pago — they are the record that something must be settled personally (binding input 1).

`PaymentRead` gains `purpose: Literal["deposit", "payment", "refund"]` — required, never null. `POST /reservations/{id}/payments` therefore re-selects the reservation's payments after its existing `flush()` and labels the new row from the same function the list endpoint uses. One extra `SELECT` on a write path, taken so that one model has one meaning; a nullable `purpose` on create would be a field whose absence means two different things.

**`purpose` is added to `_FORBIDDEN_COLUMN_NAMES` in `tests/test_schema_no_derived_columns.py`**, so "just store a `is_deposit` flag" is structurally refused rather than argued about later.

### D43 — The window filter is `daterange && daterange`, because the constraint is written that way

```python
stay   = func.daterange(Reservation.check_in, Reservation.check_out, "[)")
window = func.daterange(from_, to, "[)")
stmt   = stmt.where(stay.op("&&")(window))
```

| Option | Tradeoff | Verdict |
|---|---|---|
| `check_in < to AND check_out > from_` | Matches `app/services/public.py` line-for-line, and a plain btree on `check_in` can serve it. It is correct **by argument** — a reader has to verify two boundary comparisons by eye, and getting one wrong produces containment, which silently drops a stay from 28/8 to 3/9 out of September and shows the owner a free night that is booked. | Rejected |
| **`daterange(check_in, check_out, '[)') && daterange(:from, :to, '[)')`** | A second spelling of the same predicate now exists in the codebase, because the proposal binds the availability query as untouched. In exchange the filter is correct **by construction**: it is character-for-character the expression `reservations_no_overlap` uses, so the list and the constraint cannot disagree about what "overlap" means. | **Chosen** |

The deciding argument is not readability. The invariant this filter must agree with is the `EXCLUDE` constraint, and the constraint is written as `daterange(check_in, check_out, '[)') WITH &&`. A calendar that computes availability differently from the constraint that enforces it will eventually show a free night the database refuses to book, and the cheapest way to guarantee agreement is to write the same expression. `'[)'` is what makes checkout day equal to next check-in day non-overlapping — the same half-open rule, in the same words, in three places now.

Index note, stated honestly: the gist index backing `reservations_no_overlap` is over `(property_id, daterange(...))` and *may* be usable for a bare `&&` search on the second column. That is unverified, and it is irrelevant — this table holds hundreds of rows. It is written down only so nobody adds a speculative index citing this design.

**Parameter contract:**

- `from` (aliased, since `from` is a Python keyword — `from_: Annotated[date, Query(alias="from")]`, matching `/availability`) and `to`. **Both or neither**; supplying one raises `errors.invalid("from and to must be supplied together")` → 422. FastAPI cannot express that in a signature, so it is an explicit guard in the handler.
- **`from >= to` → 422.** An inverted range would make `daterange()` itself raise, which surfaces as a 500 — the house rule is that the app layer produces good errors while the database is the authority, so this is caught before the query. A zero-width window is rejected under the same rule rather than returning an empty list, because a caller asking for zero nights has made a mistake.
- Neither parameter has a default. `/availability` requires its window; this one makes it optional (the guest sheet asks for a client's stays with no window at all), but an *absent* window and a *defaulted* window are different, and defaulting to "the current month" would answer a question nobody asked.
- `client_id`: optional UUID, composes with the window by AND. A stay on a soft-deleted property is **not** filtered out — D8's rule is explicit at the call site, and this call site adds nothing.
- **A `status` filter is added; the default is unchanged.** Open Question 3 asked whether cancelled reservations should be excluded by default. Changing a default is a silent behaviour change to a shipped endpoint; adding `?status=reserved` is additive and lets screen 03 ask for exactly what it wants. Recommended, and separable — see Open Questions.
- **Default ordering moves from `created_at` to `check_in, created_at`.** This *is* a behaviour change, and it is proposed rather than assumed: the sole consumer renders date-ordered lists and calendars, `created_at` ordering is an artifact of insertion, and no consumer has shipped. `created_at` remains as the deterministic tie-break for two stays starting the same day.

### D44 — The cancelled-balance rule moves into the service layer, beside `is_completed`

The defect: `ReservationRead.balance` is `effective_total - paid_amount` with no reference to `status`, so a cancelled $180.000 stay carrying a $60.000 deposit reports "Le falta pagar $120.000" — a figure nobody owes.

The asymmetry the owner spotted is real and it is **two** asymmetries, not one. `is_completed` consults `status`; `balance` does not. And `is_completed` delegates to a pure function in `app/services/reservations.py` while `balance` does its arithmetic inline in the Pydantic schema. The second asymmetry is why the first was easy to miss.

| Option | Tradeoff | Verdict |
|---|---|---|
| `if self.status == "cancelled": return Decimal(0)` inside the `computed_field` | Two lines, lands today. It also leaves the only money rule in the system living in a transport model, where it cannot be unit-tested without constructing a `ReservationRead`, and it deepens the asymmetry that hid the bug. | Rejected |
| A SQL expression (`CASE WHEN status = 'cancelled' …`) | Consistent with `paid_amount`. But D7 is explicit: balance is arithmetic on two scalars already in hand, presentation only. Nothing filters or sorts by it. | Rejected |
| **A pure function `balance(*, status, effective_total, paid_amount) -> Decimal` in `app/services/reservations.py`; the `computed_field` delegates** | One more small function. In exchange the rule sits beside `is_completed` and `effective_total`, is unit-testable with no database, and the file that answers "what does status change?" answers it in one place. | **Chosen** |

```python
def balance(*, status: str, effective_total: Decimal, paid_amount: Decimal) -> Decimal:
    if status == "cancelled":
        return Decimal(0)
    return effective_total - paid_amount
```

**What does *not* change, and why each is deliberate:**

- **`paid_amount` stays visible on a cancelled reservation.** The payments are the record that there is an amount to settle personally (binding input 1). Hiding them would erase the evidence of a conversation the owner still has to have.
- **`effective_total` stays visible and unchanged.** It is what the stay would have cost — a stored fact, not a claim of debt. Only the "owes" number goes to zero.
- **A cancelled reservation's balance is `0`, never negative.** The owner's words were that the balance returns to zero, and whether a deposit is returned is settled personally. A negative balance would assert that the business owes money, which is exactly the claim the owner declined to make automatically.
- **No migration.** A computed field and its spec.

This makes the API consistent with itself rather than introducing a rule: `owner-dashboard`'s `collected` already excludes cancelled reservations' payments.

### D45 — Two revisions, not one — because their rollbacks cost different amounts

The owner's note says "one revision covering both new columns, reviewed together". This design dissents, and states the reason so the owner can overrule it cheaply.

| Option | Tradeoff | Verdict |
|---|---|---|
| One revision, two columns, two tables | One artifact to review, one `downgrade -1`. It binds a privacy-boundary change to a payments change — the "unexplained extra field" failure the proposal argues against, one level up, in the revision instead of the model. Decisively: it makes the two rollbacks a single action. | Rejected |
| **`0002_tenant_whatsapp` and `0003_payment_method`** | Two files instead of one, in what is likely still one commit each. Each is independently revertible. | **Chosen** |

**The deciding argument is asymmetric rollback cost.** Dropping `tenants.whatsapp` loses one phone number per tenant that the owner retypes in seconds — the proposal correctly calls it the gentlest possible first exercise of the downgrade path. Dropping `payments.payment_method` **destroys how every payment arrived**, typed by the owner, unrecoverable from anything else in the schema. D14 merged five revisions because they reproduced one existing schema and would always run together; these two are independent, on different tables, serving different capabilities. Merging them means the cheap rollback drags the expensive one, and an operator reaching for `downgrade -1` at 2am to undo a phone-number column would silently delete a season of payment methods.

**Revision 0002 — `tenants.whatsapp` + the D38 DDL:**

1. `op.add_column("tenants", sa.Column("whatsapp", sa.String(20), nullable=True))`
2. `CHECK (whatsapp ~ '^[0-9]{8,15}$')` named `tenants_whatsapp_format`
3. `GRANT UPDATE (whatsapp) ON tenants TO alquileres_app`
4. `ENABLE ROW LEVEL SECURITY` + the three policies of D38, as literal `op.execute()` DDL with the predicate copied from `0001_baseline.py`
5. `downgrade()`: drop the three policies, `DISABLE ROW LEVEL SECURITY`, drop the constraint, drop the column. The grant dies with the column.

**Revision 0003 — `payments.payment_method`:**

```python
op.add_column("payments", sa.Column(
    "payment_method", sa.String(20), nullable=False, server_default="other"))
op.alter_column("payments", "payment_method", server_default=None)
op.create_check_constraint(
    "payments_method_valid", "payments",
    "payment_method IN ('cash', 'transfer', 'other')")
```

**The `server_default`-then-drop dance is not decoration, and the reason is a genuine trap worth recording for every future data migration in this project.** The obvious alternative — add the column nullable, `UPDATE payments SET payment_method = 'other'`, then `SET NOT NULL` — **would silently update zero rows**. `payments` is `FORCE ROW LEVEL SECURITY` with a policy predicated on `app.tenant_id`, which is unset inside a migration, so the predicate is NULL and the migrator sees no rows *even though it owns the table* — that is precisely what `FORCE` does (D14). The `SET NOT NULL` would then fail on a populated database, or, worse, succeed on today's empty one and leave the recipe in the repository for someone to copy when there *is* data. `ADD COLUMN … DEFAULT` is DDL: it fills existing rows without going through RLS at all, works identically on an empty or a populated table, and needs nothing remembered. Dropping the default afterwards keeps the "no database default on business columns" property that `payments.paid_on` already has.

`downgrade()` drops the constraint and the column, and is **lossy** — see Rollback.

### D46 — What verifies revisions 0002 and 0003, now that the parity script is gone

D16's parity check compared two constructions of one schema and was deleted with `bootstrap.py`. That was the right call and it leaves a real question: what checks an *incremental* revision? D17's three standing checks, plus three new assertions for what those three structurally cannot see.

**What the standing checks already cover, for free:**

| Check | What it catches here |
|---|---|
| `test_schema_is_migrated.py` — `compare_metadata()` is empty | The model gained `whatsapp`/`payment_method` and the revision did not, or vice versa; a type or nullability mismatch between them. This is the mechanical model↔migration diff that replaces parity for incremental revisions, and it already exists. |
| `test_schema_is_migrated.py` — `alembic_version == head` | Someone reintroduced a `create_all()` shortcut instead of writing revision 0003. |
| `test_rls_structural.py` | Unchanged in intent; its triangulation subject moves from `tenants` to `alembic_version` (D38). |
| **D15's `downgrade base` → `upgrade head`, on every test session** | **Both new `downgrade()` functions, on every single run.** The proposal's criterion asks for `upgrade head` then `downgrade -1` once; the existing fixture already does the whole cycle down to base continuously. The first post-baseline downgrade is verified more strongly than requested, and by machinery that exists. |

**What they cannot see, and the three new tests that cover it.** Alembic's `compare_metadata()` reflects tables, columns, indexes and foreign keys. It does **not** reflect `CHECK` constraints, RLS state, policies, grants, or column privileges — which is to say it sees none of D38 and none of D41's enforcement. Saying that plainly matters more than the tests themselves: a reader who assumes the no-pending-diff test covers the RLS change will not think to look further.

1. **`tests/test_tenants_rls.py` — structural and behavioural, in one file.**
   - `pg_policies` on `tenants` contains exactly `{tenants_read/SELECT, tenants_insert/INSERT, tenants_self_update/UPDATE}`, each naming both roles, and the UPDATE policy's `qual` and `with_check` text contains `app.tenant_id` (D14's stale-predicate trap, applied to the new policy).
   - `information_schema.column_privileges` shows `UPDATE` for `alquileres_app` on `tenants.whatsapp` and on **no other column** of `tenants`.
   - **As `alquileres_app` with `app.tenant_id` set to tenant A**, an *unqualified* `UPDATE tenants SET whatsapp = 'x'` affects exactly 1 row, and tenant B's row is unchanged. This is the test that proves the backstop rather than the handler: it deliberately omits the `WHERE` the application would have written.
   - As `alquileres_app`, `UPDATE tenants SET slug = 'x' WHERE id = <own id>` raises a permission error (the column grant, independent of the policy).
   - As `alquileres_app` with **no** `app.tenant_id` set, `SELECT id FROM tenants WHERE slug = …` returns the row — the pre-context read login and the public routes depend on, proven still open after enabling RLS.
2. **`PATCH /tenant` with an extra `tenant_id` field in the body → 422** (D38 layer 1, `extra="forbid"`), and an owner of A calling `PATCH /tenant` leaves B's `whatsapp` untouched.
3. **`payments_method_valid` bites.** Through the API a bad method is a Pydantic 422; directly as `alquileres_app`, `INSERT … payment_method = 'cheque'` raises `23514`. Both, because the first proves the ergonomics and only the second proves the constraint exists.

**Plus one extension of an existing test rather than a new one:** `tests/test_public_contract.py` seeds a distinctive `whatsapp` value and asserts it appears in `/public/{slug}/contact` and does **not** appear in the raw bytes of `/public/{slug}/availability`. Same string-absence shape as D9 layer 3; it is the test that would catch the contact field being "simplified" onto `PublicAvailability` later.

### D47 — Slice 2 ships as no code, and the decision is recorded rather than left implied

Binding input 1 resolves the question slice 2 was gated on, in the direction that removes it. Once a cancelled reservation reports `0` (D44), a guest's outstanding balance is the plain sum of that guest's reservation balances, and D43's `client_id` filter puts that list in the frontend's hands. There is no longer a business rule that can differ between server and client — the rule that *could* have differed is now enforced in exactly one place, on the server, in the number the client sums.

So: **no `stay_count`, no `outstanding_balance` on `ClientRead`. No new endpoint. No SQL aggregate.** The "estadía" count is `reservations where status != 'cancelled'`, computed in the frontend over data it holds.

This is recorded as a decision, with the tripwire that reverses it, because "we decided not to" is invisible in a diff and the next reader will otherwise re-derive it: **add the server-side aggregate when a second consumer appears, or when a screen shows a guest's balance without having loaded that guest's reservations.** Neither exists.

The `client-management` spec disambiguation (slice 0) stays as the proposal describes it — a wording change naming exactly one mechanism, which the code already implements: `GET /clients/{id}` does not filter by `deleted_at` (`app/api/routers/clients.py:58-63`), while `GET /clients` does unless `include_inactive=true`. Reservation responses carry no client fields at all. Spec phase owns the wording.

---

## Component Map

```
                       AUTHENTICATED                          PUBLIC (no auth)
                            │                                       │
   PrincipalDep  ──► tid from the verified JWT              slug from the path
        │                   │                                       │
   TenantSessionDep    set_config('app.tenant_id', …, true)   PublicSessionDep
        │                   │                                       │
        ├─ GET  /reservations?client_id&from&to&status              ├─ GET /public/{slug}/availability
        │     daterange(check_in,check_out,'[)') && …               │     UNTOUCHED. list[PublicAvailability]
        │     ORDER BY check_in, created_at            (D43)        │     column projection only        (D9)
        │                                                          │
        ├─ GET/POST /reservations/{id}/payments                     └─ GET /public/{slug}/contact       (D40)
        │     PaymentRead.purpose ← assign_purposes()               │     PublicContact {name, whatsapp}
        │     (Python, over the whole list)            (D42)        │     projection over `tenants` only
        │                                                          │     no number set → 200, whatsapp: null
        └─ GET/PATCH /tenant                           (D39)
              no id in path, query, or body            (L1)
              predicate from principal.tenant_id       (L2)
                        │
                        ▼
                   PostgreSQL  ── tenants ─────────────────────────────────────
                        GRANT UPDATE (whatsapp) ONLY                      (L3)
                        ENABLE RLS, no FORCE:                             (L4)
                          SELECT USING (true)      ← login + public read unaffected
                          INSERT WITH CHECK (true) ← registration + seed unaffected
                          UPDATE USING/WITH CHECK (id = app.tenant_id)
                          (no DELETE policy, no DELETE grant)
```

## Data Flow: what a cancelled reservation reports

```
  reservation: status=cancelled, price_total=180000, payments: [60000 cash]
        │
        ├── effective_total  = 180000   (stored fact, unchanged)          D7
        ├── paid_amount      =  60000   (column_property, unchanged)      D7
        ├── balance          =      0   (status-aware pure function)      D44
        └── payments[0].purpose = "deposit"  (earliest positive by paid_on) D42

  the dashboard already agrees: `collected` excludes cancelled reservations
```

## File Changes

| File | Action | Description |
|---|---|---|
| `back/app/models/tenant.py` | Modify | `whatsapp` column + `tenants_whatsapp_format` CHECK (D39) |
| `back/app/schemas/tenant.py` | **Create** | `TenantRead`, `TenantUpdate` (`extra="forbid"`, normalising validator) (D39) |
| `back/app/api/routers/tenant.py` | **Create** | `GET /tenant`, `PATCH /tenant` — no tenant identifier in the surface (D38, D39) |
| `back/app/schemas/public.py` | Modify | **New `PublicContact` model only.** `PublicAvailability` untouched (D40) |
| `back/app/services/public.py` | Modify | **New `get_public_contact()` projection only.** Availability query untouched (D40) |
| `back/app/api/routers/public.py` | Modify | Second public route (D40) |
| `back/app/models/payment.py` | Modify | `payment_method` column, `PAYMENT_METHODS`, `payments_method_valid` CHECK (D41) |
| `back/app/schemas/payment.py` | Modify | `method` on create (required `Literal`), `purpose` on read (D41, D42) |
| `back/app/services/payments.py` | **Create** | `assign_purposes()` — the fourth service module, deliberately (D42) |
| `back/app/api/routers/payments.py` | Modify | Both routes label purposes; `POST` re-selects after `flush()` (D42) |
| `back/app/api/routers/reservations.py` | Modify | `client_id`, `from`/`to`, `status`; new default ordering (D43) |
| `back/app/services/reservations.py` | Modify | `balance()` pure function (D44) |
| `back/app/schemas/reservation.py` | Modify | `balance` `computed_field` delegates to the service (D44) |
| `back/app/main.py` | Modify | Register the `tenant` router |
| `back/migrations/versions/0002_tenant_whatsapp.py` | **Create** | Column, CHECK, column grant, RLS + three policies (D38, D45) |
| `back/migrations/versions/0003_payment_method.py` | **Create** | Column via DDL default, CHECK (D41, D45) |
| `back/tests/test_rls_structural.py` | Modify | **Triangulation subject moves `tenants` → `alembic_version`** (D38) |
| `back/tests/test_tenants_rls.py` | **Create** | Policies, column privileges, unqualified-UPDATE, cross-tenant, pre-context read (D46) |
| `back/tests/test_tenant_contact.py` | **Create** | `GET`/`PATCH /tenant`, normalisation, `extra="forbid"`, public contact route, null case |
| `back/tests/test_public_contract.py` | Modify | The `whatsapp` value is absent from `/availability`'s raw body (D46) |
| `back/tests/test_reservation_filters.py` | **Create** | Straddling stay, both-or-neither, inverted window, `client_id`, ordering (D43) |
| `back/tests/test_reservation_balance.py` | Modify | Cancelled reports 0 while `paid_amount` stays visible (D44) |
| `back/tests/test_payments.py` | Modify | `method` required and validated; `purpose` by `paid_on`, not insertion order (D41, D42) |
| `back/tests/test_schema_no_derived_columns.py` | Modify | `purpose` added to `_FORBIDDEN_COLUMN_NAMES` (D42) |
| `openspec/specs/*` | Modify | Per the proposal's Capabilities section |

## Slicing

Reordered from the proposal, with the reason stated.

| # | Slice | Migration | Why here |
|---|---|---|---|
| 0 | `client-management` disambiguation | — | Spec-only. Lands with whichever slice ships first (D47) |
| 1 | **Cancelled-reservation balance** (D44) | **No** | **Moved to first.** It is a *defect*: the API currently reports a figure nobody owes. It has no migration, no new surface, and the frontend cannot display any guest's balance correctly until it lands. Fixing a wrong number before adding new money fields also means every later slice is built on an API that agrees with itself. |
| 2 | **Reservation list filters** (D43) | No | Purely additive parameters; unblocks screens 03 and 10 |
| 3 | **Per-guest aggregates** | — | **Closed as no code** (D47). Recorded, not implemented |
| 4 | **Tenant public contact** (D38, D39, D40) | `0002` | **Alone.** The only slice touching RLS, the only one adding an unauthenticated surface, and the only CRITICAL-domain one. Putting it inside a diff about calendar filters is the failure the proposal argues against |
| 5 | **Payment method + purpose** (D41, D42) | `0003` | Last and separate from 4, per D45's rollback asymmetry |

Slice 4's internal order matters and is specified: **the migration and its tests land before the router**. Write revision 0002, run the suite (the triangulation subject change and `test_tenants_rls.py` must be green against a database with no write endpoint on it yet), and only then add `PATCH /tenant`. The backstop is proved before the thing it backs exists, which is the only order in which "the backstop works" is a claim about the database rather than about the handler.

**Prove the net by breaking it** (D16's practice, applied here): before slice 4 is called done, delete `tenants_self_update`'s `USING` clause — make it `USING (true)` — confirm the unqualified-UPDATE test goes red, and restore it. Record the observed output as a checklist item, not as an intention.

## Testing Strategy (additions only)

| Layer | What | Approach |
|---|---|---|
| Unit | `balance()` returns 0 for `cancelled` at several paid amounts, and `total - paid` otherwise, including a negative (overpaid) result | Pure function, no DB |
| Unit | `assign_purposes()` labels by `paid_on` even when insertion order disagrees; refunds never become the deposit; a same-day tie is stable across calls | Pure function, no DB |
| Unit | The `whatsapp` validator strips separators, rejects letters and free text, rejects 7 and 16 digits, accepts a `+` prefix | Pure, no DB |
| Integration | A stay 2026-08-28 → 2026-09-03 **is returned** by `from=2026-09-01&to=2026-10-01` (overlap, not containment) | Real Postgres |
| Integration | Only `from`, or only `to`, or `from >= to` → 422; neither → the unfiltered list, ordered by `check_in` | Real Postgres |
| Integration | `client_id` returns that guest's stays **including one on a soft-deleted property** | Real Postgres |
| Integration | Cancelled + $60.000 paid on a $180.000 stay → `balance` 0, `paid_amount` 60000, `effective_total` 180000 | Real Postgres |
| Integration | A March payment recorded before January's deposit: January's is the `deposit` | Real Postgres |
| Structural | `tenants` policy set, `cmd`, `roles`, and `qual` text; `column_privileges` shows `UPDATE` on `whatsapp` and no other column | `pg_catalog` / `information_schema`, **app role** |
| Isolation | Unqualified `UPDATE tenants SET whatsapp` as `alquileres_app` affects exactly 1 row; B unchanged | Real connection **as `alquileres_app`** |
| Isolation | `UPDATE tenants SET slug` as `alquileres_app` → permission denied | Real connection as `alquileres_app` |
| Regression | With **no** `app.tenant_id` set, the app role still resolves a tenant by slug | The read login and both public routes depend on |
| Contract | The `whatsapp` value appears in `/public/{slug}/contact` and **not** in `/availability`'s raw bytes | String-level, D9 layer 3's shape |
| Contract | No number set → `/contact` returns 200 with `whatsapp: null`; unknown slug → 404 | `TestClient` |
| Constraint | `payment_method = 'cheque'` → 422 via the API, `23514` via raw SQL as the app role | Both, deliberately |
| Migration | Covered continuously by D15's `downgrade base` → `upgrade head` on every session | No new test needed |

**The gotcha that decides whether the isolation tests are real** is unchanged from the original design and applies with full force to D38: these tests must connect as **`alquileres_app`**. Run the unqualified-UPDATE test as `alquileres_migrator` and it passes while proving nothing — worse than nothing, because the migrator does not even go through the policies (no `FORCE` on `tenants`, deliberately, D38).

## Risks

| Risk | Likelihood | Mitigation | Residual |
|---|---|---|---|
| Cross-tenant write on `tenants` | Med / severity **High** | Four independent layers (D38): no identifier in the request surface, predicate from the verified claim, column-scoped grant, per-command RLS policy. Proved by breaking the policy | Low |
| The `tenants` UPDATE policy is written from this document's prose and compares against `app.current_tenant_id` | **Med** | Predicate copied verbatim from `0001_baseline.py`; `test_tenants_rls.py` asserts the `qual` text. Without it the failure is silent — the endpoint would deny every update while the app starts cleanly (D14's named trap) | Low |
| A reviewer reads the `test_rls_structural.py` change as weakening the audit | **High** | It is the opposite: the tripwire fired correctly and the triangulation subject moved to `alembic_version`, which has no `tenant_id` permanently. Called out in D38 and in the commit message | Low |
| A future `GRANT DELETE ON tenants` without a `FOR DELETE` policy silently deletes nothing | Low | New in this change, accepted. `test_tenants_rls.py` pins the exact policy set, so an unpaired grant is visible in a diff | Med |
| Contact field added to `PublicAvailability` later "because it's simpler" | Med | Separate route, separate model, separate projection; the extended D9 contract test asserts the value's absence from the availability body | Low |
| `tenants` treated as an owner-profile table, citing this precedent | Med | The column is named for the channel; `tenant-management` states the publishable-only rule; the column grant means a second writable field requires a migration | Low |
| A future data migration `UPDATE`s a `FORCE`d table and silently touches zero rows | **Med** | D45 records the trap and the DDL-default recipe that avoids it. This is the change that discovers it; the next one will not | Med — depends on the recipe being read |
| Window implemented as containment; a straddling stay vanishes | Med | The same `daterange … &&` expression as the constraint; explicit test with a 28/8 → 3/9 stay | Low |
| Two spellings of "overlap" in the codebase (`&&` here, boundary comparisons in `public.py`) | **Med** | Accepted for now — the proposal binds the availability query as untouched. Recorded as a follow-up, not done here | Med |
| The default-ordering change surprises a consumer | Low | No consumer has shipped; flagged as an owner question rather than assumed | Low |
| `payment_method` downgrade destroys owner-entered data | Low | D45 splits it into its own revision so the cheap rollback cannot drag it; called out in Rollback | Med — inherent to dropping a column |
| Stored enum values in English while the owner said Spanish | Med | Follows the `status` precedent and the existing label mapping. One revision to reverse; raised as an owner question | Low |
| Slice 4 ships a write path the frontend cannot call (Open Question 5) | **High** | Accepted: the write path is far cheaper alongside the migration that creates the column than as an urgent later change. If no affordance appears, `PATCH /tenant` is set out-of-band and stays tested | Low |

## Rollback

Slices 1–3 are additive computed fields and query parameters: revert the commit, no schema change, no data implication.

**Slice 4** (revision 0002): revert the commit, then `alembic downgrade -1`. The downgrade drops three policies, disables RLS on `tenants`, and drops the column — restoring exactly the pre-change state, including `test_rls_structural.py`'s original triangulation subject. Data loss is one phone number per tenant, retyped in seconds.

**Slice 5** (revision 0003) is the one to think about before running. `alembic downgrade -1` drops `payments.payment_method`, and **that data is unrecoverable** — how each payment arrived exists nowhere else in the schema and cannot be derived. This is the whole reason D45 refuses to put it in the same revision as a phone number. If it ever needs reverting after real payments exist, the correct move is to revert the application commit and **leave the column in place**, then drop it in a considered follow-up.

Both downgrades are exercised on every test run by D15's `downgrade base` → `upgrade head` cycle, so "the downgrade is broken" is not a discovery that waits for an incident.

## Open Questions

| # | Question | Verdict | Recommendation |
|---|---|---|---|
| 1 | `GET /properties?include_inactive=true` exists? | **Answered by inspection** | It exists (`properties.py:33-41`). Binding input 3 stands with no work |
| 2 | Cancelled reservation's balance and stay count | **Answered by the owner** | Balance 0, not counted as an estadía, still listed. Implemented by D44, collapses slice 2 via D47 |
| 3 | Exclude cancelled from `GET /reservations` by default? Change the default ordering? | **Decided here, and separable** (D43) | Do **not** change the cancelled default; add `?status=`. **Do** change the ordering to `check_in, created_at` — no consumer has shipped, and `created_at` ordering serves nobody. If the owner prefers zero behaviour change, drop the ordering change and the rest of D43 is unaffected |
| 4 | WhatsApp validated/normalised, or as entered? One channel or two? | **Decided here** (D39) | Normalise to digits, validate shape (8–15), CHECK as backstop. One column per channel; a second is a second column, never a JSON blob. Shape validation cannot catch a wrong-but-well-formed number — the UI should echo the `wa.me` link back |
| 5 | Where does the owner set the number? The handoff says "no settings screen" | **Still open — product decision** | Ship the write path anyway (D38's fourth rejected option explains why). It costs little now, alongside the migration that creates the column, and a lot later as an urgent one-off. Until an affordance exists the number is set out-of-band and `PATCH /tenant` is exercised only by tests |
| 6 | `tenants` write protection: application predicate or RLS? | **Decided here** (D38) | Both, plus two more. The application predicate is necessary; it is not sufficient, because it is the only write in the system whose safety is a property of a handler rather than of the schema |
| 7 | Nullable contact, or required at registration? | **Decided here** (D39) | Nullable. Requiring it would change `RegisterRequest`, which D10's addendum fixed at exactly `{tenant_slug, name, email, password}` — a binding non-goal of this change |
| 8 | **New:** stored payment-method values in English (`cash/transfer/other`) or the owner's Spanish? | **Decided here, owner-reversible** (D41) | English, mapped to Spanish labels in the frontend — the same line `reservations.status` already draws. One revision to reverse if the owner disagrees |
| 9 | **New:** one revision or two? | **Decided here, dissenting from the owner's note** (D45) | Two. Their rollbacks cost different amounts: one loses a retypeable phone number, the other destroys owner-entered data. Merging them means the cheap rollback drags the expensive one |

**Also requiring sign-off before implementation:**

- [ ] **BLOCKING, human approval required:** D38 changes the RLS state of `tenants`, the table every login and every public page load reads before any tenant context exists. CRITICAL domain (`tenant-isolation`), not approved by this document.
- [ ] **BLOCKING, human approval required:** D39 adds the first write path to that table. CRITICAL domain.
- [ ] **Precondition to confirm at slice 4's start, not assume:** `production-readiness` phases 3–5 are committed and the tree is quiet. The proposal rates the merge conflict risk **High**.

**Recorded, not raised as questions:**

- The `&&` expression and `public.py`'s boundary comparisons are two spellings of one predicate (D43). Aligning `public.py` is a follow-up; the proposal binds the availability query as untouched here.
- `/public/{slug}/availability` silently returns `[]` for an inverted window while the new reservation filter returns 422 (D43). A pre-existing inconsistency, noted rather than fixed, because fixing it means touching the availability route.
- `app/services/payments.py` is the fourth service module, against D3's stated reservation of `services/` for three (D42). Added deliberately and recorded so it reads as a decision rather than drift.
- The public contact route performs a second lookup of `tenants` by slug after `PublicSessionDep` has already resolved it (D40). Accepted: widening a shared dependency to carry tenant columns is how a contact field ends up somewhere it was not meant to be.

---

## Owner decisions (2026-09-04)

**Open question 2 — RESOLVED.** Payment method values are stored in English
(`cash`, `transfer`, `other`) and displayed in Spanish (`Efectivo`,
`Transferencia`, `Otro`). This follows the line `reservations.status` already
draws: the database stores `reserved` and `cancelled` while every screen shows
Spanish. The stored value is an identifier; the Spanish word is a label, and
labels belong to the interface.

**Open question 3 — the design's dissent is ACCEPTED.** Two revisions, not
one. The rollback asymmetry is the argument: dropping `whatsapp` costs a phone
number retyped in seconds, while dropping `payment_method` destroys data the
owner entered that exists nowhere else. A cheap rollback must not be chained
to an expensive one.

**Still blocking implementation**: D38 and D39 are CRITICAL domain — they
change the RLS state of the table every login reads and add the first write to
it — and are not approved by any document.
