import type { PlainDate } from './parsePlainDate'

// design D26: every formatter here reads the branded string's own digits
// directly and never constructs a `Date` -- there is no instant anywhere on
// this path, so there is no timezone for the result to be off-by-one on.

const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

function monthName(month: number): string {
  const name = SPANISH_MONTHS[month - 1]
  if (name === undefined) {
    throw new Error(`Invalid month index: ${month}`)
  }
  return name
}

function splitPlainDate(date: PlainDate): { year: number; month: number; day: number } {
  // Fixed offsets into the branded `YYYY-MM-DD` string -- reading the
  // string's own digits, never a `Date`'s local/UTC fields.
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  }
}

/** Renders a single date as `D/M` -- day, then month, never ISO or American order. */
export function formatDayMonth(date: PlainDate): string {
  const { month, day } = splitPlainDate(date)
  return `${day}/${month}`
}

/** task 7.9/7.10: the guest sheet's overflow line names a MONTH, not a
 * date -- "y 1 estadía más en febrero". Reuses this module's own
 * `SPANISH_MONTHS` rather than a fourth hand-written month-name array
 * (`home.ts` and `public.ts` each already have one, for their own,
 * differently-cased screens). */
export function monthNameFor(date: PlainDate): string {
  return monthName(splitPlainDate(date).month)
}

/**
 * Renders `[checkIn, checkOut)` as `"D al D de <mes>"`.
 *
 * This is entrada-to-salida, not first-night-to-last-night: `3 al 7 de
 * septiembre` describes a 4-night stay, and the two facts are consistent
 * precisely because the range is half-open. There is no minus-one-day
 * adjustment anywhere in this function -- design D26 calls "correcting"
 * this the single most confusable rule in the change.
 */
export function formatDateRange(checkIn: PlainDate, checkOut: PlainDate): string {
  const start = splitPlainDate(checkIn)
  const end = splitPlainDate(checkOut)

  if (start.year === end.year && start.month === end.month) {
    return `${start.day} al ${end.day} de ${monthName(end.month)}`
  }

  const base = `${start.day} de ${monthName(start.month)} al ${end.day} de ${monthName(end.month)}`
  return start.year === end.year ? base : `${base} de ${end.year}`
}
