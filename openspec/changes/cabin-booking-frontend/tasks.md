# Tasks: Cabin Booking Frontend

> **Size note.** This list far exceeds a typical task-list budget, following
> this project's own precedent (`proposal.md`, `design.md`,
> `frontend-api-alignment/tasks.md`). `front/` does not exist yet — this is
> the first task list for a fully greenfield, eight-slice, eleven-capability
> frontend. Compressing it would hide the ordering arguments the design
> itself insists on (D26, D28, D29, D34), and this project has already paid
> once for a task list that stated a claim without checking it.

## Review Workload Forecast

No PR-based review workload applies. The owner works alone and has
explicitly rejected pull requests — there are no PR boundaries, no
chained-PR plan, and no review-size budget in this document. The delivery
unit is the commit, one commit per slice, matching `frontend-api-alignment`'s
and `production-readiness`'s precedent.

**One phase produces two commits, not one, by the design's own instruction.**
`design.md`'s Slicing section states that reservation editing "lands at the
end of slice 6, as its own work unit and its own PR" — read here as its own
commit, since this project has no PRs. Phase 6 is therefore split into
6.1–6.15 (detail, payments, cancel — one commit) and 6.16–6.31 (editing —
a second, separate commit), matching the design's explicit boundary.

**One task is a BLOCKING human-approval gate** (governance CRITICAL domain)
and stops the flow until a human explicitly approves: task **3.1**, covering
D29 — where the JWT lives (`localStorage`), the residual XSS risk that
choice accepts, the proactive/reactive expiry mechanism, and the copy
register for the expiry message. `design.md`'s own opening line states this
plainly: D29 "is a *proposal awaiting explicit human approval*" and "must
ship as its own reviewable slice, never folded into a batch." **No task
that writes session-store or client-interceptor code is listed before 3.1,
and 3.2 must not be started until 3.1 is approved.**

**Baseline going in:** `front/` does not exist. `back/` is unaffected by
this change (proposal's binding non-goal) and its own 221-test suite is out
of scope for this list's verification. Test runner: Vitest + React Testing
Library + MSW, configured in Phase 0 as three TZ-scoped projects
(`TZ=UTC`, `TZ=America/Argentina/Buenos_Aires`, `TZ=Pacific/Kiritimati`) per
design D26 — a date/calendar/formatting test that is not byte-identical
across all three is, by definition, a bug. Command: `npm --prefix front test`
once Phase 0 lands; exact script name confirmed in 0.3.

**Phase 0 is scaffolding, not TDD, and that is stated rather than
pretended away.** `front/` is empty; there is no test runner until 0.3
exists, so nothing before it can have a red phase. Tasks 0.1–0.6, 0.8 and
0.9 are infrastructure with no behavior to assert against yet. Task 0.7
(`env.ts`) is the first unit that *can* be TDD'd, once 0.3's runner exists —
and Phase 1 is where strict RED → GREEN → TRIANGULATE begins in earnest.

---

## Phase 0: Toolchain & Project Scaffolding — no capability, not TDD-able

> Nothing in this phase has a red phase. A test runner cannot fail against
> code that has no runner yet. Each task below is scaffolding; the first
> genuinely TDD-able unit is 0.7, and full RED/GREEN discipline starts at
> Phase 1.

- [x] 0.1 Scaffold `front/` as a standalone Vite + React + TypeScript project (`front/package.json`, no workspace root — D37). One coherent task: a partial scaffold (e.g. `package.json` without a working `vite.config.ts`) does not run.
  **Observed:** Scaffolding, not TDD, per the phase preamble. `npm create vite@latest . -- --template react-ts` into `front/`; standalone confirmed (`git status`/`ls` show no root `package.json`, no workspace field anywhere). `npm run dev`/`npm run build` both run. React 19.2.8, Vite 8.2.2, TypeScript 6.0.3 — this template's current defaults ship `oxlint` instead of ESLint; removed (`npm uninstall oxlint`, deleted `.oxlintrc.json`) because task 0.5 and design D36's Lint layer name ESLint specifically. Vite's default `public/` asset dir renamed to `static/` per D25/0.3 (see 0.3's note) before anything referenced it. Replaced the template's demo `App.tsx`/`main.tsx` counter content with a `return null` placeholder — Phase 1's own preamble states "ships no screen," and the demo copy would otherwise fail 0.5's freshly-wired `react/jsx-no-literals` rule on day one, leaving `npm run lint` red from the very first commit.
- [x] 0.2 `front/tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (D36's Types layer — several later guarantees are enforced only here).
  **Observed:** Scaffolding. This Vite version scaffolds a project-reference split (`tsconfig.json` → `tsconfig.app.json` + `tsconfig.node.json`), not the single flat file `design.md`'s tree diagram shows — added the three strict flags to **both** `tsconfig.app.json` (covers `src/`) and `tsconfig.node.json` (covers `vite.config.ts`/`vitest.config.ts`), which is where they take effect under this template; `tsconfig.json` itself carries no compiler options to add them to. Verified with `npx tsc -b` (clean, no errors) and by confirming `noUncheckedIndexedAccess` actually narrows: an ad hoc `arr[i]` access without a guard fails to compile as expected (checked interactively, not committed as a fixture — no production code exists yet to host one legitimately).
- [x] 0.3 `front/vite.config.ts` (`publicDir: 'static'`, D25's name-collision fix) and `front/vitest.config.ts` with three TZ-scoped projects (`TZ=UTC`, `TZ=America/Argentina/Buenos_Aires`, `TZ=Pacific/Kiritimati`, D26). **This is the test runner.** Confirm `npm --prefix front test` runs an empty suite cleanly across all three projects before proceeding — nothing after this task should be attempted without it green.
  **Observed:** Scaffolding for the config files; installing Vitest itself (nominally 0.4's line item) had to happen here too, since "confirm it runs" is meaningless without the package installed — noted as a task-order adjustment, not a skipped task. `vite.config.ts` sets `publicDir: 'static'`; the template's old `front/public/` (favicon.svg, icons.svg) was moved to `front/static/` in the same step so the rename didn't leave a dangling reference. `vitest.config.ts` uses Vitest 5.0.0's `test.projects` (an inline array of `{ extends: true, test: { name, env: { TZ } } }`), the current replacement for the older `vitest.workspace.ts` file — confirmed against the installed package's own `.d.ts` since this is newer than any documentation I could otherwise rely on. First run (before 0.4/0.7 existed) confirmed an empty suite passes cleanly across all three projects; after 0.7 landed, re-confirmed with real tests — literal final output below. **A real toolchain lag surfaced here and recurs in 0.4/0.5/0.8:** `openapi-typescript@7.13.0` declares a peer range of `typescript@^5.x`, but this Vite template installs TypeScript 6.0.3 by default. `openapi-typescript` has zero runtime dependency on the `typescript` package (confirmed via `npm view openapi-typescript dependencies` — it doesn't list `typescript` at all; the peer range is a soft compatibility declaration for generated-code consumers, not a runtime coupling), so every install in this phase used `--legacy-peer-deps` deliberately for that one conflict, not as a blanket suppression.
- [x] 0.4 Install Vitest, React Testing Library, MSW, `temporal-polyfill`, `openapi-typescript`. `front/src/test/setup.ts` and an empty `front/src/test/msw/handlers.ts`.
  **Observed:** Scaffolding. Installed `vitest@5.0.0`, `@vitest/coverage-v8@5.0.0`, `jsdom`, `msw@2.15.0`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event`, `@testing-library/dom` (an undeclared peer of `@testing-library/jest-dom/vitest` that npm did not pull in automatically — install failed with "Cannot find package '@testing-library/dom'" until added explicitly; recorded as a discovered gap, not silently patched over), `temporal-polyfill@1.0.4`, `openapi-typescript@7.13.0` (all via `--legacy-peer-deps`, see 0.3's note). `setup.ts` imports `@testing-library/jest-dom/vitest`, wires an MSW `setupServer(...handlers)` with `listen`/`resetHandlers`+RTL `cleanup`/`close` lifecycle hooks against the empty `handlers` array, and is registered as `vitest.config.ts`'s single `setupFiles` entry (shared by all three TZ projects). The MSW server wiring in `setup.ts` goes slightly beyond the task's literal two-file description but is inert scaffolding — `handlers` is empty, nothing is asserted — and is what makes `setup.ts` actually usable as Phase 1's MSW tests come online, rather than a file that has to be rewritten immediately.
- [x] 0.5 `front/eslint.config.js`: `import/no-restricted-paths` (`src/public/**` ✕→ `src/app/**`), `no-restricted-globals` on `Date`, `no-restricted-syntax` on `Date.now`/`Date.parse`/`.toISOString()`, no `dangerouslySetInnerHTML`, `react/jsx-no-literals` (allow `·`). The rules exist now with almost nothing to check yet — they are exercised for real starting Phase 1.
  **Observed:** Scaffolding. Flat config (`eslint.config.js`) via `typescript-eslint`'s `tseslint.config()` helper, `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react`'s flat `recommended`/`jsx-runtime` + `eslint-plugin-react-hooks`'s flat `recommended` + `eslint-plugin-import` registered manually for the one named rule. All five required rules are wired: `import/no-restricted-paths` (zone `src/public` ✕→ `src/app`), `no-restricted-globals: Date`, `no-restricted-syntax` with three selectors (`Date.now`, `Date.parse`, `.toISOString()` — literally all three per the design text, even though the first two are already reachable through `no-restricted-globals`'s coverage of `Date.now()`/`Date.parse()` call sites; kept both per the design's explicit wording rather than silently dropping the "redundant" half), `react/no-danger` for the dangerous-HTML ban, and `react/jsx-no-literals` with `allowedStrings: ['·']`. **One necessary addition beyond the rule's bare default:** `noStrings: true` alone also bans string *attribute* values (`className="x"`, `href="…"`), which is not what D32 asks for (bare Spanish *copy*, not technical attribute strings) — added `ignoreProps: true` after confirming the unqualified config flagged `height="179"`/`alt=""`/etc. as errors on the (now-removed) template markup. **Second toolchain-lag finding:** the required plugins (`eslint-plugin-import@2.32.0`, `eslint-plugin-react@7.37.5`, `eslint-plugin-react-hooks@7.1.1`) declare peer ranges topping out at ESLint `^9`; ESLint's own registry `dist-tags` show `latest: 10.10.0` but `maintenance: 9.39.5` — installed ESLint 9.39.5 deliberately (npm surfaces a "no longer supported" deprecation notice on it despite it being the tagged maintenance release) to keep the plugin chain within its declared, tested compatibility range rather than force ESLint 10 against plugins that don't yet claim to support it. `npx eslint .` runs clean on the final scaffold (confirmed after removing the demo `App.tsx` content, which the freshly-wired `jsx-no-literals`/`jsx-no-target-blank` rules correctly flagged — 80 errors before `ignoreProps`, 22 after, 0 once the demo content was removed). **Also removed:** `eslint-plugin-jsx-a11y`, installed opportunistically before re-reading D36, which names accessibility auditing "a deliberate omission, not an oversight" — keeping it would have silently added a check the design explicitly declines.
- [x] 0.6 Directory skeleton per `design.md`'s `front/` structure (`src/shared/{date,money,calendar,copy,errors,ui}/`, `src/app/`, `src/public/`, `src/test/`), placeholder barrel files only, no logic.
  **Observed:** Scaffolding. Created `src/shared/{date,money,calendar,copy,errors,ui}/`, `src/app/{api,session,calendar,reservations,guests,cabins,home,shell}/`, `src/public/` — each with a placeholder `index.ts` (`export {}` plus a comment, no logic, no exports) so the import-boundary rule (0.5) and later phases have real directories to populate. `src/test/{msw}` already exists from 0.4. Did **not** pre-create top-level files the tree diagram shows next to these directories but that carry real logic owned by later RED tasks (`routes.tsx`, `app/api/client.ts`, `app/session/store.ts`, etc.) — "directory skeleton... no logic" is read as scoped to directories, not every leaf file in the diagram, since those files are explicitly built RED-first starting Phase 1/3. **Friction worth naming, resolved in favor of the task text:** the `vercel-react-best-practices` skill's `bundle-barrel-imports` rule advises against barrel files for bundle-size reasons; this task explicitly asks for "placeholder barrel files." Followed the task's literal instruction — these are empty scaffolding placeholders now, and real barrel-vs-direct-import tradeoffs apply once each directory has actual exports, not to an `export {}` stub.
- [x] 0.7 [RED] `front/src/env.test.ts`: importing `env.ts` with `VITE_API_BASE_URL` unset throws, naming the missing variable. [GREEN] `front/src/env.ts`: validates `VITE_API_BASE_URL` and `VITE_TENANT_SLUG` (both required, no default) at module load; `VITE_WHATSAPP_NUMBER` optional. `front/.env.example`. **First TDD-able unit in the change** — 0.3's runner makes this possible.
  **Observed:** Real RED → GREEN, the first in the change. RED (literal output below): `env.test.ts` imports `./env`, which does not exist — `vitest run` fails all three TZ projects with `Failed to resolve import "./env" from "src/env.test.ts". Does the file exist?`. GREEN: wrote `front/src/env.ts` (two small `requireEnvVar`/`optionalEnvVar` helpers; the required-var error message interpolates the variable's own name, satisfying "naming the missing variable" literally) and `front/.env.example`; re-ran — 3 files / 6 tests passed across `utc`/`ar`/`kiritimati`. Added one second case beyond the task's literal single RED (`does not throw... when configured`) as a minimal triangulation — the Strict TDD module in force this session requires at least a happy-path + edge-case pair per behaviour, and a bare "throws when unset" test with nothing to prove the opposite path is under-specified by that standard, even though the task text names only the one case. **Tooling note:** `.env.example` had to be written via a Bash heredoc — the Write tool's permission rules deny writing to any `.env*` path outright, including a fresh, secret-free example file; noting this rather than working around it silently, since a stricter sandbox elsewhere might block the heredoc route too.
- [x] 0.8 Wire `npm run api:types` (`openapi-typescript` against a running backend) generating `front/src/app/api/schema.gen.ts` (D35, committed). Add a README line recording the freshness gap — no CI asserts it, same honesty as D19's un-automated check in `production-readiness`.
  **Observed:** Scaffolding, and — unlike the task prompt anticipated — a backend *was* reachable this run, so the generation is real, not deferred. `package.json`'s `api:types` script targets the canonical `http://localhost:8000/openapi.json` (matching `docker-compose.yml`'s `api` service). Port 8000 on this machine is already bound by an unrelated project's container (`facturas_api`), so to actually exercise the pipeline: built `back/`'s `api`/`migrate` images via `docker compose build`, ran `db` + `migrate` (migrations applied cleanly, `0001`→`0003`), then ran the built `api` image directly via `docker run` on host port 8010 (not via `docker-compose.yml`, which was never edited) with the same env shape `docker-compose.yml`'s `api` service already declares. Confirmed `http://localhost:8010/openapi.json` returns 200, then ran `npx openapi-typescript http://localhost:8010/openapi.json -o ./src/app/api/schema.gen.ts` — produced a real 1496-line generated file (committed). Backend containers this task started were torn down afterward (`docker compose down db migrate api`); `back/`'s own pre-existing `db-test` container was left exactly as found. Rewrote `front/README.md` (previously the unmodified Vite template README, which referenced the now-removed `oxlint`) to include setup/testing instructions and the required freshness-gap line: the generated file is only as fresh as the last manual run, no CI asserts it (D35, same honesty as D19).
- [x] 0.9 Self-host Nunito Sans under `front/static/fonts/*.woff2` (D37) — no Google Fonts request, keeping D29's "no runtime third-party resource" tripwire absolute.
  **Observed:** Scaffolding, and — again contrary to the task prompt's anticipated deferral — outbound internet access to `fonts.googleapis.com`/`fonts.gstatic.com` was available this run, so the font is genuinely self-hosted, not deferred. Fetched Google's own Nunito Sans v19 CSS for weights 400/600/700/800 and found (confirmed programmatically, not by eyeballing similar-looking hashes) that all four weights' "latin" subset resolve to the **same** physical file — Nunito Sans is served as one variable font under the hood. Downloaded that one file (verified `wOF2` magic bytes) to `front/static/fonts/nunito-sans-variable-latin.woff2` (31 KB) with a provenance `README.md` alongside it, and wired one `@font-face { font-weight: 400 800; src: url('/fonts/…woff2') format('woff2') }` plus `--sans`/`--heading` in `src/index.css`. Did **not** rewrite the rest of `index.css`'s tokens (colors, `#root` sizing) to match the handoff's palette — that is un-tasked Phase 1+ design-token work, not font self-hosting, and doing it here would be scope creep past this task. Confirmed via `npm run build` that the font is copied to `dist/fonts/` correctly (the D25 `publicDir` rename from 0.3 is what makes this resolve unambiguously).

## Phase 1: Slice 1 — Foundation (`frontend-foundation`, `interface-copy-and-formatting`) — no migration-equivalent risk

> Ships no screen, per the proposal — this is where the formatting rules
> every later slice depends on get their tests. RED/GREEN/TRIANGULATE
> discipline starts here for real.

- [ ] 1.1 [RED] `front/src/shared/date/parsePlainDate.test.ts`: `"2026-09-03T00:00:00Z"` (carries a time) and `"2026-02-30"` (invalid calendar day) are both rejected — module does not exist, fails at import.
- [ ] 1.2 [GREEN] `front/src/shared/date/parsePlainDate.ts`: regex-gate `/^\d{4}-\d{2}-\d{2}$/` **before** `Temporal.PlainDate.from(raw, { overflow: 'reject' })`; returns a branded `PlainDate`. Re-run 1.1 → green.
- [ ] 1.3 [RED][TRIANGULATE] same file: `"2026-09-03"` parses and round-trips via `.toString()`; a leap day (`"2028-02-29"`) parses; a short month (`"2026-04-31"`) is rejected.
- [ ] 1.4 [GREEN] confirmed by 1.2 if written generally; else extend. Re-run 1.3 → green.
- [ ] 1.5 [RED] `front/src/shared/date/todayAR.test.ts`: with `Temporal.Now` mocked to `2026-09-04T02:30:00Z`, `todayAR()` returns `"2026-09-03"`, matching the server's `today_ar()` — module absent, fails.
- [ ] 1.6 [GREEN] `front/src/shared/date/todayAR.ts`: `Temporal.Now.plainDateISO('America/Argentina/Buenos_Aires').toString()`. Re-run 1.5 → green.
- [ ] 1.7 [RED] `front/src/shared/date/format.test.ts`: `formatDayMonth("2026-09-03")` → `"3/9"`, run under all three TZ projects — must be byte-identical.
- [ ] 1.8 [GREEN] `front/src/shared/date/format.ts`: `formatDayMonth` reads the branded string's own digits directly, never constructs a `Date`. Re-run 1.7 → green under all three TZ projects.
- [ ] 1.9 [RED][TRAP] same file: `formatDateRange("2026-09-03", "2026-09-07")` → `"3 al 7 de septiembre"` — entrada-to-salida, a 4-night stay, **not** `"3 al 6"`. Named explicitly because the design calls this the single most confusable rule in the change and predicts it will be "corrected" by someone who does not know better.
- [ ] 1.10 [GREEN] `formatDateRange` renders `[check_in, check_out)`'s two endpoints literally, with no minus-one-day adjustment. Re-run 1.9 → green.
- [ ] 1.11 [TRIANGULATE] same file: a month-crossing range (`"2026-08-28"`→`"2026-09-03"` → `"28 de agosto al 3 de septiembre"`) and a year-crossing range (year appended); both under all three TZ projects.
- [ ] 1.12 [RED] `front/src/shared/money/parseMoney.test.ts`: the API's `"5000.00"` parses to `500000` integer centavos — module absent, fails.
- [ ] 1.13 [GREEN] `front/src/shared/money/parseMoney.ts`: string-to-centavos, no `parseFloat`. Re-run 1.12 → green.
- [ ] 1.14 [RED][TRAP] `front/src/shared/money/formatMoney.test.ts`: `formatMoney(18000000)` → `"$ 180.000"`; `formatMoney(18000050)` → `"$ 180.000,50"` — non-zero centavos rendered, never truncated.
- [ ] 1.15 [GREEN] `front/src/shared/money/formatMoney.ts`: `es-AR`, dot thousands, centavos suffix only when non-zero. Re-run 1.14 → green.
- [ ] 1.16 [RED] `front/src/shared/errors/ApiError.test-d.ts` (type-level, D36's Types layer): a `// @ts-expect-error` asserting `.detail` does not exist on `ApiError` fails to compile as expected — the type does not exist yet, so the whole file fails to typecheck.
- [ ] 1.17 [GREEN] `front/src/shared/errors/ApiError.ts`: `type ApiError = { readonly status: number; readonly code: string | null }` — no `detail` field, structurally. Re-run 1.16 → green.
- [ ] 1.18 [RED] `front/src/shared/errors/normalise.test.ts`: a `409 {"detail": "...", "code": "dates_unavailable"}` response normalises to `{status: 409, code: "dates_unavailable"}` (detail discarded); a malformed FastAPI 422 body (`{"detail": [...]}`, a list, no `code`) normalises to the generic fallback without throwing.
- [ ] 1.19 [GREEN] `front/src/shared/errors/normalise.ts`: parses, logs `detail` to console for a developer, discards it from the returned object; tolerates the 422 list shape. Re-run 1.18 → green.
- [ ] 1.20 [RED] `front/src/shared/errors/resolve.test.ts`: resolution order is call-site override → `code` → `status` → generic; `409 dates_unavailable` resolves to `"Esas noches ya están ocupadas. Elegí otras."`, containing none of "conflicto"/"error"/"409".
- [ ] 1.21 [GREEN] `front/src/shared/errors/resolve.ts` + `front/src/shared/copy/errors.ts`: the resolution function and the drafted D32 copy table. Re-run 1.20 → green.
- [ ] 1.22 [TEST] `front/src/test/glossary.test.ts`: a static scan of every exported string in `front/src/shared/copy/**` against the forbidden-word list (Propiedad, Unidad, Cliente, Usuario, Booking, Check-in, Check-out, Tarifa, Transacción, Reembolso, Balance, Deuda, Eliminar, Borrar, Ingresos, Facturación) plus technical words (error, conflicto, 409, registro). **Labelled `[TEST]`, not `[RED]`:** 1.21's copy is already clean by the time this scan is written, so it cannot fail here — it is a standing regression guard, re-verified against the whole tree's copy in Phase 9 (9.1), not a one-time cycle.
- [ ] 1.23 [RED] `front/src/app/api/client.test.ts` (MSW): a request that fails with a network error carrying no response body still resolves to a structured `ApiError` with a generic fallback code, never an unhandled rejection — module absent, fails at import.
- [ ] 1.24 [GREEN] `front/src/app/api/client.ts` (create): the single request-issuing module. Base URL from `env.ts`; wraps `fetch`, catches a thrown `TypeError` (network/CORS/offline) and routes every result through 1.19's `normalise()`. **No bearer-header attachment yet** — the session store this depends on does not exist until Phase 3's approval gate (3.1). Re-run 1.23 → green.
- [ ] 1.25 [TEST] static scan: no module other than `client.ts` calls `fetch` (or an XHR equivalent) directly. **Labelled `[TEST]`:** at this point `client.ts` is the only network call in the whole tree, so the assertion passes trivially — it stands as a regression guard through every later phase, not a cycle with its own red phase.
- [ ] 1.26 [RED] `front/src/shared/mutation/offlineGuard.test.ts`: a generic mutating call that fails from no connectivity surfaces a could-not-save message and schedules no automatic retry — mechanism absent, fails.
- [ ] 1.27 [GREEN] a shared TanStack Query `mutationDefaults` (`retry: false` for writes; two-retry backoff for reads, D30), applied once. Re-run 1.26 → green. **Each concrete mutating screen in Phases 3–8 re-exercises this mechanism with its own MSW test in its own context — this task proves the shared mechanism exists once, not that every surface uses it.**
- [ ] 1.28 [TEST] Deliberately-violating fixture: a throwaway module under `src/public/__fixtures__/` importing from `src/app/__fixtures__/` fails the build via 0.5's `import/no-restricted-paths` rule; the same module importing from `src/shared/__fixtures__/` succeeds. Delete both fixtures once confirmed. **Labelled `[TEST]`:** 0.5 already installed the rule; nothing here is new production code, only proof the rule fires.

## Phase 2: Slice 2 — Public Availability Page (`month-calendar-rendering`, `public-availability-page`) — independently shippable, no auth/money/wizard dependency

> The proposal's and design's own ordering argument: the only slice needing
> no auth, no money, and no wizard, so the hardest artifact (the month
> geometry) is forced into existence under the simplest rendering rules.

- [ ] 2.1 [RED] `front/src/shared/calendar/monthGrid.test.ts`: September 2026 (starts Tuesday) produces a first row with one leading blank then Tue 1–Sun 6; a month ending mid-week (Sept 30, Wednesday) produces trailing blanks; the grid always has six rows (D28 — height must not jump when paging).
- [ ] 2.2 [GREEN] `front/src/shared/calendar/monthGrid.ts`: pure function, `{year, month} → DayCell[][]`, Monday-first, always six rows.
- [ ] 2.3 [RED][TRIANGULATE] same file: a 28-day February and a 31-day month both produce six rows with correctly placed blanks.
- [ ] 2.4 [GREEN] confirmed by 2.2 if general; else generalize. Re-run 2.3 → green.
- [ ] 2.5 [RED] `front/src/shared/calendar/segments.test.ts`: a stay `2026-09-03`→`2026-09-07` produces `start`/`middle`/`middle`/`end` on the four occupied nights; `09-07` itself carries no segment (half-open).
- [ ] 2.6 [GREEN] `front/src/shared/calendar/segments.ts`: segmentation over `{start, end, key}` and a `YearMonth`.
- [ ] 2.7 [RED][TRIANGULATE] same file: a single-night stay produces one `single` segment.
- [ ] 2.8 [GREEN] confirmed by 2.6 if general; else extend. Re-run 2.7 → green.
- [ ] 2.9 [RED][TRAP] same file: Stay A `check_out = 2026-09-12` and Stay B `check_in = 2026-09-12` render **two half-segments** (closing A, opening B) on that day — never a single merged segment or a conflict marker. This is the adjacency rule the design names as the change's central subtlety.
- [ ] 2.10 [GREEN] `segments.ts`: a day carrying both an outgoing `end` and an incoming `start` splits into two half-segments. Re-run 2.9 → green.
- [ ] 2.11 [RED][TRAP] same file: a stay `2026-08-28`→`2026-09-03` computed independently for August and September shows the stay present in **both** (Aug 28–31; Sep 1–2), never absent or truncated to zero in either.
- [ ] 2.12 [GREEN] confirmed by 2.6/2.10's per-month independence if built that way from the start; else adjust boundary handling. Re-run 2.11 → green.
- [ ] 2.13 [RED] `front/src/shared/calendar/intersectOccupancy.test.ts` (D28's `Las dos` trap): cabin A occupied and cabin B free on the same night → `intersectOccupancy([rangesA, rangesB])` reports that night **free** (intersection, not union — the naive union would wrongly turn away a booking).
- [ ] 2.14 [GREEN] `front/src/shared/calendar/intersectOccupancy.ts`: a night is occupied only when every input range list covers it.
- [ ] 2.15 [RED][TRIANGULATE] same file: both cabins occupied on a night → occupied; both free → free.
- [ ] 2.16 [GREEN] confirmed by 2.14 if general. Re-run 2.15 → green.
- [ ] 2.17 [TEST] `front/src/shared/calendar/` module-import scan: the shared calendar module imports no reservation/client/guest/cabin/auth type from either tree. **Labelled `[TEST]`:** the module was built domain-free from 2.2 onward; this cannot fail unless a domain import is added later.
- [ ] 2.18 [RED] `front/src/public/api.test.ts` (MSW): a request from this module carries no `Authorization` header, even with a valid token in `localStorage` from a concurrent authenticated session — module absent, fails.
- [ ] 2.19 [GREEN] `front/src/public/api.ts` (create): its own fetch; no token parameter exists in its signature at all — structurally, not by convention. Re-run 2.18 → green.
- [ ] 2.20 [RED] `front/src/public/AvailabilityPage.test.tsx` (RTL+MSW): the first request on mount includes both `from` and `to`; navigating to October re-issues a request with October's window.
- [ ] 2.21 [GREEN] `front/src/public/AvailabilityPage.tsx` + `front/src/public/PublicMonthCalendar.tsx`: compute and send the explicit window on mount and on every month navigation.
- [ ] 2.22 [RED] same file: selecting `Casa Azul` from the filter changes only the displayed cabin(s); no new request is sent (data already fetched).
- [ ] 2.23 [GREEN] filter state is local component state over the already-fetched response. Re-run 2.22 → green.
- [ ] 2.24 [RED][TRAP] same file: MSW seeds a distinctive guest name, phone, and price behind the requested slug; none of those strings appear anywhere in the rendered DOM, attributes and comments included — the client-side analogue of `tests/test_public_contract.py`.
- [ ] 2.25 [GREEN] `AvailabilityPage`/`PublicMonthCalendar` render only availability/`PublicContact`-shaped data, never a reservation-shaped object. Re-run 2.24 → green.
- [ ] 2.26 [RED] same file: two non-adjacent occupied ranges render with identical neutral fill — no per-stay color.
- [ ] 2.27 [GREEN] `PublicMonthCalendar` renders `intersectOccupancy`'s output with one flat color, no stay-identity prop. Re-run 2.26 → green.
- [ ] 2.28 [RED] same file: with no `VITE_WHATSAPP_NUMBER` configured, "Escribinos por WhatsApp" is entirely absent (not disabled, not hidden-but-mounted); with a number configured, the button links to that number's `wa.me` address.
- [ ] 2.29 [GREEN] conditional render keyed on `env.ts`'s optional field. Re-run 2.28 → green.
- [ ] 2.30 [TEST] Deliberately-violating fixture (extend 1.28, now against the real public page): `src/public/AvailabilityPage.tsx` imports nothing from `src/app/**`; a fixture importing `src/app/session/store.ts` fails lint. Confirm, then remove the violating import.

## Phase 3: Slice 3 — Ingresar + Inicio (`owner-session`, `home-summary`) — contains the BLOCKING approval gate

- [ ] 3.1 **[BLOCKING — HUMAN APPROVAL REQUIRED]** D29 (`owner-session`) is CRITICAL domain. `design.md`'s own opening line states this document does not approve it and it "must ship as its own reviewable slice, never folded into a batch." Present to a human, for explicit sign-off, before writing 3.2: **(a)** the token-storage decision — `localStorage` — and its stated residual risk in full: any XSS in this app is her whole account for up to 8 hours, and no storage choice available to a bearer-token frontend (`allow_credentials=False`, D22) changes that; the accepted mitigation is *not having an XSS* (React's default escaping, no `dangerouslySetInnerHTML`, no runtime third-party resource — D37), and the tripwire that reverses the decision (a third-party script tag, a rich-text field, or any HTML-from-server rendering); **(b)** the expiry mechanism — proactive: the stored token's `exp` claim is base64url-decoded (unverified, and **only** `exp` — never `tid`, never `sub`) on app start and on window focus, treating an expired token as absent; reactive: any `401` clears the token and navigates via the router, **never `window.location`**, because a location assignment reloads the document and destroys the in-progress wizard draft; **(c)** the copy register for the expiry message — proposed **"Entrá de nuevo para seguir."**, containing none of "token"/"sesión"/"expiró"/"error", owner to confirm or correct the wording. **Do not write 3.2 or any session-store or client-interceptor code until this is approved.**

  *(Space below reserved for the recorded approval, matching this project's own precedent for BLOCKING gates.)*

- [ ] 3.2 [RED] `front/src/app/session/store.test.ts`: the session store's initial shape is `{token: null, tenantSlug: <build-time default>, isAuthenticated: false}` — module absent, fails at import.
- [ ] 3.3 [GREEN] `front/src/app/session/store.ts` (create — first of exactly two client-side stores, D30): token, tenant slug, derived `isAuthenticated`. Re-run 3.2 → green.
- [ ] 3.4 [RED] `front/src/app/session/Login.test.tsx` (RTL): the login screen renders exactly two input fields — email, password — and none representing a tenant/slug/workspace.
- [ ] 3.5 [GREEN] `front/src/app/session/LoginScreen.tsx`: two fields only. Re-run 3.4 → green.
- [ ] 3.6 [RED] same file: opening `/login?tenant=mar-del-tuyu-cabins` and submitting sends `tenant_slug: "mar-del-tuyu-cabins"`; opening bare `/login` sends `env.ts`'s build-time default.
- [ ] 3.7 [GREEN] slug resolution reads `?tenant=` first, falls back to the build-time default; never rendered as a field. Re-run 3.6 → green.
- [ ] 3.8 [TEST] same file: no "Me olvidé la contraseña" element is present, enabled, disabled, or hidden-but-mounted. **Labelled `[TEST]`:** the screen built in 3.5 never had one — this cannot fail unless someone adds it later.
- [ ] 3.9 [RED] `front/src/app/session/store.test.ts` (extend): on successful login the token persists to `localStorage`; reopening the app before expiry (mocked `exp`) lands directly on the authenticated shell, skipping `/login`.
- [ ] 3.10 [GREEN] `store.ts` persists to `localStorage`; app bootstrap reads and hydrates `isAuthenticated` before first render. Re-run 3.9 → green.
- [ ] 3.11 [RED] same file: a stored token whose `exp` is in the past is treated as absent on app start and on `window` focus.
- [ ] 3.12 [GREEN] proactive check per 3.1(b): base64url-decode `exp` only, on mount and on a `focus` listener. Re-run 3.11 → green.
- [ ] 3.13 [RED] `front/src/app/api/client.test.ts` (extend Phase 1's file): any request receiving `401` clears the stored token and navigates to `/login` via the router; a reload afterward does not silently re-authenticate.
- [ ] 3.14 [GREEN] `client.ts`'s 401 branch: clear the session store, `router.navigate('/login')` — **never `window.location`**, per 3.1(b). Re-run 3.13 → green. *(The draft-survival half of this rule cannot be fully proven until a wizard draft exists — that proof is task 5.29, not this one.)*
- [ ] 3.15 [RED] same file: the message shown after a 401 redirect matches 3.1(c)'s approved copy and contains none of "token"/"sesión"/"expiró".
- [ ] 3.16 [GREEN] render the approved copy above the login form on redirect. Re-run 3.15 → green.
- [ ] 3.17 [RED] `front/src/app/home/HomeScreen.test.tsx` (RTL+MSW): `GET /dashboard/summary` returns `collected: "450000.00"` alongside occupancy; no element renders `450000`, `$ 450.000`, or any other money figure.
- [ ] 3.18 [GREEN] `front/src/app/home/HomeScreen.tsx`: consumes only the occupancy fields — no code path reads `collected`. Re-run 3.17 → green.
- [ ] 3.19 [RED][TRAP] same file: at `2026-10-01T02:00:00Z` (`2026-09-30T23:00` in AR), the occupied-nights figures and the month label both reflect September, not October.
- [ ] 3.20 [GREEN] occupancy window and month label derive from `todayAR()` (1.6), never the browser's local/UTC month. Re-run 3.19 → green.
- [ ] 3.21 [RED] same file: with zero reservations for the tenant, "Anotar una reserva" is still present and navigates to wizard step 1.
- [ ] 3.22 [GREEN] the button is unconditional. Re-run 3.21 → green.
- [ ] 3.23 `front/src/app/shell/TabBar.tsx` + empty-state components for the not-yet-built Calendario/Huéspedes/Cabañas tabs — instructive empty states per the handoff, never a dead link. Not independently TDD-able beyond a render smoke check; real behavior lands in Phases 4/7/8.

## Phase 4: Slice 4 — Reservation Calendar (`reservation-calendar`; pastel assignment placement note below)

> **Spec/design placement note, surfaced rather than silently resolved.**
> `month-calendar-rendering`'s spec attributes "Color-Slot Assignment Keeps
> Adjacent Stays Distinguishable" to the shared calendar capability. `design.md`
> D28 places the code in `app/calendar/pastels.ts`, deliberately **outside**
> `shared/calendar/` — the core "knows no colour," and pastel assignment needs
> the property's complete `check_in`-ordered stay list, a domain concept
> `shared/` cannot import without breaking the public tree's import boundary.
> This is a capability-to-module placement split, not a behavioral
> contradiction: the tests below satisfy the spec's requirement exactly; the
> code lives here, in the authenticated tree, per the design's explicit and
> reasoned choice. Resolved in favor of the design — the alternative (putting
> color logic in `shared/`) would require `shared/` to import a domain type,
> which nothing in this change is willing to do.

- [ ] 4.1 [RED] `front/src/app/calendar/pastels.test.ts`: Stay A (`check_in 09-08`) and Stay B (`check_in 09-12`, adjacent to A's `check_out 09-12`) receive different color slots — module absent, fails.
- [ ] 4.2 [GREEN] `front/src/app/calendar/pastels.ts`: three-slot rotation by `check_in` order, computed over the property's **complete** stay list, never the visible-month subset (D28's tripwire against month-boundary color collisions). Re-run 4.1 → green.
- [ ] 4.3 [RED][TRIANGULATE] same file: a fourth stay adjacent to the third's checkout still differs from it, even where strict 3-way rotation would repeat.
- [ ] 4.4 [GREEN] confirmed by 4.2's adjacency-aware assignment if general; else add the departure-from-rotation branch. Re-run 4.3 → green.
- [ ] 4.5 [RED] `front/src/app/api/queries/keys.test.ts`: `keys.reservations()` and `keys.dashboard()` produce distinct, stable key arrays — module absent, fails.
- [ ] 4.6 [GREEN] `front/src/app/api/queries/keys.ts` (create — one typed factory, D30). Re-run 4.5 → green.
- [ ] 4.7 [TEST] static scan: no other module constructs a query-key literal. Passes trivially the moment 4.6 lands as the only source of keys; stands as a regression guard.
- [ ] 4.8 [RED] `front/src/app/reservations/lookups.test.ts`: `useCabins()` and `useClients()` both fetch with `include_inactive=true` — hooks absent, fails.
- [ ] 4.9 [GREEN] `front/src/app/reservations/useCabins.ts` / `useClients.ts` (the one hook each, D30). Re-run 4.8 → green.
- [ ] 4.10 [TEST] static scan: no other module calls `/properties` or `/clients` directly — passes trivially once 4.9 is the only call site; regression guard, the direct client-side analogue of the backend's own equivalent rule.
- [ ] 4.11 [RED] `front/src/app/calendar/useMonthParam.test.ts`: a malformed `?mes=banana` does not crash and falls back to the current AR month.
- [ ] 4.12 [GREEN] `front/src/app/calendar/useCabinParam.ts` / `useMonthParam.ts` (D31): validating parse with a safe fallback. Re-run 4.11 → green.
- [ ] 4.13 [RED] `front/src/app/calendar/CalendarScreen.test.tsx` (RTL): switching the segmented control from Casa Azul to Casa Dos Aguas updates the URL's cabin parameter and the shown occupancy, with no other state change.
- [ ] 4.14 [GREEN] `front/src/app/calendar/CalendarScreen.tsx` + `PrivateMonthCalendar.tsx`: selected cabin and month read/write via 4.12's hooks, never a store. Re-run 4.13 → green.
- [ ] 4.15 [RED] same file: tapping an occupied or free day starts no selection, opens no editor, sends no request — this calendar has no interaction.
- [ ] 4.16 [GREEN] `PrivateMonthCalendar` attaches no tap handler beyond a no-op. Re-run 4.15 → green.
- [ ] 4.17 [RED] `front/src/app/reservations/displayBalance.test.ts`: `displayBalance({status: 'cancelled', balance: 45000})` → `0`; a non-cancelled positive or negative balance passes through unchanged — module absent, fails.
- [ ] 4.18 [GREEN] `front/src/app/reservations/displayBalance.ts` (create — the one helper that knows the cancelled-stay defect, D27). Re-run 4.17 → green.
- [ ] 4.19 [RED] `front/src/app/calendar/WhoStays.test.tsx`: "Quién se queda" lists every non-cancelled reservation overlapping the displayed month, ordered by `check_in`, including a pair created in reverse order (API orders by `created_at`).
- [ ] 4.20 [GREEN] `WhoStays.tsx`: filters cancelled out, sorts by `check_in` client-side. Re-run 4.19 → green.
- [ ] 4.21 [RED][TRIANGULATE] same file: a cancelled reservation overlapping the month does not appear at all.
- [ ] 4.22 [GREEN] confirmed by 4.20's filter. Re-run 4.21 → green.
- [ ] 4.23 [RED] same file: a reservation belonging to a deactivated guest still shows that guest's full name.
- [ ] 4.24 [GREEN] confirmed by 4.9's `include_inactive=true` lookup. Re-run 4.23 → green.
- [ ] 4.25 [RED] same file: with zero non-cancelled reservations overlapping the month, the exact copy "Todavía no anotaste ninguna reserva en este mes" renders with the reachable primary action.
- [ ] 4.26 [GREEN] the instructive empty state. Re-run 4.25 → green.
- [ ] 4.27 [RED] same file: a row with a positive `displayBalance()` shows `"Debe $ 80.000"`; a zero balance shows `"Pagado"`.
- [ ] 4.28 [GREEN] wired to 4.18's helper. Re-run 4.27 → green.

## Phase 5: Slice 5 — Recording a Reservation (`reservation-recording`)

- [ ] 5.1 [RED] `front/src/app/reservations/wizard/store.test.ts`: initial draft shape is empty (`cabin: null, dates: null, guest: null, priceMode: null, amount: null`) — module absent, fails.
- [ ] 5.2 [GREEN] `front/src/app/reservations/wizard/store.ts` (create — second and last store, D30): in-memory only, never persisted. Re-run 5.1 → green.
- [ ] 5.3 [TEST] `front/src/app/stores.test.ts` (finalizes 3.2/3.3's provisional single-store state): exactly two client-side stores exist in the whole app — session and wizard draft — and neither's state shape contains a properties, clients, reservations, or payments list.
- [ ] 5.4 [RED] `front/src/app/reservations/wizard/CabinStep.test.tsx`: with one active and one deactivated cabin, only the active one is offered.
- [ ] 5.5 [GREEN] `CabinStep.tsx` filters `useCabins()`'s result by `is_active`. Re-run 5.4 → green.
- [ ] 5.6 [RED] `front/src/app/reservations/occupancy.test-d.ts` (type-level): calling `occupiedNightsFor(stays)` with only one argument is a compile error — `excludeReservationId` has no default (D34).
- [ ] 5.7 [GREEN] `front/src/app/reservations/occupancy.ts` (create): `occupiedNightsFor(stays, {excludeReservationId: string | null})`, required, no default. The create-wizard call site passes `null` explicitly. Re-run 5.6 → green.
- [ ] 5.8 [RED][TRAP] `front/src/app/reservations/wizard/DateStep.test.tsx` (RTL, built on Phase 2's shared core): a night already occupied cannot start a range — tapping it begins no selection and sends no request.
- [ ] 5.9 [GREEN] `front/src/app/reservations/wizard/RangePickerCalendar.tsx`: the first tap is gated by 5.7's occupied set. Re-run 5.8 → green.
- [ ] 5.10 [RED][TRAP — the handoff's own apparent contradiction] same file: a range **ending** on the day another stay begins (the grey check-in cell) is a legal second tap — inert for tap one, live for tap two — matching the handoff's own `8/9`→`12/9` sample selection.
- [ ] 5.11 [GREEN] the second tap validates only the nights **inside** `[entrada, salida)`, never the salida day itself. Re-run 5.10 → green — confirm the naive "grey cells are inert" implementation fails this exact test before generalizing.
- [ ] 5.12 [RED] same file: a range entirely in the past (today `2026-09-04`, range `08-01`→`08-05`) proceeds to the step-2 summary identically to a future range — no warning, no confirmation, no distinguishing style.
- [ ] 5.13 [GREEN] confirmed by 5.9/5.11 if the picker has no date-vs-today branch at all. Re-run 5.12 → green.
- [ ] 5.14 [RED] same file: `salida === entrada` (zero nights) is refused with a sentence; a range over 60 nights is refused with a sentence — both client-side, before any request.
- [ ] 5.15 [GREEN] the two guard sentences (D28), no server round-trip. Re-run 5.14 → green.
- [ ] 5.16 [RED] `front/src/app/reservations/wizard/GuestStep.test.tsx` (D33): entering an existing active guest's phone resolves to that guest, no new record created; entering a phone matching a different existing name shows `"Ese teléfono ya es de Marta González."` rather than silently renaming.
- [ ] 5.17 [GREEN] `GuestStep.tsx`: the find-or-create sheet, branching on `POST /clients`'s 200-vs-201 response. Re-run 5.16 → green.
- [ ] 5.18 [RED][TRIANGULATE] same file: a deactivated guest's phone reactivates that same client rather than creating a duplicate.
- [ ] 5.19 [GREEN] confirmed by 5.17's find-or-create-or-reactivate call. Re-run 5.18 → green.
- [ ] 5.20 [RED] `front/src/app/reservations/wizard/PriceStep.test.tsx`: entering an amount under `Por noche`, switching to `Total de la estadía`, entering a different amount, submits `price_total` only — never `price_per_night`.
- [ ] 5.21 [GREEN] `PriceStep.tsx`'s segmented control drives exactly one submitted field. Re-run 5.20 → green.
- [ ] 5.22 [RED][TRAP] same file: a 4-night per-night stay at `$ 45.000`, extended to 5 nights on step 2, shows `$ 225.000` on step 4 with no re-entry; the same extension on a stay-total stay leaves the amount unchanged.
- [ ] 5.23 [GREEN] `PriceStep.tsx` recomputes live from `price_per_night × nights` only in per-night mode. Re-run 5.22 → green.
- [ ] 5.24 [RED] `front/src/app/reservations/wizard/Wizard.test.tsx`: dates chosen on step 2 are still shown after navigating to step 3 and back.
- [ ] 5.25 [GREEN] wizard state reads/writes 5.2's store across steps. Re-run 5.24 → green.
- [ ] 5.26 [RED] same file: a successful save clears the draft; a fresh "Anotar una reserva" afterward starts step 1 with no carried-over data.
- [ ] 5.27 [GREEN] the save mutation's `onSuccess` clears 5.2's store and navigates away. Re-run 5.26 → green.
- [ ] 5.28 [RED] same file: tapping save with no connectivity shows a could-not-save message, leaves all four steps' entries intact, and creates nothing automatically once connectivity returns.
- [ ] 5.29 [GREEN] confirmed by 1.27's shared offline-mutation mechanism, plus the draft store surviving by construction (never cleared on failure). Re-run 5.28 → green.
- [ ] 5.30 [RED][TRAP — completes Phase 3's deferred proof] same file: a `401` on step 3 (cabin and dates already chosen) redirects to `/login`; after signing back in, the wizard resumes on step 3 with the cabin and dates intact.
- [ ] 5.31 [GREEN] confirmed by 5.2's in-memory store surviving a router-only navigation (3.14's `router.navigate`, never `window.location`) — the whole requirement collapses into that one rule, per D29. Re-run 5.30 → green; a failure here means the 401 handler is reloading the document somewhere, and 3.14 must be re-checked, not this task's own code.

## Phase 6: Slice 6 — Reservation Detail, Payments, Cancel (`reservation-ledger`, commit 1 of 2)

- [ ] 6.1 [RED] `front/src/app/reservations/detail/ReservationDetail.test.tsx`: an effective total of `180000` with `200000` paid renders `"Le tenés que devolver $ 20.000"`, with no error-styled element anywhere on the screen.
- [ ] 6.2 [GREEN] `front/src/app/reservations/detail/ReservationDetail.tsx`: `Total de la estadía`/`Pagado` read straight from `effective_total`/`paid_amount`; `Saldo` renders via 4.18's `displayBalance()`, sign translated to copy — never a literal `-$`. Re-run 6.1 → green.
- [ ] 6.3 [RED][TRIANGULATE — reuses 4.18's helper] same file: a cancelled reservation with a nonzero reported `balance` shows no "Debe"/"Le falta pagar"/"Le tenés que devolver" line anywhere, including in any list row referencing it.
- [ ] 6.4 [GREEN] confirmed by 4.17/4.18's `displayBalance()` returning `0` for `status === 'cancelled'`. Re-run 6.3 → green.
- [ ] 6.5 [RED] `front/src/app/reservations/detail/PaymentsList.test.tsx`: a payment (`60000`, `08-12`) and a later refund (`10000`, `08-20`) both appear in date order, the refund rendered as a negative amount.
- [ ] 6.6 [GREEN] `PaymentsList.tsx`: one list, sign-only discrimination, sorted by `paid_on`. Re-run 6.5 → green.
- [ ] 6.7 [RED] `front/src/app/reservations/detail/PaymentSheet.test.tsx`: "Anotar un pago" submits a positive amount; "Devolución" submits the negated amount — both to `POST /reservations/{id}/payments`.
- [ ] 6.8 [GREEN] the two sheets share one form component, differing only in the sign applied before submit. Re-run 6.7 → green.
- [ ] 6.9 [RED] `front/src/app/reservations/detail/CancelSheet.test.tsx`: declining the confirmation sends no request and leaves the reservation unchanged; confirming calls `POST /reservations/{id}/cancel`.
- [ ] 6.10 [GREEN] `CancelSheet.tsx`. Re-run 6.9 → green.
- [ ] 6.11 [RED][TRAP] same file: after confirming cancellation, the reservation calendar (Phase 4) stops showing those nights as occupied without a manual page reload.
- [ ] 6.12 [GREEN] the cancel mutation's `onSettled` invalidates the `reservations`/`dashboard`/`reservation(id)` query keys — D30's shared invalidation convention, built once here and reused by every mutation in Phases 7–8. Re-run 6.11 → green.
- [ ] 6.13 [TEST] same file: after cancellation, both payments recorded earlier still appear in "Pagos". **Labelled `[TEST]`:** 6.6/6.12's design touches only `status`, never the payments table, so this cannot fail given that construction — it is proof, not a cycle.
- [ ] 6.14 [RED] same file: a cancelled reservation's detail view renders no edit affordance; a non-cancelled one does.
- [ ] 6.15 [GREEN] `ReservationDetail.tsx`'s action block renders conditionally on `status !== 'cancelled'`. Re-run 6.14 → green. **Commit boundary: 6.1–6.15 ship as one commit.**

## Phase 6b: Editing A Reservation (`reservation-ledger`, commit 2 of 2 — its own work unit, per design's explicit instruction)

- [ ] 6.16 [RED] `front/src/app/reservations/edit/EditReservation.test.tsx`: the edit view's editable fields never include a cabin or guest control — module absent, fails.
- [ ] 6.17 [GREEN] `front/src/app/reservations/edit/EditReservation.tsx` (create, route `/reserva/:id/editar` — a full screen, not a sheet: a bottom sheet does not fit a month grid on an 874px phone, D34). Only date and price controls render. Re-run 6.16 → green.
- [ ] 6.18 [RED][TRAP] `front/src/app/reservations/occupancy.test.ts` (extend 5.7's function): Reservation R holds `09-03`→`09-07` on Casa Azul with nothing else overlapping; `occupiedNightsFor(stays, {excludeReservationId: R.id})` does not mark `09-03`–`09-06` as occupied, while another reservation's nights on the same cabin still are.
- [ ] 6.19 [GREEN] `occupancy.ts` filters the excluded id out of its input before computing occupied nights (5.6's required-parameter shape makes an omitted exclusion a compile error, not a silent runtime gap). Re-run 6.18 → green.
- [ ] 6.20 [RED][TRIANGULATE] same file: moving R's dates from `09-03`–`09-07` to `09-04`–`09-08` (`09-08` free) is not blocked by R's own prior nights, and the edit is submittable.
- [ ] 6.21 [GREEN] confirmed by 6.19's exclusion. Re-run 6.20 → green.
- [ ] 6.22 [RED] `front/src/app/reservations/edit/EditReservation.test.tsx` (extend): a price-mode switch during edit sends **both** `price_per_night` and `price_total`, one of them explicitly `null` — never one field omitted.
- [ ] 6.23 [GREEN] the edit submit handler always includes both keys. Re-run 6.22 → green — this is the trap the design names against a bare `{"price_per_night": 45000}` PATCH raising the backend's `23514` check violation.
- [ ] 6.24 [RED][TRIANGULATE — reuses reservation-recording's rescale rule] same file: extending a per-night-priced reservation from 4 to 5 nights during edit shows `$ 225.000` live; a stay-total-priced one stays `$ 180.000` until the price is touched.
- [ ] 6.25 [GREEN] 5.23's rescale logic reused here, not reimplemented. Re-run 6.24 → green.
- [ ] 6.26 [RED] same file: lowering the price on a reservation with `180000` paid down to `100000` is accepted with no guard, and the detail view then reads "Le tenés que devolver $ 80.000".
- [ ] 6.27 [GREEN] no min-price validation exists; the live `Saldo` preview uses `displayBalance()` before save. Re-run 6.26 → green.
- [ ] 6.28 [RED] same file: submitting an edit whose new dates overlap another reservation shows a message naming the cabin as occupied those nights and which nights of the requested range are free, containing none of "error"/"conflicto"/"409"; R's dates remain unchanged.
- [ ] 6.29 [GREEN] the `409 dates_unavailable` error maps through 1.21's resolver to an edit-specific sentence variant; the mutation does not optimistically apply the new dates before the response. Re-run 6.28 → green.
- [ ] 6.30 [RED] same file: a direct navigation to `/reserva/:id/editar` on a cancelled reservation redirects to the detail view instead of rendering the edit form — covering a bookmark, a back button, a stale tab (6.15 already covers the hidden-button half).
- [ ] 6.31 [GREEN] `EditReservation.tsx`'s route guard checks the loaded reservation's status before rendering. Re-run 6.30 → green. **Commit boundary: 6.16–6.31 ship as a second, separate commit.**

## Phase 7: Slice 7 — Guests (`guest-directory`)

- [ ] 7.1 [RED] `front/src/app/guests/GuestDirectory.test.tsx`: a client with `is_active: false` still appears in the list, styled grey and marked "Desactivado" — never filtered out.
- [ ] 7.2 [GREEN] `GuestDirectory.tsx`: fetches via 4.9's `useClients()`, renders the inactive-style branch. Re-run 7.1 → green.
- [ ] 7.3 [RED] same file: adding a guest whose phone matches an existing active client resolves to that client, no duplicate; a deactivated client's matching phone reactivates it.
- [ ] 7.4 [TEST/GREEN] confirmed by 5.17/5.19's find-or-create sheet, **mounted from a second entry point (add-guest button) rather than reimplemented.** Largely a `[TEST]` proving reuse, not new production logic.
- [ ] 7.5 [RED] same file: typing `2233` with guests at `1122334455`/`1155667788` filters to only the matching row.
- [ ] 7.6 [GREEN] client-side substring filter over the already-fetched list. Re-run 7.5 → green.
- [ ] 7.7 [RED] same file: a guest with one non-cancelled stay (`balance 80000`) and one cancelled stay shows `"Debe $ 80.000"`, excluding the cancelled amount; with two non-cancelled and one cancelled stay, the shown count is `2`.
- [ ] 7.8 [GREEN] per-guest aggregate computed from the reservation list, filtered to non-cancelled, reusing 4.18's `displayBalance()` per stay before summing. Re-run 7.7 → green.
- [ ] 7.9 [RED] `front/src/app/guests/GuestSheet.test.tsx`: with more non-cancelled stays than the sheet displays directly and the first overflow stay in February, the sheet shows "y 1 estadía más en febrero" (count adjusted to the real overflow).
- [ ] 7.10 [GREEN] `GuestSheet.tsx`'s collapse-overflow line. Re-run 7.9 → green.
- [ ] 7.11 [RED] same file: tapping a listed stay row navigates to that reservation's detail view.
- [ ] 7.12 [GREEN] a route link per row. Re-run 7.11 → green.
- [ ] 7.13 [RED] same file: confirming "Desactivar" on a guest with two past stays leaves both stays visible with the guest's name intact afterward; declining sends no request.
- [ ] 7.14 [GREEN] the deactivate confirmation sheet + soft-delete mutation, invalidating 6.12's query keys. Re-run 7.13 → green.
- [ ] 7.15 [RED] `front/src/app/guests/GuestForm.test.tsx`: submitting add/edit with a blank name or phone sends no request.
- [ ] 7.16 [GREEN] client-side required-field guard before the mutation fires. Re-run 7.15 → green.

## Phase 8: Slice 8 — Cabins (`cabin-directory`)

- [ ] 8.1 [RED] `front/src/app/cabins/CabinDirectory.test.tsx`: the available actions never include a permanent-delete affordance; deactivating a cabin with past reservations leaves those reservations fully readable, with the cabin's name still resolvable.
- [ ] 8.2 [GREEN] `CabinDirectory.tsx`: rename/deactivate only; deactivation is the same soft-delete pattern as 7.14. Re-run 8.1 → green.
- [ ] 8.3 [RED] same file: declining the deactivation confirmation sends no request; the cabin remains active.
- [ ] 8.4 [GREEN] confirmed by 8.2's shared confirmation-sheet pattern. Re-run 8.3 → green.
- [ ] 8.5 [RED] `front/src/app/cabins/CabinForm.test.tsx`: submitting the add-cabin form with a blank name sends no request.
- [ ] 8.6 [GREEN] client-side guard, mirroring 7.16. Re-run 8.5 → green.
- [ ] 8.7 [RED][TRAP] `front/src/app/cabins/CabinDirectory.test.tsx` (extend): renaming a cabin shown on a past reservation's detail view updates that reservation's displayed cabin name too, with no migration step.
- [ ] 8.8 [GREEN] confirmed by construction — cabin names are always resolved live via 4.9's `useCabins()` lookup, never snapshotted onto a reservation. Re-run 8.7 → green.
- [ ] 8.9 [RED] same file: a cabin card's "N noches ocupadas este mes" figure matches `GET /dashboard/summary`'s per-property breakdown, not a client-recomputed count.
- [ ] 8.10 [GREEN] the card reads the dashboard response's per-property field directly. Re-run 8.9 → green.

## Phase 9: Cross-Cutting Closeout — no new capability, verification only

- [ ] 9.1 [TEST] Full-source glossary scan: re-run 1.22's scan over every `shared/copy/**` file added across Phases 3–8, confirming zero forbidden-word matches now that error, reservation, guest, and cabin copy all exist.
- [ ] 9.2 [TEST] Full import-boundary audit: every module under the now-complete `src/public/**` imports only from `src/public/**` and `src/shared/**` — a re-run of 1.28/2.30's mechanism against the finished tree, not a new one.
- [ ] 9.3 [TEST] Store-count audit (finalizes 3.2/5.3): exactly two stores exist across the whole finished app, and neither mirrors a server list.
- [ ] 9.4 Re-run `npm run api:types` (0.8) against the finished backend contract; confirm no drift since Phase 0. Not TDD-able — a generated-file freshness check, per D35's stated gap (no CI asserts it automatically).
- [ ] 9.5 One Playwright smoke path — login → record a stay → record a payment → see the balance — added now that Phase 6 gives it a real path to smoke, per the design's explicit deferral ("not before slice 6, when there is a path to smoke"). The first and only E2E test in this change.
- [ ] 9.6 `docker-compose.yml`: the deferred `front` dev service (D37) — explicitly out of scope for slices 1–8. Recorded here rather than silently dropped; may be picked up in a separate later change instead of this one.

---

## Task Count Summary

| Phase | Capability | Tasks | Notes |
|---|---|---|---|
| 0 | none — scaffolding | 9 (0.1–0.9) | Not TDD-able. First TDD-able unit is 0.7 |
| 1 | `frontend-foundation` / `interface-copy-and-formatting` | 28 (1.1–1.28) | No screen ships. RED/GREEN/TRIANGULATE starts here. Two standing regression guards established (1.22 glossary, 1.25/1.28 boundary) |
| 2 | `month-calendar-rendering` / `public-availability-page` | 30 (2.1–2.30) | Independently shippable — the owner can paste the link before the app she signs into exists |
| 3 | `owner-session` / `home-summary` | 23 (3.1–3.23) | **1 BLOCKING human-approval gate (3.1, covers D29).** No session code precedes it |
| 4 | `reservation-calendar` (+ pastel placement note re: `month-calendar-rendering`) | 28 (4.1–4.28) | The screen she opens most |
| 5 | `reservation-recording` | 31 (5.1–5.31) | Contains the handoff's own apparent contradiction (5.10/5.11) and the deferred 401-draft-survival proof (5.30/5.31) |
| 6 | `reservation-ledger` (detail/payments/cancel) | 15 (6.1–6.15) | Commit 1 of 2 for this capability |
| 6b | `reservation-ledger` (editing) | 16 (6.16–6.31) | Commit 2 of 2 — its own work unit, per `design.md`'s explicit Slicing instruction |
| 7 | `guest-directory` | 16 (7.1–7.16) | Reuses Phase 5's find-or-create sheet and Phase 4's `displayBalance()` |
| 8 | `cabin-directory` | 10 (8.1–8.10) | Last, and genuinely so — two rows that change roughly never |
| 9 | cross-cutting | 6 (9.1–9.6) | 9.6 (docker-compose) is a recorded deferral, not a slice deliverable |
| **Total** | | **212** | 1 BLOCKING human-approval gate; 10 commits (0 through 9, with Phase 6 split into two) |
