import { Temporal } from 'temporal-polyfill'
import type { PlainDate } from './parsePlainDate'

/**
 * How many NIGHTS a half-open `[checkIn, checkOut)` stay covers.
 *
 * `3 al 7 de septiembre` is four nights, and there is no minus-one-day
 * adjustment anywhere in this function -- design D26 calls "correcting"
 * that the single most confusable rule in the change.
 *
 * Extracted for task 6.15's third call site, and it was overdue: the two
 * that already existed (`wizard/DateStep.tsx`, exported so `PriceStep`
 * could not write a second one; and a private copy inside
 * `calendar/WhoStays.tsx`) had ALREADY drifted into two different
 * spellings -- `from(checkIn).until(checkOut)` and
 * `from(checkOut).since(checkIn)`. They agree today, which is exactly why
 * a third independent copy was the wrong thing to write.
 */
export function nightsBetween(checkIn: PlainDate, checkOut: PlainDate): number {
  return Temporal.PlainDate.from(checkIn).until(Temporal.PlainDate.from(checkOut)).days
}
