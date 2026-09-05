import { describe, expect, it } from 'vitest'
import { computeSegments, type DateRange } from './segments'
import { parsePlainDate } from '../date/parsePlainDate'

// design D28: segmentation turns half-open `[start, end)` ranges into
// per-day segments over a target month. The core knows nothing about
// reservations -- `key` is an opaque identifier the caller supplies.

function range(key: string, start: string, end: string): DateRange {
  return { key, start: parsePlainDate(start), end: parsePlainDate(end) }
}

describe('computeSegments', () => {
  it('renders start, middle, middle, end for a 4-night stay -- check_out itself carries no segment', () => {
    const segments = computeSegments([range('A', '2026-09-03', '2026-09-07')], { year: 2026, month: 9 })

    expect(segments).toEqual([
      { date: parsePlainDate('2026-09-03'), key: 'A', kind: 'start' },
      { date: parsePlainDate('2026-09-04'), key: 'A', kind: 'middle' },
      { date: parsePlainDate('2026-09-05'), key: 'A', kind: 'middle' },
      { date: parsePlainDate('2026-09-06'), key: 'A', kind: 'end' },
    ])
    expect(segments.some((s) => s.date === parsePlainDate('2026-09-07'))).toBe(false)
  })

  it('[TRIANGULATE] renders a single-night stay as one rounded-both-ends segment', () => {
    const segments = computeSegments([range('A', '2026-09-10', '2026-09-11')], { year: 2026, month: 9 })

    expect(segments).toEqual([{ date: parsePlainDate('2026-09-10'), key: 'A', kind: 'single' }])
  })

  // [TRAP] design D28's central subtlety: adjacency splits, it never
  // merges. A guest leaving in the morning and the next arriving in the
  // afternoon on the same day is the most common real pattern in this
  // business, not a conflict.
  it('[TRAP] splits a shared checkout/check-in day into two half-segments, never a merge or a conflict', () => {
    const stayA = range('A', '2026-09-08', '2026-09-12') // check_out 2026-09-12
    const stayB = range('B', '2026-09-12', '2026-09-15') // check_in 2026-09-12

    const segments = computeSegments([stayA, stayB], { year: 2026, month: 9 })
    const onAdjacencyDay = segments.filter((s) => s.date === parsePlainDate('2026-09-12'))

    expect(onAdjacencyDay).toEqual(
      expect.arrayContaining([
        { date: parsePlainDate('2026-09-12'), key: 'A', kind: 'closingHalf' },
        { date: parsePlainDate('2026-09-12'), key: 'B', kind: 'openingHalf' },
      ]),
    )
    expect(onAdjacencyDay).toHaveLength(2)
    // Never a single merged segment, and never a third, conflict-shaped kind.
    expect(onAdjacencyDay.every((s) => s.kind === 'closingHalf' || s.kind === 'openingHalf')).toBe(true)
  })

  // [TRAP] each month is computed independently -- a stay straddling a
  // month boundary must appear in BOTH months' results, never absent from
  // either and never truncated to zero, with no requirement that the
  // caller hold a cross-month view.
  it('[TRAP] a month-crossing stay appears in both months, never absent or truncated', () => {
    const straddling = [range('A', '2026-08-28', '2026-09-03')]

    const august = computeSegments(straddling, { year: 2026, month: 8 })
    const september = computeSegments(straddling, { year: 2026, month: 9 })

    expect(august.map((s) => s.date).sort()).toEqual(
      ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'].map((d) => parsePlainDate(d)).sort(),
    )
    expect(september.map((s) => s.date).sort()).toEqual(
      ['2026-09-01', '2026-09-02'].map((d) => parsePlainDate(d)).sort(),
    )
  })
})
