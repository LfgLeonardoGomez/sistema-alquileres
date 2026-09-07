import { Temporal } from 'temporal-polyfill'
import type { PlainDate } from './parsePlainDate'

/**
 * How many whole days lie between `from` and `to` -- `0` when they are the
 * same date, negative when `to` is in the past relative to `from`.
 *
 * Deliberately its own function, not a reuse of `nightsBetween.ts`: that
 * module computes the same underlying `Temporal` arithmetic but is named
 * and documented for one specific domain meaning (how many nights a
 * `[checkIn, checkOut)` stay covers). Reusing it here for an unrelated
 * "how far away is this date" question is exactly the kind of drift
 * `nightsBetween.ts`'s own header warns against -- two callers leaning on
 * the same function for two different reasons is how they end up
 * disagreeing later.
 */
export function daysUntil(from: PlainDate, to: PlainDate): number {
  return Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days
}
