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
export function occupiedNightsFor(stays: readonly OccupancyStay[], options: OccupiedNightsOptions): ReadonlySet<string> {
  const nights = new Set<string>()

  for (const stay of stays) {
    if (stay.id === options.excludeReservationId) continue

    let cursor = Temporal.PlainDate.from(stay.checkIn)
    const end = Temporal.PlainDate.from(stay.checkOut)
    while (Temporal.PlainDate.compare(cursor, end) < 0) {
      nights.add(parsePlainDate(cursor.toString()))
      cursor = cursor.add({ days: 1 })
    }
  }

  return nights
}
