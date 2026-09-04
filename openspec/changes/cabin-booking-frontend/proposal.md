# Proposal: Cabin Booking Frontend

> **Size note.** The 450-word proposal budget is deliberately exceeded, following
> the precedent set by this project's `design.md`, `production-readiness`, and
> `frontend-api-alignment`. The month calendar alone carries three distinct
> behaviours over one geometry, and compressing that argument would produce a
> shorter document and a worse component.
>
> **Scope note.** The design handoff
> (`Diseño de app con paletas de color/design_handoff_alquileres_aya/README.md`)
> is **settled input**. Colours, type, radii, spacing, wording and screen layout
> are final and are not this proposal's to revisit. This proposal decides **what
> gets built, in what order, and where the risk is.**
>
> **Boundary note.** No backend change is proposed here. Every API gap belongs to
> `frontend-api-alignment`; this document only states how the frontend behaves
> until those land.

## Intent

The API is complete and the design is final, and **Ana still cannot do anything.**
There is no surface she can open. Her ledger is still a paper notebook and a
WhatsApp thread, and the system she paid for is reachable only by `curl`.

Stated as what she cannot do today, not as a list of screens:

| She cannot… | Which means |
|---|---|
| See which nights are taken, on her phone, in under two taps | The calendar exists as JSON only. The screen she would open most does not exist. |
| Write down a reservation she just agreed on WhatsApp | `POST /reservations` is real; nothing types into it. |
| Know who still owes her money, or how much | `balance` is computed on every read and displayed nowhere. |
| Send a prospect a link that shows free nights | `GET /public/{slug}/availability` is live, correct, privacy-audited — and has no page. |

The last row is the sharpest: the backend's most carefully protected endpoint
(three independent isolation layers, design D9) currently protects data that
**nobody can see at all**, because there is no page. That asymmetry is the whole
argument for this change.

## Scope

### In Scope

- A **React + Vite + TypeScript** app in `front/`, mobile-first, twelve designed
  screens plus the surfaces the handoff implies but does not draw (enumerated in
  Open Questions).
- A **shared month-calendar core** serving three different behaviours over one
  geometry.
- **Owner session**: sign in, tenant slug from the URL, token lifetime, and what
  happens when it expires mid-use.
- The **public availability page**, as a separate unauthenticated route tree that
  structurally cannot reach the authenticated app.
- **Spanish copy and AR formatting** as an enforced, tested concern — not a
  review-time convention.
- A **UI test strategy** proportionate to a project whose backend carries 151
  tests and practises strict TDD.

### Out of Scope (non-goals — binding)

- **Any backend change.** Owned by `frontend-api-alignment`.
- Revisiting colours, type, spacing, copy or screen layout. The handoff is final.
- React Native, or any native app. React web.
- Multi-user, roles, invitations, notifications, badges, onboarding, tours,
  tooltips, a settings screen. All explicit non-goals of the brief.
- A booking flow for guests. Guests message her on WhatsApp; that is the product.
- Password reset (`frontend-api-alignment` records it as deferred — the link is
  simply absent from screen 01).
- Offline write support / a service worker. See Open Question 7 — if the answer
  changes, this becomes its own change, not a bolt-on.
- Real cabin photos for the public page. Striped placeholders ship; photos are an
  asset delivery, not code.
- The `back/` + `front/` repository restructure. A prerequisite, not a
  deliverable — see Dependencies.

## Capabilities

### New Capabilities

- `frontend-foundation`: the app shell — Vite/TypeScript build, design tokens and
  Nunito Sans, the two route trees and the import boundary between them, the API
  client (base URL, bearer header, `{detail, code}` error mapping), and the
  TanStack Query / Zustand ownership boundary.
- `owner-session`: sign in with email and password only; the tenant slug comes
  from the URL and is never a form field; where the token lives; and the
  behaviour when an 8-hour, non-renewable token expires while she is typing.
- `interface-copy-and-formatting`: the Spanish glossary as a *testable*
  requirement, the forbidden-word list (including technical words on error
  paths), `$ 180.000`, `3/9` and `3 al 7 de septiembre`, and the plain-date rule
  that ISO strings are never converted through a timezone.
- `month-calendar-rendering`: the shared geometry — Monday-first weeks, a
  half-open `[check_in, check_out)` range rendered as a bar rounded on the first
  night and the last night and full-bleed between, the **adjacency rule** (a day
  that is both a checkout and a check-in renders two half bars and must never
  read as a conflict), stays straddling the month boundary, and the three-pastel
  assignment that keeps neighbouring stays distinguishable.
- `reservation-calendar`: screen 03 — per-cabin month view, the "Quién se queda"
  list, and the client-side resolution of cabin and guest names.
- `reservation-recording`: screens 04 and 05 plus the two undrawn wizard steps —
  a four-step flow whose state survives navigation, showing availability
  *before* asking for dates, and the two mutually exclusive price modes.
- `reservation-ledger`: screens 06 and 07 plus the undrawn payment and refund
  sheets — the stay, its payments, `Saldo` including the negative case ("Le tenés
  que devolver", a normal state), and cancellation.
- `guest-directory`: screens 09 and 10 plus add/edit — guests keyed by phone,
  deactivated guests visible by design, and the per-guest stay count and balance.
- `cabin-directory`: screen 08 — two cabins, add, rename, deactivate. Nothing is
  ever deleted.
- `home-summary`: screen 02 — occupied nights and one primary action.
  **Deliberately no revenue figure**, overriding the original brief's "how much
  she collected". `GET /dashboard/summary` returns `collected`; this screen must
  not render it.
- `public-availability-page`: screens 11 and 12 — the privacy boundary enforced
  a second time, in the client, on a route tree that cannot import an
  authenticated module and never sends an `Authorization` header.

### Modified Capabilities

**None.** No existing spec requirement changes. Every API-side change the design
implies is owned by `frontend-api-alignment`.

## Approach

### The month calendar — one core, three components (not one component, three modes)

It appears three times, and getting it wrong is the difference between a good app
and a bad one:

| Surface | Bars | Interaction | Colour |
|---|---|---|---|
| 03 private | one per stay | none (read-only) | three rotating pastels |
| 04 picker | taken nights inert; selected range solid | tap opens a range, second tap closes it; **past dates freely selectable, never warned** | `#E6E6EE` taken / `#8A90E8` selected |
| 11–12 public | one neutral bar | none | `#E4E5F0` |

**Decision: a shared headless core plus three thin presentational components. Not
a single component with a `mode` prop.**

The expensive, error-prone part is identical in all three and contains no
interaction at all:

- generating a Monday-first month grid with leading and trailing blanks;
- converting half-open `[check_in, check_out)` ranges into **per-day segments** —
  `start` (rounded left), `middle` (full-bleed), `end` (rounded right),
  `single` — so a range reads continuous across a week boundary;
- the **adjacency split**: a day carrying both an outgoing `end` and an incoming
  `start` yields two half segments, left closing and right opening;
- stays that straddle the month boundary rendering correctly in *both* months.

That is a pure function over `{start, end, key}` and a month. It knows nothing
about reservations, guests, auth, or colour. It is the single most test-worthy
artifact in this change.

The three surfaces differ in exactly the parts that are *cheap*: fill colour,
whether a cell responds to a tap, and whether selection state exists. A `mode`
enum would put a picker's selection state, a private view's per-stay colour
assignment, and a public view's absence of both into one component — three
disjoint branch sets in one file, which is three components wearing a trench
coat. Worse, it would make the public page import a component that knows what a
reservation is, which is exactly the coupling the privacy boundary forbids.

**This split is what reconciles the two constraints that otherwise conflict:**
"don't duplicate the hard geometry" and "the public tree must import nothing from
the authenticated app". The core lives in `front/src/shared/calendar/`, imports
no domain type, and is therefore legal for both trees.

Pastel assignment is its own small rule, easy to get subtly wrong: three colours
cycled by `check_in` order, with the constraint that two stays sharing an
adjacency day must not receive the same colour — otherwise the half-bar split is
invisible and adjacency *does* read as one continuous stay.

### Where the JWT lives

The API issues an HS256 bearer, **8-hour expiry, no refresh** (`app/security.py`).
There is no httpOnly-cookie option available to this change: `allow_credentials`
is `False` by design (D22, bearer not cookie), and changing that is a backend
change this proposal does not get to make.

So the real choice is `localStorage`, `sessionStorage`, or memory.

**Recommendation: `localStorage`. This is a close call and is argued, not
asserted.**

- The security difference between the three is smaller than it looks. Any XSS in
  a SPA can act as the user for as long as the page is open, whatever the storage
  is. The difference is only what survives after she closes the tab.
- The blast radius is already bounded by the backend: an 8-hour token with **no
  refresh token to steal**. A stolen token cannot be extended, and there is no
  long-lived credential in the browser to take.
- The ergonomic difference is large and predictable. Memory-only means she
  re-types an email and password on a phone keyboard every time the tab is
  evicted — which on a phone is constantly. `sessionStorage` behaves
  unpredictably across "open from home screen" and "open in a new tab", so it
  buys a security margin that is small and pays for it with ergonomics that are
  browser-dependent. A non-technical owner forced to re-authenticate a dozen
  times a day writes her password on a sticky note, which is a *worse* security
  outcome than the one we avoided.

**The honest residual: an XSS here is her whole account for up to 8 hours, and no
storage choice available to a bearer-token frontend changes that.** The actual
mitigation is not storage, it is not having an XSS: React escapes by default, and
this app renders no user-generated HTML, loads no third-party script at runtime,
and can forbid `dangerouslySetInnerHTML` as a lint rule rather than a habit.
**Tripwire that reverses this decision:** the app gains a third-party script tag,
a rich-text field, or any HTML-from-server rendering. Then the correct answer is
a backend change to httpOnly cookies, and that is a different proposal.

**Expiry mid-use.** One place handles it: the API client maps any `401` to
"clear the token, return to Ingresar". Two rules make that survivable:

1. The message never says *token*, *sesión*, *expiró* or anything technical. It
   says she needs to enter again, in the handoff's register.
2. **A wizard draft is not lost.** It lives in a store outside the React tree, so
   a redirect to Ingresar does not destroy it; after re-login she lands back on
   the step she was on. Losing four steps of typing to an invisible clock is the
   single most enraging failure this app could have.

### The state boundary

**TanStack Query owns all server state** — properties, clients, reservations,
payments, dashboard, public availability — including caching, refetching and
invalidation after a mutation.

**Zustand owns exactly two things, and both are justified by living outside the
React tree:**

1. **The session** (token + tenant slug). Read by the API client's request
   interceptor, which is not a component and cannot use a hook.
2. **The reservation wizard draft** (cabin, dates, guest, price mode, amount).
   Spans four routes, and must survive both a back-chevron and the 401 redirect
   above.

**Explicitly forbidden**, because each is a real temptation:

- mirroring any server list into a store — the query cache already holds it, and
  a second copy is a second truth about money;
- the selected cabin on screen 03 and the displayed month — those are **URL
  search params**, so reload and the browser back button keep working;
- any derived balance or total — derived at render from data already in hand.

**Is Zustand needed at all?** Honestly, no: the session could be a module-scope
variable plus a context, and the draft could live in a parent route's state. It
earns its place for those two cases and no more. **If either collapses, delete
the store rather than find work for it.**

### Routing, and how the slug enters

Two trees, one app:

| Tree | Routes | Auth |
|---|---|---|
| Public | `/disponibilidad/{slug}` | none, ever |
| App | `/login`, `/inicio`, `/calendario`, `/huespedes`, `/cabanas`, `/reserva/:id`, `/reserva/nueva/:paso` | bearer |

A **reserved path prefix** for the public page, not a bare `/{slug}`, so a tenant
slug can never collide with an app route. The exact word is a naming decision,
not a structural one.

**The slug enters only at login, and nowhere else.** After that the API resolves
the tenant from the JWT's `tid` claim (D4) — a slug in authenticated URLs would
be decoration and a chance for the URL to disagree with the token. Per
`frontend-api-alignment`'s recorded D10 mitigation, the login route accepts
`?tenant=<slug>`; because this deployment serves one owner, a build-time
`VITE_TENANT_SLUG` is the default so her bookmark is simply `/login`, and the
query parameter overrides it. She never sees the word.

**The public tree's isolation is structural, not conventional** — the frontend
analogue of D9. It imports only from `src/public/**` and `src/shared/**`; an
ESLint import-boundary rule fails the build otherwise, and its fetch function is
its own and attaches no `Authorization` header.

### Testing strategy

Strict TDD is this project's norm and the backend carries 151 tests. A UI does
not get a free pass, but the mapping is not one-to-one: **most of a UI is not
worth testing, and the parts that are, are not the parts that render.**

**Tools:** Vitest + React Testing Library + MSW (mocking at the network boundary,
so tests exercise the real query layer and the real error mapping). Strict
TypeScript is the cheapest test in the stack and is not a substitute for any of
the below.

**Test-first, always — these are pure functions and the reason the architecture
above extracts them:**

- calendar segmentation: adjacency, month-boundary straddle, first/last rounding,
  single-night stays, short and leap months, Monday-first week starts;
- pastel assignment: two stays sharing an adjacency day never share a colour;
- money and date formatting, run with the machine timezone set to **UTC** so the
  off-by-one is caught rather than masked;
- price-mode logic: per-night rescales on a date change, stay-total does not;
- display balance, including the negative case and the cancelled-stay workaround.

**Behaviour worth an RTL + MSW test, because the rule is a product promise:**

- the picker cannot start a range on a taken night;
- a past date is selectable and produces no warning of any kind;
- a `401` mid-wizard returns her to Ingresar **and the draft survives**;
- **the public page's rendered DOM contains no guest name, phone, price or
  payment** — MSW seeds distinctive strings and the test asserts their absence,
  the direct analogue of `tests/test_public_contract.py`;
- the public page issues no request carrying an `Authorization` header;
- no source string matches the forbidden-word list.

**Deliberately not tested:** token and colour values, snapshot tests of markup
(they assert nothing and fail on every design-faithful edit), that a button
renders, third-party library behaviour, pixel layout.

**E2E deferred, and named as a decision.** One Playwright smoke path (login →
record a stay → record a payment → see the balance) is worth having, but not
before slice 6, when there is a path to smoke. Building it earlier tests a
skeleton.

### Money and dates as one shared concern

One module, used everywhere, never inlined:

- **Money.** `$ 180.000` — dot thousands separator, no decimals, `es-AR`. The API
  serialises `Decimal` as a **string** (`"5000.00"`). The rule: parse to a number
  only at the formatting boundary, never round-trip a computed money value back
  to the API, and treat every client-side aggregate as display-only.
- **Dates.** `3/9`, or `3 al 7 de septiembre`. ISO never reaches the interface.
- **The bug that will otherwise happen.** `new Date("2026-09-03")` parses as UTC
  midnight and renders as **2/9** in Argentina. A calendar off by one day is a
  wrong ledger. Rule: an API date string is a plain date — three integers, never
  an instant — and is never constructed into a `Date` for display.
- "Today" is computed in `America/Argentina/Buenos_Aires`, matching the server's
  `today_ar()`, or a stay reads as finished on one screen and not another.
- The week starts **Monday** (`L M M J V S D`) everywhere, including the public
  page.

### Working within the known API gaps

No backend change is proposed. Behaviour until `frontend-api-alignment` lands:

| Gap | Frontend behaviour now |
|---|---|
| No names on `ReservationRead` | Resolve client-side from `/clients` and `/properties`, cached by TanStack Query. **Both fetched with `include_inactive=true`** — otherwise a deactivated guest's stays render nameless, and screen 09 shows deactivated guests *by design*. One hook per lookup, defined once, so this cannot be got wrong in a second call site. |
| `GET /reservations` filters only by `property_id` | Filter by guest and by date window client-side. Two cabins and a handful of guests — this is a `filter()`, not a performance question. |
| No per-guest aggregate | Compute from the reservation list, in the shared display-balance helper. |
| No WhatsApp number field | Read a build-time `VITE_WHATSAPP_NUMBER`. **If unset, the button is not rendered at all** — a dead `wa.me` link fails silently on the prospect's side, where nobody will ever report it. When the endpoint ships, the env var becomes the fallback and is then deleted. |
| A cancelled reservation reports a non-zero `balance` (a defect) | `displayBalance()` returns zero for `status === 'cancelled'`, and no "Debe" chip renders on a cancelled stay. **One helper, one line to delete** when the backend fix lands. Related: `GET /reservations` returns cancelled stays and orders by `created_at`; "Quién se queda" filters them out and every list sorts by `check_in`. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `front/` | New | The entire application. Nothing outside it changes. |
| `front/src/shared/calendar/` | New | Month grid + segmentation. Imports no domain type — legal for both route trees. |
| `front/src/shared/format/` | New | Money, dates, plain-date arithmetic. |
| `front/src/shared/api/` | New | Client, bearer header, `{detail, code}` → Spanish copy map, 401 handling. |
| `front/src/public/` | New | Screens 11–12. Import-isolated from `src/app/**`. |
| `front/src/app/` | New | Screens 01–10, tab bar, wizard. |
| `front/src/stores/` | New | Exactly two stores: session, wizard draft. |
| `front/tests/` | New | Vitest + RTL + MSW. |
| `openspec/specs/*` | New | Eleven new capability specs per above. |
| `docker-compose.yml` | Modified (later) | A `front` dev service — a deployment concern, not slice 1. |
| `back/**` | **Unchanged** | No application code, test, or config is touched by this change. |

## Slicing (proposed order)

Far beyond a 400-line budget in total. Eight slices, chained.

| # | Slice | Capabilities | Why here |
|---|-------|---|---------|
| 1 | **Foundation** | `frontend-foundation`, `interface-copy-and-formatting` | First, and it ships **no screen** — accepted deliberately. This is where the three structural decisions (token storage, state boundary, two route trees) become code rather than prose, and where the formatting rules that every later slice depends on get their tests. Keep it small; slice 2 validates it immediately. |
| 2 | **Public availability page** | `month-calendar-rendering`, `public-availability-page` | Second, and this is the ordering argument worth reading. It is the **only slice needing no auth, no money, and no wizard**, so it forces the hardest component — the month geometry — into existence under the *simplest* rendering rules, where a bug is visible rather than tangled with selection state. It is **independently shippable and immediately valuable**: Ana can paste the link into WhatsApp before the app she logs into exists. And the public tree's import isolation is cheapest to establish while the authenticated tree is still nearly empty — retrofitting a boundary is how boundaries get holes. |
| 3 | **Ingresar + Inicio** | `owner-session`, `home-summary` | The authenticated shell becomes real: token, tab bar, `GET /dashboard/summary`. Small, and it unlocks everything below. Tabs 3 and 4 land here as **instructive empty states**, per the handoff's rule — never a dead link. |
| 4 | **Reservation calendar** | `reservation-calendar` | The heart of the app and the screen she opens most. Extends slice 2's core with per-stay pastels and adjacency half-bars, and introduces the client-side name resolution that slices 6 and 7 both reuse. Before the wizard, because "show availability before asking for dates" is literally this screen's data. |
| 5 | **Recording a reservation** | `reservation-recording` | The one action of the home screen. The picker is slice 4's grid plus selection. **The one real ordering tension:** step 3 needs a guest, and the guest directory is slice 7. Resolved by building the find-or-create-by-phone sheet here (`POST /clients` already *is* find-or-create-or-reactivate), which slice 7 then reuses rather than duplicates. |
| 6 | **Reservation detail, payments, cancel** | `reservation-ledger` | Money. Needs slice 5 for something to open. **The app becomes usable by Ana at the end of this slice, not before** — slices 1 and 3–5 are internal milestones; only slice 2 ships standalone value. |
| 7 | **Guests** | `guest-directory` | Reuses slice 6's stay rows and slice 5's guest sheet. Adds client-side search and the per-guest aggregate. |
| 8 | **Cabins** | `cabin-directory` | Last, and genuinely so: two rows that change roughly never, and cabins can be created once through the API. Its "9 noches ocupadas este mes" reuses slice 3's per-property breakdown. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Calendar segmentation wrong — adjacency reads as a conflict, or a stay straddling the month boundary vanishes | **High** | The reason segmentation is a pure function. Unit tests include a same-day checkout/check-in cell and a 28/8–3/9 stay asserted present in **both** months. A vanished stay means she sells a booked night. |
| `new Date("2026-09-03")` renders 2/9 in Argentina | **High** | Plain-date rule, and formatting tests run with the machine timezone set to UTC so the bug cannot hide behind a matching local clock. |
| Undesigned surfaces invented ad hoc and drifting from the handoff | **High** | The largest *product* risk here. The handoff draws 12 screens; the app needs roughly 8 more (Open Question 1). Each gets a recorded copy + layout decision before it is built, or a design from the owner. |
| Lookups fetched without `include_inactive=true` → nameless stays and a broken screen 09 | Med | One hook per lookup, defined once; a test asserts no other call site fetches `/clients` or `/properties`. Named as a trap in `frontend-api-alignment` and cheap to hit. |
| XSS → her whole account for up to 8 hours | Med / severity **High** | Named openly rather than argued away. No `dangerouslySetInnerHTML`, no runtime third-party script, minimal dependencies, and a stated tripwire that reverses the storage decision. |
| The public tree imports an authenticated module, leaking private data or an auth header onto a stranger's page | Med | ESLint import-boundary rule (build fails, not review), a DOM-level absence test, and a test asserting no `Authorization` header. The client-side half of D9. |
| Technical or forbidden words reach the interface, most likely on an error path | Med | A `409` must never surface as "conflicto". `{status, code}` → Spanish sentence map in one module, plus a glossary test over source strings. |
| Cancelled stay shows a `Saldo` she does not owe | Med | Single `displayBalance()` helper; one line deleted when the backend defect is fixed. Being trusted about money is the app's entire job. |
| A store grows to mirror the query cache, creating a second truth about money | Med | Two stores, both justified above; anything else is a rejected addition, not a judgement call. |
| Scope creep toward a booking engine (availability holds, notifications, guest self-service) | Low | Binding non-goals above. She records decisions she already made. |
| Merge conflict with in-flight backend work | Low | This change touches nothing outside `front/` and its own specs. |

## Rollback Plan

Per slice, revert the commit. The frontend stores nothing but a JWT in the
browser and writes to the API only through documented endpoints, so **no revert
has a data implication** — reverting slice 6 does not un-record a payment.

Slice 2 is separately deployable and separately removable: the public page can be
taken down without touching the authenticated app, and vice versa, which is a
direct benefit of the two-tree split rather than an accident of it.

The only genuinely awkward rollback is slice 1, because everything sits on it —
which is the argument for keeping it small and for slice 2 validating it
immediately rather than four slices later.

## Dependencies

- **The `back/` + `front/` restructure must land first.** `openspec/` and
  `docker-compose.yml` stay at the root. This change assumes that layout.
- **`production-readiness` must be committed.** CORS is delivered there and
  without it a browser cannot call a single endpoint.
- **`CORS_ALLOWED_ORIGINS` must include the frontend's dev origin
  (`http://localhost:5173`) and, later, its deployed origin.** It has no default
  and `*` is rejected at boot. **This is a day-one blocker on slice 1, not a
  deployment detail** — the very first `fetch` fails without it.
- `frontend-api-alignment` is **not** a blocker. Every gap has a stated
  workaround above, each isolated to one helper so it deletes cleanly.
- Nunito Sans (Google Fonts). Two or three cabin photos for the public page —
  placeholders ship without them.

## Success Criteria

- [ ] A day carrying both a checkout and a check-in renders **two half bars** with two different stay identities, and never a conflict indication.
- [ ] A stay from `2026-08-28` to `2026-09-03` renders bars in **both** the August and September views.
- [ ] The picker cannot start or end a range on a taken night, and a date in the past is selectable with **no warning of any kind**.
- [ ] The public page's rendered DOM contains no guest name, phone, price, or payment amount, asserted against MSW-seeded distinctive strings.
- [ ] No request originating from the public route tree carries an `Authorization` header.
- [ ] A build fails when a module under `src/public/` imports from `src/app/`.
- [ ] `$ 180.000` and `3 al 7 de septiembre` render exactly, with the test machine's timezone set to UTC.
- [ ] An expired token during step 3 of the wizard returns her to Ingresar, and after signing in her draft is intact.
- [ ] No source string matches the forbidden-word list, including error copy.
- [ ] A cancelled reservation shows no amount owed anywhere in the interface.
- [ ] A stay belonging to a deactivated guest renders that guest's name, and the guest appears in screen 09 marked `Desactivado`.
- [ ] Screen 02 renders no revenue figure, even though `GET /dashboard/summary` returns `collected`.
- [ ] Every list of stays is ordered by `check_in`, not by the API's `created_at`.

## Open Questions

Decisions this proposal cannot make alone. (1) and (2) block slice 5; (3) and (4)
block slice 2; (5) blocks slice 1.

1. **The handoff draws 12 screens; the app needs about 20.** Which of these get a
   design, and which are extrapolated from the tokens? Wizard steps 1 (cabaña)
   and 3 (huésped); the "Anotar un pago" sheet; the "Devolución" sheet;
   add/edit huésped; add/edit/deactivate cabaña; the deactivation confirmation
   sheet. **And the one that is not merely undrawn but unreachable: there is no
   affordance anywhere to edit a saved reservation's dates or price.** The brief
   says "New / edit reservation" and the API supports `PATCH`, but screen 06
   offers only pay, refund and cancel. If the answer is genuinely "no editing",
   correcting a typo costs cancel-and-recreate, which detaches the payment
   history from the stay.
2. **Screen 06 shows `12/8 · seña — $ 60.000` and `3/9 · efectivo — $ 40.000`.**
   Are "seña" and "efectivo" free text in the payment's `note`, or a fixed set of
   labels she picks from? The design reads like a category; the API has only free
   text. A picker is kinder on a phone and makes the list scannable — but it is a
   product decision about her vocabulary, not a technical one.
3. **What exactly does she paste into WhatsApp?** The public URL shape, and
   whether her bookmark for the app is `/login` with a build-time slug (proposed)
   or always carries `?tenant=`.
4. **The WhatsApp number until the API field exists** — build-time value, or hide
   the button? Proposed: build-time, and hide it if unset rather than ship a link
   to nobody.
5. **Confirm the login-persistence tradeoff knowingly.** `localStorage` means she
   stays signed in across app opens for the token's 8 hours, and that an XSS
   would reach it. The alternative costs her an email and password on a phone
   keyboard many times a day. This proposal recommends `localStorage`; the owner
   should accept it rather than inherit it.
6. **"Me olvidé la contraseña" is removed** (reset is deferred, per
   `frontend-api-alignment`). The design draws the link. Confirm it is simply
   absent — **and what actually happens if she forgets it.** Today the answer is
   an operator resetting it by hand, and that answer needs to exist before she
   depends on the app.
7. **Does it need to work with no signal?** Mar del Tuyú, a phone, and a habit of
   recording stays days later. Query caching gives read resilience nearly free;
   **writes do not**, and if she records reservations offline this becomes a
   materially different application, not a later enhancement. Worth answering
   before slice 5, not after.
8. **Cancelled stays: do they appear in a guest's "estadías" and count toward the
   stay count?** Screen 10 shows both a count and a list. This is
   `frontend-api-alignment`'s Open Question 2 seen from the interface; the
   frontend must pick a rule now, and it should be the same rule the backend
   later enforces.
9. **Does the interface ever need to handle more than two or three cabins?** The
   segmented control on screens 03 and 11 fits two, and the palette has three
   pastels. If a third or fourth cabin is plausible, the graceful behaviour
   should be decided now rather than discovered.
