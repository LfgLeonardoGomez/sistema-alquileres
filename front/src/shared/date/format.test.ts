import { describe, expect, it } from 'vitest'
import { formatDateRange, formatDayMonth } from './format'
import { parsePlainDate } from './parsePlainDate'

// design D26: these formatters read the branded string's own digits
// directly and never construct a `Date` -- so the result must be a
// property of the value, not of the process's timezone. Run under all
// three TZ projects (utc / ar / kiritimati); a byte-identical result across
// all three is the test.

describe('formatDayMonth', () => {
  it('renders day then month, never ISO or American order', () => {
    expect(formatDayMonth(parsePlainDate('2026-09-03'))).toBe('3/9')
  })
})

describe('formatDateRange', () => {
  // [TRAP] entrada-to-salida, not first-night-to-last-night. check_in 3/9,
  // check_out 7/9 is a 4-night stay -- daysBetween(3, 7) = 4 -- and the two
  // facts are consistent precisely because the range is half-open. A
  // reader who "corrects" this to "3 al 6" has broken the design.
  it('[TRAP] renders entrada-to-salida for a 4-night stay, not entrada-to-last-night', () => {
    expect(formatDateRange(parsePlainDate('2026-09-03'), parsePlainDate('2026-09-07'))).toBe(
      '3 al 7 de septiembre',
    )
  })

  it('renders a month-crossing range with both months named', () => {
    expect(formatDateRange(parsePlainDate('2026-08-28'), parsePlainDate('2026-09-03'))).toBe(
      '28 de agosto al 3 de septiembre',
    )
  })

  // The exact string here is an OWNER DECISION (2026-09-05), not a rule
  // derived from the handoff -- neither the handoff nor design.md carries a
  // year-crossing example, and design.md says only "year appended". The year
  // is written ONCE, at the end, taken from check_out. Reading "de 2027" as
  // applying to both endpoints would mean December 2027 to January 2027,
  // which cannot happen, so the sentence resolves itself. The alternative
  // considered and rejected was "30 de diciembre de 2026 al 3 de enero de
  // 2027": unambiguous, but longer than a narrow phone card and in a more
  // formal register than the rest of the copy.
  it('appends the year once, from check_out, for a year-crossing range', () => {
    expect(formatDateRange(parsePlainDate('2026-12-30'), parsePlainDate('2027-01-03'))).toBe(
      '30 de diciembre al 3 de enero de 2027',
    )
  })
})
