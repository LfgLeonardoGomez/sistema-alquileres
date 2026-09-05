# Proposal: Frontend API Alignment

> **Size note.** The 450-word proposal budget is deliberately exceeded, following
> the precedent set by this project's `design.md` and `production-readiness`
> proposal. Two of the four gaps below resolve to *no code*, and one touches the
> system's only unauthenticated surface. Compressing the argument for either
> would produce a shorter document and a worse decision.
>
> **Scope note.** This change aligns the **API** with a frontend design that now
> exists. It does not build the frontend.

## Intent

A high-fidelity design for the owner's app now exists (`Diseño de app con
paletas de color/design_handoff_alquileres_aya/README.md`): 12 screens, final
Spanish copy, and — usefully — an explicit statement of the data each screen
needs. Reading the API against it surfaced six gaps.

The problem is stated as **what the frontend cannot build today**, not as a list
of missing endpoints:

| # | Screen | Cannot be built because | Verdict |
|---|--------|------------------------|---------|
| 1 | 03 calendar, 06 detail, 10 guest sheet | Reservations return `property_id` / `client_id` and no names | **No code** — see below |
| 2 | 03 calendar (one month), 10 guest sheet (one guest) | `GET /reservations` filters only by `property_id` | In scope |
| 3 | 09 guest list, 10 guest sheet | No per-guest stay count or outstanding balance anywhere | In scope, **conditional** |
| 4 | 11/12 public page | "Escribinos por WhatsApp" has no number to link to | In scope |
| 5 | 01 login | Screen has no tenant field; `POST /auth/login` needs `tenant_slug` | **Resolved, no code** |
| 6 | 01 login | "Me olvidé la contraseña" has no backend | **Resolved, deferred** |

The API is not wrong. It was specified before a frontend existed, so it was
specified as a data model. The design asks it to also be a *rendering contract*,
and the honest answer differs per gap.

## Gaps that need no code

Stated first and deliberately, so nobody implements them by reflex.

**(5) Login tenant.** The frontend supplies `tenant_slug` from the URL. The
owner never types it. This is exactly D10's recorded ergonomics mitigation
("a bookmarked `/login?tenant=<slug>` prefills it"). **No backend change. Do not
add one** — a global-email login would reopen the cross-tenant existence oracle
D10 exists to close.

**(6) Password reset.** The link is removed from the frontend for now. Reset
needs an email provider and is its own change. Already a binding non-goal of
`production-readiness`. **Noted as deferred, not designed here.**

**(1) Names instead of ids.** The frontend stack is now settled: React + Vite +
Zustand + TanStack Query. `/clients` and `/properties` are two small, cached,
long-lived queries; resolving an id to a name is a map lookup over data the app
already holds for screens 08 and 09. **Recommendation: accept the client-side
join and change nothing.**

Being explicit about the argument, because it is easy to make the wrong one:

- **Performance is not the reason, in either direction.** Two cabins and a
  handful of guests. Any framing that reaches for "N+1" or "scaling" here is
  invented. Nothing about this decision is about speed.
- The real argument *for* embedding is legibility and coupling: a
  `ReservationRead` of opaque UUIDs forces every consumer to know the resolution
  rules. That is a genuine argument. It loses here on a count — **there is one
  consumer**, it already holds both lookup tables, and buying legibility for
  hypothetical consumers means denormalising the hottest read path and inviting
  the next field (`client_phone`, then `client_email`) onto a model whose
  discipline is that it does not accrete.
- The cost of *not* embedding is two conditions the frontend must honour, both
  zero-code:
  1. The resolution caches must be fetched with `include_inactive=true` on
     **both** `/clients` (already implemented) and `/properties` (per design D8's
     behaviour matrix — confirm during spec). Fetched with the defaults, a
     deactivated guest's stays render nameless, and screen 09 shows deactivated
     guests by design. This trap is cheap to hit and cheap to avoid.
  2. `client-management`'s scenario *"Inactive client still resolves through
     reservation history → the client's name and contact fields MUST still be
     returned"* is **ambiguous**. It reads either as "the reservation response
     carries them" or as "`GET /clients/{id}` does not filter". The code
     implements the second (see the docstring in `app/api/routers/clients.py`).
     The spec must say which — **a wording change, no implementation.**

**Tripwire that reverses this decision:** a second consumer (another client, an
export, a webhook), or a screen that renders a reservation without having loaded
the guest list. Neither exists today. Revisit then, not before.

## Scope

### In Scope

- **Reservation list filters**: `client_id`, and a half-open `[from, to)` date
  window matched by **overlap**, not containment.
- **Per-guest aggregates** (stay count, outstanding balance) as derived values,
  never stored — **conditional on Open Question 2**, which may collapse this to
  no code.
- **Tenant public contact**: a WhatsApp number stored on the tenant, editable by
  the owner, exposed publicly through **its own endpoint and its own response
  model**, never inside the availability response.
- One Alembic revision — the project's **first real migration after the
  baseline**.
- The `client-management` spec disambiguation above (wording only).

### Out of Scope (non-goals — binding)

- Embedding cabin/guest names in reservation read models (argued above).
- Password reset / forgot-password.
- **Guest search by name or phone (screen 09).** The frontend filters the guest
  list it already has. No endpoint. Same reasoning as gap 1.
- A general `?expand=` / field-selection mechanism. Machinery for one consumer.
- Any change to `POST /auth/login`, `POST /auth/register`, or `RegisterRequest`.
- Rate limiting the new public endpoint (D9's accepted-risk position is
  unchanged and not reopened).
- The frontend itself.

## Capabilities

### New Capabilities

- `public-tenant-contact`: the tenant's own published contact channel, readable
  without authentication at a **separate** endpoint from the availability
  calendar, through a response model that carries nothing else. Carries its own
  statement of *why* a contact field on a privacy-boundary surface is not a leak.

### Modified Capabilities

- `reservation-booking`: `GET /reservations` gains a `client_id` filter and a
  half-open `[from, to)` window. Window matching is **overlap**
  (`check_in < to AND check_out > from`) — the same predicate `app/services/public.py`
  already uses. Containment would silently drop a stay from 28/8 to 3/9 out of
  September's calendar. Both window bounds are optional together and invalid
  apart.
- `client-management`: (a) the historical-read scenario is disambiguated
  (wording, no code); (b) *conditionally* — the client read carries a derived
  stay count and outstanding balance, computed in SQL, with **no stored
  aggregate** anywhere.
- `tenant-management`: the tenant record gains a nullable public contact field,
  and the owner gains a self-service path to set it. Adds the binding rule that
  `tenants` holds **only data that is safe to publish**, so the next contributor
  does not read the WhatsApp precedent as licence to treat it as an owner-profile
  table.
- `tenant-isolation`: **no behavioural change; a named gap in the audit.** The
  `pg_catalog` structural test asserts FORCE RLS + policy on every table with a
  `tenant_id` column. `tenants` has no such column, so it is outside that audit
  by construction — which is precisely why a write path on it has no net beneath
  it. The spec must state that exclusion deliberately and require a behavioural
  cross-tenant-write test in its place.
- `public-availability-calendar`: **a reinforcing delta, not a relaxation.** The
  requirements "Response Exposes Only Property Identity and Occupied Ranges" and
  "No Private Fields Are Reachable" stay exactly as written. The delta adds a
  requirement stating that the availability response carries no tenant-level
  field either, and points at `public-tenant-contact` for where the contact
  lives and why.

## Approach

### Filters (gap 2)

Additive query parameters on an existing endpoint. The owner's framing —
*"if there is a client entity, it is logical to be able to filter that client's
stays"* — is the right one: this is the reservation list finally matching the
data model it already has.

The only subtle part is the window, and it is stated as a requirement rather
than left to implementation: overlap, half-open, both-or-neither. This mirrors
`public-availability-calendar`'s "The Window Is Caller-Supplied and Mandatory"
in spirit without making it mandatory here — the guest sheet queries by client
with no window at all.

### Per-guest aggregates (gap 3) — a close call, argued

Design D7 forbids storing a derived value, and `payment-tracking` forbids a
`balance` column outright. Whatever ships must be a SQL expression, in the
existing `column_property`-style, never a stored aggregate and never a Python
loop over `client.reservations`.

**But the prior question is whether this belongs on the server at all.**
`ReservationRead` already carries `paid_amount` and a computed `balance`. Once
gap 2 lands, the frontend can fetch reservations once, group by `client_id`, and
sum. TanStack Query makes that idiomatic and cached. Performance, again, is not
an argument in either direction.

The argument for the server is **where the business rule lives**, not speed:

- Screen 06 shows a **Saldo** the server computed. Screens 09 and 10 show a
  **Debe / Saldo** in visually identical copy. If those two numbers can ever
  disagree, the owner has no way to tell which is right — and being trusted about
  money is the app's entire job.
- They *can* disagree, because a real business rule sits underneath: **does a
  cancelled reservation carrying recorded payments count toward a guest's
  outstanding balance?** Screen 07 promises "Los pagos anotados quedan
  guardados", and `payment-tracking` says a refund is a manual negative entry —
  so a cancelled-and-paid stay is a real state with a real, possibly negative,
  balance. A frontend `reduce` embeds that rule in the client.

Business rules about money belong on the server. **That is the whole case.**

The honest counter, stated because it is not weak: D7's own rule is "derive in
Python when it is only presented", and a guest's balance is only presented — one
could call the frontend just another presentation layer. The rebuttal is that
D7 partitions work *inside one authority* (SQL vs Python), and stretching it
across the API boundary is a different claim than the one D7 makes.

**Consequence: this slice is conditional.** If Open Question 2 resolves to a
rule that is trivial and permanent ("cancelled never counts, anywhere, ever"),
the rule is safe in the client and this slice may correctly shrink to nothing.
That question is load-bearing, not decorative.

Shape (`ClientRead` gains two derived fields, consistent with `paid_amount`'s
precedent — versus a dedicated summary read model, keeping `POST /clients`'s
upsert response lean) is a **design-phase** decision, not one this proposal makes.

### Tenant public contact (gap 4) — the part not to get wrong

The public availability endpoint is the only surface strangers can reach, and
D9 gave it three *independent* isolation layers: a genuine column projection, a
dedicated response model sharing no base class with any authenticated schema and
`extra="forbid"`, and a raw-body contract test.

A WhatsApp number does not violate that boundary. It is the owner's own
commercial contact information, published by their explicit choice, and it is a
categorically different object from reservation data — it belongs to nobody but
the owner, and its entire purpose is to be seen by strangers.

**But it must be added deliberately and visibly, and here is the failure being
avoided.** Smuggled in as an extra field on `PublicAvailability`, a future reader
opens a privacy-boundary model, finds an unexplained contact field beside
occupancy data, and **cannot tell whether it was intended or whether it is a
leak that survived review.** The reader has no way to distinguish a deliberate
publication from a regression. That ambiguity is the harm — independent of
whether this particular field is safe.

So:

- **Its own endpoint** — `GET /public/{tenant_slug}/…`, returning the tenant's
  public identity and contact. Its own model in `app/schemas/public.py`, its own
  column projection over `tenants` only. The availability query, model and
  response are **not touched**.
- **Its own spec requirement**, in a new capability, stating in prose why this
  field is published. The availability spec's absolute sentences stay absolute
  and gain a pointer.
- A structural bonus that makes the choice near-forced anyway:
  `/availability` returns a bare `list[PublicAvailability]` of **per-property**
  items. A tenant-level field has no home in it without either duplicating the
  number on every cabin or wrapping the list in an envelope — a breaking change
  to the one endpoint whose contract must not move.
- Honest cost: two unauthenticated surfaces instead of one. Accepted, and the
  second is the least dangerous read in the system — it touches only `tenants`,
  a table that by rule holds nothing private.

**Where the owner sets it — and the real hazard.** `GET /me` is read-only, and
the number is a *tenant* attribute, not a *user* one, so `PATCH /me` would write
across two tables to serve one field. A tenant-scoped write path is the right
shape.

That write path is **the most dangerous thing in this change**, and not for the
reason gap 4 appears to be about. `tenants` is the one table with **no RLS**
(D5) — deliberately, because login and public slug resolution must read it
*before* any tenant context exists. Every other write in this system has RLS
underneath it as a backstop. This one would not. An `UPDATE tenants … WHERE id`
that ever loses its predicate, or takes the id from anywhere but the verified
JWT claim, is a silent cross-tenant write with nothing beneath it to stop it.

Design fork, named here so the owner sees the tradeoff (decided in design, not
here):

| Option | Tradeoff |
|---|---|
| Keep `tenants` un-RLS'd; the predicate comes from the verified `tid` claim only, plus a dedicated cross-tenant-write test | Simplest, changes nothing about login. The protection is application-level — the only such write in the system. |
| Add **per-command** RLS on `tenants`: `FOR SELECT USING (true)`, `FOR UPDATE USING (id = current_setting(…))` | Restores a database-level backstop for the write while leaving login's pre-context read working. More moving parts on the most load-bearing table. |

**Migration.** The new column is one Alembic revision — **the first real one this
project has ever written**, following `0001_baseline`. It is a nullable column
add, about as gentle as a first revision gets, but it is the revision that
proves the `schema-migrations` capability works for something other than the
baseline. It must ship a working `downgrade()`, and it must not disturb
`tenants`' grants.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/api/routers/reservations.py` | Modified | `client_id` + `from`/`to` query params on the list |
| `app/models/tenant.py` | Modified | Nullable contact column |
| `app/schemas/client.py` | Modified (conditional) | Derived stay count + outstanding balance |
| `app/schemas/tenant.py` | New | Authenticated tenant read/update model |
| `app/api/routers/tenant.py` (or extends `auth.py`) | New | Owner read/update of the tenant contact |
| `app/schemas/public.py` | Modified | **New model only.** `PublicAvailability` untouched |
| `app/services/public.py` | Modified | **New projection only.** Availability query untouched |
| `app/api/routers/public.py` | Modified | Second public route |
| `migrations/versions/0002_*.py` | New | First post-baseline revision |
| `tests/` | Modified | Overlap-window cases, cross-tenant write, extended D9 contract test |
| `openspec/specs/*` | Modified | Per Capabilities above |

## Slicing (proposed order)

Three slices, plus a spec-only item. Gap 1 produces no slice.

| # | Slice | Why here |
|---|-------|---------|
| 0 | `client-management` scenario disambiguation | Spec phase only, no code. Lands with whichever slice ships first. |
| 1 | **Reservation list filters** | First: purely additive query params, no response-shape change, and it unblocks the two screens the owner touches daily (03, 10). It is also a **precondition for evaluating slice 2** — once the frontend can fetch a guest's stays, the client-side-aggregate alternative becomes testable rather than theoretical. |
| 2 | **Per-guest aggregates** (conditional) | Second, and gated on Open Question 2. Reuses slice 1's window semantics. May correctly shrink to zero code — that outcome is a success, not a failure of the slice. |
| 3 | **Tenant public contact** | Last and **alone**. It is the only slice with a migration, the only one writing to an un-RLS'd table, and the only one adding an unauthenticated surface. It is fully independent of 1–2, so this position is a **reviewability** choice, not a dependency one: putting a privacy-boundary change inside a diff about calendar filters is precisely the "unexplained extra field" failure this proposal argues against — one level up, in the diff instead of the model. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cross-tenant write on `tenants`, with no RLS backstop | **Med / severity High** | The change's top risk. Predicate from the verified JWT claim only; dedicated cross-tenant-write test; `tenant-isolation` spec names the audit gap explicitly rather than leaving it implied |
| Contact field added to `PublicAvailability` "because it's simpler" | Med | Separate model, separate endpoint, separate projection; D9's raw-body contract test extended to assert the availability response still carries no tenant-level field |
| A future contributor treats `tenants` as an owner-profile table, citing this precedent | **Med** | `tenant-management` states the rule: `tenants` holds only publicly-safe data. This is the whole reason the rule is written down now rather than after the second column |
| Date window implemented as containment | Med | A stay straddling the month boundary vanishes from the calendar and the owner sees a free night that is booked. Explicit spec scenario with a straddling stay |
| Guest aggregate becomes a stored column or a Python loop | Low | `tests/test_schema_no_derived_columns.py` already exists and must cover the new fields; D7 and `payment-tracking` both forbid it |
| Server and client compute a guest's balance differently | Med | The reason slice 2 exists at all. If it ships, the frontend must not also compute it |
| First post-baseline migration has no working `downgrade()` | Low | Slice 3 acceptance criterion, exercised not reviewed |
| Merge conflict with in-flight `production-readiness` phases 3–5 | **High** | Sequencing dependency below — this change does not start until those are committed |
| Gap 1 reversed later at real cost | Low | Tripwire named above; reversal is additive and cheap |

## Rollback Plan

Slices 1–2: revert the commit. Additive query parameters and derived read
fields, no schema change, no data implication.

Slice 3 carries the migration. Revert the commit, then `alembic downgrade` one
revision. The dropped column loses exactly one value per tenant — a phone number
the owner re-enters in seconds. This is the gentlest possible first exercise of
the downgrade path, which is a further argument for it being the slice that
proves it.

## Dependencies

- **`production-readiness` phases 3–5 must be committed first.** Phases 3–4 are
  in flight against `app/main.py`, `app/config.py`, `tests/test_config.py`,
  `docker-compose.yml` and `README.md`. This change touches routers, schemas,
  services, models and migrations — largely disjoint, but concurrent work on the
  same tree is not worth the conflict.
- **Alembic** (delivered by `production-readiness` slice 1, already committed).
  Slice 3 is the first consumer of `schema-migrations` beyond the baseline.
- Open Questions 1 and 2 answered before slice 2; 3, 4 and 5 before slice 3.

## Success Criteria

- [ ] `GET /reservations?client_id=…` returns only that guest's stays, including stays on a soft-deleted property.
- [ ] `GET /reservations?from=2026-09-01&to=2026-10-01` includes a stay from `2026-08-28` to `2026-09-03` (overlap, not containment).
- [ ] Supplying only `from`, or only `to`, is rejected; supplying neither returns the unfiltered list as before.
- [ ] The `client-management` historical-read scenario names exactly one mechanism, and a test asserts it.
- [ ] No `ReservationRead` field was added — gap 1 shipped as zero code, or the tripwire was documented as tripped.
- [ ] (If slice 2 ships) A guest's outstanding balance from the client read equals the sum of that guest's reservation balances under the rule chosen in Open Question 2, and no stored aggregate column exists in the schema.
- [ ] `GET /public/{slug}/availability` response bytes contain no tenant contact value — the existing D9 contract test, extended.
- [ ] The tenant contact is reachable only via its own public endpoint, whose response model carries no reservation, client, property or payment field.
- [ ] An authenticated owner of Tenant A cannot change Tenant B's contact, by any parameter, and a test proves it against the running `alquileres_app` role.
- [ ] `alembic upgrade head` then `alembic downgrade -1` leaves the schema equivalent to the baseline, verified by the `schema-migrations` mechanical check.
- [ ] The owner can set the number and it appears on the public page — **or** Open Question 5 has an accepted out-of-band answer recorded.

## Open Questions

Decisions this proposal cannot make alone.

1. **Confirm `GET /properties?include_inactive=true` exists** as design D8's
   behaviour matrix describes. Gap 1's zero-code recommendation depends on it:
   without it, a stay on a retired cabin renders nameless. If it does not exist,
   adding it is trivial and belongs in slice 1.
2. **Does a cancelled reservation with recorded payments count toward a guest's
   outstanding balance? And does a cancelled stay count as an "estadía"?**
   *This is the deciding question for slice 2, not a detail of it.* If the rule
   is trivial and permanent, the frontend can hold it and slice 2 may correctly
   ship as nothing.
3. **Should `GET /reservations` exclude cancelled reservations by default?**
   Screen 03's "Quién se queda" presumably should not list them. Changing the
   default is a silent behaviour change to a shipped endpoint; adding an explicit
   `status` filter is not. Related: should the default ordering move from
   `created_at` to `check_in`, which is what every consumer actually wants?
4. **WhatsApp number: validated and normalised, or stored as entered?** The
   button builds a `wa.me` link, which needs country code and digits only. A typo
   produces a link to nobody, silently — the failure has no symptom on the
   owner's side. Also: is one number enough, or is a second channel foreseeable?
5. **Where does the owner actually set it?** The design handoff states plainly:
   *"no settings screen"*. Screen 08 has per-cabin "Editar" but nothing at the
   tenant level. So the backend can ship the write path and **the frontend has
   nowhere to call it.** Either the design gains a small settings affordance, or
   the number is set out-of-band once (seed/manual) and the write path is
   deferred. This is a product decision, and it may reduce slice 3 to
   storage + public read only.
6. **`tenants` write protection:** application-level predicate, or per-command
   RLS policies on `tenants`? (Table in Approach.) Design decides the mechanism;
   the owner should know a write without an RLS backstop would otherwise be a
   first for this system.
7. **Nullable contact + frontend hides the button, or required at
   registration?** Recommendation: nullable. Requiring it would change
   `RegisterRequest`, which D10's addendum fixed at exactly
   `{tenant_slug, name, email, password}`.

**Recorded as deferred, not open:** password reset. It needs an email provider
and is its own change.

---

## Owner decisions after the proposal (2026-09-04)

### Open Question 2 — RESOLVED, and it collapses slice 2

**A cancelled reservation owes nothing. Its balance is 0.**

The owner's words: if the reservation is cancelled the money does not exist,
the balance returns to zero, and whether a deposit is returned is settled
personally with the guest. The recorded payments remain visible on the
reservation — they *are* the record that there is an amount to discuss.

**A cancelled stay is not counted as an "estadía."** The guest never came. It
still appears in the guest's stay list marked `Cancelada`: a count is a
summary, a list is a history.

This resolves the question the per-guest aggregate slice was gated on, and it
resolves it in the direction that removes the slice. Once a cancelled
reservation reports zero, a guest's outstanding balance is just the sum of
their reservations' balances, and slice 1's `client_id` filter already puts
that list in the frontend's hands. **Slice 2 is expected to ship as no code.**
That was named as a legitimate outcome when it was proposed; it is now the
likely one.

### New scope item — the cancelled-balance defect

This is not new work invented here; it is a defect the decision above
exposes. `ReservationRead.balance` is `effective_total - paid_amount` with no
reference to `status`, so a cancelled reservation of $180.000 carrying a
$60.000 deposit currently reports **"Le falta pagar $120.000"** — a figure
nobody owes.

The asymmetry is visible in the same file: `is_completed` *does* consult
`status` (a cancelled stay is never completed) while `balance` does not. One
derived field is status-aware and its neighbour is not.

Note the dashboard already agrees with the owner: `collected` excludes
cancelled reservations' payments. Fixing `balance` makes the two consistent
rather than introducing a new rule.

No migration. It changes a computed field and its spec, and it needs a test
that a cancelled reservation reports zero regardless of what was paid.

### New scope item — payment method as a stored enum

The owner wants how a payment arrived recorded rather than typed into free
text: a new enum column on `payments` (`efectivo`, `transferencia`, `otro`).
Only the owner knows the method, so it must be stored.

**The payment's *purpose* is not stored.** The first payment on a reservation
is the "Seña" and the rest are "Pago" — derived and displayed, never a column,
consistent with D7's standing rule that nothing derivable is persisted. Two
consequences for whoever implements it:

- **Derive by `paid_on`, not by insertion order.** If the owner records a
  March payment before January's deposit, "first by `created_at`" names the
  wrong one as the seña.
- A refund is neither seña nor pago. The negative sign already distinguishes
  it, and no enum value should duplicate that.

This carries a migration, so it joins slice 3 rather than opening a fourth —
one revision covering both new columns, reviewed together.

### Explicitly NOT in scope: cookie-based sessions

Considered and deferred. The frontend keeps its bearer token in
`localStorage` for now. Front (Vercel) and back (Railway) will sit on
different registrable domains until a custom domain is bought, and across
different sites a session cookie is a third-party cookie — already blocked by
Safari and being phased out by Chrome. It would not work, not merely cost
more.

The trigger that reopens it is the domain purchase, which the owner is
holding until the system has been used and found worth keeping. When it
happens, the cookie migration and password recovery should land together
rather than touching auth twice.

### Revised slicing

| # | Slice | Change |
|---|-------|--------|
| 0 | `client-management` disambiguation | unchanged, spec only |
| 1 | Reservation list filters | unchanged |
| 2 | Per-guest aggregates | **expected to be no code**, pending confirmation once slice 1 lands |
| 3 | Tenant public contact **+ payment method enum** | one migration, two columns |
| 4 | **Cancelled-reservation balance** | new. No migration; lands independently and can go first if convenient, since the frontend needs it before it can display any guest's balance correctly |
