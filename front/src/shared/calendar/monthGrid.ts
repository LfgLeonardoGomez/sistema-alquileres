import { Temporal } from 'temporal-polyfill'
import { parsePlainDate, type PlainDate } from '../date/parsePlainDate'

// design D28: the month grid is the first of `shared/calendar/`'s pure
// functions. It knows nothing about reservations, guests, cabins or auth
// (task 2.17's domain-import scan) -- only a target month and calendar
// geometry. `Temporal.PlainDate` computes every day; `Date` never appears.

/** A target month. Months are 1-indexed (`9` = September), matching the
 * server's own `month_window(year, month)` (`back/app/services/dates.py`)
 * and `PlainDate`'s own digits, never a JS `Date`'s 0-indexed month. */
export type YearMonth = { readonly year: number; readonly month: number }

/** One grid cell: a real day, or `null` for a leading/trailing blank. */
export type DayCell = { readonly date: PlainDate } | null

const WEEKS_IN_GRID = 6
const DAYS_IN_WEEK = 7
const CELLS_IN_GRID = WEEKS_IN_GRID * DAYS_IN_WEEK

/**
 * `[first_of_month, first_of_next_month)` -- the same half-open window the
 * server computes in `back/app/services/dates.py`'s `month_window`.
 * December rolls into January of the following year rather than an
 * invalid month 13.
 */
export function monthWindow({ year, month }: YearMonth): { start: PlainDate; end: PlainDate } {
  const start = Temporal.PlainDate.from({ year, month, day: 1 })
  const end = start.add({ months: 1 })
  return { start: parsePlainDate(start.toString()), end: parsePlainDate(end.toString()) }
}

/**
 * Builds a Monday-first month grid, always six rows (design D28): the page
 * height must not jump when paging between months, so a 28-day February
 * and a 31-day month both produce the same 6x7 shape. `Temporal`'s
 * `dayOfWeek` is already Monday(1)..Sunday(7), so no reindexing is needed.
 */
export function getMonthGrid({ year, month }: YearMonth): DayCell[][] {
  const firstOfMonth = Temporal.PlainDate.from({ year, month, day: 1 })
  const leadingBlanks = firstOfMonth.dayOfWeek - 1

  const cells: DayCell[] = []
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push(null)
  }
  for (let day = 1; day <= firstOfMonth.daysInMonth; day++) {
    cells.push({ date: parsePlainDate(Temporal.PlainDate.from({ year, month, day }).toString()) })
  }
  while (cells.length < CELLS_IN_GRID) {
    cells.push(null)
  }

  const rows: DayCell[][] = []
  for (let row = 0; row < WEEKS_IN_GRID; row++) {
    rows.push(cells.slice(row * DAYS_IN_WEEK, (row + 1) * DAYS_IN_WEEK))
  }
  return rows
}
