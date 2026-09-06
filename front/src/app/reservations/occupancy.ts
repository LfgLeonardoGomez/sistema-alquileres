import { Temporal } from 'temporal-polyfill'
import type { PlainDate } from '../../shared/date/parsePlainDate'
import { parsePlainDate } from '../../shared/date/parsePlainDate'

// design D34: "The structural answer is a parameter with no default." The
// server's `EXCLUDE USING gist` compares distinct rows, so a reservation
// never conflicts with itself -- a picker that shows the stay being
// edited as occupied is correct-looking and completely broken, and it
// fails only when someone tries to shift a date by one day. This is the
// ONLY function that builds the picker's occupied set (both the create
// wizard, which passes `null`, and the future edit screen, which passes
// the reservation's own id).

export type OccupancyStay = {
  readonly id: string
  readonly checkIn: PlainDate
  readonly checkOut: PlainDate
}

export type OccupiedNightsOptions = {
  readonly excludeReservationId: string | null
}

/**
 * Every occupied NIGHT (never the checkout day -- half-open ranges, the
 * same rule `shared/calendar/segments.ts` enforces) across `stays`,
 * excluding `excludeReservationId` if given. Callers are responsible for
 * having already filtered out cancelled stays (D30: "activeStays()
 * filters them out of every occupancy computation").
 *
 * `options` has NO default (D34, required): calling this with one argument
 * is a compile error (`occupancy.test-d.ts`), so the create-wizard call
 * site must write `{excludeReservationId: null}` explicitly rather than
 * getting the correct-for-creating case by forgetting a parameter.
 */
/**
 * Every NIGHT in the half-open range `[checkIn, checkOut)` -- the check-out
 * day is not a night, the same rule `shared/calendar/segments.ts` enforces
 * and the same one `formatDateRange` deliberately does NOT compensate for.
 *
 * Extracted at 6.29 because the edit screen needs the identical
 * enumeration for a different question -- "which of the nights she just
 * asked for are still free?" -- and a second copy of this loop would be a
 * second chance to get the half-open boundary wrong.
 */
export function nightsInRange(checkIn: PlainDate, checkOut: PlainDate): PlainDate[] {
  const nights: PlainDate[] = []
  let cursor = Temporal.PlainDate.from(checkIn)
  const end = Temporal.PlainDate.from(checkOut)
  while (Temporal.PlainDate.compare(cursor, end) < 0) {
    nights.push(parsePlainDate(cursor.toString()))
    cursor = cursor.add({ days: 1 })
  }
  return nights
}

export function occupiedNightsFor(stays: readonly OccupancyStay[], options: OccupiedNightsOptions): ReadonlySet<string> {
  const nights = new Set<string>()

  for (const stay of stays) {
    if (stay.id === options.excludeReservationId) continue
    for (const night of nightsInRange(stay.checkIn, stay.checkOut)) nights.add(night)
  }

  return nights
}
