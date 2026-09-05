import { describe, expect, it } from 'vitest'
import { getMonthGrid } from './monthGrid'
import { parsePlainDate } from '../date/parsePlainDate'

// design D28: the month grid is a pure `{year, month} -> DayCell[][]`
// function, Monday-first, with leading/trailing blanks padding partial
// weeks, and it always has six rows so paging between months never moves
// the page height. `Temporal.PlainDate` computes the geometry; there is no
// `Date` anywhere on this path.

describe('getMonthGrid', () => {
  it('pads a mid-week start with one leading blank (Monday-first)', () => {
    // September 2026 starts on a Tuesday.
    const grid = getMonthGrid({ year: 2026, month: 9 })

    expect(grid[0]).toEqual([
      null,
      { date: parsePlainDate('2026-09-01') },
      { date: parsePlainDate('2026-09-02') },
      { date: parsePlainDate('2026-09-03') },
      { date: parsePlainDate('2026-09-04') },
      { date: parsePlainDate('2026-09-05') },
      { date: parsePlainDate('2026-09-06') },
    ])
  })

  it('pads a mid-week end with trailing blanks, and always renders six rows', () => {
    // September 2026 ends on a Wednesday (the 30th).
    const grid = getMonthGrid({ year: 2026, month: 9 })

    expect(grid).toHaveLength(6)

    const rowWithTheLastDays = grid[4]
    expect(rowWithTheLastDays).toEqual([
      { date: parsePlainDate('2026-09-28') },
      { date: parsePlainDate('2026-09-29') },
      { date: parsePlainDate('2026-09-30') },
      null,
      null,
      null,
      null,
    ])

    // September only needs five weeks of real content -- the sixth row is
    // the spare, fully blank week that D28's "always six rows" guarantees.
    expect(grid[5]).toEqual([null, null, null, null, null, null, null])
  })

  it('[TRIANGULATE] a 28-day February starting on a Sunday still produces six rows', () => {
    // February 2026 (not a leap year) has 28 days and starts on a Sunday --
    // the maximum possible leading-blank count (6).
    const grid = getMonthGrid({ year: 2026, month: 2 })

    expect(grid).toHaveLength(6)
    expect(grid[0]).toEqual([null, null, null, null, null, null, { date: parsePlainDate('2026-02-01') }])
    expect(grid[4]).toEqual([
      { date: parsePlainDate('2026-02-23') },
      { date: parsePlainDate('2026-02-24') },
      { date: parsePlainDate('2026-02-25') },
      { date: parsePlainDate('2026-02-26') },
      { date: parsePlainDate('2026-02-27') },
      { date: parsePlainDate('2026-02-28') },
      null,
    ])
    expect(grid[5]).toEqual([null, null, null, null, null, null, null])
  })

  it('[TRIANGULATE] a 31-day month starting mid-week still produces six rows', () => {
    // October 2026 has 31 days and starts on a Thursday.
    const grid = getMonthGrid({ year: 2026, month: 10 })

    expect(grid).toHaveLength(6)
    expect(grid[0]).toEqual([
      null,
      null,
      null,
      { date: parsePlainDate('2026-10-01') },
      { date: parsePlainDate('2026-10-02') },
      { date: parsePlainDate('2026-10-03') },
      { date: parsePlainDate('2026-10-04') },
    ])
    expect(grid[4]).toEqual([
      { date: parsePlainDate('2026-10-26') },
      { date: parsePlainDate('2026-10-27') },
      { date: parsePlainDate('2026-10-28') },
      { date: parsePlainDate('2026-10-29') },
      { date: parsePlainDate('2026-10-30') },
      { date: parsePlainDate('2026-10-31') },
      null,
    ])
    expect(grid[5]).toEqual([null, null, null, null, null, null, null])
  })
})
