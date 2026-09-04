# Month Calendar Rendering Specification

## Purpose

A shared, headless geometry core that turns a half-open `[check_in, check_out)`
date range into a Monday-first month grid of per-day segments. It is consumed
by three surfaces — the private per-cabin calendar, the reservation wizard's
date picker, and the public availability page — and by none of them
duplicated. The core carries no knowledge of reservations, guests,
authentication, or color tokens; it is a pure function of `{start, end, key}`
triples and a target month. Because it imports no domain type, it is legal to
import from both the authenticated and the public route trees, which is the
structural precondition the privacy boundary in `public-availability-page`
depends on.

## Requirements

### Requirement: Monday-First Month Grid With Leading And Trailing Blanks

The system MUST generate a month grid whose week rows always begin on Monday
and end on Sunday, padding the first and last week with blank cells so every
row contains exactly seven days and the grid always covers whole weeks.

#### Scenario: A month starting mid-week gets leading blanks

- GIVEN September 2026, which starts on a Tuesday
- WHEN the month grid is generated
- THEN the first row MUST contain one leading blank cell (Monday) followed by Tuesday 1 through Sunday 6

#### Scenario: A month ending mid-week gets trailing blanks

- GIVEN September 2026, which ends on a Wednesday (30th)
- WHEN the month grid is generated
- THEN the final row MUST contain the 28th through the 30th followed by trailing blank cells through Sunday

### Requirement: Half-Open Ranges Convert Into Per-Day Segments

The system MUST convert a half-open `[check_in, check_out)` range into a
segment for each occupied day: `start` (rounded on the leading edge) for the
`check_in` day of a multi-night stay, `middle` (full-bleed, no rounding) for
every night strictly between, `end` (rounded on the trailing edge) for the
last occupied night — which is `check_out` minus one day, never `check_out`
itself — and `single` (rounded on both edges) when `check_in` and the last
occupied night are the same day.

#### Scenario: A multi-night stay produces start, middle, and end segments

- GIVEN a stay from `2026-09-03` to `2026-09-07`
- WHEN segments are computed for September 2026
- THEN `2026-09-03` MUST be `start`, `2026-09-04` and `2026-09-05` MUST be `middle`, `2026-09-06` MUST be `end`, and `2026-09-07` MUST carry no segment from this stay

#### Scenario: A single-night stay produces one rounded-both-ends segment

- GIVEN a stay from `2026-09-10` to `2026-09-11`
- WHEN segments are computed for September 2026
- THEN `2026-09-10` MUST be `single`, and no other day carries a segment from this stay

### Requirement: Adjacency Splits Into Two Half-Segments, Never A Conflict

When one stay's `check_out` and another stay's `check_in` fall on the same
calendar day, the system MUST render that day as two independent half
segments — a closing half for the outgoing stay and an opening half for the
incoming stay — and MUST NOT collapse it into a single segment, a merged
color, or any form of conflict indicator. Two stays sharing an adjacency day
MUST also receive different color slots (see the color-slot requirement
below), or the half-split is present in geometry but invisible in color.

#### Scenario: A shared checkout/check-in day renders two half-segments

- GIVEN Stay A with `check_out = 2026-09-12` and Stay B with `check_in = 2026-09-12` on the same property
- WHEN segments are computed for September 2026
- THEN `2026-09-12` MUST carry a closing half-segment belonging to Stay A and an opening half-segment belonging to Stay B, and MUST NOT carry a single merged segment or any conflict marker

### Requirement: Stays Straddling A Month Boundary Render In Every Month They Touch

The segmentation function MUST be computed independently per displayed month
and MUST include a stay's overlapping portion in every month it touches, with
each month's portion correctly rounded at that month's visible edges.

#### Scenario: A stay crossing August into September appears in both months

- GIVEN a stay from `2026-08-28` to `2026-09-03`
- WHEN segments are computed for August 2026 and, separately, for September 2026
- THEN the August grid MUST show segments for `2026-08-28` through `2026-08-31`, and the September grid MUST show segments for `2026-09-01` and `2026-09-02`, with neither month showing the stay as absent or truncated to zero days

### Requirement: Color-Slot Assignment Keeps Adjacent Stays Distinguishable

The system MUST assign each stay one of three rotating color slots ordered by
`check_in`, and MUST guarantee that two stays sharing an adjacency day (per
the requirement above) never receive the same slot, even when that forces a
departure from strict rotation order.

#### Scenario: Two adjacent stays never share a color slot

- GIVEN Stay A (`check_in = 2026-09-08`) and Stay B (`check_in = 2026-09-12`, adjacent to Stay A's `check_out = 2026-09-12`)
- WHEN color slots are assigned for the displayed month
- THEN Stay A and Stay B MUST receive different slots

#### Scenario: A fourth concurrent stay still avoids its adjacency neighbors' slots

- GIVEN four stays in the same displayed month, where the fourth stay (by `check_in` order) is adjacent to the third stay's `check_out`
- WHEN color slots are assigned
- THEN the fourth stay's slot MUST differ from the third stay's slot, even though strict three-way rotation would otherwise repeat it

### Requirement: The Core Carries No Domain Knowledge And Is Legal For Both Route Trees

The month-grid and segmentation module MUST NOT import any type or module
representing a reservation, client, guest, cabin, or authentication state. It
MUST operate only on `{start: Date-like, end: Date-like, key: string}` inputs
and a target month/year, so that it can be imported unmodified from both the
authenticated app tree and the public route tree without violating the
import boundary that isolates them.

#### Scenario: The module has no domain imports

- GIVEN the shared calendar module's source file
- WHEN its imports are inspected
- THEN it MUST import nothing from a reservation, client, guest, cabin, or auth module, in either route tree
