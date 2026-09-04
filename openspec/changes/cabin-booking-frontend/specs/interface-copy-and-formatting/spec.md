# Interface Copy And Formatting Specification

## Purpose

The Spanish glossary, the forbidden-word list, and Argentine money/date
formatting are enforced as tested rules, not review-time conventions. The
sharpest rule here is the plain-date rule: an API date string is three
integers, never an instant, and must never be constructed into a `Date` and
rendered through a timezone — the exact bug that turns `2026-09-03` into
"2/9" in Argentina and produces a wrong ledger rather than a visible error.

## Requirements

### Requirement: No Forbidden Word Or Technical Term Reaches Rendered Copy

The system MUST NOT render any of the handoff's forbidden words (Propiedad,
Unidad, Cliente, Usuario, Booking, Check-in, Check-out, Tarifa, Transacción,
Reembolso, Balance, Deuda, Eliminar, Borrar, Ingresos, Facturación) nor any
technical or status word (error, conflicto, 409, registro) anywhere in the
interface, including on error paths.

#### Scenario: A static scan of source copy finds no forbidden word

- GIVEN every user-facing string literal in the source tree
- WHEN each is checked against the forbidden-word list
- THEN none MUST match, in any casing

#### Scenario: A backend conflict never surfaces as "conflicto"

- GIVEN the API rejects a request with `{"code": "dates_unavailable"}`
- WHEN the mapped Spanish message is rendered
- THEN it MUST NOT contain "conflicto", "error", or "409", and MUST instead state that the cabin is occupied those nights and show which nights are free

### Requirement: Money Renders With A Dot Thousands Separator And No Decimals

The system MUST format every money amount as `$ ` followed by the integer
value with `.` as the thousands separator and no decimal digits, regardless
of how many decimal digits the API's string-serialized `Decimal` carries.

#### Scenario: A round amount formats without decimals

- WHEN the amount `180000` is formatted
- THEN it MUST render as `"$ 180.000"`

#### Scenario: The API's decimal-string amount formats identically

- GIVEN the API returns the string `"5000.00"` for a money field
- WHEN that value is formatted
- THEN it MUST render as `"$ 5.000"`, with the decimal component dropped, and MUST NOT be rounded or re-sent to the API as a modified value

### Requirement: Dates Render Day/Month Or As A Spanish Range, Never ISO Or American Order

The system MUST render a single date as `D/M` and a date range as
`"D al D de <mes>"`, and MUST NOT render an ISO string or an American
month/day order anywhere in the interface.

#### Scenario: A single date renders day-then-month

- GIVEN the API date string `"2026-09-03"`
- WHEN it is formatted for display
- THEN it MUST render as `"3/9"`

#### Scenario: A range renders as a Spanish phrase

- GIVEN `check_in = "2026-09-03"` and `check_out = "2026-09-07"`
- WHEN the range is formatted for display
- THEN it MUST render as `"3 al 7 de septiembre"`

### Requirement: An API Date String Is A Plain Date, Never Converted Through A Timezone

The system MUST treat every API date string as three integers (year, month,
day) and MUST NOT construct it into a `Date` object whose value is then
rendered through the browser's local timezone. This MUST hold regardless of
the runtime's configured timezone.

#### Scenario: A negative-offset runtime still renders the correct day

The runtime timezone here is load-bearing and must not be relaxed to UTC.
`new Date("2026-09-03")` is parsed as UTC midnight, so reading its day in
local time returns 3 under UTC and 2 under any negative offset. A test run
with the clock set to UTC therefore **passes on the buggy implementation**
and proves nothing. Verified empirically: `TZ=UTC` yields 3, and
`TZ=America/Argentina/Buenos_Aires` yields 2.

- GIVEN the test runtime's timezone is `America/Argentina/Buenos_Aires`, whose offset from UTC is negative
- WHEN the API date string `"2026-09-03"` is rendered
- THEN it MUST render as `"3/9"`, not `"2/9"`

#### Scenario: The rendering is timezone-independent, not merely correct in one zone

- GIVEN the same API date string `"2026-09-03"`
- WHEN it is rendered under a negative-offset timezone and again under UTC
- THEN both MUST render as `"3/9"`, so the result is a property of the value rather than of where the code happens to run

#### Scenario: A date entered on the picker round-trips unchanged to the API

- GIVEN the owner selects the day she sees labeled `3` under `Septiembre` on the picker
- WHEN that selection is submitted as `check_in`
- THEN the request payload MUST carry `"2026-09-03"`, unchanged by the browser's configured timezone

### Requirement: "Today" Is Computed In Buenos Aires Time

The system MUST compute "today", for any purpose (a stay's finished state, the
home summary's month, calendar highlighting), in
`America/Argentina/Buenos_Aires`, matching the server's `today_ar()`, and
MUST NOT compute it from the browser's local timezone or from UTC.

#### Scenario: A stay reads as finished consistently near midnight UTC

- GIVEN the moment is `2026-09-04T02:30:00Z`, which is `2026-09-03T23:30:00-03:00` in Argentina
- WHEN the system computes "today" for any display purpose
- THEN it MUST resolve to `2026-09-03`, not `2026-09-04`

### Requirement: The Week Starts Monday On Every Calendar Surface

Every rendered month grid — private calendar, date picker, and public
calendar — MUST show its weekday header in the order `L M M J V S D`, Monday
first.

#### Scenario: All three calendar surfaces share the same weekday order

- GIVEN the private calendar, the wizard's date picker, and the public calendar are each rendered
- WHEN their weekday header rows are inspected
- THEN all three MUST read `L M M J V S D` in that order
