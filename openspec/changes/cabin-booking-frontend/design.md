# Design: Cabin Booking Frontend

> **GOVERNANCE — READ BEFORE IMPLEMENTING.** `owner-session` (D29) is **CRITICAL** domain: it decides where a bearer token lives in a browser and what happens when it expires. The decisions below are a *proposal awaiting explicit human approval*. No code is written by this document, and D29 must ship as its own reviewable slice, never folded into a batch. No approval is implied by the existence of this document.

> **Size note.** The design budget is deliberately exceeded, following the precedent of this project's two archived designs. Thirteen decisions, one of them (D26) load-bearing for every date the owner will ever read. The central failure mode here is *silent*: a calendar off by one day produces a wrong ledger, not a visible error. Compressing the analysis of how it fails silently would be false economy.

> **Numbering.** Decisions continue from the archived `production-readiness` design (D13–D24), which continued from `cabin-booking-api` (D1–D12). Nothing in D1–D24 is superseded here. This change touches no backend code; where it depends on a backend decision, it cites it.

## Binding inputs (already decided, not reopened here)

1. **React + Vite + TypeScript + Zustand + TanStack Query.** React web, mobile-first responsive. Not React Native.
2. **The app lives in `front/`**, alongside `back/`. `openspec/` and `docker-compose.yml` stay at the root (engram `#1131`). `front/` does not exist yet; this design decides its shape.
3. **The tenant slug comes from the URL, never a form field.** The owner types an email and a password, and nothing else.
4. **All interface copy is Spanish**, using the handoff's glossary exactly.
5. **No offline writes** (engram `#1128`). Read caching only. Recording a reservation requires connectivity, because the non-overlap invariant is enforced by an `EXCLUDE` constraint (D6) that only the server can evaluate, and a queued write later rejected leaves the owner having already told a guest yes.
6. **Editing a saved reservation is in scope** (engram `#1129`). `ReservationUpdate` bounds it to `check_in`, `check_out`, `price_per_night`, `price_total`. A cancelled reservation offers no edit affordance.
7. **The design handoff is settled.** Colours, type, radii, spacing, copy and layout are final.

## Technical Approach

The backend already owns every invariant that matters: non-overlap, tenant isolation, price derivation, the privacy projection. This frontend does not re-implement any of them and must not pretend to. Its job is narrower and, stated honestly, mostly presentational — with **three exceptions where the client is genuinely the only authority**, and those three carry the whole design:

1. **The calendar geometry.** The server returns half-open `[check_in, check_out)` ranges. Turning them into a Monday-first grid of bars, with adjacency drawn as two half bars and stays straddling a month boundary drawn in both months, exists nowhere but here.
2. **The date representation.** The server speaks plain dates with no time and no zone. JavaScript has no such type, and its default coercion (`new Date("2026-09-03")` → UTC midnight → **2 September** in Argentina) is wrong in exactly the direction that produces a wrong ledger.
3. **The self-exclusion on the edit screen.** An `EXCLUDE` constraint compares distinct rows, so a reservation never conflicts with itself. The server therefore cannot detect the interface bug where the owner tries to shift a stay by one day and her own booking blocks her.

Two standing rules from the archived designs still apply and are load-bearing below:

1. **Never store a value derived from other stored facts.** Here it reads: never mirror server state into a store, and never recompute a number the server already sent.
2. **A rule that can only be followed by remembering it is not a rule** (`production-readiness`, rule 3). Where a guarantee can be made structural — an unreachable module, an absent field on a type, a parameter with no default — it is made structural and the cost is paid.

To which this change adds a third, specific to a browser:

3. **The type system is the cheapest test in the stack, and several guarantees in this design exist *only* there.** A branded date type, an error object with no `detail` field, and a required `excludeId` parameter are not documentation. They are the enforcement.

---

## Architecture Decisions

### D25 — `front/` is three trees, and the dependency arrows only point one way

```
shared/  ←  app/          app/ ✕→ public/
shared/  ←  public/       public/ ✕→ app/
shared/  imports from neither
```

`shared/` may contain **no domain type** — no `Reservation`, no `Client`, no notion of a guest or a price. That is not stylistic tidiness; it is what makes the calendar core legally importable by the public tree, which is the constraint that decides D28.

| Option | Tradeoff | Verdict |
|---|---|---|
| Type-first (`components/`, `hooks/`, `pages/`, `utils/`) | The React default, and everyone recognises it. It puts the wizard's four steps in three different directories and gives the public/authenticated boundary nowhere to live — the boundary would cut *across* every folder, so no lint rule can express it. | Rejected |
| Atomic design (`atoms/`, `molecules/`, `organisms/`) | Fine vocabulary for a design system. This is one app with twelve designed screens and no component library to publish; the taxonomy debate would cost more than the structure returns. | Rejected |
| **Three trees, feature-first within each** | A reader looking for "how a reservation is edited" opens one directory. The privacy boundary is a directory boundary, so `import/no-restricted-paths` can enforce it and the build fails rather than a reviewer noticing. Cost: `shared/ui/` and `shared/copy/` are cross-cutting buckets that will attract junk, and need a stated admission rule. | **Chosen** |

**Admission rule for `shared/`:** a module belongs there if and only if it (a) is imported by both trees or is plausibly about to be, and (b) references no domain concept. `shared/ui/Button.tsx` qualifies. A `StayRow` does not, and goes in `app/reservations/`.

**The name collision that will otherwise waste an afternoon.** Vite's static-asset directory is `public/` by default, and this design also has a *source* tree at `src/public/`. Two directories called `public` with unrelated meanings is how a font ends up in the wrong one and a route module ends up copied verbatim into the build output. Fixed in one line: `publicDir: 'static'` in `vite.config.ts`, so assets live in `front/static/` and `src/public/` is unambiguous.

### D26 — Dates: a branded ISO string as the representation, `Temporal.PlainDate` as the engine, and `Date` banned outright

This is the decision the rest of the app rests on, and it is not a detail. Every date in this system — `check_in`, `check_out`, `paid_on`, the dashboard window — is a **plain calendar date**: three integers, no time, no zone. The backend already models it that way (D7: all business dates are `DATE`, `TIMESTAMPTZ` never appears in a report, and `America/Argentina/Buenos_Aires` is used in exactly one function). JavaScript has no plain-date type, and its nearest primitive is an instant that *prints* as a date.

**The failure, precisely.** `new Date("2026-09-03")` is parsed by the ES spec as UTC midnight. Rendered in Argentina (UTC−3) it is `2/9`. Nothing throws, nothing logs, and the developer's machine — if it is set to Buenos Aires — shows the same wrong answer as production, so the bug is invisible until the owner says a guest arrived on the wrong day.

| Option | Tradeoff | Verdict |
|---|---|---|
| `Date` plus a discipline ("always construct with `new Date(y, m-1, d)`") | Zero dependencies. It is a rule that can only be followed by remembering it, on the one value in the system where forgetting is silent and expensive. The project's standing rule 3 forbids exactly this. | **Rejected** |
| `date-fns` | Excellent function set, tree-shakeable, and `parseISO("2026-09-03")` does correctly give local midnight. But every function takes and returns a `Date`, so the type system still cannot tell a calendar date from an instant, and one `new Date(apiString)` anywhere reintroduces the bug. It hands us *functions*, not *impossibility*. | Rejected |
| `Luxon` | `DateTime` is a zoned instant by design. Modelling a plain date with a type whose defining feature is a time zone means carrying the concept we are trying to eliminate, plus ~70 kB. | Rejected |
| `Day.js` | `Date`-backed with a plugin surface. Same objection as `date-fns`, with less type safety. | Rejected |
| Hand-rolled arithmetic on `{y, m, d}` or a day-number | No dependency, ~120 lines, exactly the eight operations needed. But it means re-deriving leap-year and month-length arithmetic — the one category of code where "obviously correct" and "correct" diverge — as a side quest, in a change that already has a hard calendar problem to solve. | Rejected |
| **Branded ISO string as the representation; `Temporal.PlainDate` (via `temporal-polyfill`) as the arithmetic engine, confined to `src/shared/date/`** | ~20 kB gzipped for a polyfill of a language feature still landing in browsers, and one module that knows the trick. In exchange the *domain type is the wire format* (no serialize step to get wrong), arithmetic comes from a spec-grade implementation, and `Temporal.PlainDate` has no instant to be off by — converting one to an instant requires naming a time zone explicitly, which nothing in this app does. | **Chosen** |

**The representation.**

```ts
export type PlainDate = string & { readonly __plainDate: unique symbol };  // "YYYY-MM-DD"
export type YearMonth = { readonly year: number; readonly month: number };  // month 1–12
```

A `PlainDate` *is* the string the API sent and the string the API expects back, so `JSON.stringify` on a request body is already correct and there is no serialization step in which a value could be mangled. `Temporal.PlainDate` objects were considered for the representation and rejected on exactly this point: they would have to be converted at both boundaries, and every conversion is a place to be wrong.

**How the off-by-one becomes unrepresentable rather than merely avoided.** Five mechanisms, each independent:

1. **There are exactly two constructors**, both in `shared/date/`: `parsePlainDate(raw: string)` and `todayAR()`. No function anywhere converts `Date → PlainDate` or `PlainDate → Date`, in either direction, because none is written. A `Date` cannot enter the calendar domain even if one existed.
2. **`parsePlainDate` gates on `/^\d{4}-\d{2}-\d{2}$/` *before* handing the string to `Temporal.PlainDate.from(raw, { overflow: 'reject' })`.** The regex is not there to validate the calendar — Temporal does that, and rejects `2026-02-30`. It is there to reject anything carrying a time or an offset (`"2026-09-03T00:00:00Z"`), which Temporal would otherwise happily truncate, silently laundering an instant into a plain date.
3. **The parse point is forced by the type system.** API response types declare `check_in: PlainDate`; `fetch` yields `string`; `string` is not assignable to `PlainDate`. The decoder must therefore exist, and it exists once, in `app/api/decode.ts`. Skipping it is a compile error, not an oversight.
4. **`Date` is banned globally by lint, with zero exemptions** (`no-restricted-globals` on `Date`, plus `no-restricted-syntax` for `Date.now`, `Date.parse`, `.toISOString()`). This is affordable only because `todayAR()` is `Temporal.Now.plainDateISO('America/Argentina/Buenos_Aires').toString()` — which needs no `Date` at all. The codebase therefore contains **zero** `new Date(...)` calls, and that is a property a reviewer can verify by grep in one second. **Tripwire:** the ban holds because no timestamp is ever rendered (the interface shows `entrada`, `salida`, `paid_on` — never `created_at`). If a timestamp ever needs displaying, it goes through `Temporal.Instant.toZonedDateTimeISO(AR_TZ)`, and `Date` stays banned.
5. **Every formatter accepts `PlainDate` and nothing else.** There is no overload taking a `Date`, so rendering one is a type error rather than a wrong date.

**The AR "today" rule.** `todayAR()` is the single source of the current date, matching the server's `today_ar()` (D7). It is used for the default month, the "finished stay" reading (`check_out < today`, strictly — matching `is_completed`), and the dashboard window. Nothing else in the app knows a time zone exists.

**Formatting, and the range that looks like an off-by-one but is not.** The handoff renders `entrada 3/9, salida 7/9, 4 noches` as **"3 al 7 de septiembre"**. That is entrada-to-salida, not first-night-to-last-night. A reader who "corrects" it to `3 al 6` has broken the design. Stated here because it will be read as a bug at least once. Three cases: same month (`3 al 7 de septiembre`), crossing a month (`28 de agosto al 3 de septiembre`), crossing a year (year appended). Night count is `daysBetween(check_in, check_out)`, which is `4`, and the two facts are consistent precisely because the range is half-open.

**Test property: TZ-invariance, not a "safe" TZ.** The proposal proposed running formatting tests under `TZ=UTC` so the off-by-one cannot hide behind a matching local clock. This design strengthens it: because the code contains no `Date`, the process time zone should be **irrelevant**, so that is the thing to assert. The date, calendar and formatting suites run three times — `TZ=UTC`, `TZ=America/Argentina/Buenos_Aires`, and `TZ=Pacific/Kiritimati` (UTC+14, so an error in the opposite direction is also caught) — and must produce byte-identical results. **Any date test whose outcome changes with `TZ` is, by definition, a bug.** That is a stronger and cheaper statement than picking one machine timezone and hoping.

### D27 — Money: integer centavos at one boundary, a brand at the other, and two named places where arithmetic is allowed

The API serialises `Decimal` as a **string** (`"5000.00"`), which is the correct choice and must not be undone by the client. `MoneyString` is branded the same way `PlainDate` is, parsed at the same decode boundary, and never produced by client arithmetic.

- **Parse to integer centavos, never to a float.** `"5000.00"` → `500000`. Sums happen in centavos (exact in `number` well past any plausible peso amount) and format from centavos. `parseFloat` plus `+` is forbidden by the absence of any helper that does it.
- **The only client-side money arithmetic in the entire app is two things, and both are display-only:** the per-guest aggregate on screen 10 (a sum over `balance` values, needed because no per-guest endpoint exists), and the wizard/edit price preview (`price_per_night × nights`, needed because it is shown *before* saving so the server has not computed it yet). The preview must reproduce `effective_total` exactly (`price_total ?? price_per_night * nights`) and is tested against a fixture taken from the API.
- **Everything else is read straight from the server.** Screen 06's `Total de la estadía`, `Pagado` and `Saldo` are `effective_total`, `paid_amount` and `balance` from `ReservationRead`. Three numbers, zero client arithmetic, no possibility of the interface disagreeing with the ledger.
- **A computed money value is never sent back to the API.** The client posts `price_per_night` *or* `price_total`, which the owner typed.
- **Formatting: `$ 180.000`, `es-AR`, dot thousands.** With one refinement the handoff does not cover: when centavos are non-zero, they are **rendered** (`$ 180.000,50`), not dropped. Every value in the design has zero centavos so this never changes a designed screen — but silently truncating fifty centavos is a wrong ledger in miniature, and being trusted about money is the app's entire job.
- **A negative `Saldo` renders as a positive figure with different copy** — `Le tenés que devolver $ 20.000` — never `-$ 20.000`. The sign is carried by the sentence, which is what the handoff draws and what a non-technical reader actually parses.

**`displayBalance(reservation)` is the one helper that knows about the cancelled-stay defect** (a cancelled reservation still reports a non-zero `balance`; `frontend-api-alignment` owns the fix). It returns zero centavos for `status === 'cancelled'`, and no `Debe` chip renders anywhere on a cancelled stay. One function, one line to delete when the backend lands.

### D28 — The calendar: one headless core, three presentational components — confirmed, and the public surface is *not* a third colour scheme

The proposal recommended a shared headless core plus three thin components rather than one component with a `mode` prop. **Confirmed, and the argument is stronger than the proposal knew**, because of what screen 11's `Las dos` filter actually means (below).

The expensive part is identical everywhere and contains no interaction:

- a Monday-first month grid with leading and trailing blanks, **always six rows** so the grid height does not jump when paging months;
- converting half-open `[start, end)` ranges into per-day segments — `start` (rounded left), `middle` (full-bleed), `end` (rounded right), `single`;
- the **adjacency split**: a day carrying both an outgoing `end` and an incoming `start` yields two half segments, left closing and right opening;
- ranges straddling a month boundary rendering correctly in *both* months.

That is a pure function over `{ key: string; start: PlainDate; end: PlainDate }` and a `YearMonth`. It knows nothing about reservations, guests, auth or colour, and is therefore legal in `shared/`.

**The `mode` prop is rejected for a reason beyond branch-set hygiene.** A single component would have to accept, as one prop, three structurally different inputs: per-stay ranges with identities (private), per-stay ranges plus a live selection (picker), and — the one the proposal missed — **merged unavailability ranges that are not stays at all** (public). A union-typed prop discriminated by `mode` is three components wearing a trench coat, and it would additionally make the public page import a module that knows what a reservation is, which is precisely the coupling D25's boundary forbids.

**`Las dos` on the public page is an intersection, not a union.** Screen 11's filter offers `Las dos / Casa Azul / Dos Aguas`, with a single neutral bar and a two-item legend (`Libre` / `Ocupado`). With both cabins selected, two stays *can* cover the same night, and the naive implementation unions them. That is wrong, and wrong in the expensive direction: it would show a night as taken when one cabin is free, turning away a booking on the page whose entire purpose is not to. The prospect's question is "¿tenés algo libre esa noche?", so **a night renders occupied only when every selected cabin is occupied.** `intersectOccupancy(rangesPerCabin[]): DateRange[]` is another pure function in `shared/calendar/`, and the bars it produces are not stays — adjacency has no meaning over them, which is consistent with the public page having no adjacency semantics and one flat colour.

**Pastel assignment lives in `app/calendar/pastels.ts`, not in the core** (the core knows no colour). Three pastels cycled by `check_in` order. Two subtleties:

- The private calendar is **per cabin** (the segmented control), so the stays it draws cannot overlap; consecutive stays in `check_in` order are the only ones that can share an adjacency day, and cycling three colours therefore satisfies "two stays sharing an adjacency day never share a colour" automatically. The proposal treated the palette as a constraint on the number of *cabins*; it is not — it constrains neighbouring *stays on one cabin*. A fourth cabin costs the palette nothing.
- **The index is computed over the property's complete `check_in`-ordered stay list, never over the stays visible in the rendered month.** Otherwise a stay straddling 31 August / 1 September is one colour in August and another in September, and two adjacent stays can collide at a month boundary. This works because `GET /reservations?property_id=` returns the whole list (no pagination, no date filter), which the client already holds in one query. **Tripwire:** if pagination is ever added server-side, pastel assignment must move to a rule derived from the stay's neighbours or to the server.

**The picker's interaction rule, which the handoff states twice and appears to contradict itself.** "Taken nights are not selectable" and "a range may end on a day another stay starts" are both true, because the picker's two taps target different things:

- **First tap (entrada)** selects a *night*. Legal only if that night is free.
- **Second tap (salida)** selects a *boundary*. Legal iff every night in `[entrada, salida)` is free — **regardless of whether the night beginning on the salida day is taken.**

So a cell rendered grey as the next stay's check-in is inert for the first tap and live for the second. That is exactly the handoff's own sample selection (`8/9` to `12/9`, where `12/9` starts another stay), and a naive "grey cells are not clickable" implementation makes the designed example impossible. This is the single most confusable rule in the change and it gets its own test.

Also client-side, with copy rather than a server round-trip: `salida === entrada` (zero nights) is not a valid second tap, and a range longer than 60 nights is refused with a sentence, because the server's `23514 → 422` would otherwise surface as the generic failure message.

### D29 — The JWT lives in `localStorage`; expiry is handled in exactly one place, and the redirect must not reload the app

**CRITICAL domain. Awaiting approval.**

There is no httpOnly-cookie option available to this change: `allow_credentials` is `False` by design (D22, bearer not cookie), and changing it is a backend change. The real choice is `localStorage`, `sessionStorage`, or memory.

**`localStorage`, confirmed.** The argument is the proposal's and is not repeated at length: the security difference between the three is smaller than it looks (any XSS in a SPA acts as the user while the page is open regardless of storage); the blast radius is already bounded by the backend at 8 hours with **no refresh token to steal**; and the ergonomic difference is large, predictable and adverse — an owner forced to retype a password on a phone keyboard a dozen times a day writes it on a sticky note, which is a worse security outcome than the one avoided.

**The honest residual, restated rather than argued away:** an XSS here is her whole account for up to 8 hours, and no storage available to a bearer-token frontend changes that. The mitigation is not storage, it is not having an XSS — React escapes by default, this app renders no user-generated HTML, and (D37) loads no third-party runtime resource at all, including fonts. **Tripwire that reverses this decision:** a third-party script tag, a rich-text field, or any HTML-from-server rendering. Then the correct answer is a backend change to httpOnly cookies, and that is a different proposal.

**What the owner sees when the token expires mid-use.** Two paths, one handler:

- **Proactive.** On app start and on window focus, the stored token's `exp` claim is base64url-decoded and compared against now. An expired token is treated as absent, so she gets the sign-in screen instead of a flash of an empty app followed by a redirect. **The client decodes `exp` and nothing else** — never `tid`, never `sub`. The claim is unverified and is used only to decide whether sending the request is worth the trip; it grants nothing, and the server remains the authority.
- **Reactive.** Any `401` from any request, anywhere, hits one interceptor in `app/api/client.ts`: clear the token, navigate to `/login`, show the message.

**The message never contains *token*, *sesión*, *expiró*, *error*, or any technical word.** Proposed copy, owner to confirm the register: **"Entrá de nuevo para seguir."** It renders above the form on screen 01.

**The draft survives, and the mechanism is a constraint on how the redirect is performed.** The wizard draft lives in a Zustand store, in memory, **not persisted**. A memory store survives a client-side route change trivially — which means the requirement collapses into a single rule: **the 401 handler navigates through the router and must never assign `window.location`.** A location assignment reloads the document and destroys the draft, which is the exact failure being prevented. The rule is stated here, tested directly ("a 401 during step 3 returns her to Ingresar and the draft is intact"), and is the reason the store exists at all.

Deliberately **not** persisted to `sessionStorage`: the draft holds a guest's name, phone and a price, and persisting it would write that to disk for a benefit — surviving a full page reload — the success criteria do not ask for. Residual, accepted: a reload or a closed tab loses an in-progress draft.

**A 401 on the save mutation is safe.** The write did not happen, so after signing in she returns to step 4 with the draft intact and presses save again; there is no double-write to defend against.

### D30 — TanStack Query owns server state, and a store must earn its existence against one written rule

The proposal allowed exactly two Zustand stores and observed that neither is strictly necessary. Correct, and the useful output is not the count but the **criterion**, because the count answers today's question and the criterion answers next month's:

> **A store may exist only if something outside the React tree must read it, or something must survive the tree unmounting.** Nothing else qualifies. Not convenience, not prop-drilling depth, not "we already have Zustand".

- **`sessionStore`** (token + derived `isAuthenticated`) — read by the API client's request path, which is not a component and cannot use a hook. Qualifies on the first clause.
- **`wizardDraftStore`** (cabin, dates, guest, price mode, amount) — must survive the D29 redirect unmounting the wizard. Qualifies on the second.

**Explicitly forbidden, because each is a real temptation:**

- mirroring any server list into a store — the query cache already holds it, and a second copy is a second truth about money;
- the selected cabin and the displayed month — those are **URL search params** (`?cabana=`, `?mes=`), so reload and the browser back button keep working, and a shared link opens on the right month;
- any derived balance, total, or occupancy — derived at render from data already in hand.

**Server-state conventions, decided once so they cannot be got wrong in a second call site:**

| Concern | Rule |
|---|---|
| Query keys | One typed factory in `app/api/queries/keys.ts`. No key literal anywhere else. |
| Lookups | **One** hook each for cabins and guests, both fetching with `include_inactive=true`. A test asserts no other module calls `/properties` or `/clients` for a lookup. Without this, a deactivated guest's stays render nameless and screen 09 — which shows deactivated guests *by design* — breaks. |
| Invalidation | Any reservation or payment mutation invalidates `reservations`, `dashboard`, and the affected `reservation(id)`. Written once as `onSettled` in a shared mutation factory, not per call site. |
| Cancelled stays | `activeStays()` filters them out of every occupancy computation and every list. The one exception is a guest's stay history — pending Open Question 5. |
| Ordering | Every list sorts by `check_in`. The API orders by `created_at`, which is the order she typed them in, not the order they happen in. |
| Retries | Reads retry twice with backoff (she is on a phone in Mar del Tuyú). **Writes never retry** — a retried `POST /reservations` that actually succeeded the first time would produce a second stay, or a confusing `409` against itself. |

### D31 — Routing: React Router v7, two trees, a reserved public prefix, and the slug only at login

| Tree | Routes | Auth |
|---|---|---|
| Public | `/disponibilidad/:slug` | none, ever |
| App | `/login`, `/inicio`, `/calendario`, `/huespedes`, `/cabanas`, `/reserva/:id`, `/reserva/:id/editar`, `/reserva/nueva/:paso` | bearer |

**`disponibilidad` is the reserved prefix**, decided here rather than left open: it is the word in the handoff's register, it is what she pastes into WhatsApp, and a reserved prefix (rather than a bare `/:slug`) means a tenant slug can never collide with an app route.

**The slug enters only at login.** After that the API resolves the tenant from the JWT's `tid` claim (D4), so a slug in an authenticated URL would be decoration and a chance for the URL to disagree with the token. `POST /auth/login` requires `tenant_slug` in the body; the login route reads it from `?tenant=<slug>` if present, otherwise from the build-time `VITE_TENANT_SLUG`, so her bookmark is simply `/login` and **she never sees the word**.

| Option | Tradeoff | Verdict |
|---|---|---|
| TanStack Router | Typed search params and typed route params, which suits D30's "the URL is state" rule well, and it pairs with TanStack Query. But route-tree generation adds a build step, and the typing benefit is small when the whole app has exactly two search params, both of which need a validating hook we would write regardless (a `?mes=` of `banana` must not crash). | Rejected |
| File-based routing (a Vite plugin) | Fewer lines. It makes the route tree implicit, and this design's central structural claim is that the two trees are *visibly* separate. An implicit tree is a worse artifact to review for a privacy boundary. | Rejected |
| **React Router v7, declarative, one explicit `routes.tsx`** | Boring, well-understood, and the two trees are literally two arrays in one readable file. Cost: search params are `string | null` and validated by hand — two small hooks, `useMonthParam` and `useCabinParam`. | **Chosen** |

**The public tree's isolation is structural, and it is three independent layers — the client-side analogue of D9.**

1. **The bearer-attaching client does not live in `shared/`.** `app/api/client.ts` is the only module that reads the token and sets an `Authorization` header, and `src/public/` cannot import from `src/app/`. The header cannot be attached by mistake because the code that attaches it is unreachable. `src/public/api.ts` is its own ~20-line fetch whose signature has no place for a token.
2. **`import/no-restricted-paths` fails the build**, not the review, when `src/public/**` imports from `src/app/**`.
3. **A runtime test**: MSW asserts that no request originating from the public route carries an `Authorization` header, and a DOM-level test asserts that MSW-seeded distinctive guest names, phones, prices and payment notes appear **nowhere** in the rendered output — the direct analogue of `tests/test_public_contract.py`.

**Two separate Vite builds were considered and rejected.** Physically separate bundles would make the boundary unbreakable rather than lint-enforced, which is genuinely stronger. It costs two dev servers, two configs, two deploy artifacts and a duplicated `shared/`, for one owner and one public page — and the backend's own D9 is likewise three layers within one process rather than two processes. Recorded as the escalation path if the boundary is ever actually violated. Related gap, stated rather than implied: the public route is a `lazy()` chunk, so an authenticated module leaking in would also show up in the build manifest, but **asserting that mechanically requires parsing the manifest and is not automated in this change** — the same honesty as D19's image-inspection gap.

### D32 — Errors: the API's `detail` is not on the type, so it cannot be rendered

The API returns `{detail, code}` (D11) with codes `dates_unavailable`, `duplicate`, `not_found`, `invalid`, plus 401/403/404/409/422/429. **The owner must never see a status code, an English sentence, or the word "error".**

**The structural move is subtraction.** The API client normalises every failure into:

```ts
type ApiError = { readonly status: number; readonly code: string | null };
```

**`detail` is deliberately absent from the type.** It is parsed, logged to the console for a developer, and discarded. The natural implementation renders `detail`; `detail` is English prose written for API consumers ("Dates are not available", "Referenced record not found"). A field that does not exist on the type cannot reach a screen — the same mechanism as D23's allowlist formatter and D9's column projection.

**Where the map lives.** `shared/errors/` holds the normaliser and the resolution logic (it references no domain type, and the public tree needs its own failure copy). `shared/copy/errors.ts` holds the sentences.

**Resolution order, and how an unmapped code degrades:**

1. A call site may pass a more specific sentence for a specific `code` — the same `409 dates_unavailable` reads differently in the wizard than on the edit screen.
2. Otherwise, `code` → sentence.
3. Otherwise, `status` → sentence.
4. Otherwise, one generic sentence.

An unmapped `code` therefore degrades to something human and status-appropriate, and an unmapped status degrades to something human. **At no point is a code, a status, or the API's `detail` interpolated into copy** — there is no template that accepts one.

Drafted copy (owner owns the register — Open Question 1):

| Trigger | Copy |
|---|---|
| `409 dates_unavailable` | `Esas noches ya están ocupadas. Elegí otras.` |
| `409 duplicate` (phone edited onto an existing guest) | `Ese teléfono ya es de otro huésped.` |
| `404` / `not_found` | `No encontramos eso. Puede que ya no esté.` |
| `422` | `Revisá los datos y probá de nuevo.` |
| `429` | `Probá de nuevo en un ratito.` + the button stays disabled for `Retry-After` seconds |
| `401` | no message in place — D29's path |
| `500` | `Algo no anduvo. Probá de nuevo en un momento.` |
| network / CORS / timeout | `No pudimos conectar. Fijate si tenés internet y probá de nuevo.` |

**The 422 shape gotcha, which breaks the `{detail, code}` contract and will be discovered at the worst moment otherwise.** FastAPI's `RequestValidationError` returns `{"detail": [ ... ]}` — a **list**, with **no `code`**. The normaliser must tolerate a 422 whose body shape matches nothing else in the API. It resolves to the generic sentence above, and the real defence is that a 422 should be unreachable: the client validates night bounds, the exactly-one-price-mode rule, and non-empty name and phone before sending.

**The network-failure line is the entire offline story.** Binding input 5 means there are no queued writes, so on a phone with no signal in Mar del Tuyú that sentence *is* the product's answer. It must be reachable, plain, and identical on every write surface. `fetch` rejects with an indistinguishable `TypeError` for a dropped connection and for a CORS rejection, so a misconfigured `CORS_ALLOWED_ORIGINS` presents to the owner as "no internet" — which is why D37 refuses a dev proxy.

**The correlation id is read and never rendered.** The backend echoes `X-Request-ID` and exposes it to JavaScript deliberately (D22). The client reads it and writes it to the console with the failure. It is **not** shown to the owner: a correlation string is a technical word by any reasonable reading of the handoff's copy rule, and a non-technical owner will report "no me deja guardar la reserva del 3 al 7", which plus a timestamp is enough to find the line in the server log.

**Copy lives in `src/shared/copy/`, and JSX contains no bare Spanish sentence.** Split per surface (`copy/reservations.ts`, `copy/guests.ts`, `copy/errors.ts`), so it stays colocated by feature while remaining auditable in one directory. Two consequences, both the point: the forbidden-word test scans exactly those files rather than attempting to distinguish a Spanish sentence from an identifier across the whole codebase (`ApiError`, `onError` are identifiers and must not trip it), and `react/jsx-no-literals` — configured to allow separators like `·` — prevents copy from being inlined and escaping the audit. **Tradeoff, stated plainly:** this is indirection with no i18n payoff in a single-language app, and every label becomes `copy.reserva.saldo`. It is bought for one reason: the handoff mandates a glossary and a forbidden-word list, and the alternative is a review convention, which standing rule 3 forbids.

### D33 — The find-or-create-by-phone sheet surfaces the API's 200-vs-201 distinction

`POST /clients` is find-or-create-or-reactivate (D8). It returns **201** when it created a guest and **200** when it matched an existing phone — and it deliberately does **not** overwrite the stored name, so a typo while booking cannot silently rename someone.

The interface must not swallow that. If she types `11 2233 4455` with the name `Marta` and the phone already belongs to `Marta González`, the sheet shows the name the API returned and says so: **`Ese teléfono ya es de Marta González.`** Otherwise she believes she just renamed a guest, and the guest directory will disagree with her memory later.

The same sheet is built in slice 5 and reused by slice 7 rather than duplicated, which is the resolution of the proposal's one real ordering tension.

### D34 — Editing a reservation: the self-exclusion is a required parameter, and a cancelled stay has no route

The server cannot help here. `EXCLUDE USING gist` compares distinct rows, so a reservation never conflicts with itself; a picker that shows the stay being edited as occupied is correct-looking and completely broken, and it fails only when someone tries to shift a date by one day.

**The structural answer is a parameter with no default.**

```ts
occupiedNightsFor(stays, { excludeReservationId: string | null })   // required — no default
```

This is the *only* function that builds the picker's occupied set. Every call site must decide explicitly; the create wizard writes `null` in full. A default of `null` was considered and rejected on exactly the grounds that make defaults dangerous elsewhere in this project: it makes the correct-for-creating case the one you get by forgetting, and the edit case the one you get by remembering. Forgetting is now a compile error.

**Four more consequences, each decided:**

- **Route, not a modal.** `/reserva/:id/editar` is a full screen. The handoff uses bottom sheets for confirmations and short forms; an editor carrying a month grid does not fit a sheet on an 874 px phone.
- **The price-mode switch requires sending both fields, one of them explicitly `null`.** `ReservationUpdate` has both prices optional and the handler applies `model_dump(exclude_unset=True)`, while the table carries `CHECK (num_nonnulls(price_per_night, price_total) = 1)`. Sending only `{"price_per_night": 45000}` on a stay-total reservation therefore leaves both columns populated and raises `23514 → 422`, which the owner would see as the generic "revisá los datos" for a change she made correctly. The client always sends **both** price fields on any price change, one of them `null`.
- **The rescale rule is shown, not inferred.** Changing dates on a per-night stay recomputes the total live using the same formula as `effective_total`, with the handoff's helper line (`Se calcula solo: 5 noches × $ 45.000`). Changing dates on a stay-total stay shows the total unchanged with a line saying so. Otherwise she extends a stay by one night and the total either moves or fails to move without her having asked for either.
- **Lowering the price below what has been paid is allowed, with no guard and no confirmation.** The screen previews the resulting `Saldo` live through `displayBalance()`, so a negative result reads **`Le tenés que devolver $ 20.000`** *before* she saves rather than as a surprise after. That is a normal state, never an error.

**A cancelled reservation offers no editing — in two places, because a hidden button is not a closed route.** Screen 06 renders the action block only when `status !== 'cancelled'`, **and** `/reserva/:id/editar` redirects to the detail when the loaded stay is cancelled, covering a bookmark, a back button, and a stale tab. The API would accept the `PATCH` (it does not check status, and a cancelled row sits outside the `EXCLUDE` predicate so any dates would pass), so the interface is the only thing preventing it.

### D35 — The API contract is generated from OpenAPI; that generated file is the only artifact crossing `back/` ↔ `front/`

`front/` shares nothing with `back/` except the HTTP contract, and this decision makes "the HTTP contract" a file rather than an intention.

| Option | Tradeoff | Verdict |
|---|---|---|
| Hand-written TypeScript types | Zero tooling. They drift silently the first time a field changes, and the drift surfaces as `undefined` in the interface rather than as a build failure. | Rejected |
| A full client generator (`orval`, generated query hooks) | Generates the hooks too. It also generates its own fetch layer and its own types, which would fight the `PlainDate`/`MoneyString` brands and the D32 `detail`-free error type at every call site — the two places this design is deliberately non-standard. | Rejected |
| **`openapi-typescript` → a committed `src/app/api/schema.gen.ts`, plus a hand-written branding layer** | One dev dependency and one script (`npm run api:types` against a running backend). The generated file is committed, so a contract change shows up as a reviewable diff. The narrow hand-written layer above it is where `string` becomes `PlainDate` and `MoneyString` — exactly once, at the decode boundary. | **Chosen** |

**Stated gap, not claimed as solved:** the generated file is only as fresh as the last run, and this repository has no CI to assert freshness. A README line and a script are the mitigation; automating the check belongs to the CI change. The same honesty as D19's un-automated image inspection.

### D36 — Testing: TDD where the subject is pure, behaviour where the rule is a product promise, and an explicit exclusion list

The backend carries 166 tests under strict TDD, and the instinct to transfer that wholesale is wrong — not because a UI deserves a free pass, but because the *subjects* differ.

**Why it does not transfer unexamined.** The backend's tests are durable because their subjects are pure functions, status codes, and `pg_catalog` rows — none of which change when someone adjusts a layout. A UI's most-frequently-changed artifact is markup, and tests over markup break for reasons unrelated to correctness. A suite written with the backend's instincts gets rewritten every design pass, and a suite that is routinely rewritten teaches the team to delete tests instead of trusting them. So the discipline stays and the subject moves: **test-first applies wherever a test can be written before the thing exists and remain true after it is restyled.**

**Tools:** Vitest + React Testing Library + MSW (mocking at the network boundary, so tests exercise the real query layer, the real decoder, and the real error mapping — not a stubbed hook).

**Four layers.**

| Layer | What it covers | Note |
|---|---|---|
| **Types** (always on, free) | The `PlainDate` and `MoneyString` brands, `ApiError` without `detail`, the required `excludeReservationId`, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | Several guarantees in this design are enforced **only** here. This is not a supplement to the tests; for D26, D32 and D34 it is the primary mechanism. |
| **Lint** (build fails) | `src/public/**` ✕→ `src/app/**`; no `Date`; no `dangerouslySetInnerHTML`; no bare JSX literals | A red build is a test with a very short feedback loop. |
| **Unit, strict TDD** | Calendar segmentation (adjacency, month-boundary straddle, first/last rounding, single-night stays, short and leap months, Monday-first starts), `intersectOccupancy`, pastel assignment, the whole `shared/date` module, money formatting and centavo arithmetic, the price preview, `displayBalance` | This is where the backend's discipline transfers unchanged, and the architecture above exists to make these pure. Run under three time zones (D26). |
| **Behaviour (RTL + MSW), test-first for the promise** | The picker cannot *start* a range on a taken night; the picker **can** end one on a taken check-in day when the intervening nights are free; a past date is selectable with no warning of any kind; a `401` mid-wizard returns her to Ingresar and the draft survives; the edit picker excludes the stay being edited; a price-mode switch sends both fields with one `null`; the public DOM contains no guest name, phone, price or payment; no public request carries an `Authorization` header; a `429` on login disables the button for `Retry-After`; screen 02 renders no revenue figure though the endpoint returns `collected`; every stay list is ordered by `check_in`; no string in `shared/copy/**` matches the forbidden-word list | Queried by accessible role and by **importing the copy constants**, never by test-id and never by a duplicated string literal — so a copy change does not break a test, and a behaviour change does. |

**Deliberately not tested, each with a reason rather than an omission:**

- **Snapshot tests of markup.** They assert nothing and fail on every design-faithful edit.
- **Token and colour values.** A test asserting `#8A90E8` restates a constant; the handoff is the source.
- **"A button renders."** Component-per-component coverage on presentational components buys nothing the type checker and a human eye do not already provide.
- **Third-party behaviour** — TanStack Query's caching, React Router's navigation, the Temporal polyfill's arithmetic. A polyfill bug surfaces through `shared/date`'s own tests, which is the right place for it to surface.
- **Pixel layout and responsive breakpoints.** Nothing in this stack tests them meaningfully; visual regression is separate infrastructure and is not being adopted.
- **A coverage threshold.** A percentage target on a UI codebase drives tests toward exactly the cheap, worthless kind listed above. There is no threshold; the table is the contract.
- **Accessibility auditing.** Named as a deliberate omission, not an oversight: one known user, no assistive-technology requirement stated. Querying by accessible role in the behaviour layer means the app accrues most of the benefit anyway.
- **Contract testing against a live API.** MSW fixtures are hand-checked against real responses once per slice. D35's generated types make the *shape* mechanical; the *values* are not verified. Stated as a gap.

**E2E deferred, and named as a decision.** One Playwright smoke path — login → record a stay → record a payment → see the balance — is worth having, but not before slice 6, when there is a path to smoke. Building it earlier tests a skeleton.

### D37 — `front/` is a standalone package, talks to the API cross-origin even in development, and has no runtime third-party dependency

- **No monorepo tooling.** `front/package.json` stands alone. A pnpm/npm workspace would add a root `package.json` to a repository whose root is deliberately just `openspec/`, `back/`, `front/` and `docker-compose.yml`, to coordinate exactly one JavaScript package.
- **Environment variables adopt the backend's no-default rule.** `src/env.ts` validates at module load and throws naming the missing variable — the frontend analogue of "the app refuses to boot without `JWT_SECRET`".

| Variable | Required | Note |
|---|---|---|
| `VITE_API_BASE_URL` | **yes, no default** | A default of `http://localhost:5173`-era localhost is precisely how a production build ships pointing at a developer's machine. |
| `VITE_TENANT_SLUG` | yes | The login default; `?tenant=` overrides it. |
| ~~`VITE_WHATSAPP_NUMBER`~~ | **removed** | This row planned for a build-time number "until the API gains the field". The API has since gained it: `GET /public/{slug}/contact` returns a per-tenant `whatsapp` (backend D40/D46, decisions numbered past this document — the backend moved while this design was being written). The variable is therefore deleted rather than kept as the fallback this row anticipated, because **the fallback is the bug**: one build serves every slug, so falling back would print one tenant's number on another tenant's page, on precisely the path nobody exercises. A tenant with no number set renders no button, which the spec already treats as complete. The original reasoning still stands and still applies to the endpoint's `null`: a dead `wa.me` link fails on the prospect's side, where nobody will ever report it. |

- **No Vite dev proxy. The browser talks to the API cross-origin in development exactly as in production.** A proxy would make development pleasant and leave CORS exercised for the first time in production, where a misconfiguration is discovered by the owner and presents to her as "no internet" (D32). Cost, accepted and loud: `CORS_ALLOWED_ORIGINS` must include `http://localhost:5173` on day one, or the very first `fetch` fails — which is exactly the day-one blocker the proposal named, now deliberately unavoidable rather than deferred.
- **Nunito Sans is self-hosted** (`front/static/fonts/*.woff2`), not loaded from Google Fonts. It costs one build step and removes the last third-party runtime request — including on the page a stranger opens, whose IP would otherwise reach a third party. It also keeps D29's tripwire absolute ("no runtime third-party resource") rather than the weaker "no third-party *script*".
- **Deployment is out of scope**, with one requirement recorded so it is not discovered by a prospect: the app is an SPA, so **the host must serve `index.html` for unknown paths**. Without that, `/disponibilidad/casa-aya` — the exact URL she pastes into WhatsApp — returns a 404 on a hard load, and the failure appears only for strangers.
- A `front` service in `docker-compose.yml` is deferred; it is a deployment concern, not slice 1.

---

## `front/` structure

```
front/
├── package.json              standalone; no workspace root (D37)
├── vite.config.ts            publicDir: 'static'  (D25 name collision)
├── tsconfig.json             strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes
├── eslint.config.js          import boundary, no-Date, no-jsx-literals (D26, D31, D32)
├── vitest.config.ts          three TZ projects (D26)
├── .env.example
├── static/                   self-hosted Nunito Sans, favicon (D37)
└── src/
    ├── main.tsx
    ├── env.ts                validates VITE_* at load; throws naming the missing one
    ├── routes.tsx            both trees, visibly separate; public tree is lazy()
    │
    ├── shared/               NO domain type. Importable by both trees.
    │   ├── date/             PlainDate brand, parse, todayAR, arithmetic, formatters
    │   ├── money/            MoneyString brand, centavos, formatMoney
    │   ├── calendar/         month grid, segmentation, adjacency, intersectOccupancy
    │   ├── copy/             every Spanish string, split per surface
    │   ├── errors/           ApiError (no `detail`), normalise, code→copy resolution
    │   └── ui/               Button, Card, Sheet, SegmentedControl, Field, Pill, Progress
    │
    ├── app/                  authenticated tree
    │   ├── api/              client.ts (the only bearer attach), schema.gen.ts,
    │   │                     decode.ts (the only brand boundary), queries/
    │   ├── session/          store.ts, useSession, RequireSession
    │   ├── calendar/         PrivateMonthCalendar, RangePickerCalendar, pastels.ts
    │   ├── reservations/     list, detail, occupancy.ts, wizard/, edit/
    │   ├── guests/           directory, sheet, GuestPicker (find-or-create, D33)
    │   ├── cabins/
    │   ├── home/
    │   └── shell/            TabBar, screen chrome, empty states
    │
    ├── public/               unauthenticated tree — imports only public/ + shared/
    │   ├── api.ts            its own fetch; no token parameter exists
    │   ├── PublicMonthCalendar.tsx
    │   └── AvailabilityPage.tsx
    │
    └── test/
        ├── msw/              handlers + fixtures
        └── setup.ts
```

## Component map

```
                       browser
                          │
              ┌───────────┴───────────┐
              │      routes.tsx       │
              └───────┬───────┬───────┘
                      │       │
   /disponibilidad/:slug      /login /inicio /calendario … /reserva/:id/editar
                      │       │
        ┌─────────────▼──┐  ┌─▼──────────────────────────────────┐
        │ src/public/    │  │ src/app/                           │
        │ api.ts         │  │ api/client.ts  ── attaches Bearer  │
        │  NO Bearer —   │  │   401 ─► clear token               │
        │  the module    │  │        ─► router.navigate('/login')│
        │  that attaches │  │           (never window.location)  │
        │  it is         │  └─┬──────────────────────────────────┘
        │  unreachable   │    │
        └─────────┬──────┘    │  TanStack Query owns server state
                  │           │  Zustand owns session + wizard draft ONLY
                  │           │
                  └─────┬─────┘
                        │
        ┌───────────────▼────────────────┐
        │ src/shared/                    │   knows no domain type,
        │  calendar/  date/  money/      │   therefore legal for BOTH trees
        │  copy/      errors/  ui/       │
        └────────────────────────────────┘
```

## Data flow: how a calendar date reaches a pixel

```
  API JSON                "2026-09-03"            : string
      │
      ▼
  app/api/decode.ts       parsePlainDate()        regex rejects anything with a time
      │                                           Temporal rejects 2026-02-30
      ▼
  PlainDate                                       branded — `string` is NOT assignable
      │
      ├──► shared/calendar/  segmentation, adjacency, month straddle
      │        │              (Temporal.PlainDate arithmetic, never leaves the module)
      │        ▼
      │    DayCell[] with Segment[]  ── no colour, no domain type
      │        │
      │        ├──► app/calendar/PrivateMonthCalendar   + pastels
      │        ├──► app/calendar/RangePickerCalendar    + selection
      │        └──► public/PublicMonthCalendar          + intersectOccupancy, one grey
      │
      └──► shared/date/formatDayMonth()  "3/9"
                                          ▲
                          no `Date` exists anywhere on this path,
                          so there is no instant to be off by one
```

## File changes

Everything is new; nothing outside `front/` changes.

| Path | Action | Description |
|---|---|---|
| `front/` (whole tree) | Create | Per the structure above |
| `front/src/shared/date/` | Create | D26 — the single most consequential module in this change |
| `front/src/shared/calendar/` | Create | D28 — segmentation, adjacency, `intersectOccupancy` |
| `front/src/shared/copy/` | Create | D32 — all Spanish copy, glossary-tested |
| `front/src/shared/errors/` | Create | D32 — `ApiError` without `detail` |
| `front/src/app/api/schema.gen.ts` | Create (generated) | D35 — the only artifact crossing `back/` ↔ `front/` |
| `front/src/public/` | Create | D31 — import-isolated, tested for header absence and DOM absence |
| `openspec/specs/*` | Create | Eleven capability specs (owned by the parallel spec run) |
| `docker-compose.yml` | Modify (later) | A `front` dev service — deferred (D37) |
| `back/**` | **Unchanged** | No application code, test or config is touched |

**One backend *configuration* change is a day-one prerequisite and is not a code change:** `CORS_ALLOWED_ORIGINS` must include `http://localhost:5173`, and later the deployed origin. It has no default and `*` is rejected at boot (D22).

## Slicing

The proposal's eight slices stand, in order, with one adjustment.

**Editing a reservation lands at the end of slice 6, as its own work unit and its own PR.** It needs slice 5's picker (selection) and slice 6's detail screen, because the detail screen is where its only affordance lives — and D34's self-exclusion is only testable once there is a saved stay to exclude. Putting it in slice 5 would mean building an editor for reservations that cannot yet be opened.

The rest is unchanged, and the ordering argument worth re-reading is slice 2: the public page is the only slice needing no auth, no money and no wizard, so it forces the hardest artifact — the month geometry — into existence under the simplest rendering rules, where a bug is visible instead of tangled with selection state. It is also independently shippable: the owner can paste the link into WhatsApp before the app she signs into exists.

## Risks

| Risk | Likelihood | Mitigation | Residual |
|---|---|---|---|
| A date renders one day early — a wrong ledger, not a visible error | **High if implemented naively** | D26's five mechanisms; `Date` banned by lint with zero exemptions; TZ-invariance asserted across three time zones | Low |
| Calendar segmentation wrong — adjacency reads as a conflict, or a month-straddling stay vanishes | **High** | Pure function, TDD; tests include a same-day checkout/check-in cell and a 28/8–3/9 stay asserted present in **both** months | Low — a vanished stay means she sells a booked night |
| The picker refuses the handoff's own sample selection (salida on a taken check-in day) | **High** | D28 states the two-tap rule explicitly and tests it; the naive "grey cells are inert" implementation fails this test on day one | Low |
| The edit picker shows the stay being edited as occupied, so a one-day shift is impossible with no explanation | **High** | D34's required `excludeReservationId` parameter — forgetting is a compile error | Low |
| A price-mode switch on edit sends one field and hits `23514` | Med | D34: always send both prices, one explicitly `null`; behaviour test on the request payload | Low |
| `Las dos` on the public page unions instead of intersecting, showing a free cabin as taken | Med | D28 decides intersection; unit test with one cabin busy and one free | Low |
| Undesigned surfaces invented ad hoc and drifting from the handoff | **High** | The largest *product* risk. The handoff draws 12 screens; the app needs ~20. Each undrawn surface gets a recorded copy + layout decision before it is built | **Med — depends on the owner answering Open Question 2** |
| Lookups fetched without `include_inactive=true` → nameless stays, broken screen 09 | Med | D30: one hook per lookup; a test asserts no other call site fetches `/properties` or `/clients` | Low |
| XSS → her whole account for up to 8 hours | Med / severity **High** | Named openly. No `dangerouslySetInnerHTML` (lint), no runtime third-party resource at all (D37), minimal dependencies, and a stated tripwire that reverses D29 | **Med — accepted, and it is the honest residual of a bearer token in a browser** |
| The public tree imports an authenticated module, leaking data or an auth header onto a stranger's page | Med | Three layers (D31): the attaching module is unreachable, the lint boundary fails the build, and two runtime tests | Low — chunk-level assertion not automated |
| A technical or forbidden word reaches the interface, most likely on an error path | Med | D32: `detail` is absent from the type; copy is centralised and glossary-tested; `jsx-no-literals` prevents escape | Low |
| A cancelled stay shows a `Saldo` she does not owe | Med | Single `displayBalance()` helper (D27); one line to delete when the backend defect is fixed | Low |
| A store grows to mirror the query cache — a second truth about money | Med | D30's written admission rule makes the third store a rejected addition rather than a judgement call | Low |
| `schema.gen.ts` drifts from the running API | Med | D35: committed, regenerated by script, diff reviewable | **Med — no CI to assert freshness. Stated gap.** |
| The deployed host does not serve `index.html` for unknown paths, so the WhatsApp link 404s | Med | D37 records the requirement | **Med — belongs to a deployment change that does not exist yet** |
| A 401 handler written with `window.location` silently destroys the wizard draft | Med | D29 forbids it explicitly; the draft-survival test fails if anyone reintroduces it | Low |
| Scope creep toward a booking engine (holds, notifications, guest self-service) | Low | Binding non-goals in the proposal. She records decisions she already made | Low |

## Open questions

Flagged for the owner. (1)–(3) are copy and product; (4)–(5) block specific slices; (6)–(7) are operational.

| # | Question | Recommendation |
|---|---|---|
| 1 | **The error copy in D32 is drafted, not approved.** The register is the owner's, not the design's | Accept as a starting point and correct the wording; the *shape* (no code, no status, no `detail`, always a human sentence) is what must not be traded away |
| 2 | **The handoff draws 12 screens; the app needs about 20.** Which of the undrawn surfaces get a design, and which are extrapolated from the tokens? Wizard steps 1 and 3, the payment sheet, the refund sheet, add/edit huésped, add/edit/deactivate cabaña, the deactivation confirmation, **and the edit-reservation screen** | Extrapolate from tokens with a recorded decision per surface, unless the owner wants to draw the edit screen — it is the only new *screen*, the rest are sheets and forms |
| 3 | **"seña" and "efectivo" on screen 06** — free text in the payment `note`, or a fixed set she picks from? (Proposal OQ2, still open; blocks the payment sheet in slice 6) | A small chip set (`Seña`, `Efectivo`, `Transferencia`, `Otro`) writing into `note`, with free text still available. Kinder on a phone, keeps the list scannable, needs no API change. But it is her vocabulary, not ours |
| 4 | **Do cancelled stays appear in a guest's "estadías" and count toward the stay count?** (Proposal OQ8; the frontend must pick a rule now and it should be the rule the backend later enforces) | Excluded from the count, shown in the list marked `Cancelada`. A count is a summary; a list is a history |
| 5 | **More than two or three cabins?** (Proposal OQ9) | Correcting the proposal: the three pastels distinguish neighbouring *stays on one cabin*, not cabins, so a fourth cabin costs the palette nothing. What breaks is the segmented control. Recommend it degrades to a horizontally scrollable pill row past three |
| 6 | **What happens when she forgets her password?** (Proposal OQ6; reset is deferred, the link is absent from screen 01.) Today the answer is an operator resetting it by hand | That answer must exist and be written down **before she depends on the app** — this is not a code question and this change cannot answer it |
| 7 | **Where does the frontend get deployed, and what is its origin?** It must be added to `CORS_ALLOWED_ORIGINS`, and the host must serve `index.html` for unknown paths or the public link 404s for strangers | Deferred to a deployment change; recorded here so it is not discovered by a prospect |

**Also requiring sign-off before implementation:**

- [ ] **BLOCKING, human approval required:** D29 decides where a bearer token lives in a browser and is CRITICAL domain. It is not approved by this document, and it ships as its own reviewable slice.
- [ ] **Precondition, to confirm rather than assume:** `production-readiness` is committed and `CORS_ALLOWED_ORIGINS` includes `http://localhost:5173` before slice 1 begins. D37 makes this unavoidable by design — without it the very first `fetch` fails.

**Recorded, not raised as questions:**

- D26 adopts a polyfill for a language feature still landing in browsers. When `Temporal` is natively available everywhere this app runs, deleting the polyfill import is a one-line change confined to `shared/date/`, because no call site ever sees a `Temporal.PlainDate`.
- D32's copy-constants module is real indirection with no i18n payoff. It is bought to make the glossary testable, and it is reversible at the cost of losing that test.
- The public/authenticated boundary is lint-enforced, not physically separate builds. The escalation path (two Vite builds) is recorded in D31 and should be taken only if the boundary is actually violated.
